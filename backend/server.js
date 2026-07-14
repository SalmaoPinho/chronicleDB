const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { execFile } = require("child_process");
const yaml = require("js-yaml");
const { MsEdgeTTS, OUTPUT_FORMAT } = require("msedge-tts");
const {
  NOTEBOOK_DIR,
  buildNotebookMarkdown,
  compileNotebooks,
  cleanText,
  parseNotebookImportText,
  slugifyNotebookId
} = require("../tempscripts/notebook_utils");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

const app = express();
const PORT = Number(process.env.CHAR_MGR_BACKEND_PORT || 8787);
const HOST = process.env.CHAR_MGR_BACKEND_HOST || "0.0.0.0";
const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_STORY_DIR = path.join(ROOT_DIR, "stories", "earthborn");
const RUNTIME_CONFIG_PATH = path.join(ROOT_DIR, "data", "runtime-config.json");
const MANIFEST_SCRIPT = path.join(ROOT_DIR, "tempscripts", "generate_media_manifests.js");
const MEDIA_EXT_RE = /\.(png|jpe?g|webp|gif|avif|mp4)$/i;
const MAX_ROW_UPLOAD_BYTES = 25 * 1024 * 1024;
const JSON_BODY_LIMIT = "40mb";
const SECURE_MASTER_KEY = process.env.CHAR_MGR_MEDIA_MASTER_KEY || "";
const SECURE_ACCESS_TOKEN = process.env.CHAR_MGR_SECURE_MEDIA_TOKEN || "";
let STORY_ROOT_DIR = resolveInitialStoryRoot();
let cachedEvents = null;
let cachedStoryName = null;

function clearTimelineCache() {
  cachedEvents = null;
  cachedStoryName = null;
}

function readRuntimeConfig() {
  try {
    if (!fs.existsSync(RUNTIME_CONFIG_PATH)) return {};
    const raw = fs.readFileSync(RUNTIME_CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeRuntimeConfig(config) {
  const current = readRuntimeConfig();
  const next = { ...current, ...config };
  fs.mkdirSync(path.dirname(RUNTIME_CONFIG_PATH), { recursive: true });
  fs.writeFileSync(RUNTIME_CONFIG_PATH, JSON.stringify(next, null, 2) + "\n", "utf8");
}

function resolveStoryRootCandidate(inputPath) {
  const value = String(inputPath || "").trim();
  if (!value) return "";
  return path.normalize(path.isAbsolute(value) ? value : path.resolve(ROOT_DIR, value));
}

function resolveInitialStoryRoot() {
  const runtimeConfig = readRuntimeConfig();
  const runtimeStoryRoot = resolveStoryRootCandidate(runtimeConfig.storyRootDir);
  if (runtimeStoryRoot) return runtimeStoryRoot;
  const envStoryRoot = resolveStoryRootCandidate(process.env.CHAR_MGR_STORY_DIR);
  if (envStoryRoot) return envStoryRoot;
  return DEFAULT_STORY_DIR;
}

function getStoryRootDir() {
  return STORY_ROOT_DIR;
}

function getNotebookDir() {
  return path.join(getStoryRootDir(), "notebooks");
}

function resolveStoryPath(...segments) {
  if (segments.length > 0 && /^\d{4}$/.test(String(segments[0]))) {
    return path.join(getStoryRootDir(), "sheets", ...segments);
  }
  return path.join(getStoryRootDir(), ...segments);
}

async function listMarkdownFilesRecursive(dir) {
  const out = [];
  if (!fs.existsSync(dir)) {
    return out;
  }

  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...await listMarkdownFilesRecursive(abs));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      out.push(abs);
    }
  }

  return out;
}

async function readAndMergeStoryJson(fileName, storyRootDir = getStoryRootDir(), visited = new Set()) {
  const activePath = path.join(storyRootDir, fileName);
  let activeData = {};
  if (fs.existsSync(activePath)) {
    try {
      const content = await fs.promises.readFile(activePath, "utf8");
      activeData = JSON.parse(content || "{}");
    } catch (e) {
      console.error(`Failed to parse ${fileName} in ${storyRootDir}:`, e);
    }
  }

  // Read metadata to check for baseStory
  const metaPath = path.join(storyRootDir, "metadata.json");
  let baseStory = null;
  if (fs.existsSync(metaPath)) {
    try {
      const metaContent = await fs.promises.readFile(metaPath, "utf8");
      const metaJson = JSON.parse(metaContent);
      baseStory = metaJson.baseStory || metaJson.parentStory;
    } catch (e) {
      // Metadata might not exist or parse
    }
  }

  if (baseStory) {
    const baseStoryDir = path.join(ROOT_DIR, "stories", baseStory);
    const storyName = path.basename(storyRootDir);
    if (fs.existsSync(baseStoryDir) && !visited.has(baseStory) && baseStory !== storyName) {
      visited.add(baseStory);
      const baseData = await readAndMergeStoryJson(fileName, baseStoryDir, visited);
      
      if (fileName === "core.json") {
        const mergedCharacters = { ...(baseData.characters || {}), ...(activeData.characters || {}) };
        return { ...baseData, ...activeData, characters: mergedCharacters };
      } else if (fileName === "entities.json") {
        const merged = { ...baseData, ...activeData };
        for (const key of ["organizations", "locations", "themes", "misc"]) {
          merged[key] = { ...(baseData[key] || {}), ...(activeData[key] || {}) };
        }
        return merged;
      } else if (fileName === "year_themes.json") {
        return { ...baseData, ...activeData };
      } else if (fileName === "character_stats.json" || fileName === "location_stats.json") {
        return { ...baseData, ...activeData };
      }
    }
  }

  return activeData;
}

app.use(express.json({ limit: JSON_BODY_LIMIT }));
app.use(express.text({ type: ['text/plain', 'text/markdown', 'text/x-markdown', 'text/*'], limit: JSON_BODY_LIMIT }));
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

// Cache clearing middleware for mutating requests
app.use((req, res, next) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    const url = req.originalUrl || req.url;
    if (url.includes("/api/timeline") || url.includes("/api/relationships") || url.includes("/api/config/story-root") || url.includes("/api/timelines/select")) {
      clearTimelineCache();
    }
  }
  next();
});

app.use((error, req, res, next) => {
  if (error?.type === "entity.too.large") {
    res.status(413).json({
      ok: false,
      error: `Request too large. Max JSON payload is ${JSON_BODY_LIMIT}.`
    });
    return;
  }
  next(error);
});

// --- API ROUTES (Priority) ---
app.post("/api/character/update-raw", handleUpdateCharacterRaw);
app.post("/api/notebooks/import-story", handleImportNotebookStory);
app.post("/api/notebooks/delete", handleDeleteNotebook);
app.post("/api/character-core/set-icon", handleCharacterCoreSetIcon);
app.post("/api/character-core/upsert", handleCharacterCoreUpsert);
app.post("/api/character-core/rename", handleCharacterCoreRename);
app.post("/api/character-core/bulk-upsert", handleCharacterCoreBulkUpsert);
app.post("/api/character-core/bulk-delete", handleCharacterCoreBulkDelete);
app.post("/api/character-core/delete", handleCharacterCoreDelete);
app.post("/api/character-core/suggest", handleCharacterCoreSuggest);
app.get("/api/entities", handleGetEntities);

app.get("/api/health", (req, res) => {
  const storyRootDir = getStoryRootDir();
  res.json({
    ok: true,
    service: "character-manager-backend",
    storyRootDir,
    storyRootExists: fs.existsSync(storyRootDir)
  });
});

app.get("/api/config/story-root", (req, res) => {
  const storyRootDir = getStoryRootDir();
  res.json({
    ok: true,
    storyRootDir,
    storyRootExists: fs.existsSync(storyRootDir)
  });
});

app.post("/api/config/story-root", (req, res) => {
  const candidate = resolveStoryRootCandidate(req.body?.storyRootDir);
  if (!candidate) {
    return res.status(400).json({ ok: false, error: "Missing storyRootDir." });
  }
  STORY_ROOT_DIR = candidate;
  writeRuntimeConfig({ storyRootDir: candidate });
  return res.json({
    ok: true,
    storyRootDir: candidate,
    storyRootExists: fs.existsSync(candidate)
  });
});

app.get("/api/timelines", (req, res) => {
  try {
    const storiesParent = path.join(ROOT_DIR, "stories");
    if (!fs.existsSync(storiesParent)) {
      fs.mkdirSync(storiesParent, { recursive: true });
    }
    const list = fs.readdirSync(storiesParent, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
    
    const active = path.basename(getStoryRootDir());
    res.json({ ok: true, active, list });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post("/api/timelines/select", (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ ok: false, error: "Missing timeline name" });
  
  const targetDir = path.join(ROOT_DIR, "stories", name);
  if (!fs.existsSync(targetDir)) {
    return res.status(404).json({ ok: false, error: `Timeline "${name}" does not exist.` });
  }
  
  STORY_ROOT_DIR = targetDir;
  writeRuntimeConfig({ storyRootDir: targetDir });
  
  res.json({ ok: true, active: name });
});

app.post("/api/timelines/create", (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ ok: false, error: "Missing timeline name" });
  
  const safeName = String(name).trim().replace(/[^a-zA-Z0-9_\-]/g, "").toLowerCase();
  if (!safeName) return res.status(400).json({ ok: false, error: "Invalid timeline name." });
  
  const targetDir = path.join(ROOT_DIR, "stories", safeName);
  if (fs.existsSync(targetDir)) {
    return res.status(400).json({ ok: false, error: `Timeline "${safeName}" already exists.` });
  }
  
  try {
    fs.mkdirSync(targetDir, { recursive: true });
    fs.mkdirSync(path.join(targetDir, "timeline"), { recursive: true });
    fs.mkdirSync(path.join(targetDir, "notebooks"), { recursive: true });
    fs.mkdirSync(path.join(targetDir, "relationships"), { recursive: true });
    fs.mkdirSync(path.join(targetDir, "prompt"), { recursive: true });
    fs.mkdirSync(path.join(targetDir, "media"), { recursive: true });
    
    fs.writeFileSync(path.join(targetDir, "core.json"), "{\"characters\": {}}", "utf8");
    fs.writeFileSync(path.join(targetDir, "year_themes.json"), "{}", "utf8");
    fs.writeFileSync(path.join(targetDir, "character_stats.json"), "{}", "utf8");
    fs.writeFileSync(path.join(targetDir, "location_stats.json"), "{}", "utf8");
    fs.writeFileSync(path.join(targetDir, "entities.json"), "{}", "utf8");
    fs.writeFileSync(path.join(targetDir, "metadata.json"), JSON.stringify({ version: 1, name: safeName }), "utf8");
    fs.writeFileSync(path.join(targetDir, "notebooks", "manifest.json"), JSON.stringify({ notebooks: [] }), "utf8");
    
    STORY_ROOT_DIR = targetDir;
    writeRuntimeConfig({ storyRootDir: targetDir });
    
    res.json({ ok: true, active: safeName });
  } catch (err) {
    console.error("Failed to create timeline:", err);
    res.status(500).json({ ok: false, error: `Failed to create: ${err.message}` });
  }
});

app.get("/api/media/portraits/list", async (req, res) => {
  try {
    const storyPortraitDir = path.join(getStoryRootDir(), "portraits");
    const globalPortraitDir = path.join(ROOT_DIR, "portraits");
    const portraitDir = fs.existsSync(storyPortraitDir) ? storyPortraitDir : globalPortraitDir;

    if (!fs.existsSync(portraitDir)) {
      return res.json({ ok: true, portraits: {}, folderMap: {}, prefix: "portraits" });
    }
    const prefix = toPosix(path.relative(ROOT_DIR, portraitDir));
    const manifest = {};
    const folderMap = {};
    const entries = await fs.promises.readdir(portraitDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const charId = entry.name.toLowerCase();
        const fullPath = path.join(portraitDir, entry.name);
        const files = await fs.promises.readdir(fullPath);
        // Only include media files
        manifest[charId] = files.filter((f) => MEDIA_EXT_RE.test(f));
        // Map lowercase id to actual directory name (for case-sensitive filesystems)
        if (entry.name !== charId) {
          folderMap[charId] = entry.name;
        }
      }
    }
    res.json({ ok: true, portraits: manifest, folderMap, prefix });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error?.message || "Failed to list portraits.") });
  }
});

app.get("/api/media/sfx/list", async (req, res) => {
  try {
    const storySfxDir = path.join(getStoryRootDir(), "sfx");
    const globalSfxDir = path.join(ROOT_DIR, "sfx");
    const sfxDir = fs.existsSync(storySfxDir) ? storySfxDir : globalSfxDir;

    if (!fs.existsSync(sfxDir)) {
      return res.json({ ok: true, sfx: [] });
    }
    const files = await fs.promises.readdir(sfxDir);
    // Include common audio formats
    const sfxFiles = files.filter((f) => /\.(mp3|wav|ogg|aac|flac)$/i.test(f));
    res.json({ ok: true, sfx: sfxFiles });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error?.message || "Failed to list SFX.") });
  }
});

app.post("/api/run/generate-media-manifests", async (req, res) => {
  try {
    const result = await runManifestGenerator();
    res.json({
      ok: true,
      message: "image_index.json files regenerated successfully.",
      stdout: result.stdout,
      stderr: result.stderr
    });
  } catch (failure) {
    const stderr = failure?.stderr || "";
    const stdout = failure?.stdout || "";
    const errorMessage = failure?.error?.message || "Manifest generation failed.";
    res.status(500).json({ ok: false, error: errorMessage, stdout, stderr });
  }
});

app.get("/api/media/catalog", async (req, res) => {
  try {
    const year = String(req.query.year || "").trim();
    const catalog = await buildMediaCatalog(year);
    res.json({ ok: true, year, source: "backend-fs", catalog });
  } catch (error) {
    res.status(400).json({ ok: false, error: error?.message || "Failed to build media catalog." });
  }
});

app.get("/api/media/years", async (req, res) => {
  try {
    const years = await listPictureYears();
    res.json({ ok: true, source: "backend-fs", years });
  } catch (error) {
    res.status(500).json({ ok: false, error: error?.message || "Failed to list media years." });
  }
});

app.get("/api/year-variants", async (req, res, next) => {
  try {
    const year = String(req.query.year || "").trim();
    if (!/^\d{4}$/.test(year)) return res.json({ variants: [] });
    const versionsDir = resolveStoryPath(year, "versions");
    let entries = [];
    try {
      entries = await fs.promises.readdir(versionsDir, { withFileTypes: true });
    } catch {
      // Fallback for legacy structure if any remains or for years without versions
      return res.json({ variants: [] });
    }
    const variants = entries
      .filter((e) => e.isFile() && (e.name.endsWith(".json") || e.name.endsWith(".md")))
      .map((e) => {
        const basename = e.name.replace(/\.(json|md)$/i, "");
        let label = basename.startsWith(year) ? basename.slice(4) : basename;
        label = label ? label.charAt(0).toUpperCase() + label.slice(1) : "Default";
        return { id: basename, filename: `versions/${e.name}`, label };
      })
      .sort((a, b) => a.label.localeCompare(b.label));

    if (variants.length > 0) {
      variants.unshift({ id: "main", filename: "", label: "Main" });
    }

    res.json({ variants });
  } catch (error) { next(error); }
});

app.get("/api/relationships", async (req, res) => {
  try {
    const relationships = await getRelationships();
    res.json(relationships);
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error?.message || "Failed to load relationships.") });
  }
});

app.get("/api/timeline", async (req, res) => {
  try {
    const events = await getTimelineEvents();
    res.json(events);
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error?.message || "Failed to load timeline.") });
  }
});

app.get("/api/secure-media", async (req, res) => {
  try {
    if (SECURE_ACCESS_TOKEN) {
      if (String(req.query.token || "") !== SECURE_ACCESS_TOKEN) return res.status(403).json({ ok: false, error: "Forbidden" });
    }
    const relPath = String(req.query.path || "").trim();
    if (!relPath) return res.status(400).json({ ok: false, error: "Missing path query parameter." });
    const result = await decryptSecureMediaByPath(relPath);
    res.setHeader("Content-Type", result.mimeType);
    res.setHeader("Cache-Control", "private, max-age=60");
    res.send(result.body);
  } catch (error) {
    res.status(404).json({ ok: false, error: error?.message || "Secure media unavailable." });
  }
});

app.get("/api/config/media-token", (req, res) => {
  res.json({ ok: true, token: SECURE_ACCESS_TOKEN || "" });
});

app.get("/api/prompt/presets", async (req, res) => {
  try {
    const promptDir = path.join(getStoryRootDir(), "prompt");
    if (!fs.existsSync(promptDir)) {
      return res.json({ ok: true, presets: {} });
    }
    const files = await fs.promises.readdir(promptDir);
    const result = {};
    for (const file of files) {
      if (file.endsWith(".md")) {
        const absPath = path.join(promptDir, file);
        const content = await fs.promises.readFile(absPath, "utf8");
        const fmMatch = content.match(/^---\s*[\r\n]+([\s\S]*?)[\r\n]+---\s*[\r\n]*/);
        if (fmMatch) {
          try {
            const data = yaml.load(fmMatch[1]);
            const key = file.replace(/\.md$/i, "");
            result[key] = data;
          } catch (e) {
            console.error(`Failed to parse YAML in ${file}:`, e);
          }
        }
      }
    }
    res.json({ ok: true, presets: result });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error?.message || "Failed to load prompt presets.") });
  }
});

// Relationship Actions
app.post("/api/relationships/set-date", handleRelationshipSetDate);
app.put("/api/relationships/set-date", handleRelationshipSetDate);
app.patch("/api/relationships/set-date", handleRelationshipSetDate);

app.post("/api/relationships/set-text", handleRelationshipSetText);
app.put("/api/relationships/set-text", handleRelationshipSetText);
app.patch("/api/relationships/set-text", handleRelationshipSetText);

app.post('/api/relationships/delete-history-note', handleRelationshipDeleteHistoryNote);
app.put('/api/relationships/delete-history-note', handleRelationshipDeleteHistoryNote);
app.patch('/api/relationships/delete-history-note', handleRelationshipDeleteHistoryNote);

app.post("/api/relationships/add", handleRelationshipAdd);
app.put("/api/relationships/add", handleRelationshipAdd);

app.post("/api/relationships/update", handleRelationshipUpdate);
app.put("/api/relationships/update", handleRelationshipUpdate);

app.post("/api/relationships/delete", handleRelationshipDelete);
app.delete("/api/relationships/delete", handleRelationshipDelete);

// Timeline Actions
app.post("/api/timeline/set-date", handleTimelineSetDate);
app.put("/api/timeline/set-date", handleTimelineSetDate);
app.patch("/api/timeline/set-date", handleTimelineSetDate);

app.post("/api/timeline/set-text", handleTimelineSetText);
app.put("/api/timeline/set-text", handleTimelineSetText);
app.patch("/api/timeline/set-text", handleTimelineSetText);

app.post("/api/timeline/set-tags", handleTimelineSetTags);
app.put("/api/timeline/set-tags", handleTimelineSetTags);
app.patch("/api/timeline/set-tags", handleTimelineSetTags);

app.post("/api/timeline/mass-tag", handleTimelineMassTag);
app.post("/api/timeline/mass-text-action", handleTimelineMassTextAction);

app.post('/api/timeline/delete-event', handleTimelineDeleteEvent);
app.put('/api/timeline/delete-event', handleTimelineDeleteEvent);
app.patch('/api/timeline/delete-event', handleTimelineDeleteEvent);

app.post("/api/timeline/add-event", handleTimelineAddEvent);
app.put("/api/timeline/add-event", handleTimelineAddEvent);

app.post("/api/timeline/bulk-add", handleTimelineBulkAdd);

app.post("/api/timeline/group", handleTimelineGroup);
app.post("/api/timeline/ungroup", handleTimelineUngroup);

app.post("/api/timeline/inject", async (req, res) => {
  try {
    const text = String(req.body?.text || '').trim();
    if (!text) {
      return res.status(400).json({ ok: false, error: "No text provided." });
    }
    const newtimelinePath = resolveStoryPath("newtimeline.md");
    fs.writeFileSync(newtimelinePath, text, "utf8");

    const injectScript = path.join(ROOT_DIR, "tools", "inject_entries.js");
    if (!fs.existsSync(injectScript)) {
      return res.status(500).json({ ok: false, error: "inject_entries.js not found." });
    }

    const { execSync } = require("child_process");
    const output = execSync(`node "${injectScript}"`, {
      cwd: ROOT_DIR,
      env: { ...process.env, CHAR_MGR_STORY_DIR: getStoryRootDir() },
      encoding: "utf8",
      timeout: 15000
    });
    console.log("inject_entries output:", output.trim());
    res.json({ ok: true, output: output.trim() });
  } catch (error) {
    const message = String(error?.message || "Failed to inject timeline entries.");
    console.error("inject_entries error:", message);
    res.status(500).json({ ok: false, error: message });
  }
});

app.post("/api/timeline/append-newtimeline", async (req, res) => {
  try {
    const entry = String(req.body?.entry || '').trim();
    if (!entry) {
      return res.status(400).json({ ok: false, error: "No entry content provided." });
    }
    const newtimelinePath = resolveStoryPath("newtimeline.md");
    let currentContent = '';
    if (fs.existsSync(newtimelinePath)) {
      currentContent = fs.readFileSync(newtimelinePath, "utf8");
    }
    
    let separator = '';
    if (currentContent.trim()) {
      separator = "\n\n<!-- entry-break -->\n\n";
    }
    
    const nextContent = currentContent + separator + entry + "\n";
    fs.writeFileSync(newtimelinePath, nextContent, "utf8");
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post("/api/timeline/run-pipeline", async (req, res) => {
  try {
    const { execSync } = require("child_process");
    const outputs = [];

    // 1. Inject
    const injectScript = path.join(ROOT_DIR, "tools", "inject_entries.js");
    if (fs.existsSync(injectScript)) {
      outputs.push("=== INJECTING STAGED ENTRIES ===");
      const out = execSync(`node "${injectScript}"`, {
        cwd: ROOT_DIR,
        env: { ...process.env, CHAR_MGR_STORY_DIR: getStoryRootDir() },
        encoding: "utf8",
        timeout: 15000
      });
      outputs.push(out.trim());
    }

    // 2. Format
    const formatScript = path.join(ROOT_DIR, "tools", "format_tags.js");
    if (fs.existsSync(formatScript)) {
      outputs.push("=== FORMATTING TAGS ===");
      const timelineRelPath = path.relative(ROOT_DIR, resolveStoryPath("timeline"));
      const relationshipsRelPath = path.relative(ROOT_DIR, resolveStoryPath("relationships"));
      const newtimelineRelPath = path.relative(ROOT_DIR, resolveStoryPath("newtimeline.md"));
      const out = execSync(`node "${formatScript}" --paths "${timelineRelPath}" "${relationshipsRelPath}" "${newtimelineRelPath}"`, {
        cwd: ROOT_DIR,
        env: { ...process.env, CHAR_MGR_STORY_DIR: getStoryRootDir() },
        encoding: "utf8",
        timeout: 15000
      });
      outputs.push(out.trim());
    }

    // 3. Sort
    const sortScript = path.join(ROOT_DIR, "tools", "sort_timeline.js");
    if (fs.existsSync(sortScript)) {
      outputs.push("=== SORTING TIMELINE ===");
      const out = execSync(`node "${sortScript}"`, {
        cwd: ROOT_DIR,
        env: { ...process.env, CHAR_MGR_STORY_DIR: getStoryRootDir() },
        encoding: "utf8",
        timeout: 15000
      });
      outputs.push(out.trim());
    }

    // 4. Compact
    const compactScript = path.join(ROOT_DIR, "tools", "compact_timeline.js");
    if (fs.existsSync(compactScript)) {
      outputs.push("=== COMPACTING TIMELINE ===");
      const out = execSync(`node "${compactScript}"`, {
        cwd: ROOT_DIR,
        env: { ...process.env, CHAR_MGR_STORY_DIR: getStoryRootDir() },
        encoding: "utf8",
        timeout: 15000
      });
      outputs.push(out.trim());
    }

    res.json({ ok: true, output: outputs.join("\n\n") });
  } catch (error) {
    const message = String(error?.message || "Pipeline execution failed.");
    console.error("run-pipeline error:", message);
    res.status(500).json({ ok: false, error: message });
  }
});

app.post("/api/timeline/format-tags", async (req, res) => {
  try {
    const formatScript = path.join(ROOT_DIR, "tools", "format_tags.js");
    if (!fs.existsSync(formatScript)) {
      return res.status(500).json({ ok: false, error: "format_tags.js not found." });
    }

    const { execSync } = require("child_process");
    
    const timelineRelPath = path.relative(ROOT_DIR, resolveStoryPath("timeline"));
    const relationshipsRelPath = path.relative(ROOT_DIR, resolveStoryPath("relationships"));
    const output = execSync(`node "${formatScript}" --paths "${timelineRelPath}" "${relationshipsRelPath}"`, {
      cwd: ROOT_DIR,
      env: { ...process.env, CHAR_MGR_STORY_DIR: getStoryRootDir() },
      encoding: "utf8",
      timeout: 30000
    });
    console.log("format_tags output:", output.trim());
    res.json({ ok: true, output: output.trim() });
  } catch (error) {
    const message = String(error?.message || "Failed to run format_tags.");
    console.error("format_tags error:", message);
    res.status(500).json({ ok: false, error: message });
  }
});

app.post("/api/timeline/swap", async (req, res) => {
  try {
    const { canonical, aliases } = req.body;
    if (!canonical) {
      return res.status(400).json({ ok: false, error: "Canonical tag is required." });
    }
    if (!Array.isArray(aliases) || !aliases.length) {
      return res.status(400).json({ ok: false, error: "At least one alias is required." });
    }

    const formatScript = path.join(ROOT_DIR, "tools", "format_tags.js");
    if (!fs.existsSync(formatScript)) {
      return res.status(500).json({ ok: false, error: "format_tags.js not found." });
    }

    // 1. Read format_tags.js
    let content = fs.readFileSync(formatScript, "utf8");

    // 2. Parse the EQUIVALENCIES block
    const startIdx = content.indexOf("const EQUIVALENCIES = {");
    const endIdx = content.indexOf("};", startIdx);
    if (startIdx === -1 || endIdx === -1) {
      return res.status(500).json({ ok: false, error: "EQUIVALENCIES block not found in format_tags.js." });
    }

    const objStr = content.substring(startIdx + "const EQUIVALENCIES = ".length, endIdx + 1);
    let equivalencies;
    try {
      equivalencies = eval("(" + objStr + ")");
    } catch (e) {
      return res.status(500).json({ ok: false, error: "Failed to parse EQUIVALENCIES in format_tags.js: " + e.message });
    }

    // 3. Update equivalencies
    const canonicalKey = String(canonical).trim().toLowerCase();
    if (!equivalencies[canonicalKey]) {
      equivalencies[canonicalKey] = [];
    }

    aliases.forEach(alias => {
      const cleanAlias = String(alias).trim().toLowerCase();
      if (cleanAlias && cleanAlias !== canonicalKey) {
        // Remove this alias from any other canonical keys to avoid duplicates/conflicts
        for (const key of Object.keys(equivalencies)) {
          equivalencies[key] = equivalencies[key].filter(a => String(a).toLowerCase().trim() !== cleanAlias);
        }
        // Add to our canonical key
        if (!equivalencies[canonicalKey].includes(cleanAlias)) {
          equivalencies[canonicalKey].push(cleanAlias);
        }
      }
    });

    // 4. Format the block
    const sortedKeys = Object.keys(equivalencies).sort();
    let newBlock = "const EQUIVALENCIES = {\n";
    for (let i = 0; i < sortedKeys.length; i++) {
      const k = sortedKeys[i];
      const sortedAliases = Array.from(new Set(equivalencies[k])).sort();
      const aliasesStr = sortedAliases.map(a => JSON.stringify(a)).join(", ");
      newBlock += `    ${JSON.stringify(k)}: [${aliasesStr}]`;
      if (i < sortedKeys.length - 1) {
        newBlock += ",\n";
      } else {
        newBlock += "\n";
      }
    }
    newBlock += "};";

    // 5. Write back to format_tags.js
    content = content.substring(0, startIdx) + newBlock + content.substring(endIdx + 2);
    fs.writeFileSync(formatScript, content, "utf8");

    // 6. Run format_tags.js to execute replacements across all timeline files
    const { execSync } = require("child_process");
    const timelineRelPath = path.relative(ROOT_DIR, resolveStoryPath("timeline"));
    const relationshipsRelPath = path.relative(ROOT_DIR, resolveStoryPath("relationships"));
    const runOutput = execSync(`node "${formatScript}" --paths "${timelineRelPath}" "${relationshipsRelPath}"`, {
      cwd: ROOT_DIR,
      env: { ...process.env, CHAR_MGR_STORY_DIR: getStoryRootDir() },
      encoding: "utf8",
      timeout: 30000
    });

    console.log("format_tags run output after swap:", runOutput.trim());
    res.json({ ok: true, output: runOutput.trim() });
  } catch (error) {
    const message = String(error?.message || "Failed to run swap.");
    console.error("Swap error:", message);
    res.status(500).json({ ok: false, error: message });
  }
});

// Other Actions
app.post("/api/rows/set-image", async (req, res) => {
  try {
    const result = await updateRowImageInSource(req.body || {});
    res.json({ ok: true, ...result });
  } catch (error) {
    const message = String(error?.message || "Failed to update row image.");
    res.status(/not found/i.test(message) ? 404 : 400).json({ ok: false, error: message });
  }
});

app.post("/api/rows/upload-image", async (req, res) => {
  try {
    const { year, sourcePath, entryId, blockIndex, rowIndex, variant, fileName, mimeType, dataBase64 } = req.body || {};
    if (!dataBase64) return res.status(400).json({ ok: false, error: "Missing dataBase64." });
    const buffer = Buffer.from(dataBase64, "base64");
    if (buffer.length > MAX_ROW_UPLOAD_BYTES) return res.status(400).json({ ok: false, error: "Uploaded file exceeds max size (25MB)." });
    const ext = mediaExtensionFromName(fileName) || mediaExtensionFromMime(mimeType);
    if (!ext || !MEDIA_EXT_RE.test(ext)) return res.status(400).json({ ok: false, error: "Unsupported media type." });
    if (!/^[0-9A-Za-z_-]+$/.test(year)) return res.status(400).json({ ok: false, error: "Invalid year." });

    const uploadDir = path.join(getStoryRootDir(), "pictures", year, "rows");
    await fs.promises.mkdir(uploadDir, { recursive: true });
    const rowName = `${safeSlug(entryId)}-b${Math.max(0, blockIndex)}-r${Math.max(0, rowIndex)}-${variant}-${Date.now()}${ext}`;
    const targetPath = path.join(uploadDir, rowName);
    await fs.promises.writeFile(targetPath, buffer);

    const imagePath = toPosix(path.relative(ROOT_DIR, targetPath));
    const result = await updateRowImageInSource({ year, sourcePath, entryId, blockIndex, rowIndex, variant, imagePath });
    res.json({ ok: true, ...result, uploaded: { fileName: rowName, bytes: buffer.length, mimeType: mimeType || "application/octet-stream" } });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post("/api/portraits/upload-event", async (req, res) => {
  try {
    const { fileName, mimeType, dataBase64 } = req.body || {};
    if (!dataBase64) return res.status(400).json({ ok: false, error: "Missing dataBase64." });
    const buffer = Buffer.from(dataBase64, "base64");
    if (buffer.length > MAX_ROW_UPLOAD_BYTES) return res.status(400).json({ ok: false, error: "Uploaded file exceeds max size (25MB)." });
    
    const getExt = () => {
      if (fileName && fileName.lastIndexOf(".") !== -1) {
        return fileName.substring(fileName.lastIndexOf(".")).toLowerCase();
      }
      const mimeMap = {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/webp": ".webp",
        "image/gif": ".gif"
      };
      return mimeMap[mimeType] || ".jpg";
    };

    const ext = getExt();
    if (!/\.(png|jpe?g|webp|gif)$/i.test(ext)) {
      return res.status(400).json({ ok: false, error: "Unsupported media type." });
    }

    const eventsDir = path.join(getStoryRootDir(), "portraits", "events");
    await fs.promises.mkdir(eventsDir, { recursive: true });

    let cleanStem = "pasted_event_image";
    if (fileName && fileName.lastIndexOf(".") !== -1) {
      const stem = fileName.substring(0, fileName.lastIndexOf(".")).replace(/[^0-9A-Za-z_-]/g, "").toLowerCase();
      if (stem) cleanStem = stem;
    }
    
    const uniqueName = req.body.useExactName ? `${cleanStem}${ext}` : `${cleanStem}_${Date.now()}${ext}`;
    const targetPath = path.join(eventsDir, uniqueName);

    await fs.promises.writeFile(targetPath, buffer);

    runManifestGenerator().catch(err => {
      console.error("Manifest generation failed after event portrait upload:", err);
    });

    res.json({
      ok: true,
      fileName: uniqueName,
      imagePath: toPosix(path.relative(ROOT_DIR, targetPath))
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post("/api/portraits/upload-misc", async (req, res) => {
  try {
    const { characterId, fileName, mimeType, dataBase64 } = req.body || {};
    if (!characterId) return res.status(400).json({ ok: false, error: "Missing characterId." });
    if (!dataBase64) return res.status(400).json({ ok: false, error: "Missing dataBase64." });
    
    const buffer = Buffer.from(dataBase64, "base64");
    if (buffer.length > MAX_ROW_UPLOAD_BYTES) {
      return res.status(400).json({ ok: false, error: "Uploaded file exceeds max size (25MB)." });
    }
    
    const id = String(characterId).toLowerCase().trim().replace(/[^a-z0-9_-]/g, "");
    if (!id) return res.status(400).json({ ok: false, error: "Invalid characterId." });

    const getExt = () => {
      if (fileName && fileName.lastIndexOf(".") !== -1) {
        return fileName.substring(fileName.lastIndexOf(".")).toLowerCase();
      }
      const mimeMap = {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/webp": ".webp",
        "image/gif": ".gif"
      };
      return mimeMap[mimeType] || ".jpg";
    };

    const ext = getExt();
    if (!/\.(png|jpe?g|webp|gif)$/i.test(ext)) {
      return res.status(400).json({ ok: false, error: "Unsupported media type." });
    }

    const miscDir = path.join(getStoryRootDir(), "portraits", "misc");
    await fs.promises.mkdir(miscDir, { recursive: true });

    // Clean up potential conflicting extensions (e.g. if we upload kirk.png, delete kirk.jpg, etc.)
    const extensions = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
    for (const curExt of extensions) {
      const p = path.join(miscDir, `${id}${curExt}`);
      if (fs.existsSync(p)) {
        try {
          await fs.promises.unlink(p);
        } catch (e) {
          console.warn(`Failed to delete conflicting file ${p}:`, e);
        }
      }
    }

    // Write the new file
    const targetName = `${id}${ext}`;
    const targetPath = path.join(miscDir, targetName);
    await fs.promises.writeFile(targetPath, buffer);

    // Regenerate media manifests so the frontend sees the new file immediately!
    await runManifestGenerator().catch(err => {
      console.error("Manifest generation failed after misc portrait upload:", err);
    });

    res.json({
      ok: true,
      fileName: targetName,
      imagePath: toPosix(path.relative(ROOT_DIR, targetPath))
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post("/api/rows/set-subtitle", async (req, res) => {
  try {
    const result = await updateRowSubtitleInSource(req.body || {});
    res.json({ ok: true, ...result });
  } catch (error) {
    const message = String(error?.message || "Failed to update row subtitle.");
    res.status(/not found/i.test(message) ? 404 : 400).json({ ok: false, error: message });
  }
});

app.post("/api/nav-groups/reorder", async (req, res) => {
  console.debug('/api/nav-groups/reorder payload ->', req.body);
  try {
    const result = await updateNavGroupOrderInSource(req.body || {});
    console.debug('/api/nav-groups/reorder result ->', result);
    res.json({ ok: true, ...result });
  } catch (error) {
    console.error('/api/nav-groups/reorder ERROR ->', error && error.stack ? error.stack : error);
    const message = String(error?.message || "Failed to update nav group order.");
    res.status(/not found/i.test(message) ? 404 : 400).json({ ok: false, error: message });
  }
});

app.post("/api/year-themes/update", async (req, res) => {
  console.debug('/api/year-themes/update payload ->', req.body);
  try {
    const targetFile = path.join(getStoryRootDir(), "year_themes.json");
    const themes = req.body || {};
    fs.writeFileSync(targetFile, JSON.stringify(themes, null, 2), "utf8");
    res.json({ ok: true });
  } catch (error) {
    console.error('/api/year-themes/update ERROR ->', error);
    res.status(400).json({ ok: false, error: String(error?.message || "Failed to update year themes.") });
  }
});

app.post("/api/character-core/set-birthdate", handleCharacterCoreBirthDateSet);
app.put("/api/character-core/set-birthdate", handleCharacterCoreBirthDateSet);
app.patch("/api/character-core/set-birthdate", handleCharacterCoreBirthDateSet);
app.get('/api/export/character', async (req, res) => {
  // Keeping export logic mostly where it was but registering it here
  handleCharacterExport(req, res);
});

app.get('/api/export/timeline', async (req, res) => {
  handleTimelineExport(req, res);
});

app.get("/api/tts", async (req, res) => {
  const text = req.query.text;
  const voice = req.query.voice || "en_US-amy-medium";
  if (!text) return res.status(400).send("Missing text");

  const isEdge = voice.startsWith("edge:") || 
                 voice.includes("Neural") || 
                 voice.toLowerCase().includes("online") ||
                 (!voice.startsWith("local:") && !voice.includes("en_US-") && !voice.includes("en_UK-"));

  if (isEdge) {
    try {
      const cleanVoice = voice.replace(/^edge:/i, "").trim();
      console.log(`Backend TTS: Generating Edge TTS voice="${cleanVoice}" for text="${text.slice(0, 30)}..."`);
      
      const tts = new MsEdgeTTS();
      // Set metadata with voice and output format (MP3)
      await tts.setMetadata(cleanVoice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
      
      // Escape XML-special characters before passing to toStream (matches SillyTavern EdgeTTS Plugin)
      const safeText = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
      const { audioStream } = tts.toStream(safeText);
      res.setHeader("Content-Type", "audio/mpeg");
      
      audioStream.pipe(res);
      
      audioStream.on("error", (err) => {
        console.error("Edge TTS Stream Error:", err);
        if (!res.headersSent) {
          res.status(500).send("Edge TTS Stream Failed");
        }
      });
      return;
    } catch (err) {
      console.error("Edge TTS Initialization Error:", err);
      return res.status(500).send("Edge TTS Initialization Failed: " + err.message);
    }
  }

  // Piper TTS Fallback
  const scriptPath = path.join(ROOT_DIR, "tempscripts", "piper_tts.py");
  const cleanPiperVoice = voice.replace(/^local:/i, "").trim();
  const modelPath = path.join(ROOT_DIR, "voices", `${cleanPiperVoice}.onnx`);

  // Use system temp dir to avoid triggering live-reload in dev servers
  const os = require("os");
  const tempDir = path.join(os.tmpdir(), "character-manager-tts");
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  const outputPath = path.join(tempDir, `tts_${Date.now()}.wav`);

  execFile("python", [scriptPath, text, modelPath, outputPath], (error, stdout, stderr) => {
    if (error) {
      console.error("Piper TTS Error:", stderr || error.message);
      return res.status(500).send("TTS Generation Failed");
    }
    res.setHeader("Content-Type", "audio/wav");
    res.sendFile(outputPath, (err) => {
      // Cleanup after send
      setTimeout(() => {
        if (fs.existsSync(outputPath)) {
          try { fs.unlinkSync(outputPath); } catch (e) { }
        }
      }, 1000);
    });
  });
});

// Local LLM Proxy endpoint to bypass CORS OPTION preflight issues in browser
app.post("/api/chat/completions", (req, res) => {
  const { endpointUrl, ...payload } = req.body || {};
  if (!endpointUrl) {
    return res.status(400).json({ ok: false, error: "Missing endpointUrl parameter." });
  }

  try {
    const http = require("http");
    const https = require("https");
    const url = new URL(`${endpointUrl}/chat/completions`);
    const isHttps = url.protocol === "https:";
    const client = isHttps ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      }
    };

    const proxyReq = client.request(options, (proxyRes) => {
      res.setHeader("Content-Type", proxyRes.headers["content-type"] || "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.statusCode = proxyRes.statusCode;

      proxyRes.on("data", (chunk) => {
        res.write(chunk);
      });

      proxyRes.on("end", () => {
        res.end();
      });
    });

    proxyReq.on("error", (err) => {
      console.error("LLM Connection Error:", err);
      res.status(500).json({ ok: false, error: "LLM Connection Error: " + err.message });
    });

    proxyReq.write(JSON.stringify(payload));
    proxyReq.end();

  } catch (error) {
    console.error("LLM Proxy error:", error);
    res.status(500).json({ ok: false, error: String(error?.message || error) });
  }
});

// ComfyUI Proxy endpoint to bypass CORS issues in browser
app.all("/api/comfy/*", async (req, res) => {
  const subpath = req.params[0] || "";
  const comfyHost = req.headers["x-comfy-server"] || req.query["x-comfy-server"] || "127.0.0.1:8000";
  
  const urlObj = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  urlObj.searchParams.delete("x-comfy-server");
  const queryString = urlObj.search;
  const targetUrl = `http://${comfyHost}/${subpath}${queryString}`;

  try {
    const fetchOptions = {
      method: req.method,
      headers: {}
    };

    // Copy incoming headers (skip host, connection, x-comfy-server, origin, and referer to bypass ComfyUI CORS checks)
    for (const [key, value] of Object.entries(req.headers)) {
      if (key !== "host" && key !== "connection" && key !== "x-comfy-server" && key !== "origin" && key !== "referer") {
        fetchOptions.headers[key] = value;
      }
    }

    // Set up request body if method is POST, PUT, etc.
    if (req.method !== "GET" && req.method !== "HEAD") {
      const contentType = req.headers["content-type"] || "";
      if (contentType.includes("multipart/form-data")) {
        fetchOptions.body = req;
        fetchOptions.duplex = "half";
      } else if (req.body) {
        if (typeof req.body === "object") {
          fetchOptions.body = JSON.stringify(req.body);
        } else {
          fetchOptions.body = req.body;
        }
      }
    }

    const comfyRes = await fetch(targetUrl, fetchOptions);

    res.status(comfyRes.status);
    
    // Copy headers back to client
    comfyRes.headers.forEach((value, key) => {
      if (key !== "transfer-encoding" && key !== "connection" && key !== "keep-alive") {
        res.setHeader(key, value);
      }
    });

    if (comfyRes.body) {
      const { Readable } = require("stream");
      Readable.fromWeb(comfyRes.body).pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    console.error(`ComfyUI Proxy Error [${req.method} ${targetUrl}]:`, error);
    res.status(500).json({ ok: false, error: `ComfyUI Proxy Error: ${error.message}` });
  }
});

// --- END API ROUTES ---

// Dynamic /story router serving files from active STORY_ROOT_DIR
app.use("/story", async (req, res, next) => {
  let requestedPath = req.path;
  const yearMatch = requestedPath.match(/^\/(\d{4})(\/.*)?$/);
  if (yearMatch) {
    requestedPath = `/sheets/${yearMatch[1]}${yearMatch[2] || ""}`;
  }
  const normPath = requestedPath.replace(/\\/g, "/").toLowerCase();
  
  if (normPath === "/core.json" || normPath === "/entities.json" || normPath === "/year_themes.json" || normPath === "/character_stats.json" || normPath === "/location_stats.json") {
    const fileName = req.path.substring(1);
    try {
      const merged = await readAndMergeStoryJson(fileName);
      return res.json(merged);
    } catch (e) {
      console.error(`Failed to serve merged ${fileName}:`, e);
    }
  }

  const filePath = path.join(getStoryRootDir(), requestedPath);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    return res.sendFile(filePath);
  }
  
  // High-fidelity fallback for missing default files in new/empty timelines
  if (normPath === "/notebooks/manifest.json") {
    return res.json({ notebooks: [] });
  }
  if (normPath === "/metadata.json") {
    const activeName = path.basename(getStoryRootDir());
    return res.json({ version: 1, title: activeName.toUpperCase() });
  }
  if (normPath === "/year_themes.json") {
    return res.json({});
  }
  if (normPath === "/character_stats.json" || normPath === "/location_stats.json") {
    return res.json({});
  }
  if (/\/index\.json$/.test(normPath)) {
    return res.json({ entries: [], meta: {} });
  }
  
  next();
});

// Dynamic Static Asset Routes
app.use("/portraits", (req, res, next) => {
  const storyPortraitPath = path.join(getStoryRootDir(), "portraits", req.path);
  if (fs.existsSync(storyPortraitPath) && fs.statSync(storyPortraitPath).isFile()) {
    return res.sendFile(storyPortraitPath);
  }
  const globalPortraitPath = path.join(ROOT_DIR, "portraits", req.path);
  if (fs.existsSync(globalPortraitPath) && fs.statSync(globalPortraitPath).isFile()) {
    return res.sendFile(globalPortraitPath);
  }
  next();
});

app.use("/pictures", (req, res, next) => {
  const storyPicturesPath = path.join(getStoryRootDir(), "pictures", req.path);
  if (fs.existsSync(storyPicturesPath) && fs.statSync(storyPicturesPath).isFile()) {
    return res.sendFile(storyPicturesPath);
  }
  const globalPicturesPath = path.join(ROOT_DIR, "pictures", req.path);
  if (fs.existsSync(globalPicturesPath) && fs.statSync(globalPicturesPath).isFile()) {
    return res.sendFile(globalPicturesPath);
  }
  next();
});

app.use("/sfx", (req, res, next) => {
  const storySfxPath = path.join(getStoryRootDir(), "sfx", req.path);
  if (fs.existsSync(storySfxPath) && fs.statSync(storySfxPath).isFile()) {
    return res.sendFile(storySfxPath);
  }
  const globalSfxPath = path.join(ROOT_DIR, "sfx", req.path);
  if (fs.existsSync(globalSfxPath) && fs.statSync(globalSfxPath).isFile()) {
    return res.sendFile(globalSfxPath);
  }
  next();
});

app.get(["/favicon.png", "/story/favicon.png"], (req, res, next) => {
  const storyFavicon = path.join(getStoryRootDir(), "favicon.png");
  if (fs.existsSync(storyFavicon)) {
    return res.sendFile(storyFavicon);
  }
  const globalFavicon = path.join(ROOT_DIR, "favicon.png");
  if (fs.existsSync(globalFavicon)) {
    return res.sendFile(globalFavicon);
  }
  const fallbackIcon = path.join(ROOT_DIR, "icon.png");
  if (fs.existsSync(fallbackIcon)) {
    return res.sendFile(fallbackIcon);
  }
  next();
});

// Serve the project files as static assets.
app.use(express.static(ROOT_DIR));

// Provide stable shortcuts for the main MR app page.
app.get(["/", "/mr"], (req, res) => {
  res.sendFile(path.join(ROOT_DIR, "mr.html"));
});

function runManifestGenerator() {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [MANIFEST_SCRIPT],
      { 
        cwd: ROOT_DIR, 
        windowsHide: true, 
        maxBuffer: 1024 * 1024 * 8,
        env: { ...process.env, CHAR_MGR_STORY_DIR: getStoryRootDir() }
      },
      (error, stdout, stderr) => {
        if (error) {
          reject({
            error,
            stdout: String(stdout || "").trim(),
            stderr: String(stderr || "").trim()
          });
          return;
        }

        resolve({
          stdout: String(stdout || "").trim(),
          stderr: String(stderr || "").trim()
        });
      }
    );
  });
}

function toPosix(value) {
  return String(value || "").replace(/\\/g, "/");
}

function parseMasterKey(raw) {
  const value = String(raw || "").trim();
  if (!value) {
    return null;
  }

  if (/^[A-Fa-f0-9]{64}$/.test(value)) {
    return Buffer.from(value, "hex");
  }

  try {
    const decoded = Buffer.from(value, "base64");
    if (decoded.length >= 32) {
      return decoded.subarray(0, 32);
    }
  } catch {
    // Ignore invalid base64 and fall through.
  }

  return null;
}

function computePathEquation(relPath) {
  const normalized = toPosix(relPath).toLowerCase();
  const bytes = Buffer.from(normalized, "utf8");
  let acc = 0n;
  const mod = 4294967291n;

  for (let i = 0; i < bytes.length; i += 1) {
    const idx = BigInt(i + 1);
    const value = BigInt(bytes[i] + 17);
    const term = (idx * idx + 3n * idx + 7n) * value;
    acc = (acc + term) % mod;
  }

  return acc.toString(16);
}

function deriveMediaKey(masterKey, relPath) {
  const equation = computePathEquation(relPath);
  const payload = `cm-secure-v1|${equation}|${toPosix(relPath).toLowerCase()}`;
  return crypto.createHmac("sha256", masterKey).update(payload).digest().subarray(0, 32);
}

function getMimeTypeFromPath(relPath) {
  const ext = path.extname(String(relPath || "")).toLowerCase();
  const map = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".avif": "image/avif",
    ".mp4": "video/mp4"
  };
  return map[ext] || "application/octet-stream";
}

async function decryptSecureMediaByPath(relPath) {
  const normalizedRelPath = toPosix(relPath).replace(/^\/+/, "");
  if (!/^(pictures\/[0-9A-Za-z_-]+\/(unmasked|exposed)\/|portraits\/rows\/)/i.test(normalizedRelPath)) {
    throw new Error("Path is not in secure media scope.");
  }

  const masterKey = parseMasterKey(SECURE_MASTER_KEY);
  if (!masterKey) {
    throw new Error("Secure media key is not configured.");
  }

  const sourceRelativePath = normalizedRelPath.toLowerCase().endsWith(".enc")
    ? normalizedRelPath.slice(0, -4)
    : normalizedRelPath;
  const encRelativePath = `${sourceRelativePath}.enc`;
  const encPath = path.join(ROOT_DIR, encRelativePath);
  const payload = await fs.promises.readFile(encPath);
  if (!payload || payload.length < 28) {
    throw new Error("Encrypted payload is invalid.");
  }

  const iv = payload.subarray(0, 12);
  const authTag = payload.subarray(12, 28);
  const ciphertext = payload.subarray(28);
  const key = deriveMediaKey(masterKey, sourceRelativePath);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  return {
    mimeType: getMimeTypeFromPath(sourceRelativePath),
    body: plaintext
  };
}

function isMediaFileName(name) {
  return MEDIA_EXT_RE.test(String(name || ""));
}

async function listMediaFiles(directory, options = {}) {
  const recursive = options.recursive !== false;
  const results = [];

  async function walk(absDir, relPrefix) {
    let entries = [];
    try {
      entries = await fs.promises.readdir(absDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const absPath = path.join(absDir, entry.name);
      const nextRel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        if (recursive) {
          await walk(absPath, nextRel);
        }
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (!isMediaFileName(entry.name)) {
        continue;
      }

      results.push(toPosix(nextRel));
    }
  }

  await walk(directory, "");
  return results;
}

function uniqueSorted(values = []) {
  return Array.from(new Set((values || []).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

async function listPictureYears() {
  const picturesDir = path.join(ROOT_DIR, "pictures");
  let entries = [];
  try {
    entries = await fs.promises.readdir(picturesDir, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((entry) => entry && entry.isDirectory() && /^\d{4}$/.test(String(entry.name || "")))
    .map((entry) => String(entry.name))
    .sort((a, b) => Number(a) - Number(b));
}

function normalizeJsonSourcePath(value, year) {
  const candidate = toPosix(String(value || `${year}.json`).trim()).replace(/^\/+/, "");
  if (!candidate || candidate.includes("..")) {
    return null;
  }
  // Allow .json and .md files, including nested subdirectories (safe chars only)
  // Examples: index.json, data.json, variants/one.json, some_dir/sub-dir/file.md
  if (!/^(?:[0-9A-Za-z_-]+(?:\/[0-9A-Za-z_.-]+)*)\.(?:json|md)$/.test(candidate)) {
    return null;
  }
  return candidate;
}

function normalizeDroppedImagePath(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  const normalized = toPosix(raw).replace(/^\/+/, "");
  if (!/^pictures\//i.test(normalized)) {
    return null;
  }
  if (!MEDIA_EXT_RE.test(normalized)) {
    return null;
  }
  return normalized;
}

function safeSlug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "row";
}

function mediaExtensionFromMime(mimeType) {
  const lower = String(mimeType || "").toLowerCase();
  if (lower === "image/png") return ".png";
  if (lower === "image/jpeg") return ".jpg";
  if (lower === "image/webp") return ".webp";
  if (lower === "image/gif") return ".gif";
  if (lower === "image/avif") return ".avif";
  if (lower === "video/mp4") return ".mp4";
  return "";
}

function mediaExtensionFromName(fileName) {
  const ext = path.extname(String(fileName || "")).toLowerCase();
  if (MEDIA_EXT_RE.test(ext)) {
    return ext;
  }
  return "";
}

function resolveYearsSourceAbsolutePath(sourcePath, year) {
  const isMd = String(sourcePath || "").toLowerCase().endsWith(".md");
  const yearStr = String(year || "").trim();

  // Try story directory first if year is provided
  if (yearStr) {
    const storyAbsPath = resolveStoryPath(yearStr, sourcePath);
    if (fs.existsSync(storyAbsPath)) {
      return storyAbsPath;
    }
  }

  // Fallback to legacy data directory
  const legacySubPath = path.join("data", "characters", "years", sourcePath);
  const absPath = path.join(ROOT_DIR, legacySubPath);

  // Security check: ensure the resolved path stays within the project root
  const relativeCheck = path.relative(ROOT_DIR, absPath);
  if (relativeCheck.startsWith("..") || path.isAbsolute(relativeCheck)) {
    return "";
  }
  return absPath;
}

async function updateRowInMarkdown(absPath, entryId, blockIndex, rowIndex, updates) {
  let raw;
  try {
    raw = await fs.promises.readFile(absPath, "utf8");
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      // As a last resort, (re)create a minimal scaffold
      await fs.promises.mkdir(path.dirname(absPath), { recursive: true });
      if (String(sourcePath || '').toLowerCase().endsWith('.md')) {
        const yaml = require('js-yaml');
        const meta = { navGroupOrder: Array.from(new Set(navGroupOrder)) };
        const content = `---\n${yaml.dump(meta, { lineWidth: -1, flowLevel: 3 })}---\n\n`;
        await fs.promises.writeFile(absPath, content, 'utf8');
        raw = content;
      } else {
        const scaffold = { meta: { navGroupOrder: Array.from(new Set(navGroupOrder)) }, entries: [] };
        await fs.promises.writeFile(absPath, JSON.stringify(scaffold, null, 2) + '\n', 'utf8');
        raw = JSON.stringify(scaffold, null, 2) + '\n';
      }
    } else {
      throw err;
    }
  }
  const parts = raw.split(/<!--\s*entry-break\s*-->/);

  const entryIdx = parts.findIndex(part => {
    const trimmedPart = part.trim();
    const fmMatch = trimmedPart.match(/^---\s*[\r\n]+([\s\S]*?)[\r\n]+---\s*[\r\n]*/);
    if (!fmMatch) return false;
    try {
      const meta = require("js-yaml").load(fmMatch[1]);
      return String(meta.id) === String(entryId);
    } catch { return false; }
  });

  if (entryIdx === -1) throw new Error("Entry not found in Markdown source.");

  const part = parts[entryIdx];
  const blockRegex = /<!--\s*block:\s*(\w+)\s*({.*?})\s*-->/g;
  const blocks = [];
  let match;
  const blockMatches = [];
  while ((match = blockRegex.exec(part)) !== null) {
    blockMatches.push(match);
  }

  // Find targeted block content
  let start, end;
  if (blockMatches.length === 0) {
    if (blockIndex === 0) { start = 0; end = part.length; }
    else throw new Error("Block not found.");
  } else {
    // Handle text before first block (index 0)
    if (blockIndex === 0) {
      if (blockMatches[0].index > 0) {
        start = 0; end = blockMatches[0].index;
      } else {
        // Index 0 IS the first block
        start = 0; end = (blockMatches.length > 1) ? blockMatches[1].index : part.length;
      }
    } else {
      const matchIdx = (blockMatches[0].index > 0) ? blockIndex - 1 : blockIndex;
      if (matchIdx < 0 || matchIdx >= blockMatches.length) throw new Error("Block index out of bounds.");
      start = blockMatches[matchIdx].index;
      end = (matchIdx + 1 < blockMatches.length) ? blockMatches[matchIdx + 1].index : part.length;
    }
  }

  let blockBody = part.slice(start, end);
  const blockHeader = blockMatches.find(m => m.index === start)?.[0] || "";
  const actualBody = blockBody.slice(blockHeader.length);

  // Update table row if it's a table block
  if (blockHeader.includes("block: table") || (!blockHeader && actualBody.includes("## "))) {
    const rows = actualBody.split(/^##\s+/m);
    const headerPart = rows[0];
    const dataRows = rows.slice(1);
    if (rowIndex >= dataRows.length) throw new Error("Row index out of bounds.");

    let rowContent = dataRows[rowIndex];
    if (updates.imagePath !== undefined) {
      const variant = updates.variant || "base";
      const key = variant === "unmasked" ? "unmasked" : (variant === "exposed" ? "exposed" : "img");
      const pattern = new RegExp(`\\*\\(${key}:.*?\\)\\*`, "i");
      const newLine = `*(${key}: ${updates.imagePath})*`;
      if (pattern.test(rowContent)) {
        rowContent = rowContent.replace(pattern, newLine);
      } else {
        rowContent = rowContent.trim() + (rowContent.includes("\n") ? "\n" : " ") + newLine + "\n";
      }
    }
    if (updates.subtitle !== undefined) {
      const pattern = /\*\(imgnotes:.*?\)\*/i;
      const newLine = `*(imgnotes: ${updates.subtitle})*`;
      if (pattern.test(rowContent)) {
        rowContent = rowContent.replace(pattern, newLine);
      } else {
        rowContent = rowContent.trim() + (rowContent.includes("\n") ? "\n" : " ") + newLine + "\n";
      }
    }
    dataRows[rowIndex] = rowContent;
    blockBody = blockHeader + headerPart + "## " + dataRows.join("## ");
  }

  parts[entryIdx] = part.slice(0, start) + blockBody + part.slice(end);
  await fs.promises.writeFile(absPath, parts.join("<!-- entry-break -->"), "utf8");
}

function parseTimelineDateParts(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(-?\d+)-(\d{1,2})-(\d{1,2})$/);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year)) {
    return null;
  }
  if (!Number.isFinite(month) || month < 0 || month > 12) {
    return null;
  }
  if (!Number.isFinite(day) || day < 0 || day > 31) {
    return null;
  }
  return { year, month, day };
}

function sortTimelineEvents(events) {
  const list = Array.isArray(events) ? events : [];
  return list
    .map((event, index) => ({ event, index }))
    .sort((a, b) => {
      const pa = parseTimelineDateParts(a?.event?.date || "");
      const pb = parseTimelineDateParts(b?.event?.date || "");
      if (!pa && !pb) return a.index - b.index;
      if (!pa) return 1;
      if (!pb) return -1;
      if (pa.year !== pb.year) return pa.year - pb.year;
      if (pa.month !== pb.month) return pa.month - pb.month;
      if (pa.day !== pb.day) return pa.day - pb.day;
      return a.index - b.index;
    })
    .map((entry) => entry.event);
}

async function loadEventsForStory(storyName, visited = new Set()) {
  if (visited.has(storyName)) return [];
  visited.add(storyName);

  const storyDir = path.join(ROOT_DIR, "stories", storyName);
  if (!fs.existsSync(storyDir)) return [];

  const timelineDir = path.join(storyDir, "timeline");
  const events = [];
  const yaml = require("js-yaml");

  if (fs.existsSync(timelineDir)) {
    const files = await listMarkdownFilesRecursive(timelineDir);
    for (const absPath of files) {
      const raw = await fs.promises.readFile(absPath, "utf8");
      const parts = raw.split(/<!--\s*entry-break\s*-->/);
      for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        const fmMatch = trimmed.match(/^---\s*[\r\n]+([\s\S]*?)[\r\n]+---\s*[\r\n]*/);
        if (fmMatch) {
          try {
            const meta = yaml.load(fmMatch[1]);
            const body = trimmed.slice(fmMatch[0].length).trim();
            // Skip stub entries (empty or only HTML comments)
            if (/^(?:<!--[\s\S]*?-->\s*)*$/.test(body)) {
              continue;
            }
            events.push({
              ...meta,
              description: body,
              __source: toPosix(path.relative(ROOT_DIR, absPath)),
              __isMd: true
            });
          } catch (e) {
            console.error(`Error parsing timeline MD entry in ${absPath}:`, e);
          }
        }
      }
    }
  }

  // Read metadata to check for baseStory
  const metaPath = path.join(storyDir, "metadata.json");
  let baseStory = null;
  if (fs.existsSync(metaPath)) {
    try {
      const metaContent = await fs.promises.readFile(metaPath, "utf8");
      const metaJson = JSON.parse(metaContent);
      baseStory = metaJson.baseStory || metaJson.parentStory;
    } catch (e) {
      // Ignore
    }
  }

  if (baseStory) {
    const baseStoryDir = path.join(ROOT_DIR, "stories", baseStory);
    if (fs.existsSync(baseStoryDir) && baseStory !== storyName) {
      // Find earliest date in current events list
      let earliestDate = null;
      for (const ev of events) {
        if (ev.date) {
          if (!earliestDate || ev.date < earliestDate) {
            earliestDate = ev.date;
          }
        }
      }

      const baseEvents = await loadEventsForStory(baseStory, visited);

      // Filter base story events: keep only those with date < earliestDate
      const filteredBase = earliestDate
        ? baseEvents.filter(ev => !ev.date || ev.date < earliestDate)
        : baseEvents;

      // Prepend base events
      events.unshift(...filteredBase);
    }
  }

  return events;
}

async function getTimelineEvents() {
  const activeName = path.basename(getStoryRootDir());
  if (cachedEvents && cachedStoryName === activeName) {
    return JSON.parse(JSON.stringify(cachedEvents));
  }

  const events = await loadEventsForStory(activeName);

  // Assign original load indices and guarantee unique IDs before any other processing or sorting
  events.forEach((ev, idx) => {
    ev.__loadIndex = idx;
    if (!ev.id) {
      ev.id = `evt_${idx}`;
    }
  });

  // Dynamic automatic grouping based on title prefixes
  events.forEach(ev => {
    if (ev.parent) return; // Already has an explicit parent
    
    const title = String(ev.title || "").trim();
    const splitMatch = title.match(/\s+(?:—|--|-|:)\s+/);
    if (splitMatch) {
      const prefix = title.substring(0, splitMatch.index).trim();
      const suffix = title.substring(splitMatch.index + splitMatch[0].length).trim();
      
      if (prefix && suffix) {
        // Find another event on the SAME date whose title matches the prefix
        const parent = events.find(other => 
          other.id !== ev.id && 
          other.date === ev.date && 
          String(other.title || "").trim().toLowerCase() === prefix.toLowerCase()
        );
        
        if (parent) {
          ev.parent = parent.id;
        }
      }
    }
  });

  // Date inheritance and depth calculation for recursive entries
  const eventMap = new Map();
  events.forEach(ev => { eventMap.set(ev.id, ev); });
  
  events.forEach(ev => {
    let depth = 0;
    let current = ev;
    const visited = new Set();
    
    while (current && current.parent) {
      if (visited.has(current.id || current)) break; // Prevent infinite loops
      if (current.id) visited.add(current.id);
      else visited.add(current);

      const parent = eventMap.get(current.parent);
      if (!parent) break;
      
      if (!ev.date && parent.date) {
        ev.date = parent.date;
      }
      depth++;
      current = parent;
    }
    ev.__depth = depth;
    ev.__rootId = current.id || `root_${current.__loadIndex}`;
    ev.__rootLoadIndex = current.__loadIndex;
  });

  // Load legacy JSON
  const legacyPath = path.join(ROOT_DIR, "data", "timeline.json");
  if (fs.existsSync(legacyPath)) {
    try {
      const raw = await fs.promises.readFile(legacyPath, "utf8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        parsed.forEach(ev => {
          // Check if this event (by date+title) is already in MD
          const exists = events.find(m => m.date === ev.date && m.title === ev.title);
          if (!exists) {
            events.push({
              ...ev,
              __source: "data/timeline.json",
              __isMd: false,
              __loadIndex: events.length
            });
          }
        });
      }
    } catch (e) {
      console.error("Error reading legacy timeline.json:", e);
    }
  }

  // Sort by date and same-day parent-first topological order
  events.sort((a, b) => {
    const pa = parseTimelineDateParts(a.date);
    const pb = parseTimelineDateParts(b.date);
    if (!pa && !pb) return 0;
    if (!pa) return 1;
    if (!pb) return -1;
    if (pa.year !== pb.year) return pa.year - pb.year;
    if (pa.month !== pb.month) return pa.month - pb.month;
    if (pa.day !== pb.day) return pa.day - pb.day;

    // Same day parent-first topological sort
    const rootIdA = a.__rootId;
    const rootIdB = b.__rootId;

    if (rootIdA !== rootIdB) {
      // Different trees: compare by root ancestor's load index
      return (a.__rootLoadIndex ?? a.__loadIndex ?? 0) - (b.__rootLoadIndex ?? b.__loadIndex ?? 0);
    }

    // Same tree: compare depth (parent depth 0 comes first)
    if (a.__depth !== b.__depth) {
      return (a.__depth ?? 0) - (b.__depth ?? 0);
    }

    // Same depth: preserve loadIndex order
    return (a.__loadIndex ?? 0) - (b.__loadIndex ?? 0);
  });

  cachedEvents = events;
  cachedStoryName = activeName;
  return JSON.parse(JSON.stringify(events));
}

async function updateTimelineEventInMarkdown(absPath, identifier, updates) {
  const yaml = require("js-yaml");
  const raw = await fs.promises.readFile(absPath, "utf8");
  const parts = raw.split(/<!--\s*entry-break\s*-->/);

  const entryIdx = parts.findIndex(part => {
    const trimmed = part.trim();
    const fmMatch = trimmed.match(/^---\s*[\r\n]+([\s\S]*?)[\r\n]+---\s*[\r\n]*/);
    if (!fmMatch) return false;
    try {
      const meta = yaml.load(fmMatch[1]);
      if (identifier.id && meta.id === identifier.id) return true;
      if (identifier.date === meta.date && identifier.title === meta.title) return true;
      return false;
    } catch { return false; }
  });

  if (entryIdx === -1) throw new Error("Timeline event not found in Markdown source.");

  if (updates === null) {
    // Delete
    parts.splice(entryIdx, 1);
  } else {
    // Update
    const part = parts[entryIdx];
    const fmMatch = part.trim().match(/^---\s*[\r\n]+([\s\S]*?)[\r\n]+---\s*[\r\n]*/);
    const meta = yaml.load(fmMatch[1]);
    const body = part.trim().slice(fmMatch[0].length).trim();

    if (updates.date !== undefined) meta.date = updates.date;
    if (updates.title !== undefined) meta.title = updates.title;
    if (updates.tags !== undefined) meta.tags = updates.tags;
    if (updates.parent !== undefined) {
      if (updates.parent === null || updates.parent === "") {
        delete meta.parent;
      } else {
        meta.parent = updates.parent;
      }
    }
    if (updates.description !== undefined) {
      // Replace body
      parts[entryIdx] = `---\n${yaml.dump(meta, { lineWidth: -1, flowLevel: 3 })}---\n${updates.description}\n\n`;
    } else {
      parts[entryIdx] = `---\n${yaml.dump(meta, { lineWidth: -1, flowLevel: 3 })}---\n${body}\n\n`;
    }
  }

  await fs.promises.writeFile(absPath, parts.join("<!-- entry-break -->\n\n"), "utf8");
}

async function addTimelineEvent(options) {
  const date = String(options?.date || "").trim();
  const title = String(options?.title || "").trim();
  const description = String(options?.description || "").trim();
  const tags = Array.isArray(options?.tags) ? options.tags : [];

  if (!parseTimelineDateParts(date)) {
    throw new Error("Invalid date format. Use YYYY-MM-DD.");
  }
  if (!title) {
    throw new Error("Missing timeline title.");
  }

  const yaml = require("js-yaml");
  let decade = "ancient";
  if (date !== "0000-01-01") {
    const match = date.match(/^(\d{3})/);
    if (match) decade = match[1] + "0s";
  }
  const fileName = `${decade}.md`;
  const absPath = resolveStoryPath("timeline", fileName);

  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const todayStr = `${yyyy}-${mm}-${dd}`;
  const meta = { date, title, tags, datecreated: todayStr };
  const entryMd = `---\n${yaml.dump(meta, { lineWidth: -1, flowLevel: 3 })}---\n${description}\n\n`;

  if (fs.existsSync(absPath)) {
    let raw = await fs.promises.readFile(absPath, "utf8");
    raw = raw.trim();
    if (raw) raw += "\n\n<!-- entry-break -->\n\n";
    raw += entryMd;
    await fs.promises.writeFile(absPath, raw, "utf8");
  } else {
    await fs.promises.writeFile(absPath, entryMd, "utf8");
  }

  return { date, title, filePath: toPosix(path.relative(ROOT_DIR, absPath)) };
}

async function updateTimelineEventDate(options) {
  const oldDate = String(options?.oldDate || "").trim();
  const oldTitle = String(options?.oldTitle || "").trim();
  const newDate = String(options?.newDate || "").trim();
  const entryId = options?.id;

  const parsedDate = parseTimelineDateParts(newDate);
  if (!parsedDate) throw new Error("Invalid new date.");

  // Try to find in MD first
  const timelineDir = resolveStoryPath("timeline");
  const files = await listMarkdownFilesRecursive(timelineDir);
  for (const abs of files) {
    const raw = await fs.promises.readFile(abs, "utf8");
    if (raw.includes(oldTitle)) { // Quick check
      try {
        await updateTimelineEventInMarkdown(abs, { id: entryId, date: oldDate, title: oldTitle }, { date: newDate });
        return { oldDate, newDate, filePath: toPosix(path.relative(ROOT_DIR, abs)) };
      } catch { }
    }
  }

  // Fallback to legacy JSON
  const absPath = path.join(ROOT_DIR, "data", "timeline.json");
  const raw = await fs.promises.readFile(absPath, "utf8");
  const parsed = JSON.parse(raw);
  const event = parsed.find(ev => (entryId && ev.id === entryId) || (ev.date === oldDate && ev.title === oldTitle));
  if (!event) throw new Error("Timeline event not found.");
  event.date = newDate;
  await fs.promises.writeFile(absPath, JSON.stringify(parsed, null, 2) + "\n", "utf8");
  return { oldDate, newDate, filePath: "data/timeline.json" };
}

async function updateTimelineEventText(options) {
  const date = String(options?.date || "").trim();
  const title = String(options?.title || "").trim();
  const newTitle = String(options?.newTitle || "").trim();
  const newDescription = String(options?.newDescription || "").trim();
  const entryId = options?.id;

  if (!newTitle) throw new Error('Timeline title cannot be empty.');

  // Try MD
  const timelineDir = resolveStoryPath("timeline");
  const files = await listMarkdownFilesRecursive(timelineDir);
  for (const abs of files) {
    const raw = await fs.promises.readFile(abs, "utf8");
    if (raw.includes(title)) {
      try {
        await updateTimelineEventInMarkdown(abs, { id: entryId, date, title }, { title: newTitle, description: newDescription });
        return { date, title: newTitle, filePath: toPosix(path.relative(ROOT_DIR, abs)) };
      } catch { }
    }
  }

  const absPath = path.join(ROOT_DIR, 'data', 'timeline.json');
  const rawData = await fs.promises.readFile(absPath, 'utf8');
  const parsed = JSON.parse(rawData);
  const event = parsed.find(ev => (entryId && ev.id === entryId) || (ev.date === date && ev.title === title));
  if (!event) throw new Error('Timeline event not found.');
  event.title = newTitle;
  event.description = newDescription;
  await fs.promises.writeFile(absPath, JSON.stringify(parsed, null, 2) + "\n", 'utf8');
  return { date, title: newTitle, filePath: 'data/timeline.json' };
}

async function updateTimelineEventTags(options) {
  const date = String(options?.date || "").trim();
  const title = String(options?.title || "").trim();
  const tags = Array.isArray(options?.tags) ? options.tags.map(t => String(t || "").trim()).filter(Boolean) : [];
  const entryId = options?.id;

  // Try MD
  const timelineDir = resolveStoryPath("timeline");
  const files = await listMarkdownFilesRecursive(timelineDir);
  for (const abs of files) {
    const raw = await fs.promises.readFile(abs, "utf8");
    if (raw.includes(title)) {
      try {
        await updateTimelineEventInMarkdown(abs, { id: entryId, date, title }, { tags });
        return { date, title, tags, filePath: toPosix(path.relative(ROOT_DIR, abs)) };
      } catch { }
    }
  }

  const absPath = path.join(ROOT_DIR, 'data', 'timeline.json');
  const rawData = await fs.promises.readFile(absPath, 'utf8');
  const parsed = JSON.parse(rawData);
  const event = parsed.find(ev => (entryId && ev.id === entryId) || (ev.date === date && ev.title === title));
  if (!event) throw new Error('Timeline event not found.');
  event.tags = tags;
  await fs.promises.writeFile(absPath, JSON.stringify(parsed, null, 2) + "\n", 'utf8');
  return { date, title, tags, filePath: 'data/timeline.json' };
}

function preserveCase(match, repl) {
  if (!repl) return "";
  if (match === match.toUpperCase() && match !== match.toLowerCase()) {
    return repl.toUpperCase();
  }
  if (match === match.toLowerCase() && match !== match.toUpperCase()) {
    return repl.toLowerCase();
  }
  const first = match.charAt(0);
  if (first === first.toUpperCase() && first !== first.toLowerCase()) {
    return repl.split(/\s+/).map(word => {
      if (!word) return '';
      return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ');
  }
  return repl;
}

async function updateTimelineEventsTextBatch(options) {
  const { events, searchWords, replacement, mode } = options;
  if (!Array.isArray(events) || !Array.isArray(searchWords) || !searchWords.length) {
    throw new Error("Missing events or searchWords.");
  }

  const results = [];
  const timelineDir = resolveStoryPath("timeline");
  const mdFiles = await listMarkdownFilesRecursive(timelineDir);

  // Group events by file to minimize writes
  const fileGroups = new Map();
  const legacyEvents = [];

  for (const event of events) {
    let foundInMd = false;
    for (const abs of mdFiles) {
      const raw = await fs.promises.readFile(abs, "utf8");
      if (raw.includes(event.title)) {
        if (!fileGroups.has(abs)) fileGroups.set(abs, []);
        fileGroups.get(abs).push(event);
        foundInMd = true;
        break;
      }
    }
    if (!foundInMd) legacyEvents.push(event);
  }

  const yaml = require("js-yaml");

  // Process MD files
  for (const [absPath, groupEvents] of fileGroups.entries()) {
    const raw = await fs.promises.readFile(absPath, "utf8");
    const parts = raw.split(/<!--\s*entry-break\s*-->/);
    let modified = false;

    for (const event of groupEvents) {
      const idx = parts.findIndex(part => {
        const trimmed = part.trim();
        const fmMatch = trimmed.match(/^---\s*[\r\n]+([\s\S]*?)[\r\n]+---\s*[\r\n]*/);
        if (!fmMatch) return false;
        try {
          const meta = yaml.load(fmMatch[1]);
          return String(meta.title) === String(event.title) && String(meta.date) === String(event.date);
        } catch { return false; }
      });

      if (idx !== -1) {
        const fmMatch = parts[idx].trim().match(/^---\s*[\r\n]+([\s\S]*?)[\r\n]+---\s*[\r\n]*/);
        const meta = yaml.load(fmMatch[1]);
        let body = parts[idx].trim().slice(fmMatch[0].length).trim();
        let titleVal = String(meta.title || "");

        let changed = false;

        for (const searchWord of searchWords) {
          if (!searchWord) continue;
          const escaped = searchWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regexPattern = `(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`;
          const regex = new RegExp(regexPattern, 'gui');

          if (regex.test(titleVal)) {
            titleVal = titleVal.replace(regex, (m) => preserveCase(m, replacement));
            changed = true;
          }
          if (regex.test(body)) {
            body = body.replace(regex, (m) => preserveCase(m, replacement));
            changed = true;
          }
        }

        if (changed) {
          meta.title = titleVal;
          parts[idx] = `---\n${yaml.dump(meta, { lineWidth: -1, flowLevel: 3 })}---\n${body}\n\n`;
          modified = true;
          results.push({ ...event, title: titleVal, filePath: toPosix(path.relative(ROOT_DIR, absPath)) });
        }
      }
    }

    if (modified) {
      await fs.promises.writeFile(absPath, parts.join("<!-- entry-break -->\n\n"), "utf8");
    }
  }

  // Process Legacy JSON
  if (legacyEvents.length) {
    const absPath = path.join(ROOT_DIR, 'data', 'timeline.json');
    if (fs.existsSync(absPath)) {
      const rawData = await fs.promises.readFile(absPath, 'utf8');
      const parsed = JSON.parse(rawData);
      let modified = false;
      for (const event of legacyEvents) {
        const match = parsed.find(ev => (event.id && ev.id === event.id) || (ev.date === event.date && ev.title === event.title));
        if (match) {
          let titleVal = String(match.title || "");
          let body = String(match.description || "");
          let changed = false;

          for (const searchWord of searchWords) {
            if (!searchWord) continue;
            const escaped = searchWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regexPattern = `(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`;
            const regex = new RegExp(regexPattern, 'gui');

            if (regex.test(titleVal)) {
              titleVal = titleVal.replace(regex, (m) => preserveCase(m, replacement));
              changed = true;
            }
            if (regex.test(body)) {
              body = body.replace(regex, (m) => preserveCase(m, replacement));
              changed = true;
            }
          }

          if (changed) {
            match.title = titleVal;
            match.description = body;
            modified = true;
            results.push({ ...event, title: titleVal, filePath: 'data/timeline.json' });
          }
        }
      }
      if (modified) {
        await fs.promises.writeFile(absPath, JSON.stringify(parsed, null, 2) + "\n", 'utf8');
      }
    }
  }

  // Run compaction tool if it exists to regenerate AI ingestion profiles
  const compactScript = path.join(ROOT_DIR, "tools", "compact_timeline.js");
  if (fs.existsSync(compactScript)) {
    try {
      const { execSync } = require("child_process");
      execSync(`node "${compactScript}"`, {
        cwd: ROOT_DIR,
        env: { ...process.env, CHAR_MGR_STORY_DIR: getStoryRootDir() },
        timeout: 15000
      });
      console.log("Compacted timeline after batch text action.");
    } catch (err) {
      console.error("Failed to run compact_timeline.js after batch text action:", err);
    }
  }

  return { results };
}

async function updateTimelineEventsTagsBatch(options) {
  const { events, tag, mode } = options;
  if (!Array.isArray(events) || !tag) throw new Error("Missing events or tag.");

  const results = [];
  const timelineDir = resolveStoryPath("timeline");
  const mdFiles = await listMarkdownFilesRecursive(timelineDir);

  // Group events by file to minimize writes
  const fileGroups = new Map();
  const legacyEvents = [];

  for (const event of events) {
    let foundInMd = false;
    for (const abs of mdFiles) {
      const raw = await fs.promises.readFile(abs, "utf8");
      if (raw.includes(event.title)) {
        if (!fileGroups.has(abs)) fileGroups.set(abs, []);
        fileGroups.get(abs).push(event);
        foundInMd = true;
        break;
      }
    }
    if (!foundInMd) legacyEvents.push(event);
  }

  // Process MD files
  for (const [absPath, groupEvents] of fileGroups.entries()) {
    const raw = await fs.promises.readFile(absPath, "utf8");
    const parts = raw.split(/<!--\s*entry-break\s*-->/);
    let modified = false;

    for (const event of groupEvents) {
      const idx = parts.findIndex(part => {
        const trimmed = part.trim();
        const fmMatch = trimmed.match(/^---\s*[\r\n]+([\s\S]*?)[\r\n]+---\s*[\r\n]*/);
        if (!fmMatch) return false;
        try {
          const meta = yaml.load(fmMatch[1]);
          return String(meta.title) === String(event.title) && String(meta.date) === String(event.date);
        } catch { return false; }
      });

      if (idx !== -1) {
        const fmMatch = parts[idx].trim().match(/^---\s*[\r\n]+([\s\S]*?)[\r\n]+---\s*[\r\n]*/);
        const meta = yaml.load(fmMatch[1]);
        const body = parts[idx].trim().slice(fmMatch[0].length).trim();
        let currentTags = Array.isArray(meta.tags) ? meta.tags : [];
        
        let changed = false;
        if (mode === 'remove' || mode === 'remove-tag') {
          const originalCount = currentTags.length;
          currentTags = currentTags.filter(t => String(t).toLowerCase().trim() !== tag.toLowerCase().trim());
          if (currentTags.length !== originalCount) changed = true;
        } else {
          if (mode === 'merge') {
            const originalCount = currentTags.length;
            // Filter out related tags
            currentTags = currentTags.filter(t => {
              const nt = String(t).toLowerCase().trim();
              const target = tag.toLowerCase().trim();
              return !(nt.startsWith(target + '-') || nt.endsWith('-' + target) || nt === target);
            });
            if (currentTags.length !== originalCount) changed = true;
          }

          if (!currentTags.includes(tag)) {
            currentTags.push(tag);
            changed = true;
          }
        }

        if (changed) {
          meta.tags = currentTags;
          parts[idx] = `---\n${yaml.dump(meta, { lineWidth: -1, flowLevel: 3 })}---\n${body}\n\n`;
          modified = true;
          results.push({ ...event, tags: meta.tags, filePath: toPosix(path.relative(ROOT_DIR, absPath)) });
        }
      }
    }

    if (modified) {
      await fs.promises.writeFile(absPath, parts.join("<!-- entry-break -->\n\n"), "utf8");
    }
  }

  // Process Legacy JSON
  if (legacyEvents.length) {
    const absPath = path.join(ROOT_DIR, 'data', 'timeline.json');
    if (fs.existsSync(absPath)) {
      const rawData = await fs.promises.readFile(absPath, 'utf8');
      const parsed = JSON.parse(rawData);
      let modified = false;
      for (const event of legacyEvents) {
        const match = parsed.find(ev => (event.id && ev.id === event.id) || (ev.date === event.date && ev.title === event.title));
        if (match) {
          let currentTags = Array.isArray(match.tags) ? [...match.tags] : [];
          let changed = false;

          if (mode === 'remove' || mode === 'remove-tag') {
            const originalCount = currentTags.length;
            currentTags = currentTags.filter(t => String(t).toLowerCase().trim() !== tag.toLowerCase().trim());
            if (currentTags.length !== originalCount) changed = true;
          } else {
            if (!currentTags.includes(tag)) {
              currentTags.push(tag);
              changed = true;
            }
          }

          if (changed) {
            match.tags = currentTags;
            modified = true;
            results.push({ ...event, tags: match.tags, filePath: 'data/timeline.json' });
          }
        }
      }
      if (modified) {
        await fs.promises.writeFile(absPath, JSON.stringify(parsed, null, 2) + "\n", 'utf8');
      }
    }
  }

  return { results };
}

async function deleteTimelineEvent(options) {
  const date = String(options?.date || "").trim();
  const title = String(options?.title || "").trim();
  const entryId = options?.id;

  // Try MD
  const timelineDir = resolveStoryPath("timeline");
  const files = await listMarkdownFilesRecursive(timelineDir);
  for (const abs of files) {
    const raw = await fs.promises.readFile(abs, "utf8");
    if (raw.includes(title)) {
      try {
        await updateTimelineEventInMarkdown(abs, { id: entryId, date, title }, null);
        return { date, title, deleted: true };
      } catch { }
    }
  }

  const absPath = path.join(ROOT_DIR, 'data', 'timeline.json');
  const rawData = await fs.promises.readFile(absPath, 'utf8');
  let parsed = JSON.parse(rawData);
  const idx = parsed.findIndex(ev => (entryId && ev.id === entryId) || (ev.date === date && ev.title === title));
  if (idx === -1) throw new Error('Timeline event not found.');
  parsed.splice(idx, 1);
  await fs.promises.writeFile(absPath, JSON.stringify(parsed, null, 2) + "\n", 'utf8');
  return { date, title, deleted: true };
}

function sortHistoryEntries(historyObj) {
  const source = historyObj && typeof historyObj === "object" ? historyObj : {};
  const entries = Object.entries(source).map(([date, events], index) => ({
    date: String(date || "").trim(),
    events: Array.isArray(events) ? events : [],
    index
  }));

  entries.sort((a, b) => {
    const pa = parseTimelineDateParts(a.date);
    const pb = parseTimelineDateParts(b.date);
    if (!pa && !pb) return a.index - b.index;
    if (!pa) return 1;
    if (!pb) return -1;
    if (pa.year !== pb.year) return pa.year - pb.year;
    if (pa.month !== pb.month) return pa.month - pb.month;
    if (pa.day !== pb.day) return pa.day - pb.day;
    return a.index - b.index;
  });

  const sorted = {};
  entries.forEach((item) => {
    if (!item.date) {
      return;
    }
    sorted[item.date] = item.events;
  });
  return sorted;
}

async function updateRelationshipDate(options) {
  const relationshipId = String(options?.relationshipId || "").trim();
  const oldDate = String(options?.oldDate || "").trim();
  const date = String(options?.date || "").trim();
  const field = String(options?.field || "").trim();

  if (!relationshipId) {
    throw new Error("Missing relationshipId.");
  }
  if (!["startDate", "splitDate", "history"].includes(field)) {
    throw new Error("Invalid field.");
  }
  if (!parseTimelineDateParts(date)) {
    throw new Error("Invalid date format.");
  }

  // Try MD
  const allParsed = await getRelationships();
  const match = allParsed.find(r => r.id === relationshipId);
  if (!match) throw new Error("Relationship not found.");

  if (match.__isMd) {
    const absPath = path.join(ROOT_DIR, match.__source);
    const updates = {};
    if (field === 'startDate') updates.startDate = date;
    else if (field === 'splitDate') updates.splitDate = date;
    else if (field === 'history') {
      const history = match.history || {};
      const events = history[oldDate] || [];
      delete history[oldDate];
      history[date] = events;
      updates.history = history;
    }
    await updateRelationshipInMarkdown(absPath, relationshipId, updates);
    return { relationshipId, field, date, oldDate: oldDate || null, filePath: match.__source };
  }

  const absPath = path.join(ROOT_DIR, "data", "relationships.json");
  const raw = await fs.promises.readFile(absPath, "utf8");
  const parsed = JSON.parse(raw);
  const rows = Array.isArray(parsed?.relationships) ? parsed.relationships : (Array.isArray(parsed) ? parsed : []);
  const row = rows.find((item) => String(item?.id || "").trim() === relationshipId);
  if (!row) throw new Error("Relationship not found.");

  if (field === "startDate" || field === "splitDate") {
    row[field] = date;
  } else {
    if (!oldDate) throw new Error("Missing oldDate for history update.");
    const history = row.history && typeof row.history === "object" ? { ...row.history } : {};
    const oldEvents = history[oldDate];
    if (!oldEvents) throw new Error("Relationship history date not found.");
    if (oldDate !== date) {
      const merged = [...(Array.isArray(history[date]) ? history[date] : []), ...oldEvents];
      history[date] = merged;
      delete history[oldDate];
    }
    row.history = sortHistoryEntries(history);
  }

  const output = JSON.stringify(parsed, null, 2) + "\n";
  await fs.promises.writeFile(absPath, output, "utf8");

  return { relationshipId, field, date, oldDate: oldDate || null, filePath: "data/relationships.json" };
}

async function updateRelationshipText(options) {
  const relationshipId = String(options?.relationshipId || '').trim();
  const field = String(options?.field || '').trim();
  const text = String(options?.text || '').trim();
  const oldText = String(options?.oldText || '').trim();
  const date = String(options?.date || '').trim();

  if (!relationshipId) {
    throw new Error('Missing relationshipId.');
  }

  // Try MD
  const allParsed = await getRelationships();
  const match = allParsed.find(r => r.id === relationshipId);
  if (!match) throw new Error("Relationship not found.");

  if (match.__isMd) {
    const absPath = path.join(ROOT_DIR, match.__source);
    const updates = {};
    if (field === 'notes') updates.notes = text;
    else if (field === 'history-note') {
      const history = match.history || {};
      const events = history[date] || [];
      const idx = events.indexOf(oldText);
      if (idx !== -1) events[idx] = text;
      else events.push(text);
      history[date] = events;
      updates.history = history;
    }
    await updateRelationshipInMarkdown(absPath, relationshipId, updates);
    return { relationshipId, field, date, filePath: match.__source };
  }

  const absPath = path.join(ROOT_DIR, 'data', 'relationships.json');
  const raw = await fs.promises.readFile(absPath, 'utf8');
  const parsed = JSON.parse(raw);
  const rows = Array.isArray(parsed?.relationships) ? parsed.relationships : (Array.isArray(parsed) ? parsed : []);
  const row = rows.find((item) => String(item?.id || '').trim() === relationshipId);
  if (!row) throw new Error('Relationship not found.');

  if (field === 'notes') {
    if (Object.prototype.hasOwnProperty.call(row, 'core-note')) {
      row['core-note'] = text;
    } else {
      row.notes = text;
    }
  } else {
    if (!date) throw new Error('Missing date for history-note update.');
    const history = row.history && typeof row.history === 'object' ? { ...row.history } : {};
    const events = Array.isArray(history[date]) ? [...history[date]] : null;
    if (!events) throw new Error('Relationship history date not found.');

    let replaced = false;
    const updated = events.map((token) => {
      if (replaced) return token;
      const rawToken = String(token || '').trim();
      const body = rawToken.replace(/^timeline-note\s*:\s*/i, '').trim();
      if (oldText && body !== oldText) return token;
      replaced = true;
      return rawToken.includes(':') ? `timeline-note: ${text}` : text;
    });

    if (!replaced) throw new Error('Relationship timeline-note not found for update.');
    history[date] = updated;
    row.history = sortHistoryEntries(history);
  }

  const output = JSON.stringify(parsed, null, 2) + '\n';
  await fs.promises.writeFile(absPath, output, 'utf8');

  return { relationshipId, field, date, filePath: 'data/relationships.json' };
}

async function deleteRelationshipHistoryNote(options) {
  const relationshipId = String(options?.relationshipId || '').trim();
  const date = String(options?.date || '').trim();
  const text = String(options?.text || '').trim();

  if (!relationshipId) {
    throw new Error('Missing relationshipId.');
  }

  // Try MD
  const allParsed = await getRelationships();
  const match = allParsed.find(r => r.id === relationshipId);
  if (!match) throw new Error("Relationship not found.");

  if (match.__isMd) {
    const absPath = path.join(ROOT_DIR, match.__source);
    await updateRelationshipInMarkdown(absPath, relationshipId, {}, { date, text });
    return { relationshipId, date, filePath: match.__source };
  }

  const absPath = path.join(ROOT_DIR, 'data', 'relationships.json');
  const raw = await fs.promises.readFile(absPath, 'utf8');
  const parsed = JSON.parse(raw);
  const rows = Array.isArray(parsed?.relationships) ? parsed.relationships : (Array.isArray(parsed) ? parsed : []);
  const row = rows.find((item) => String(item?.id || '').trim() === relationshipId);
  if (!row) throw new Error('Relationship not found.');

  if (!row.history || !row.history[date]) {
    throw new Error('Relationship history date not found.');
  }
  const idx = row.history[date].indexOf(text);
  if (idx !== -1) {
    row.history[date].splice(idx, 1);
    if (row.history[date].length === 0) delete row.history[date];
  }

  const output = JSON.stringify(parsed, null, 2) + '\n';
  await fs.promises.writeFile(absPath, output, 'utf8');

  return { relationshipId, date, filePath: 'data/relationships.json' };
}

async function updateCharacterCoreBirthDate(options) {
  const characterId = String(options?.characterId || "").toLowerCase().trim();
  const newDate = String(options?.date || "").trim();
  if (!characterId) {
    throw new Error("Missing characterId.");
  }

  const parsedDate = parseTimelineDateParts(newDate);
  if (!parsedDate) {
    throw new Error("Invalid date format. Use YYYY-MM-DD (supports negative years, and 00 month/day).");
  }

  const candidatePaths = [
    resolveStoryPath("core.json"),
    path.join(ROOT_DIR, 'data', 'characters', 'core.json'),
    path.join(ROOT_DIR, 'data', 'characters', 'character_core.json')
  ];
  const absPath = candidatePaths.find((p) => fs.existsSync(p)) || candidatePaths[0];

  const raw = await fs.promises.readFile(absPath, "utf8");
  const parsed = JSON.parse(raw);
  const characters = parsed?.characters && typeof parsed.characters === "object"
    ? parsed.characters
    : null;
  if (!characters) {
    throw new Error("Character core source is invalid.");
  }

  let character = characters[characterId];
  if (!character || typeof character !== "object") {
    const mergedCore = await readAndMergeStoryJson("core.json");
    const inherited = mergedCore.characters?.[characterId];
    if (inherited && typeof inherited === 'object') {
      character = JSON.parse(JSON.stringify(inherited));
      characters[characterId] = character;
    } else {
      throw new Error("Character not found.");
    }
  }

  const rows = Array.isArray(character.rows) ? character.rows : [];
  let targetRow = rows.find((row) => row && typeof row === "object" && String(row.birthDate || "").trim());
  if (!targetRow) {
    targetRow = rows.find((row) => row && typeof row === "object" && String(row.label || "").toLowerCase().trim() === "birthday");
  }
  if (!targetRow) {
    targetRow = { label: "birthday", value: "", birthDate: newDate, pinned: true };
    rows.push(targetRow);
    character.rows = rows;
  }

  targetRow.birthDate = newDate;

  const output = JSON.stringify(parsed, null, 2) + "\n";
  await fs.promises.writeFile(absPath, output, "utf8");

  return {
    characterId,
    date: newDate,
    filePath: toPosix(path.relative(ROOT_DIR, absPath))
  };
}

function runVitalsGenerator() {
  const scriptPath = path.join(ROOT_DIR, "tools", "generate_vitals.js");
  if (!fs.existsSync(scriptPath)) {
    console.error("runVitalsGenerator: generate_vitals.js not found.");
    return;
  }
  execFile(
    process.execPath,
    [scriptPath],
    {
      cwd: ROOT_DIR,
      windowsHide: true,
      env: { ...process.env, CHAR_MGR_STORY_DIR: getStoryRootDir() }
    },
    (error, stdout, stderr) => {
      if (error) {
        console.error("runVitalsGenerator error:", stderr || error.message);
      } else {
        console.log("runVitalsGenerator output:", stdout.trim());
      }
    }
  );
}

async function addTimelineEvent(options) {
  const date = String(options?.date || "").trim();
  const title = String(options?.title || "").trim();
  const description = String(options?.description || "").trim();
  const tags = Array.isArray(options?.tags)
    ? options.tags.map((tag) => String(tag || "").trim()).filter(Boolean)
    : [];

  if (!parseTimelineDateParts(date)) {
    throw new Error("Invalid date format. Use YYYY-MM-DD (supports negative years, and 00 month/day).");
  }
  if (!title) {
    throw new Error("Missing timeline title.");
  }

  const absPath = path.join(ROOT_DIR, "data", "timeline.json");
  const raw = await fs.promises.readFile(absPath, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("Timeline source is not an array.");
  }

  parsed.push({
    date,
    title,
    description,
    tags: Array.from(new Set(tags))
  });

  const sorted = sortTimelineEvents(parsed);
  const output = JSON.stringify(sorted, null, 2) + "\n";
  await fs.promises.writeFile(absPath, output, "utf8");

  return {
    date,
    title,
    filePath: "data/timeline.json"
  };
}

async function bulkAddTimelineEvents(events) {
  if (!Array.isArray(events)) {
    throw new Error("Events must be an array.");
  }

  const absPath = path.join(ROOT_DIR, "data", "timeline.json");
  const raw = await fs.promises.readFile(absPath, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("Timeline source is not an array.");
  }

  const added = [];
  for (const ev of events) {
    const date = String(ev?.date || "").trim();
    const title = String(ev?.title || "").trim();
    const description = String(ev?.description || "").trim();
    const tags = Array.isArray(ev?.tags)
      ? ev.tags.map((tag) => String(tag || "").trim()).filter(Boolean)
      : [];

    if (!parseTimelineDateParts(date)) continue;
    if (!title) continue;

    parsed.push({
      date,
      title,
      description,
      tags: Array.from(new Set(tags))
    });
    added.push({ date, title });
  }

  if (added.length === 0) {
    return { ok: true, added: [] };
  }

  const sorted = sortTimelineEvents(parsed);
  const output = JSON.stringify(sorted, null, 2) + "\n";
  await fs.promises.writeFile(absPath, output, "utf8");

  return {
    ok: true,
    added,
    filePath: "data/timeline.json"
  };
}

async function getRelationships() {
  const relDir = resolveStoryPath("relationships");
  let allRelationships = [];

  if (fs.existsSync(relDir)) {
    const files = await fs.promises.readdir(relDir);
    for (const file of files) {
      if (!file.toLowerCase().endsWith(".md")) continue;
      const abs = path.join(relDir, file);
      const content = await fs.promises.readFile(abs, "utf8");
      const blocks = content.split("<!-- entry-break -->").filter(Boolean);

      for (const block of blocks) {
        const trimmed = block.trim();
        const fmMatch = trimmed.match(/^---\s*[\r\n]+([\s\S]*?)[\r\n]+---\s*[\r\n]*/);
        if (fmMatch) {
          try {
            const meta = yaml.load(fmMatch[1]);
            let body = trimmed.slice(fmMatch[0].length).trim();

            // Extract history block
            let history = null;
            if (body.includes("<!-- block: history -->")) {
              const hParts = body.split("<!-- block: history -->");
              const hEndParts = hParts[1].split("<!-- end-block -->");
              const hLines = hEndParts[0].trim().split("\n");
              history = {};
              hLines.forEach(line => {
                const colonIdx = line.indexOf(": ");
                if (colonIdx !== -1) {
                  const date = line.substring(0, colonIdx).trim();
                  const text = line.substring(colonIdx + 2).trim();
                  if (!history[date]) history[date] = [];
                  history[date].push(text);
                }
              });
              body = hParts[0].trim() + (hEndParts[1] ? "\n\n" + hEndParts[1].trim() : "");
            }

            allRelationships.push({
              ...meta,
              notes: body.trim(),
              history,
              __isMd: true,
              __source: toPosix(path.relative(ROOT_DIR, abs))
            });
          } catch (e) {
            console.error(`Error parsing relationship MD block in ${file}:`, e);
          }
        }
      }
    }
  }

  // Load legacy JSON as fallback
  const legacyPath = path.join(ROOT_DIR, "data", "relationships.json");
  if (fs.existsSync(legacyPath)) {
    try {
      const raw = await fs.promises.readFile(legacyPath, "utf8");
      const data = JSON.parse(raw);
      const legacyItems = Array.isArray(data.relationships) ? data.relationships : (Array.isArray(data) ? data : []);

      const existingIds = new Set(allRelationships.map(r => r.id));
      legacyItems.forEach((item, idx) => {
        if (!existingIds.has(item.id)) {
          allRelationships.push({
            ...item,
            __isMd: false,
            __source: "data/relationships.json",
            __sourceIndex: idx
          });
        }
      });
    } catch (e) {
      console.error("Error loading legacy relationships.json:", e);
    }
  }

  // Sort by startDate
  allRelationships.sort((a, b) => {
    const pa = parseTimelineDateParts(a.startDate || "");
    const pb = parseTimelineDateParts(b.startDate || "");
    if (!pa && !pb) return String(a.label || "").localeCompare(String(b.label || ""));
    if (!pa) return 1;
    if (!pb) return -1;
    if (pa.year !== pb.year) return pa.year - pb.year;
    if (pa.month !== pb.month) return pa.month - pb.month;
    if (pa.day !== pb.day) return pa.day - pb.day;
    return String(a.label || "").localeCompare(String(b.label || ""));
  });

  return allRelationships;
}

async function updateRelationshipInMarkdown(absPath, relId, updates, deleteHistory = null) {
  let content = await fs.promises.readFile(absPath, "utf8");
  const rawBlocks = content.split("<!-- entry-break -->");
  let found = false;

  const newBlocks = rawBlocks.map(block => {
    if (found) return block;
    const parts = block.split("---\n");
    if (parts.length < 3) return block;

    try {
      const meta = yaml.load(parts[1]);
      if (meta.id !== relId) return block;

      found = true;
      let body = parts.slice(2).join("---\n").trim();

      // Update meta
      if (updates.startDate) meta.startDate = updates.startDate;
      if (updates.splitDate) meta.splitDate = updates.splitDate;
      if (updates.label) meta.label = updates.label;
      if (updates.type) meta.type = updates.type;
      if (updates.members) meta.members = updates.members;
      if (updates.children) meta.children = updates.children;

      // Update body (notes)
      if (updates.notes !== undefined) {
        // If there's a history block, we need to preserve it
        if (body.includes("<!-- block: history -->")) {
          const hParts = body.split("<!-- block: history -->");
          body = updates.notes.trim() + "\n\n<!-- block: history -->" + hParts[1];
        } else {
          body = updates.notes.trim();
        }
      }

      // Handle history updates (add/update)
      if (updates.history) {
        let historyStr = "<!-- block: history -->\n";
        for (const [date, events] of Object.entries(updates.history)) {
          if (Array.isArray(events)) {
            events.forEach(ev => { historyStr += `${date}: ${ev}\n`; });
          } else {
            historyStr += `${date}: ${events}\n`;
          }
        }
        historyStr += "<!-- end-block -->";

        if (body.includes("<!-- block: history -->")) {
          const hParts = body.split("<!-- block: history -->");
          const hEndParts = hParts[1].split("<!-- end-block -->");
          body = hParts[0].trim() + "\n\n" + historyStr + (hEndParts[1] || "");
        } else {
          body = body.trim() + "\n\n" + historyStr;
        }
      }

      // Handle history deletion (single note or whole date)
      if (deleteHistory) {
        if (body.includes("<!-- block: history -->")) {
          const hParts = body.split("<!-- block: history -->");
          const hEndParts = hParts[1].split("<!-- end-block -->");
          const hLines = hEndParts[0].trim().split("\n");
          const newHLines = hLines.filter(line => {
            const colonIdx = line.indexOf(": ");
            if (colonIdx === -1) return true;
            const date = line.substring(0, colonIdx).trim();
            const text = line.substring(colonIdx + 2).trim();
            if (date === deleteHistory.date && text === deleteHistory.text) return false;
            if (date === deleteHistory.date && !deleteHistory.text) return false;
            return true;
          });

          if (newHLines.length === 0) {
            body = hParts[0].trim() + (hEndParts[1] || "");
          } else {
            body = hParts[0].trim() + "\n\n<!-- block: history -->\n" + newHLines.join("\n") + "\n<!-- end-block -->" + (hEndParts[1] || "");
          }
        }
      }

      return `\n---\n${yaml.dump(meta, { lineWidth: -1, flowLevel: 3 }).trim()}\n---\n${body.trim()}\n\n`;
    } catch (e) {
      console.error("Error updating relationship MD:", e);
      return block;
    }
  });

  if (!found) throw new Error(`Relationship ${relId} not found in ${absPath}`);

  await fs.promises.writeFile(absPath, newBlocks.join("<!-- entry-break -->"), "utf8");
}

async function removeRelationshipFromMarkdown(absPath, relId) {
  if (!fs.existsSync(absPath)) return;
  let content = await fs.promises.readFile(absPath, "utf8");
  const rawBlocks = content.split("<!-- entry-break -->");
  const remainingBlocks = [];
  for (const block of rawBlocks) {
    const parts = block.split("---\n");
    if (parts.length < 3) {
      if (block.trim()) remainingBlocks.push(block);
      continue;
    }
    try {
      const meta = yaml.load(parts[1]);
      if (meta && meta.id === relId) {
        // Skip this block to remove it!
        continue;
      }
    } catch (e) {
      // Keep block on parse error
    }
    remainingBlocks.push(block);
  }
  
  const newContent = remainingBlocks.join("<!-- entry-break -->");
  if (!newContent.trim()) {
    await fs.promises.unlink(absPath).catch(() => {});
  } else {
    await fs.promises.writeFile(absPath, newContent, "utf8");
  }
}

async function removeRelationshipFromLegacyJson(relId) {
  const absPath = path.join(ROOT_DIR, 'data', 'relationships.json');
  if (!fs.existsSync(absPath)) return;
  const raw = await fs.promises.readFile(absPath, 'utf8');
  let parsed = JSON.parse(raw);
  const rows = Array.isArray(parsed?.relationships) ? parsed.relationships : (Array.isArray(parsed) ? parsed : []);
  const filtered = rows.filter(r => String(r?.id || '').trim() !== relId);
  if (Array.isArray(parsed?.relationships)) {
    parsed.relationships = filtered;
  } else {
    parsed = filtered;
  }
  await fs.promises.writeFile(absPath, JSON.stringify(parsed, null, 2) + '\n', 'utf8');
}

async function deleteRelationship(relId) {
  const allParsed = await getRelationships();
  const match = allParsed.find(r => r.id === relId);
  if (!match) throw new Error("Relationship not found.");

  if (match.__isMd) {
    const absPath = path.join(ROOT_DIR, match.__source);
    await removeRelationshipFromMarkdown(absPath, relId);
  } else {
    await removeRelationshipFromLegacyJson(relId);
  }
  return { id: relId };
}

async function updateRelationship(options) {
  const relId = String(options?.id || "").trim();
  if (!relId) throw new Error("Missing relationship ID.");

  const allParsed = await getRelationships();
  const match = allParsed.find(r => r.id === relId);
  if (!match) throw new Error("Relationship not found.");

  const label = String(options?.label || match.label || "").trim();
  const type = String(options?.type || match.type || "relationship").trim();
  const startDate = String(options?.startDate || match.startDate || "").trim();
  const splitDate = String(options?.splitDate || match.splitDate || "").trim();
  const notes = String(options?.notes !== undefined ? options.notes : (match.notes || "")).trim();
  const members = Array.isArray(options?.members)
    ? options.members.map((id) => String(id || "").toLowerCase().trim()).filter(Boolean)
    : (match.members || []);
  const children = Array.isArray(options?.children)
    ? options.children.map((id) => String(id || "").toLowerCase().trim()).filter(Boolean)
    : (match.children || []);
  
  // Merge/update history if provided
  let history = match.history || {};
  if (options?.history && typeof options.history === "object") {
    history = options.history;
  }

  if (!label) {
    throw new Error("Missing relationship label.");
  }
  if (!parseTimelineDateParts(startDate)) {
    throw new Error("Invalid startDate format. Use YYYY-MM-DD.");
  }
  if (splitDate && !parseTimelineDateParts(splitDate)) {
    throw new Error("Invalid splitDate format. Use YYYY-MM-DD.");
  }

  // Determine target ID (support renaming ID)
  let targetId = relId;
  const newIdInput = String(options?.newId || "").trim();
  if (newIdInput && newIdInput !== relId) {
    const idConflict = allParsed.some(r => r.id === newIdInput);
    if (idConflict) {
      throw new Error(`Relationship ID "${newIdInput}" is already in use.`);
    }
    if (!/^[a-z0-9-]+$/.test(newIdInput)) {
      throw new Error("Relationship ID must contain only lowercase letters, numbers, and hyphens.");
    }
    targetId = newIdInput;
  }

  // Determine new target file
  let targetFile = 'meta.md';
  let canonicalType = 'note';

  const personal = ['family', 'romance', 'friendship', 'personal'];
  const operational = ['operation', 'organization', 'partnership'];
  const historical = ['incident', 'arc', 'historical'];

  if (personal.includes(type)) { targetFile = 'personal.md'; canonicalType = type; }
  else if (operational.includes(type)) { targetFile = 'operational.md'; canonicalType = type; }
  else if (historical.includes(type)) { targetFile = 'historical.md'; canonicalType = type; }
  else if (type === 'meta' || type === 'note' || type === 'complicated') { targetFile = 'meta.md'; canonicalType = type; }

  // Remove old entry from its source
  if (match.__isMd) {
    const absOldPath = path.join(ROOT_DIR, match.__source);
    await removeRelationshipFromMarkdown(absOldPath, relId);
  } else {
    await removeRelationshipFromLegacyJson(relId);
  }

  // Build updated MD block (preserving or using new ID!)
  const meta = {
    id: targetId,
    label,
    type: canonicalType,
    startDate,
    members: Array.from(new Set(members))
  };
  if (splitDate) meta.splitDate = splitDate;
  if (children.length) meta.children = Array.from(new Set(children));

  let mdEntry = `\n---\n${yaml.dump(meta, { lineWidth: -1, flowLevel: 3 }).trim()}\n---\n${notes.trim()}\n\n`;
  if (history && Object.keys(history).length) {
    const sortedH = sortHistoryEntries(history);
    mdEntry += '<!-- block: history -->\n';
    for (const [d, evs] of Object.entries(sortedH)) {
      if (Array.isArray(evs)) {
        evs.forEach(ev => { mdEntry += `${d}: ${ev}\n`; });
      } else {
        mdEntry += `${d}: ${evs}\n`;
      }
    }
    mdEntry += '<!-- end-block -->\n\n';
  }

  const relDir = resolveStoryPath("relationships");
  if (!fs.existsSync(relDir)) fs.mkdirSync(relDir, { recursive: true });
  const absNewPath = path.join(relDir, targetFile);

  if (fs.existsSync(absNewPath)) {
    await fs.promises.appendFile(absNewPath, "<!-- entry-break -->\n" + mdEntry, "utf8");
  } else {
    await fs.promises.writeFile(absNewPath, mdEntry, "utf8");
  }

  return {
    id: targetId,
    filePath: toPosix(path.relative(ROOT_DIR, absNewPath))
  };
}

async function addRelationship(options) {
  const idInput = String(options?.id || "").trim();
  const label = String(options?.label || "").trim();
  const type = String(options?.type || "relationship").trim() || "relationship";
  const startDate = String(options?.startDate || "").trim();
  const splitDate = String(options?.splitDate || "").trim();
  const notes = String(options?.notes || "").trim();
  const members = Array.isArray(options?.members)
    ? options.members.map((id) => String(id || "").toLowerCase().trim()).filter(Boolean)
    : [];
  const children = Array.isArray(options?.children)
    ? options.children.map((id) => String(id || "").toLowerCase().trim()).filter(Boolean)
    : [];
  const history = options?.history && typeof options.history === "object" ? options.history : null;

  if (!label) {
    throw new Error("Missing relationship label.");
  }
  if (!parseTimelineDateParts(startDate)) {
    throw new Error("Invalid startDate format. Use YYYY-MM-DD.");
  }
  if (splitDate && !parseTimelineDateParts(splitDate)) {
    throw new Error("Invalid splitDate format. Use YYYY-MM-DD.");
  }

  // Determine target file and canonical type
  let targetFile = 'meta.md';
  let canonicalType = 'note';

  const personal = ['family', 'romance', 'friendship', 'personal'];
  const operational = ['operation', 'organization', 'partnership'];
  const historical = ['incident', 'arc', 'historical'];

  if (personal.includes(type)) { targetFile = 'personal.md'; canonicalType = type; }
  else if (operational.includes(type)) { targetFile = 'operational.md'; canonicalType = type; }
  else if (historical.includes(type)) { targetFile = 'historical.md'; canonicalType = type; }
  else if (type === 'meta' || type === 'note' || type === 'complicated') { targetFile = 'meta.md'; canonicalType = type; }

  const relDir = resolveStoryPath("relationships");
  if (!fs.existsSync(relDir)) fs.mkdirSync(relDir, { recursive: true });
  const absPath = path.join(relDir, targetFile);

  // Load existing to generate unique ID
  const allParsed = await getRelationships();
  const baseId = safeSlug(idInput || label);
  let nextId = baseId;
  let suffix = 2;
  const existingIds = new Set(allParsed.map((row) => String(row?.id || "").trim()).filter(Boolean));
  while (existingIds.has(nextId)) {
    nextId = `${baseId}-${suffix}`;
    suffix += 1;
  }

  const meta = {
    id: nextId,
    label,
    type: canonicalType,
    startDate,
    members: Array.from(new Set(members))
  };
  if (splitDate) meta.splitDate = splitDate;
  if (children.length) meta.children = Array.from(new Set(children));

  let mdEntry = `\n---\n${yaml.dump(meta, { lineWidth: -1, flowLevel: 3 }).trim()}\n---\n${notes.trim()}\n\n`;
  if (history && Object.keys(history).length) {
    const sortedH = sortHistoryEntries(history);
    mdEntry += '<!-- block: history -->\n';
    for (const [d, evs] of Object.entries(sortedH)) {
      if (Array.isArray(evs)) {
        evs.forEach(ev => { mdEntry += `${d}: ${ev}\n`; });
      } else {
        mdEntry += `${d}: ${evs}\n`;
      }
    }
    mdEntry += '<!-- end-block -->\n\n';
  }

  if (fs.existsSync(absPath)) {
    await fs.promises.appendFile(absPath, "<!-- entry-break -->\n" + mdEntry, "utf8");
  } else {
    await fs.promises.writeFile(absPath, mdEntry, "utf8");
  }

  return {
    id: nextId,
    filePath: toPosix(path.relative(ROOT_DIR, absPath))
  };
}

async function updateRowImageInSource(options) {
  const year = String(options?.year || "").trim();
  let sourcePath = normalizeJsonSourcePath(options?.sourcePath, year);
  // If initial normalization failed, try common fallbacks (allow missing extension)
  if (!sourcePath) {
    const raw = String(options?.sourcePath || "").trim();
    if (raw) {
      const tryMd = normalizeJsonSourcePath(`${raw}.md`, year);
      const tryJson = normalizeJsonSourcePath(`${raw}.json`, year);
      sourcePath = tryMd || tryJson || null;
    }
  }
  const entryId = String(options?.entryId || "").trim();
  const blockIndex = Number(options?.blockIndex);
  const rowIndex = Number(options?.rowIndex);
  const imagePath = normalizeDroppedImagePath(options?.imagePath);
  const variant = String(options?.variant || "base").toLowerCase();

  if (!/^[0-9A-Za-z_-]+$/.test(year)) {
    throw new Error("Invalid year.");
  }
  if (!sourcePath) {
    throw new Error("Invalid sourcePath.");
  }
  if (!entryId) {
    throw new Error("Missing entryId.");
  }
  if (!Number.isInteger(blockIndex) || blockIndex < 0) {
    throw new Error("Invalid blockIndex.");
  }
  if (!Number.isInteger(rowIndex) || rowIndex < 0) {
    throw new Error("Invalid rowIndex.");
  }
  if (!["base", "unmasked", "exposed"].includes(variant)) {
    throw new Error("Invalid variant.");
  }
  if (imagePath === null) {
    throw new Error("Image path must point to pictures/* media file.");
  }

  const absPath = resolveYearsSourceAbsolutePath(sourcePath, year);
  if (!absPath) {
    throw new Error("Resolved source path is outside years directory.");
  }

  const isMd = absPath.toLowerCase().endsWith(".md");
  if (isMd) {
    const result = await updateRowInMarkdown(absPath, entryId, blockIndex, rowIndex, {
      variant,
      imagePath: imagePath || ""
    });
    return {
      year,
      sourcePath,
      entryId,
      blockIndex,
      rowIndex,
      imagePath: imagePath || "",
      variant
    };
  }

  const raw = await fs.promises.readFile(absPath, "utf8");
  const parsed = JSON.parse(raw);
  const entries = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.entries) ? parsed.entries : null);
  if (!entries) {
    throw new Error("Source file does not contain entries.");
  }

  const entry = entries.find((item) => String(item?.id || "") === entryId);
  if (!entry) {
    throw new Error("Entry not found in source file.");
  }

  const blocks = Array.isArray(entry.blocks) ? entry.blocks : [];
  const block = blocks[blockIndex];
  if (!block || !Array.isArray(block.rows)) {
    throw new Error("Table block not found.");
  }

  const row = block.rows[rowIndex];
  if (!row || typeof row !== "object") {
    throw new Error("Row not found.");
  }

  if (variant === "base") {
    if (Object.prototype.hasOwnProperty.call(row, "img")) {
      row.img = imagePath || "";
    } else if (Object.prototype.hasOwnProperty.call(row, "image")) {
      row.image = imagePath || "";
    } else {
      row.img = imagePath || "";
    }
  } else if (variant === "unmasked") {
    row.unmasked = imagePath || "";
  } else {
    row.exposed = imagePath || "";
  }

  const output = JSON.stringify(parsed, null, 2) + "\n";
  await fs.promises.writeFile(absPath, output, "utf8");

  return {
    year,
    sourcePath,
    entryId,
    blockIndex,
    rowIndex,
    imagePath: imagePath || "",
    variant
  };
}

async function updateRowSubtitleInSource(options) {
  const year = String(options?.year || "").trim();
  const sourcePath = normalizeJsonSourcePath(options?.sourcePath, year);
  const entryId = String(options?.entryId || "").trim();
  const blockIndex = Number(options?.blockIndex);
  const rowIndex = Number(options?.rowIndex);
  const subtitle = String(options?.subtitle || "").trim();

  if (!/^[0-9A-Za-z_-]+$/.test(year)) {
    throw new Error("Invalid year.");
  }
  if (!sourcePath) {
    throw new Error("Invalid sourcePath.");
  }
  if (!entryId) {
    throw new Error("Missing entryId.");
  }
  if (!Number.isInteger(blockIndex) || blockIndex < 0) {
    throw new Error("Invalid blockIndex.");
  }
  if (!Number.isInteger(rowIndex) || rowIndex < 0) {
    throw new Error("Invalid rowIndex.");
  }

  const absPath = resolveYearsSourceAbsolutePath(sourcePath, year);
  if (!absPath) {
    throw new Error("Resolved source path is outside years directory.");
  }

  const isMd = absPath.toLowerCase().endsWith(".md");
  if (isMd) {
    await updateRowInMarkdown(absPath, entryId, blockIndex, rowIndex, {
      subtitle: subtitle || ""
    });
    return {
      year,
      sourcePath,
      entryId,
      blockIndex,
      rowIndex,
      subtitle
    };
  }

  const raw = await fs.promises.readFile(absPath, "utf8");
  const parsed = JSON.parse(raw);
  const entries = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.entries) ? parsed.entries : null);
  if (!entries) {
    throw new Error("Source file does not contain entries.");
  }

  const entry = entries.find((item) => String(item?.id || "") === entryId);
  if (!entry) {
    throw new Error("Entry not found in source file.");
  }

  const blocks = Array.isArray(entry.blocks) ? entry.blocks : [];
  const block = blocks[blockIndex];
  if (!block || !Array.isArray(block.rows)) {
    throw new Error("Table block not found.");
  }

  const row = block.rows[rowIndex];
  if (!row || typeof row !== "object") {
    throw new Error("Row not found.");
  }

  row.imgnotes = subtitle;

  const output = JSON.stringify(parsed, null, 2) + "\n";
  await fs.promises.writeFile(absPath, output, "utf8");

  return {
    year,
    sourcePath,
    entryId,
    blockIndex,
    rowIndex,
    subtitle
  };
}

async function updateNavGroupOrderInSource(options) {
  const year = String(options?.year || "").trim();
  const sourcePath = normalizeJsonSourcePath(options?.sourcePath, year);
  const navGroupOrder = Array.isArray(options?.navGroupOrder)
    ? options.navGroupOrder
      .map((name) => String(name || "").trim())
      .filter(Boolean)
    : [];

  if (!/^[0-9A-Za-z_-]+$/.test(year)) {
    throw new Error("Invalid year.");
  }
  if (!sourcePath) {
    throw new Error("Invalid sourcePath.");
  }
  if (!navGroupOrder.length) {
    throw new Error("Missing navGroupOrder.");
  }

  const absPath = resolveYearsSourceAbsolutePath(sourcePath, year);
  if (!absPath) {
    throw new Error("Resolved source path is outside years directory.");
  }

  // If the source file doesn't exist, create a minimal scaffold so we can persist navGroupOrder.
  if (!fs.existsSync(absPath)) {
    await fs.promises.mkdir(path.dirname(absPath), { recursive: true });
    if (String(sourcePath || '').toLowerCase().endsWith('.md')) {
      const yaml = require('js-yaml');
      const meta = { navGroupOrder: Array.from(new Set(navGroupOrder)) };
      const content = `---\n${yaml.dump(meta)}---\n\n`;
      await fs.promises.writeFile(absPath, content, 'utf8');
    } else {
      // default to JSON scaffold
      const scaffold = {
        meta: { navGroupOrder: Array.from(new Set(navGroupOrder)) },
        entries: []
      };
      await fs.promises.writeFile(absPath, JSON.stringify(scaffold, null, 2) + '\n', 'utf8');
    }
  }

  const raw = await fs.promises.readFile(absPath, "utf8");

  // If the source is a Markdown file, update YAML frontmatter's meta.navGroupOrder
  if (String(sourcePath || "").toLowerCase().endsWith('.md')) {
    const yaml = require('js-yaml');
    const trimmed = String(raw || '');
    const fmMatch = trimmed.match(/^---\s*[\r\n]+([\s\S]*?)[\r\n]+---\s*[\r\n]*/);
    let meta = {};
    let body = trimmed;
    if (fmMatch) {
      try {
        meta = yaml.load(fmMatch[1]) || {};
      } catch (e) {
        meta = {};
      }
      body = trimmed.slice(fmMatch[0].length);
    }

    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
      meta = {};
    }

    meta.navGroupOrder = Array.from(new Set(navGroupOrder));

    const newFm = `---\n${yaml.dump(meta, { lineWidth: -1, flowLevel: 3 })}---\n\n`;
    const output = newFm + body.replace(/^\n+/, '');
    await fs.promises.writeFile(absPath, output, 'utf8');

    return {
      year,
      sourcePath,
      navGroupOrder: meta.navGroupOrder
    };
  }

  // Fallback: treat as JSON (legacy behavior)
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Source file must be an object with meta.");
  }

  parsed.meta = parsed.meta && typeof parsed.meta === "object" && !Array.isArray(parsed.meta)
    ? parsed.meta
    : {};
  parsed.meta.navGroupOrder = Array.from(new Set(navGroupOrder));

  const output = JSON.stringify(parsed, null, 2) + "\n";
  await fs.promises.writeFile(absPath, output, "utf8");

  return {
    year,
    sourcePath,
    navGroupOrder: parsed.meta.navGroupOrder
  };
}

async function buildMediaCatalog(year) {
  const safeYear = String(year || "").trim();
  if (!safeYear || !/^[0-9A-Za-z_-]+$/.test(safeYear)) {
    throw new Error("Invalid year parameter");
  }

  const yearDir = path.join(ROOT_DIR, "pictures", safeYear);
  const yearRootRel = `pictures/${safeYear}`;
  const yearPortraitDir = path.join(yearDir, "portraits");
  const yearGroupDir = path.join(yearDir, "groups");
  const yearUnmaskedDir = path.join(yearDir, "unmasked");
  const yearExposedDir = path.join(yearDir, "exposed");

  const [
    yearRootDirect,
    portraitFiles,
    yearGroupFiles,
    unmaskedFiles,
    exposedFiles,
    outfitFiles,
    groupFiles,
    life123Files,
    roboterFiles
  ] = await Promise.all([
    listMediaFiles(yearDir, { recursive: false }),
    listMediaFiles(yearPortraitDir, { recursive: true }),
    listMediaFiles(yearGroupDir, { recursive: true }),
    listMediaFiles(yearUnmaskedDir, { recursive: true }),
    listMediaFiles(yearExposedDir, { recursive: true }),
    listMediaFiles(path.join(ROOT_DIR, "pictures", "outfits"), { recursive: true }),
    listMediaFiles(path.join(ROOT_DIR, "pictures", "group"), { recursive: true }),
    listMediaFiles(path.join(ROOT_DIR, "pictures", "life123"), { recursive: true }),
    listMediaFiles(path.join(ROOT_DIR, "pictures", "Roboter"), { recursive: true })
  ]);

  const toYearPath = (name) => `${yearRootRel}/${toPosix(name)}`;

  return {
    portraits: uniqueSorted(portraitFiles.map((name) => `${yearRootRel}/portraits/${toPosix(name)}`)),
    outfits: uniqueSorted(outfitFiles.map((name) => `pictures/outfits/${toPosix(name)}`)),
    groups: uniqueSorted([
      ...yearGroupFiles.map((name) => `${yearRootRel}/groups/${toPosix(name)}`),
      ...groupFiles.map((name) => `pictures/group/${toPosix(name)}`)
    ]),
    fieldMedia: uniqueSorted([
      ...yearRootDirect.map(toYearPath),
      ...life123Files.map((name) => `pictures/life123/${toPosix(name)}`),
      ...roboterFiles.map((name) => `pictures/Roboter/${toPosix(name)}`)
    ]),
    unmasked: uniqueSorted(unmaskedFiles.map((name) => `${yearRootRel}/unmasked/${toPosix(name)}`)),
    exposed: uniqueSorted(exposedFiles.map((name) => `${yearRootRel}/exposed/${toPosix(name)}`))
  };
}


async function handleCharacterExport(req, res) {
  try {
    const characterId = String(req.query.characterId || '').toLowerCase().trim();
    const format = String(req.query.format || 'json').toLowerCase().trim();
    if (!characterId) {
      res.status(400).json({ ok: false, error: 'Missing characterId' });
      return;
    }

    const legacyRoot = path.join(ROOT_DIR, 'data', 'characters', 'years');
    const storyRoot = getStoryRootDir();
    const results = [];

    async function walkDir(dir, type, relPrefix = '') {
      let entriesList = [];
      try {
        entriesList = await fs.promises.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const ent of entriesList) {
        const abs = path.join(dir, ent.name);
        const rel = relPrefix ? `${relPrefix}/${ent.name}` : ent.name;
        if (ent.isDirectory()) {
          await walkDir(abs, type, rel);
          continue;
        }

        const isJson = ent.name.toLowerCase().endsWith('.json');
        const isMd = ent.name.toLowerCase().endsWith('.md');
        if (!ent.isFile() || (!isJson && !isMd)) continue;

        let raw = '';
        try {
          raw = await fs.promises.readFile(abs, 'utf8');
        } catch { continue; }

        if (isJson) {
          let parsed = null;
          try { parsed = JSON.parse(raw); } catch { continue; }
          const list = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.entries) ? parsed.entries : null);
          if (!Array.isArray(list)) continue;
          const matched = list.filter((e) => String(e?.id || '').toLowerCase().trim() === characterId);
          if (matched.length) {
            results.push({
              source: toPosix(path.relative(ROOT_DIR, abs)),
              year: (rel.match(/^(\d{4})/) || [])[1] || null,
              entries: matched,
              isMd: false
            });
          }
        } else if (isMd) {
          const parts = splitMarkdownEntries(raw);
          parts.forEach(part => {
            const trimmedPart = part.trim();
            const fmMatch = trimmedPart.match(/^---\s*[\r\n]+([\s\S]*?)[\r\n]+---\s*[\r\n]*/);
            if (fmMatch) {
              try {
                const meta = yaml.load(fmMatch[1]);
                if (String(meta.id).toLowerCase().trim() === characterId) {
                  results.push({
                    source: toPosix(path.relative(ROOT_DIR, abs)),
                    year: (rel.match(/^(\d{4})/) || [])[1] || null,
                    raw: trimmedPart,
                    isMd: true
                  });
                }
              } catch (e) { }
            }
          });
        }
      }
    }

    await walkDir(legacyRoot, 'json');
    await walkDir(storyRoot, 'md');

    // Filter results to prefer story/ version if both exist for same year
    const finalResults = [];
    const seenYear = new Set();
    results.sort((a, b) => (a.isMd === b.isMd ? 0 : (a.isMd ? -1 : 1)));
    for (const res of results) {
      if (res.year && seenYear.has(res.year)) continue;
      if (res.year) seenYear.add(res.year);
      finalResults.push(res);
    }

    finalResults.sort((a, b) => Number(a.year || 0) - Number(b.year || 0));

    if (format === 'markdown') {
      let md = `# Character Export: ${characterId}\n\n`;
      for (const res of finalResults) {
        if (res.year) md += `## ${res.year}\n\n`;
        if (res.isMd) {
          md += res.raw + "\n\n";
        } else {
          res.entries.forEach(e => {
            md += `### ${e.title || e.id}\n\n`;
            (e.blocks || []).forEach(b => {
              if (b.type === 'text') md += b.body + "\n\n";
              else if (b.type === 'table') {
                (b.rows || []).forEach(r => {
                  md += `#### ${r.label}\n${r.value}\n*(img: ${r.img})*\n\n`;
                });
              }
            });
          });
        }
        md += "---\n\n";
      }
      return res.json({ ok: true, characterId, format: 'markdown', markdown: md });
    }

    res.json({ ok: true, characterId, exportedAt: new Date().toISOString(), sources: finalResults });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error?.message || 'Export failed') });
  }
}

app.post("/api/rows/set-image", async (req, res) => {
  try {
    const result = await updateRowImageInSource(req.body || {});
    res.json({ ok: true, ...result });
  } catch (error) {
    const message = String(error?.message || "Failed to update row image.");
    const status = /not found/i.test(message) ? 404 : 400;
    res.status(status).json({ ok: false, error: message });
  }
});

app.post("/api/rows/upload-image", async (req, res) => {
  try {
    const year = String(req.body?.year || "").trim();
    const sourcePath = String(req.body?.sourcePath || "").trim();
    const entryId = String(req.body?.entryId || "").trim();
    const blockIndex = Number(req.body?.blockIndex);
    const rowIndex = Number(req.body?.rowIndex);
    const variant = String(req.body?.variant || "base").toLowerCase();
    const fileName = String(req.body?.fileName || "").trim();
    const mimeType = String(req.body?.mimeType || "").trim();
    const base64 = String(req.body?.dataBase64 || "").trim();

    if (!base64) {
      res.status(400).json({ ok: false, error: "Missing dataBase64." });
      return;
    }

    const buffer = Buffer.from(base64, "base64");
    if (!buffer.length) {
      res.status(400).json({ ok: false, error: "Uploaded file is empty." });
      return;
    }
    if (buffer.length > MAX_ROW_UPLOAD_BYTES) {
      res.status(400).json({ ok: false, error: "Uploaded file exceeds max size (25MB)." });
      return;
    }

    const extFromName = mediaExtensionFromName(fileName);
    const extFromMime = mediaExtensionFromMime(mimeType);
    const ext = extFromName || extFromMime;
    if (!ext || !MEDIA_EXT_RE.test(ext)) {
      res.status(400).json({ ok: false, error: "Unsupported media type." });
      return;
    }

    if (!/^[0-9A-Za-z_-]+$/.test(year)) {
      res.status(400).json({ ok: false, error: "Invalid year." });
      return;
    }

    const uploadDir = path.join(ROOT_DIR, "pictures", year, "rows");
    await fs.promises.mkdir(uploadDir, { recursive: true });

    const stamp = Date.now();
    const rowName = `${safeSlug(entryId)}-b${Math.max(0, blockIndex)}-r${Math.max(0, rowIndex)}-${variant}-${stamp}${ext}`;
    const absUploadPath = path.join(uploadDir, rowName);
    await fs.promises.writeFile(absUploadPath, buffer);

    const imagePath = `pictures/${year}/rows/${rowName}`;
    const result = await updateRowImageInSource({
      year,
      sourcePath,
      entryId,
      blockIndex,
      rowIndex,
      variant,
      imagePath
    });

    res.json({
      ok: true,
      ...result,
      uploaded: {
        fileName: rowName,
        bytes: buffer.length,
        mimeType: mimeType || "application/octet-stream"
      }
    });
  } catch (error) {
    const message = String(error?.message || "Failed to upload row image.");
    const status = /not found/i.test(message) ? 404 : 400;
    res.status(status).json({ ok: false, error: message });
  }
});

app.post("/api/rows/set-subtitle", async (req, res) => {
  try {
    const result = await updateRowSubtitleInSource(req.body || {});
    res.json({ ok: true, ...result });
  } catch (error) {
    const message = String(error?.message || "Failed to update row subtitle.");
    const status = /not found/i.test(message) ? 404 : 400;
    res.status(status).json({ ok: false, error: message });
  }
});


async function handleTimelineSetDate(req, res) {
  try {
    const result = await updateTimelineEventDate(req.body || {});
    res.json({ ok: true, ...result });
  } catch (error) {
    const message = String(error?.message || "Failed to update timeline event date.");
    const status = /not found/i.test(message) ? 404 : 400;
    res.status(status).json({ ok: false, error: message });
  }
}

async function handleTimelineSetText(req, res) {
  try {
    const result = await updateTimelineEventText(req.body || {});
    res.json({ ok: true, ...result });
  } catch (error) {
    const message = String(error?.message || 'Failed to update timeline event text.');
    const status = /not found/i.test(message) ? 404 : 400;
    res.status(status).json({ ok: false, error: message });
  }
}

async function handleTimelineSetTags(req, res) {
  try {
    const result = await updateTimelineEventTags(req.body || {});
    res.json({ ok: true, ...result });
  } catch (error) {
    const message = String(error?.message || 'Failed to update timeline event tags.');
    const status = /not found/i.test(message) ? 404 : 400;
    res.status(status).json({ ok: false, error: message });
  }
}

async function handleTimelineMassTag(req, res) {
  try {
    const result = await updateTimelineEventsTagsBatch(req.body || {});
    res.json({ ok: true, ...result });
  } catch (error) {
    const message = String(error?.message || 'Failed to mass tag entries.');
    res.status(400).json({ ok: false, error: message });
  }
}

async function handleTimelineMassTextAction(req, res) {
  try {
    const result = await updateTimelineEventsTextBatch(req.body || {});
    res.json({ ok: true, ...result });
  } catch (error) {
    const message = String(error?.message || 'Failed to mass update timeline text.');
    res.status(400).json({ ok: false, error: message });
  }
}

async function handleTimelineDeleteEvent(req, res) {
  try {
    const result = await deleteTimelineEvent(req.body || {});
    res.json({ ok: true, ...result });
  } catch (error) {
    const message = String(error?.message || 'Failed to delete timeline event.');
    const status = /not found/i.test(message) ? 404 : 400;
    res.status(status).json({ ok: false, error: message });
  }
}

async function handleRelationshipSetDate(req, res) {
  try {
    const result = await updateRelationshipDate(req.body || {});
    res.json({ ok: true, ...result });
  } catch (error) {
    const message = String(error?.message || "Failed to update relationship date.");
    const status = /not found/i.test(message) ? 404 : 400;
    res.status(status).json({ ok: false, error: message });
  }
}

async function handleRelationshipSetText(req, res) {
  try {
    const result = await updateRelationshipText(req.body || {});
    res.json({ ok: true, ...result });
  } catch (error) {
    const message = String(error?.message || 'Failed to update relationship text.');
    const status = /not found/i.test(message) ? 404 : 400;
    res.status(status).json({ ok: false, error: message });
  }
}

async function handleRelationshipDeleteHistoryNote(req, res) {
  try {
    const result = await deleteRelationshipHistoryNote(req.body || {});
    res.json({ ok: true, ...result });
  } catch (error) {
    const message = String(error?.message || 'Failed to delete relationship timeline-note.');
    const status = /not found/i.test(message) ? 404 : 400;
    res.status(status).json({ ok: false, error: message });
  }
}

async function handleCharacterCoreBirthDateSet(req, res) {
  try {
    const result = await updateCharacterCoreBirthDate(req.body || {});
    runVitalsGenerator();
    res.json({ ok: true, ...result });
  } catch (error) {
    const message = String(error?.message || "Failed to update character birthday.");
    const status = /not found/i.test(message) ? 404 : 400;
    res.status(status).json({ ok: false, error: message });
  }
}

async function handleRelationshipAdd(req, res) {
  try {
    const result = await addRelationship(req.body || {});
    res.json({ ok: true, ...result });
  } catch (error) {
    const message = String(error?.message || "Failed to add relationship.");
    const status = /not found/i.test(message) ? 404 : 400;
    res.status(status).json({ ok: false, error: message });
  }
}

async function handleRelationshipUpdate(req, res) {
  try {
    const result = await updateRelationship(req.body || {});
    res.json({ ok: true, ...result });
  } catch (error) {
    const message = String(error?.message || "Failed to update relationship.");
    const status = /not found/i.test(message) ? 404 : 400;
    res.status(status).json({ ok: false, error: message });
  }
}

async function handleRelationshipDelete(req, res) {
  try {
    const result = await deleteRelationship(req.body?.id || "");
    res.json({ ok: true, ...result });
  } catch (error) {
    const message = String(error?.message || "Failed to delete relationship.");
    const status = /not found/i.test(message) ? 404 : 400;
    res.status(status).json({ ok: false, error: message });
  }
}

async function handleTimelineAddEvent(req, res) {
  try {
    const result = await addTimelineEvent(req.body || {});
    res.json({ ok: true, ...result });
  } catch (error) {
    const message = String(error?.message || "Failed to add timeline event.");
    const status = /not found/i.test(message) ? 404 : 400;
    res.status(status).json({ ok: false, error: message });
  }
}

async function handleTimelineBulkAdd(req, res) {
  try {
    const events = Array.isArray(req.body?.events) ? req.body.events : [];
    const result = await bulkAddTimelineEvents(events);
    res.json({ ok: true, ...result });
  } catch (error) {
    const message = String(error?.message || "Failed to bulk add timeline events.");
    res.status(400).json({ ok: false, error: message });
  }
}


async function ensureEventHasId(eventIdent) {
  const timelineDir = resolveStoryPath("timeline");
  const files = await listMarkdownFilesRecursive(timelineDir);
  const yaml = require("js-yaml");

  const title = eventIdent.title;
  const date = eventIdent.date;
  const childId = eventIdent.id;

  // 1. Search in MD files
  for (const abs of files) {
    const raw = await fs.promises.readFile(abs, "utf8");
    if (raw.includes(title)) {
      const parts = raw.split(/<!--\s*entry-break\s*-->/);
      const entryIdx = parts.findIndex(part => {
        const trimmed = part.trim();
        const fmMatch = trimmed.match(/^---\s*[\r\n]+([\s\S]*?)[\r\n]+---\s*[\r\n]*/);
        if (!fmMatch) return false;
        try {
          const meta = yaml.load(fmMatch[1]);
          if (childId && meta.id === childId) return true;
          if (date === meta.date && title === meta.title) return true;
          return false;
        } catch { return false; }
      });

      if (entryIdx !== -1) {
        const part = parts[entryIdx];
        const fmMatch = part.trim().match(/^---\s*[\r\n]+([\s\S]*?)[\r\n]+---\s*[\r\n]*/);
        const meta = yaml.load(fmMatch[1]);
        const body = part.trim().slice(fmMatch[0].length).trim();

        if (meta.id) {
          return meta.id; // Already has an explicit ID
        }

        // Generate a new clean unique ID
        const slug = String(title || "event").toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        const cleanDate = String(date || "0000-00-00").replace(/[^0-9]/g, '');
        const newId = `${slug}-${cleanDate}`;

        meta.id = newId;
        parts[entryIdx] = `---\n${yaml.dump(meta, { lineWidth: -1, flowLevel: 3 })}---\n${body}\n\n`;
        await fs.promises.writeFile(abs, parts.join("<!-- entry-break -->\n\n"), "utf8");
        return newId;
      }
    }
  }

  // 2. Search in legacy JSON
  const absPath = path.join(ROOT_DIR, 'data', 'timeline.json');
  if (fs.existsSync(absPath)) {
    const rawData = await fs.promises.readFile(absPath, 'utf8');
    const parsed = JSON.parse(rawData);
    const event = parsed.find(ev => (childId && ev.id === childId) || (ev.date === date && ev.title === title));
    if (event) {
      if (event.id && !event.id.startsWith("evt_")) {
        return event.id;
      }
      const slug = String(title || "event").toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const cleanDate = String(date || "0000-00-00").replace(/[^0-9]/g, '');
      const newId = `${slug}-${cleanDate}`;
      event.id = newId;
      await fs.promises.writeFile(absPath, JSON.stringify(parsed, null, 2) + "\n", 'utf8');
      return newId;
    }
  }

  // Fallback
  return childId || `evt_${Math.random().toString(36).slice(2, 9)}`;
}

async function groupTimelineEvents(parentId, children) {
  const timelineDir = resolveStoryPath("timeline");
  const files = await listMarkdownFilesRecursive(timelineDir);
  const updatedFiles = [];

  for (const child of children) {
    let childUpdated = false;
    const childId = child.id;
    const date = child.date;
    const title = child.title;
    
    // 1. Search in MD files
    for (const abs of files) {
      const raw = await fs.promises.readFile(abs, "utf8");
      if (raw.includes(title)) {
        try {
          await updateTimelineEventInMarkdown(abs, { id: childId, date, title }, { parent: parentId });
          updatedFiles.push(toPosix(path.relative(ROOT_DIR, abs)));
          childUpdated = true;
          break;
        } catch (e) {
          console.error(`Error updating MD grouping for child ${title}:`, e);
        }
      }
    }

    // 2. Search in legacy JSON if not found in MD
    if (!childUpdated) {
      const absPath = path.join(ROOT_DIR, 'data', 'timeline.json');
      if (fs.existsSync(absPath)) {
        const rawData = await fs.promises.readFile(absPath, 'utf8');
        const parsed = JSON.parse(rawData);
        const event = parsed.find(ev => (childId && ev.id === childId) || (ev.date === date && ev.title === title));
        if (event) {
          event.parent = parentId;
          await fs.promises.writeFile(absPath, JSON.stringify(parsed, null, 2) + "\n", 'utf8');
          updatedFiles.push('data/timeline.json');
        }
      }
    }
  }

  return { parentId, childIds: children.map(c => c.id), updatedFiles };
}

async function ungroupTimelineEvents(events) {
  const timelineDir = resolveStoryPath("timeline");
  const files = await listMarkdownFilesRecursive(timelineDir);
  const updatedFiles = [];

  for (const ev of events) {
    let idUpdated = false;
    const childId = ev.id;
    const date = ev.date;
    const title = ev.title;
    
    // 1. Search in MD files
    for (const abs of files) {
      const raw = await fs.promises.readFile(abs, "utf8");
      if (raw.includes(title)) {
        try {
          await updateTimelineEventInMarkdown(abs, { id: childId, date, title }, { parent: null });
          updatedFiles.push(toPosix(path.relative(ROOT_DIR, abs)));
          idUpdated = true;
          break;
        } catch (e) {
          console.error(`Error updating MD ungrouping for title ${title}:`, e);
        }
      }
    }

    // 2. Search in legacy JSON if not found in MD
    if (!idUpdated) {
      const absPath = path.join(ROOT_DIR, 'data', 'timeline.json');
      if (fs.existsSync(absPath)) {
        const rawData = await fs.promises.readFile(absPath, 'utf8');
        const parsed = JSON.parse(rawData);
        const event = parsed.find(ev => (childId && ev.id === childId) || (ev.date === date && ev.title === title));
        if (event) {
          delete event.parent;
          await fs.promises.writeFile(absPath, JSON.stringify(parsed, null, 2) + "\n", 'utf8');
          updatedFiles.push('data/timeline.json');
        }
      }
    }
  }

  return { ids: events.map(e => e.id), updatedFiles };
}

async function handleTimelineGroup(req, res) {
  try {
    const { parentIdent, children } = req.body || {};
    if (!parentIdent || !Array.isArray(children) || children.length === 0) {
      throw new Error("Missing parentIdent or children.");
    }
    
    // 1. Ensure the parent has a permanent ID
    const parentId = await ensureEventHasId(parentIdent);
    
    // 2. Group all children under that parentId
    const result = await groupTimelineEvents(parentId, children);
    res.json({ ok: true, parentId, ...result });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
}

async function handleTimelineUngroup(req, res) {
  try {
    const { events } = req.body || {};
    if (!Array.isArray(events) || events.length === 0) {
      throw new Error("Missing events list.");
    }
    const result = await ungroupTimelineEvents(events);
    res.json({ ok: true, ...result });
} catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
}


let server = null;
let retryTimer = null;
let restartingAfterFatal = false;
let eaddrRetryCount = 0;

function scheduleServerRetry(reason) {
  if (retryTimer) {
    return;
  }
  const waitMs = 1200;
  console.warn(`${reason} Retrying backend bind on ${HOST}:${PORT} in ${waitMs}ms...`);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    startServer();
  }, waitMs);
}

function setupComfyWebSocketProxy(serverInstance) {
  try {
    const WebSocket = require("ws");
    const comfyWsUrl = "ws://127.0.0.1:8188/ws";
    const wss = new WebSocket.Server({ noServer: true });

    serverInstance.on("upgrade", (request, socket, head) => {
      const { pathname } = new URL(request.url, `http://${request.headers.host}`);
      if (pathname === "/ws") {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit("connection", ws, request);
        });
      }
    });

    wss.on("connection", (clientWs) => {
      const targetWs = new WebSocket(comfyWsUrl);

      clientWs.on("message", (message) => {
        if (targetWs.readyState === WebSocket.OPEN) {
          targetWs.send(message);
        }
      });

      targetWs.on("message", (message) => {
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(message);
        }
      });

      clientWs.on("close", () => {
        targetWs.close();
      });

      targetWs.on("close", () => {
        clientWs.close();
      });

      targetWs.on("error", (err) => {
        console.error("[ComfyWS Proxy] Target WS error:", err);
        clientWs.close();
      });

      clientWs.on("error", (err) => {
        console.error("[ComfyWS Proxy] Client WS error:", err);
        targetWs.close();
      });
    });
  } catch (err) {
    console.error("Failed to setup ComfyUI WebSocket proxy:", err);
  }
}

function startServer() {
  if (server) {
    return;
  }

  server = app.listen(PORT, HOST, () => {
    eaddrRetryCount = 0;
    console.log(`Character Manager backend listening on http://${HOST}:${PORT}`);
    setupComfyWebSocketProxy(server);
  });

  server.on("error", (error) => {
    const code = String(error?.code || "");
    server = null;

    if (code === "EADDRINUSE") {
      if (eaddrRetryCount < 5) {
        eaddrRetryCount++;
        const waitMs = 1500;
        console.warn(`Port ${PORT} is busy (likely socket in TIME_WAIT). Retrying bind (${eaddrRetryCount}/5) in ${waitMs}ms...`);
        setTimeout(() => {
          startServer();
        }, waitMs);
        return;
      }
      console.error(`Port ${PORT} is already in use after 5 retries. Stop any other backend process and restart the watch task.`);
      process.exitCode = 1;
      return;
    }

    console.error("Backend server error:", error);
    scheduleServerRetry("Backend listener error encountered.");
  });

  server.on("close", () => {
    server = null;
  });
}

function restartServerAfterFatal(reason, error) {
  if (restartingAfterFatal) {
    return;
  }
  restartingAfterFatal = true;
  console.error(reason, error);

  if (server) {
    try {
      server.close(() => {
        server = null;
        restartingAfterFatal = false;
        scheduleServerRetry("Recovered from fatal backend error.");
      });
      return;
    } catch {
      server = null;
    }
  }

  restartingAfterFatal = false;
  scheduleServerRetry("Recovered from fatal backend error.");
}

process.on("uncaughtException", (error) => {
  restartServerAfterFatal("Uncaught backend exception:", error);
});

process.on("unhandledRejection", (reason) => {
  restartServerAfterFatal("Unhandled backend rejection:", reason);
});

startServer();


function splitMarkdownEntries(content) {
  if (content.includes('<!-- entry-break -->')) {
    return content.split(/<!--\s*entry-break\s*-->/);
  }
  const parts = content.split(/\n\n+(?=---[\r\n]+[a-z0-9_-]+:)/gi);
  if (parts.length === 1 && content.trim().startsWith('---')) {
    return content.split(/\n+(?=---[\r\n]+[a-z0-9_-]+:)/gi);
  }
  return parts;
}


async function handleUpdateCharacterRaw(req, res) {
  try {
    const { characterId, sourceFile, newRaw } = req.body;
    if (!characterId || !sourceFile || !newRaw) {
      return res.status(400).json({ ok: false, error: "Missing required fields" });
    }

    const absPath = resolveSafePath(sourceFile);
    if (!absPath || !fs.existsSync(absPath)) {
      return res.status(404).json({ ok: false, error: "Source file not found" });
    }

    const raw = await fs.promises.readFile(absPath, "utf8");
    const parts = splitMarkdownEntries(raw);

    // Detect joiner
    let joiner = "\n\n\n";
    if (raw.includes("<!-- entry-break -->")) {
      joiner = "\n\n<!-- entry-break -->\n\n";
    }

    const entryIdx = parts.findIndex(part => {
      const trimmedPart = part.trim();
      const fmMatch = trimmedPart.match(/^---\s*[\r\n]+([\s\S]*?)[\r\n]+---\s*[\r\n]*/);
      if (!fmMatch) return false;
      try {
        const meta = require("js-yaml").load(fmMatch[1]);
        return String(meta.id) === String(characterId);
      } catch { return false; }
    });

    if (entryIdx === -1) {
      return res.status(404).json({ ok: false, error: "Character entry not found in file" });
    }

    // Replace
    parts[entryIdx] = newRaw.trim();

    await fs.promises.writeFile(absPath, parts.join(joiner), "utf8");
    res.json({ ok: true });
  } catch (error) {
    console.error("Error updating character raw:", error);
    res.status(500).json({ ok: false, error: error.message });
  }
}

async function handleImportNotebookStory(req, res) {
  try {
    const rawPayload = typeof req.body === 'string' ? req.body : (req.body?.storyText || req.body?.rawMarkdown || req.body?.markdown || '');
    const rawText = String(rawPayload || '').replace(/\r\n/g, "\n").trim();
    if (!rawText) {
      return res.status(400).json({ ok: false, error: "Missing storyText." });
    }

    const parsedImport = parseNotebookImportText(rawText);
    const parsedFields = parsedImport.fields || {};
    const storyText = String(parsedImport.body || rawText).replace(/\r\n/g, "\n").trim();

    const title = cleanText(req.body?.title || req.body?.notebookTitle || parsedFields.title || "Field Notes") || "Field Notes";
    const notebookId = slugifyNotebookId(req.body?.notebookId || req.body?.id || parsedFields.id || title, "notebook");
    const filename = cleanText(req.body?.filename || req.body?.notebookFilename || parsedFields.filename || `nb_${notebookId}.md`);
    const subtitle = cleanText(req.body?.subtitle || parsedFields.subtitle || "");
    const metadata = cleanText(req.body?.metadata || parsedFields.metadata || "");
    const date = cleanText(req.body?.date || parsedFields.date || "");
    const payload = {
      notebookId,
      number: req.body?.number ?? parsedFields.number,
      title,
      subtitle,
      metadata,
      date,
      filename,
      entryId: cleanText(req.body?.entryId || `${notebookId}-e1`) || `${notebookId}-e1`,
      entryTitle: cleanText(req.body?.entryTitle || "Start") || "Start",
      entryDate: cleanText(req.body?.entryDate || date || ""),
      rawMarkdown: storyText,
      stickers: Array.isArray(req.body?.stickers) ? req.body.stickers : (Array.isArray(parsedFields.stickers) ? parsedFields.stickers : []),
      coverDoodles: Array.isArray(req.body?.coverDoodles) ? req.body.coverDoodles : (Array.isArray(parsedFields.coverdoodles) ? parsedFields.coverdoodles : [])
    };

    const built = buildNotebookMarkdown(payload);
    const absPath = path.join(getNotebookDir(), built.filename);
    await fs.promises.mkdir(path.dirname(absPath), { recursive: true });
    await fs.promises.writeFile(absPath, built.markdown, "utf8");

    const compiled = compileNotebooks(getNotebookDir());
    const notebook = (Array.isArray(compiled.notebooks) ? compiled.notebooks : [])
      .find((entry) => String(entry?.id || "") === String(built.notebookId || "")) || built.manifestEntry;

    res.json({
      ok: true,
      notebook,
      filePath: toPosix(path.relative(ROOT_DIR, absPath)),
      filename: built.filename
    });
  } catch (error) {
    console.error("Error importing notebook story:", error);
    res.status(500).json({ ok: false, error: String(error?.message || "Failed to import notebook story.") });
  }
}

async function handleDeleteNotebook(req, res) {
  try {
    const notebookId = cleanText(req.body?.id || req.body?.notebookId || '');
    if (!notebookId) {
      return res.status(400).json({ ok: false, error: "Missing notebookId." });
    }

    const CANONICAL_JESS_IDS = new Set([
      'one', 'nb2', 'three', 'four-five', 'six', 'seven', 'eight', 'nine', 'ten',
      'eleven', 'nb12', 'nb13', 'nb14', 'nb15', 'nb16', 'nb17', 'nb20', 'nb21'
    ]);

    if (CANONICAL_JESS_IDS.has(notebookId)) {
      return res.status(403).json({ ok: false, error: "Canonical story notebooks cannot be deleted." });
    }

    const manifestPath = path.join(getNotebookDir(), 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      return res.status(404).json({ ok: false, error: "Manifest not found." });
    }

    const manifestData = JSON.parse(await fs.promises.readFile(manifestPath, 'utf8'));
    const notebooks = Array.isArray(manifestData?.notebooks) ? manifestData.notebooks : [];
    const notebook = notebooks.find(nb => String(nb.id || '') === String(notebookId));
    if (!notebook) {
      return res.status(404).json({ ok: false, error: "Notebook not found in manifest." });
    }

    const filename = notebook.filename || `nb_${notebookId}.md`;
    const absPath = path.join(getNotebookDir(), filename);

    if (fs.existsSync(absPath)) {
      await fs.promises.unlink(absPath);
    } else {
      console.warn(`File ${absPath} did not exist when trying to delete notebook ${notebookId}.`);
    }

    // Recompile the notebooks to regenerate the manifest.json
    const compiled = compileNotebooks(getNotebookDir());

    res.json({
      ok: true,
      notebooks: compiled.notebooks
    });
  } catch (error) {
    console.error("Error deleting notebook:", error);
    res.status(500).json({ ok: false, error: String(error?.message || "Failed to delete notebook.") });
  }
}

async function handleCharacterCoreSetIcon(req, res) {
  try {
    const characterId = String(req.body?.characterId || '').toLowerCase().trim();
    const iconKey = String(req.body?.iconKey || '').trim();
    console.log('handleCharacterCoreSetIcon request', { characterId, iconKey });
    if (!characterId) return res.status(400).json({ ok: false, error: 'Missing characterId' });

    // Support either `core.json` or `character_core.json` depending on repo
    const candidatePaths = [
      path.join(ROOT_DIR, 'data', 'characters', 'core.json'),
      path.join(ROOT_DIR, 'data', 'characters', 'character_core.json')
    ];
    let absPath = candidatePaths.find((p) => fs.existsSync(p));
    if (!absPath) {
      // default to `core.json` if none exist
      absPath = candidatePaths[0];
    }

    console.log('handleCharacterCoreSetIcon using file', absPath);

    const raw = await fs.promises.readFile(absPath, 'utf8');
    let parsed;
    try {
      parsed = JSON.parse(raw || '{}');
    } catch (e) {
      console.error('handleCharacterCoreSetIcon JSON parse error', e);
      return res.status(500).json({ ok: false, error: 'Failed to parse core JSON', details: String(e?.message || e) });
    }

    const characters = parsed?.characters && typeof parsed.characters === 'object' ? parsed.characters : null;
    if (!characters) return res.status(500).json({ ok: false, error: `${path.basename(absPath)} format invalid` });

    let character = characters[characterId];
    if (!character || typeof character !== 'object') {
      console.log(`handleCharacterCoreSetIcon character ${characterId} not found, creating default entry`);
      character = {
        "full name": characterId,
        "gender": "",
        "race": "",
        "ethnicity": "",
        "nationality": ""
      };
      characters[characterId] = character;
    }

    // Apply icon fields
    if (iconKey) {
      character.iconKey = iconKey;
      character.icon = iconKey;
    } else {
      delete character.iconKey;
      delete character.icon;
    }

    // Save back to disk
    const output = JSON.stringify(parsed, null, 2) + '\n';
    try {
      await fs.promises.writeFile(absPath, output, 'utf8');
    } catch (e) {
      console.error('handleCharacterCoreSetIcon write error', e);
      return res.status(500).json({ ok: false, error: 'Failed to write core JSON', details: String(e?.message || e) });
    }

    console.log('handleCharacterCoreSetIcon wrote file', absPath, 'for', characterId);
    res.json({ ok: true, characterId, filePath: path.relative(ROOT_DIR, absPath) });
  } catch (error) {
    console.error('Error in handleCharacterCoreSetIcon:', error);
    res.status(500).json({ ok: false, error: String(error?.message || error) });
  }
}

async function cleanUpEntityId(characterId) {
  const entitiesPath = resolveStoryPath("entities.json");
  if (!fs.existsSync(entitiesPath)) return;
  try {
    const raw = await fs.promises.readFile(entitiesPath, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    let changed = false;
    Object.keys(parsed).forEach(cat => {
      if (parsed[cat] && parsed[cat][characterId]) {
        delete parsed[cat][characterId];
        changed = true;
      }
    });
    if (changed) {
      await fs.promises.writeFile(entitiesPath, JSON.stringify(parsed, null, 2) + '\n', 'utf8');
    }
  } catch (e) {
    console.error('Error cleaning up entity ID', characterId, e);
  }
}

async function upsertEntity(characterId, category, name, iconKey, isSpecial) {
  const entitiesPath = resolveStoryPath("entities.json");
  if (!fs.existsSync(entitiesPath)) return {};
  const raw = await fs.promises.readFile(entitiesPath, 'utf8');
  const parsed = JSON.parse(raw || '{}');

  // Find if entity already exists and what other tags it had
  let existingTags = [];
  Object.keys(parsed).forEach(cat => {
    if (parsed[cat] && parsed[cat][characterId]) {
      if (Array.isArray(parsed[cat][characterId].tags)) {
        existingTags = parsed[cat][characterId].tags;
      }
      delete parsed[cat][characterId];
    }
  });

  // Assign standard tag
  let standardTag = 'theme';
  if (category === 'places') standardTag = 'location';
  else if (category === 'organizations') standardTag = 'organization';
  else if (category === 'countries') standardTag = 'geopolitical';

  const categoryTags = ['theme', 'location', 'organization', 'geopolitical'];
  let tags = existingTags.filter(t => t !== 'special' && !categoryTags.includes(t));
  
  // Add standard tag to front
  tags.unshift(standardTag);

  // If special subtag is toggled, add 'special'
  if (isSpecial) {
    if (!tags.includes('special')) {
      tags.push('special');
    }
  }

  const entity = {
    name: name,
    iconKey: iconKey || 'tag',
    tags: tags
  };

  if (!parsed[category]) {
    parsed[category] = {};
  }
  parsed[category][characterId] = entity;

  await fs.promises.writeFile(entitiesPath, JSON.stringify(parsed, null, 2) + '\n', 'utf8');
  return entity;
}

async function syncEquivalencies(characterId, mode, redirectTarget) {
  const filePath = path.join(ROOT_DIR, "tools", "format_tags.js");
  if (!fs.existsSync(filePath)) {
    console.warn("format_tags.js not found at", filePath);
    return;
  }

  try {
    const content = await fs.promises.readFile(filePath, 'utf8');
    const startMarker = 'const EQUIVALENCIES = {';
    const startIdx = content.indexOf(startMarker);
    if (startIdx === -1) {
      console.warn("Could not find start of EQUIVALENCIES in format_tags.js");
      return;
    }
    const endIdx = content.indexOf('};', startIdx);
    if (endIdx === -1) {
      console.warn("Could not find end of EQUIVALENCIES in format_tags.js");
      return;
    }

    const innerText = content.substring(startIdx + startMarker.length, endIdx);
    const eq = new Function("return {" + innerText + "}")();

    // 1. Remove characterId from all alias lists
    Object.keys(eq).forEach(key => {
      if (Array.isArray(eq[key])) {
        eq[key] = eq[key].filter(alias => alias !== characterId);
      }
    });

    // 2. If mode is redirect, add characterId to redirectTarget
    if (mode === 'redirect' && redirectTarget) {
      const targetKey = String(redirectTarget).toLowerCase().trim();
      if (!eq[targetKey]) {
        eq[targetKey] = [];
      }
      if (!eq[targetKey].includes(characterId)) {
        eq[targetKey].push(characterId);
      }
    }

    // 3. Format EQUIVALENCIES block back cleanly
    const sortedKeys = Object.keys(eq).sort((a, b) => a.localeCompare(b));
    const formattedLines = sortedKeys.map(key => {
      const listStr = eq[key].map(alias => JSON.stringify(alias)).join(', ');
      return `    ${JSON.stringify(key)}: [${listStr}]`;
    });
    const newBlock = 'const EQUIVALENCIES = {\n' + formattedLines.join(',\n') + '\n};';

    const newContent = content.substring(0, startIdx) + newBlock + content.substring(endIdx + 2);
    await fs.promises.writeFile(filePath, newContent, 'utf8');
    console.log("Successfully updated format_tags.js EQUIVALENCIES for", characterId);
  } catch (err) {
    console.error("Failed to sync equivalencies in format_tags.js:", err);
  }
}

async function handleCharacterCoreUpsert(req, res) {
  try {
    const characterId = String(req.body?.characterId || '').toLowerCase().trim();
    const mode = String(req.body?.mode || 'character').toLowerCase().trim();
    const updateData = req.body?.updateData;
    
    if (!characterId || !updateData || typeof updateData !== 'object') {
      return res.status(400).json({ ok: false, error: 'Missing characterId or updateData' });
    }

    const corePath = resolveStoryPath("core.json");
    if (!fs.existsSync(corePath)) {
      return res.status(404).json({ ok: false, error: 'core.json not found in story directory' });
    }

    const rawCore = await fs.promises.readFile(corePath, 'utf8');
    let parsedCore;
    try {
      parsedCore = JSON.parse(rawCore || '{}');
    } catch (e) {
      return res.status(500).json({ ok: false, error: 'Failed to parse core JSON' });
    }

    if (!parsedCore.characters || typeof parsedCore.characters !== 'object') {
      parsedCore.characters = {};
    }

    // Clean up cross-registrations and save based on the selected mode
    if (mode === 'character') {
      // 1. Clean up entities.json
      await cleanUpEntityId(characterId);

      // 2. Sync format_tags.js EQUIVALENCIES (removes characterId from all alias lists)
      await syncEquivalencies(characterId, 'character');

      // 3. Upsert to core.json
      let character = parsedCore.characters[characterId];
      if (!character || typeof character !== 'object') {
        const mergedCore = await readAndMergeStoryJson("core.json");
        const inherited = mergedCore.characters?.[characterId];
        if (inherited && typeof inherited === 'object') {
          character = JSON.parse(JSON.stringify(inherited));
        } else {
          character = { "full name": characterId };
        }
      }
      // Remove any redirect fields if converting from redirect
      delete character.redirect;

      // Apply character updates
      const charFields = ['full name', 'birthDate', 'deathDate', 'gender', 'ethnicity', 'nationality', 'navGroup', 'iconKey', 'groups'];
      charFields.forEach(key => {
        if (updateData[key] !== undefined && updateData[key] !== null) {
          character[key] = updateData[key];
        }
      });
      parsedCore.characters[characterId] = character;

      const outputCore = JSON.stringify(parsedCore, null, 2) + '\n';
      await fs.promises.writeFile(corePath, outputCore, 'utf8');

      runVitalsGenerator();
      return res.json({ ok: true, characterId, character });

    } else if (mode === 'entity') {
      // 1. Remove from core.json
      if (parsedCore.characters[characterId]) {
        delete parsedCore.characters[characterId];
        const outputCore = JSON.stringify(parsedCore, null, 2) + '\n';
        await fs.promises.writeFile(corePath, outputCore, 'utf8');
      }

      // 2. Sync format_tags.js EQUIVALENCIES (removes characterId from all alias lists)
      await syncEquivalencies(characterId, 'entity');

      // 3. Upsert to entities.json
      const category = updateData.entityCategory || 'organizations';
      const name = updateData['full name'] || characterId;
      const iconKey = updateData.iconKey || 'tag';
      const isSpecial = !!updateData.isSpecial;

      const entity = await upsertEntity(characterId, category, name, iconKey, isSpecial);

      runVitalsGenerator();
      return res.json({ ok: true, characterId, entity, category });

    } else if (mode === 'redirect') {
      // 1. Clean up entities.json
      await cleanUpEntityId(characterId);

      // 2. Overwrite as a redirect character entry in core.json
      const redirectTarget = String(updateData.redirectTarget || '').toLowerCase().trim();
      if (!redirectTarget) {
        return res.status(400).json({ ok: false, error: 'Missing redirectTarget for redirect mode' });
      }

      const character = {
        redirect: redirectTarget
      };
      if (updateData.navGroup) {
        character.navGroup = updateData.navGroup;
      }
      parsedCore.characters[characterId] = character;

      const outputCore = JSON.stringify(parsedCore, null, 2) + '\n';
      await fs.promises.writeFile(corePath, outputCore, 'utf8');

      // 3. Sync format_tags.js EQUIVALENCIES (removes from others, pushes to redirectTarget)
      await syncEquivalencies(characterId, 'redirect', redirectTarget);

      runVitalsGenerator();
      return res.json({ ok: true, characterId, character });
    } else {
      return res.status(400).json({ ok: false, error: `Invalid mode: ${mode}` });
    }

  } catch (error) {
    console.error('Error in handleCharacterCoreUpsert:', error);
    res.status(500).json({ ok: false, error: String(error?.message || error) });
  }
}

async function handleCharacterCoreRename(req, res) {
  try {
    const oldId = String(req.body?.oldId || '').toLowerCase().trim();
    const newId = String(req.body?.newId || '').toLowerCase().trim();

    if (!oldId || !newId) {
      return res.status(400).json({ ok: false, error: 'Both oldId and newId are required' });
    }

    if (!/^[a-z0-9-]+$/.test(oldId) || !/^[a-z0-9-]+$/.test(newId)) {
      return res.status(400).json({ ok: false, error: 'IDs must contain only lowercase letters, numbers, and hyphens' });
    }

    if (oldId === newId) {
      return res.json({ ok: true });
    }

    // 1. Rename inside core.json if present
    const corePath = resolveStoryPath("core.json");
    let coreUpdated = false;
    if (fs.existsSync(corePath)) {
      const rawCore = await fs.promises.readFile(corePath, 'utf8');
      const parsedCore = JSON.parse(rawCore || '{}');
      if (parsedCore.characters && parsedCore.characters[oldId]) {
        parsedCore.characters[newId] = parsedCore.characters[oldId];
        delete parsedCore.characters[oldId];
        await fs.promises.writeFile(corePath, JSON.stringify(parsedCore, null, 2) + '\n', 'utf8');
        coreUpdated = true;
      }
    }

    // 2. Rename inside entities.json if present
    const entitiesPath = resolveStoryPath("entities.json");
    let entitiesUpdated = false;
    if (fs.existsSync(entitiesPath)) {
      const rawEntities = await fs.promises.readFile(entitiesPath, 'utf8');
      const parsedEntities = JSON.parse(rawEntities || '{}');
      Object.keys(parsedEntities).forEach(cat => {
        if (parsedEntities[cat] && parsedEntities[cat][oldId]) {
          parsedEntities[cat][newId] = parsedEntities[cat][oldId];
          delete parsedEntities[cat][oldId];
          entitiesUpdated = true;
        }
      });
      if (entitiesUpdated) {
        await fs.promises.writeFile(entitiesPath, JSON.stringify(parsedEntities, null, 2) + '\n', 'utf8');
      }
    }

    // 3. Rename inside character_stats.json if present
    const charStatsPath = resolveStoryPath("character_stats.json");
    if (fs.existsSync(charStatsPath)) {
      const rawStats = await fs.promises.readFile(charStatsPath, 'utf8');
      const parsedStats = JSON.parse(rawStats || '{}');
      if (parsedStats[oldId]) {
        parsedStats[newId] = parsedStats[oldId];
        delete parsedStats[oldId];
        await fs.promises.writeFile(charStatsPath, JSON.stringify(parsedStats, null, 2) + '\n', 'utf8');
      }
    }

    // 4. Update equivalencies in format_tags.js and run it
    const formatScript = path.join(ROOT_DIR, "tools", "format_tags.js");
    if (fs.existsSync(formatScript)) {
      let formatContent = await fs.promises.readFile(formatScript, 'utf8');
      const startMarker = 'const EQUIVALENCIES = {';
      const startIdx = formatContent.indexOf(startMarker);
      if (startIdx !== -1) {
        const endIdx = formatContent.indexOf('};', startIdx);
        if (endIdx !== -1) {
          const innerText = formatContent.substring(startIdx + startMarker.length, endIdx);
          const eq = new Function("return {" + innerText + "}")();

          // Move any aliases under oldId to newId, and add oldId as alias for newId
          const oldAliases = eq[oldId] || [];
          delete eq[oldId];

          // Make sure newId has its aliases set up, including oldId and any existing ones
          if (!eq[newId]) {
            eq[newId] = [];
          }
          oldAliases.forEach(alias => {
            const aClean = String(alias).toLowerCase().trim();
            if (aClean && aClean !== newId && !eq[newId].includes(aClean)) {
              eq[newId].push(aClean);
            }
          });
          if (!eq[newId].includes(oldId)) {
            eq[newId].push(oldId);
          }

          // Clean up oldId and newId aliases from all other keys to avoid conflicts
          Object.keys(eq).forEach(key => {
            if (key !== newId && Array.isArray(eq[key])) {
              eq[key] = eq[key].filter(a => {
                const cleanA = String(a).toLowerCase().trim();
                return cleanA !== oldId && cleanA !== newId;
              });
            }
          });

          // Format back cleanly
          const sortedKeys = Object.keys(eq).sort((a, b) => a.localeCompare(b));
          const formattedLines = sortedKeys.map(key => {
            const listStr = eq[key].map(alias => JSON.stringify(alias)).join(', ');
            return `    ${JSON.stringify(key)}: [${listStr}]`;
          });
          const newBlock = 'const EQUIVALENCIES = {\n' + formattedLines.join(',\n') + '\n};';
          const newFormatContent = formatContent.substring(0, startIdx) + newBlock + formatContent.substring(endIdx + 2);
          await fs.promises.writeFile(formatScript, newFormatContent, 'utf8');

          // Run format_tags.js to replace references in all story files
          const { execSync } = require("child_process");
          const timelineRelPath = path.relative(ROOT_DIR, resolveStoryPath("timeline"));
          const relationshipsRelPath = path.relative(ROOT_DIR, resolveStoryPath("relationships"));
          execSync(`node "${formatScript}" --paths "${timelineRelPath}" "${relationshipsRelPath}"`, {
            cwd: ROOT_DIR,
            env: { ...process.env, CHAR_MGR_STORY_DIR: getStoryRootDir() },
            encoding: "utf8",
            timeout: 30000
          });
        }
      }
    }

    // 5. Rename portrait folder if exists
    const oldPortraitDir = path.join(ROOT_DIR, 'portraits', oldId);
    const newPortraitDir = path.join(ROOT_DIR, 'portraits', newId);
    if (fs.existsSync(oldPortraitDir) && !fs.existsSync(newPortraitDir)) {
      try {
        fs.renameSync(oldPortraitDir, newPortraitDir);
        console.log(`Renamed portraits folder from ${oldId} to ${newId}`);
      } catch (e) {
        console.error('Failed to rename portraits folder:', e);
      }
    }

    // 6. Run vitals generator
    runVitalsGenerator();

    // 7. Run compact_timeline to regenerate AI profiles if compact script exists
    const compactScript = path.join(ROOT_DIR, "tools", "compact_timeline.js");
    if (fs.existsSync(compactScript)) {
      try {
        const { execSync } = require("child_process");
        execSync(`node "${compactScript}"`, {
          cwd: ROOT_DIR,
          env: { ...process.env, CHAR_MGR_STORY_DIR: getStoryRootDir() },
          encoding: "utf8",
          timeout: 30000
        });
        console.log("Successfully ran compact_timeline.js");
      } catch (e) {
        console.error('Failed to run compact_timeline.js:', e);
      }
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error('Error in handleCharacterCoreRename:', error);
    res.status(500).json({ ok: false, error: String(error?.message || error) });
  }
}

async function handleCharacterCoreBulkUpsert(req, res) {
  try {
    const characterIds = req.body?.characterIds;
    const updates = req.body?.updates;

    if (!Array.isArray(characterIds) || !characterIds.length || !updates || typeof updates !== 'object') {
      return res.status(400).json({ ok: false, error: 'Missing characterIds array or updates object' });
    }

    const corePath = resolveStoryPath("core.json");
    if (!fs.existsSync(corePath)) {
      return res.status(404).json({ ok: false, error: 'core.json not found in story directory' });
    }

    const rawCore = await fs.promises.readFile(corePath, 'utf8');
    let parsedCore;
    try {
      parsedCore = JSON.parse(rawCore || '{}');
    } catch (e) {
      return res.status(500).json({ ok: false, error: 'Failed to parse core JSON' });
    }

    if (!parsedCore.characters || typeof parsedCore.characters !== 'object') {
      parsedCore.characters = {};
    }

    let modifiedCount = 0;
    const updatedCharacters = {};

    for (const characterId of characterIds) {
      const id = String(characterId || '').toLowerCase().trim();
      if (!id) continue;

      let character = parsedCore.characters[id];
      if (!character || typeof character !== 'object') {
        continue;
      }

      if (character.redirect) {
        continue;
      }

      // Apply whitelisted character updates
      const whitelistedFields = ['gender', 'ethnicity', 'nationality', 'navGroup'];
      whitelistedFields.forEach(key => {
        if (updates[key] !== undefined && updates[key] !== null) {
          character[key] = String(updates[key]);
        }
      });

      if (Array.isArray(updates.groups)) {
        let currentGroups = character.groups || [];
        if (typeof currentGroups === 'string') {
          currentGroups = [currentGroups];
        }
        const groupsArray = Array.isArray(currentGroups) ? [...currentGroups] : [];
        updates.groups.forEach(g => {
          const trimmed = String(g || '').trim();
          if (trimmed && !groupsArray.some(cg => String(cg).trim() === trimmed)) {
            groupsArray.push(trimmed);
          }
        });
        character.groups = groupsArray;
      }

      parsedCore.characters[id] = character;
      updatedCharacters[id] = character;
      modifiedCount++;
    }

    if (modifiedCount > 0) {
      const outputCore = JSON.stringify(parsedCore, null, 2) + '\n';
      await fs.promises.writeFile(corePath, outputCore, 'utf8');
      runVitalsGenerator();
    }

    return res.json({ ok: true, modifiedCount, updatedCharacters });
  } catch (error) {
    console.error('Error in handleCharacterCoreBulkUpsert:', error);
    res.status(500).json({ ok: false, error: String(error?.message || error) });
  }
}

async function handleCharacterCoreBulkDelete(req, res) {
  try {
    const characterIds = req.body?.characterIds;
    console.log('Received bulk-delete request for characterIds:', characterIds);

    if (!Array.isArray(characterIds) || !characterIds.length) {
      console.warn('bulk-delete aborted: characterIds is empty or not an array');
      return res.status(400).json({ ok: false, error: 'Missing characterIds array' });
    }

    const corePath = resolveStoryPath("core.json");
    if (!fs.existsSync(corePath)) {
      return res.status(404).json({ ok: false, error: 'core.json not found in story directory' });
    }

    const rawCore = await fs.promises.readFile(corePath, 'utf8');
    let parsedCore;
    try {
      parsedCore = JSON.parse(rawCore || '{}');
    } catch (e) {
      return res.status(500).json({ ok: false, error: 'Failed to parse core JSON' });
    }

    if (!parsedCore.characters || typeof parsedCore.characters !== 'object') {
      return res.status(400).json({ ok: false, error: 'Characters registry is invalid' });
    }

    let deletedCount = 0;
    for (const characterId of characterIds) {
      const id = String(characterId || '').toLowerCase().trim();
      if (!id) continue;
      if (parsedCore.characters[id]) {
        delete parsedCore.characters[id];
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      const outputCore = JSON.stringify(parsedCore, null, 2) + '\n';
      await fs.promises.writeFile(corePath, outputCore, 'utf8');
      runVitalsGenerator();
    }

    return res.json({ ok: true, deletedCount });
  } catch (error) {
    console.error('Error in handleCharacterCoreBulkDelete:', error);
    res.status(500).json({ ok: false, error: String(error?.message || error) });
  }
}

async function handleCharacterCoreDelete(req, res) {
  try {
    const characterId = String(req.body?.characterId || '').toLowerCase().trim();
    if (!characterId) {
      return res.status(400).json({ ok: false, error: 'Missing characterId' });
    }

    console.log('Received delete request for characterId:', characterId);

    const corePath = resolveStoryPath("core.json");
    const entitiesPath = resolveStoryPath("entities.json");

    let deleted = false;

    // 1. Remove from core.json
    if (fs.existsSync(corePath)) {
      const rawCore = await fs.promises.readFile(corePath, 'utf8');
      const parsedCore = JSON.parse(rawCore || '{}');
      if (parsedCore.characters && parsedCore.characters[characterId]) {
        delete parsedCore.characters[characterId];
        await fs.promises.writeFile(corePath, JSON.stringify(parsedCore, null, 2) + '\n', 'utf8');
        deleted = true;
      }
    }

    // 2. Remove from entities.json
    if (fs.existsSync(entitiesPath)) {
      const rawEntities = await fs.promises.readFile(entitiesPath, 'utf8');
      const parsedEntities = JSON.parse(rawEntities || '{}');
      let entitiesModified = false;
      for (const category of Object.keys(parsedEntities)) {
        if (parsedEntities[category] && parsedEntities[category][characterId]) {
          delete parsedEntities[category][characterId];
          entitiesModified = true;
          deleted = true;
        }
      }
      if (entitiesModified) {
        await fs.promises.writeFile(entitiesPath, JSON.stringify(parsedEntities, null, 2) + '\n', 'utf8');
      }
    }

    // 3. Sync format_tags.js EQUIVALENCIES (removes characterId from all alias lists)
    await syncEquivalencies(characterId, 'entity');

    // 4. Scan all markdown files in the story directory and remove the tag
    await removeTagFromMarkdownFiles(characterId);

    runVitalsGenerator();

    return res.json({ ok: true, deleted });
  } catch (error) {
    console.error('Error in handleCharacterCoreDelete:', error);
    res.status(500).json({ ok: false, error: String(error?.message || error) });
  }
}

async function removeTagFromMarkdownFiles(tagToRemove) {
  const targetTag = String(tagToRemove || '').toLowerCase().trim();
  if (!targetTag) return;

  const storyPath = resolveStoryPath("");
  
  const mdFiles = [];
  async function findMdFiles(dir) {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const ent of entries) {
      const fullPath = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === 'node_modules' || ent.name === '.git' || ent.name === 'archives') continue;
        await findMdFiles(fullPath);
      } else if (ent.isFile() && ent.name.toLowerCase().endsWith('.md')) {
        mdFiles.push(fullPath);
      }
    }
  }

  await findMdFiles(storyPath);
  console.log(`Scanning ${mdFiles.length} markdown files to remove tag: "${targetTag}"...`);

  for (const filePath of mdFiles) {
    try {
      const content = await fs.promises.readFile(filePath, 'utf8');
      
      const separatorRegex = /<!--\s*entry-break\s*-->/g;
      const chunks = content.split(separatorRegex);
      let fileModified = false;
      
      const updatedChunks = chunks.map(chunk => {
        const trimmed = chunk.trim();
        if (!trimmed) return chunk;

        const fmMatch = trimmed.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        if (!fmMatch) return chunk;

        try {
          const fmContent = fmMatch[1];
          const data = yaml.load(fmContent);
          if (data && Array.isArray(data.tags)) {
            const originalLength = data.tags.length;
            
            data.tags = data.tags.filter(t => {
              let tClean = String(t || '').toLowerCase().trim();
              if (tClean.startsWith('-')) {
                tClean = tClean.slice(1).trim();
              }
              return tClean !== targetTag;
            });

            if (data.tags.length !== originalLength) {
              fileModified = true;
              const newFm = yaml.dump(data, { lineWidth: -1 }).trim();
              const chunkBody = trimmed.slice(fmMatch[0].length).trim();
              
              return `---\n${newFm}\n---\n\n${chunkBody}`;
            }
          }
        } catch (err) {
          console.warn(`YAML parse/dump error in file ${filePath}:`, err);
        }
        return chunk;
      });

      if (fileModified) {
        const separatorMatches = content.match(separatorRegex) || [];
        let rejoined = '';
        for (let i = 0; i < updatedChunks.length; i++) {
          rejoined += updatedChunks[i];
          if (i < separatorMatches.length) {
            rejoined += '\n\n' + separatorMatches[i] + '\n\n';
          }
        }
        await fs.promises.writeFile(filePath, rejoined, 'utf8');
        console.log(`  Updated tags in file: ${filePath}`);
      }
    } catch (err) {
      console.error(`Error processing file ${filePath}:`, err);
    }
  }
}


async function handleGetEntities(req, res) {
  try {
    const merged = await readAndMergeStoryJson("entities.json");
    res.json(merged);
  } catch (error) {
    console.error("Error loading entities:", error);
    res.status(500).json({ ok: false, error: "Failed to load entities." });
  }
}

async function getCharacterCoreData() {
  try {
    const merged = await readAndMergeStoryJson("core.json");
    return merged?.characters || {};
  } catch (e) {
    console.error('getCharacterCoreData parse error', e);
    return {};
  }
}

function resolveCharacterId(characterId, coreData) {
  const id = String(characterId || '').toLowerCase().trim();
  if (!id) return id;
  let character = coreData[id];
  if (!character?.redirect) return id;

  let currentId = id;
  let visited = new Set([id]);
  while (character?.redirect) {
    const nextId = String(character.redirect).toLowerCase().trim();
    if (visited.has(nextId)) break; // Loop protection
    visited.add(nextId);
    currentId = nextId;
    character = coreData[nextId];
    if (!character) break;
  }
  return currentId;
}

async function handleTimelineExport(req, res) {
  try {
    const tagsParam = req.query.tags ? String(req.query.tags).split(',').map(t => t.trim().toLowerCase()).filter(Boolean) : [];
    const yearParam = req.query.year ? String(req.query.year).trim() : null;
    const yearFromParam = req.query.yearFrom ? Number(req.query.yearFrom) : null;
    const yearToParam = req.query.yearTo ? Number(req.query.yearTo) : null;
    const monthFromParam = req.query.monthFrom ? String(req.query.monthFrom).trim() : null;
    const monthToParam = req.query.monthTo ? String(req.query.monthTo).trim() : null;
    const searchParam = req.query.search ? String(req.query.search).trim().toLowerCase() : null;
    const tagMode = String(req.query.tagMode || 'or').toLowerCase().trim() === 'and' ? 'and' : 'or';
    const saveToServer = String(req.query.saveToServer).trim() === 'true';
    const format = String(req.query.format || 'json').toLowerCase().trim();

    const events = await getTimelineEvents();
    const coreData = await getCharacterCoreData();
    const characterTagSet = new Set(Object.keys(coreData).map(k => k.toLowerCase()));
    const resolvedActiveTags = tagsParam.map(tag => resolveCharacterId(tag, coreData));

    function getEventYear(ev) {
      const parts = parseTimelineDateParts(ev?.date);
      return parts ? parts.year : null;
    }

    const filtered = events.filter(ev => {
      // 1. Text Search Filter
      if (searchParam) {
        const tags = Array.isArray(ev.tags) ? ev.tags : [];
        const haystack = [
          String(ev.date || ''),
          String(ev.title || ''),
          String(ev.description || ''),
          ...tags
        ].join(' ').toLowerCase();
        if (!haystack.includes(searchParam)) return false;
      }

      // 2. Year & Date Range Filters
      const eventYear = getEventYear(ev);
      const parsedDate = parseTimelineDateParts(ev.date);
      const eventMonth = parsedDate ? parsedDate.month : 0;

      if (eventYear !== null) {
        if (yearParam) {
          if (String(eventYear) !== yearParam) return false;
        }
        const startYear = yearFromParam !== null && !isNaN(yearFromParam) ? yearFromParam : -Infinity;
        const startMonth = monthFromParam && monthFromParam !== '00' ? Number(monthFromParam) : 1;
        const endYear = yearToParam !== null && !isNaN(yearToParam) ? yearToParam : Infinity;
        const endMonth = monthToParam && monthToParam !== '00' ? Number(monthToParam) : 12;

        const eventVal = eventYear * 100 + eventMonth;
        const startVal = startYear * 100 + startMonth;
        const endVal = endYear * 100 + endMonth;

        if (eventVal < startVal || eventVal > endVal) return false;
      } else if (yearParam || (yearFromParam !== null && !isNaN(yearFromParam)) || (yearToParam !== null && !isNaN(yearToParam))) {
        return false;
      }

      // 3. Tag Filters
      if (resolvedActiveTags.length > 0) {
        const tags = Array.isArray(ev.tags) ? ev.tags.map(t => String(t || '').trim().toLowerCase()) : [];
        const resolvedEventTags = tags.map(t => resolveCharacterId(t, coreData));

        if (tagMode === 'and') {
          const matchesAll = resolvedActiveTags.every(tag => {
            return resolvedEventTags.includes(tag) || (eventYear !== null && String(eventYear) === tag);
          });
          if (!matchesAll) return false;
        } else {
          const matchesAny = resolvedActiveTags.some(tag => {
            return resolvedEventTags.includes(tag) || (eventYear !== null && String(eventYear) === tag);
          });
          if (!matchesAny) return false;
        }
      }

      return true;
    });

    let content;
    if (format === 'md' || format === 'markdown') {
      const payload = {};
      filtered.forEach(ev => {
        const date = String(ev.date || '');
        const title = String(ev.title || '').trim();
        const desc = String(ev.description || '').trim();
        if (!date) return;
        if (!payload[date]) payload[date] = [];
        const entry = title ? `[${title}] ${desc}` : desc;
        if (entry.trim()) payload[date].push(entry.trim());
      });

      const dates = Object.keys(payload).sort();
      let md = `# Timeline Export - ${yearParam || 'Filtered timeline'}\n\n`;
      dates.forEach((date) => {
        md += `## ${date}\n`;
        payload[date].forEach((entry) => {
          md += `- ${entry}\n`;
        });
        md += `\n`;
      });
      content = md;
    } else if (format === 'compact' || format === 'ai_compact') {
      const TAG_ABBREVIATIONS = {
        "history": "h",
        "key-event": "!",
        "pangea": "pg",
        "pre-flood": "pf",
        "order": "o",
        "roboter": "r",
        "fairmount": "f",
        "eden": "e",
        "watchers": "w",
        "nephilim": "nph",
        "long-war": "lw",
        "management-operation": "mo",
        "character": "c",
        "location": "l"
      };

      const compactTags = (tags) => {
        if (!Array.isArray(tags)) return [];
        return tags.map(t => TAG_ABBREVIATIONS[t] || t);
      };

      const stripRedundant = (text) => {
        if (!text) return "";
        return text
          .replace(/Addendum to .*?:/gi, '')
          .replace(/\b(the|a|an)\b /gi, '')
          .replace(/\s+/g, ' ')
          .trim();
      };

      const sorted = [...filtered].sort((a, b) => {
        const dA = String(a.date || '0000-00-00');
        const dB = String(b.date || '0000-00-00');
        if (dA !== dB) return dA.localeCompare(dB);
        return (a.id || '').localeCompare(b.id || '');
      });

      const lines = sorted.map(e => {
        const date = e.date || "0000-00-00";
        const id = e.id || "";
        const title = String(e.title || "").trim();
        const tags = compactTags(e.tags);
        const meta = [id, title, ...tags].filter(Boolean).join('|');
        const body = stripRedundant(String(e.description || ""));
        return `${date}[${meta}] ${body}`;
      });

      content = lines.join('\n');
    } else {
      // Default: JSON format
      const payload = {};
      filtered.forEach(ev => {
        const date = String(ev.date || '');
        const title = String(ev.title || '').trim();
        const desc = String(ev.description || '').trim();
        if (!date) return;
        if (!payload[date]) payload[date] = [];
        const entry = title ? `[${title}] ${desc}` : desc;
        if (entry.trim()) payload[date].push(entry.trim());
      });
      content = payload;
    }

    const activeCharTags = tagsParam.filter(t => characterTagSet.has(resolveCharacterId(t, coreData)));
    const charSuffix = activeCharTags.length ? `_${activeCharTags.join('_')}` : '';
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const yearStr = yearParam || 'timeline';
    
    let ext = 'json';
    if (format === 'md' || format === 'markdown') ext = 'md';
    else if (format === 'compact' || format === 'ai_compact') ext = 'txt';

    const filename = `timeline_export_${yearStr}${charSuffix}_${stamp}.${ext}`;
    const fileContent = typeof content === 'string' ? content : JSON.stringify(content, null, 2);

    let savedPath = null;
    if (saveToServer) {
      const exportDir = path.join(ROOT_DIR, 'exportdump');
      await fs.promises.mkdir(exportDir, { recursive: true });
      const fullPath = path.join(exportDir, filename);
      await fs.promises.writeFile(fullPath, fileContent, 'utf8');
      savedPath = `exportdump/${filename}`;
    }

    res.json({
      ok: true,
      filename,
      savedToServer: saveToServer,
      serverFilePath: savedPath,
      format,
      data: content
    });
  } catch (error) {
    console.error('Error in handleTimelineExport:', error);
    res.status(500).json({ ok: false, error: String(error?.message || error) });
  }
}




let cachedMaleNames = null;
let cachedFemaleNames = null;
let cachedLastNames = null;

function loadNameDatabases() {
  if (cachedMaleNames && cachedFemaleNames && cachedLastNames) return;
  const path = require('path');
  const fs = require('fs');

  const malePath = path.resolve(__dirname, "../data/male.txt");
  const femalePath = path.resolve(__dirname, "../data/female.txt");
  const lastPath = path.resolve(__dirname, "../data/last-names.txt");

  if (fs.existsSync(malePath)) {
    cachedMaleNames = fs.readFileSync(malePath, 'utf8')
      .split(/\r?\n/)
      .slice(6)
      .map(n => n.trim())
      .filter(Boolean);
  } else {
    cachedMaleNames = ["John", "Michael", "David", "James", "Robert"];
  }

  if (fs.existsSync(femalePath)) {
    cachedFemaleNames = fs.readFileSync(femalePath, 'utf8')
      .split(/\r?\n/)
      .slice(6)
      .map(n => n.trim())
      .filter(Boolean);
  } else {
    cachedFemaleNames = ["Mary", "Jennifer", "Linda", "Patricia", "Elizabeth"];
  }

  if (fs.existsSync(lastPath)) {
    cachedLastNames = fs.readFileSync(lastPath, 'utf8')
      .split(/\r?\n/)
      .map(n => n.trim())
      .filter(Boolean);
  } else {
    cachedLastNames = ["Smith", "Johnson", "Williams", "Brown", "Jones"];
  }
}

function pickWeighted(options, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * sum;
  for (let i = 0; i < options.length; i++) {
    r -= weights[i];
    if (r <= 0) return options[i];
  }
  return options[options.length - 1];
}

function capitalizeName(str) {
  if (!str) return '';
  return str.split('-').map(part => {
    return part.split(' ').map(word => {
      if (!word) return '';
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }).join(' ');
  }).join('-');
}

function generateSvgSketch(gender, hairColor, eyeColor, skinTone, hairStyle, clothingColor, name) {
  const skinColors = {
    'pale': '#fce5cd',
    'fair': '#f9cb9c',
    'rosy': '#f3c8c2',
    'olive': '#e0ac69',
    'moderate bronze': '#c68642',
    'warm sand': '#e8beac',
    'light beige': '#f6dec9',
    'light brown': '#b07d62',
    'brown': '#8d5524',
    'tan': '#d2b48c',
    'dark brown': '#5c3818',
    'deep brown': '#3c2006',
    'deep bronze': '#4a2c11'
  };

  const eyeColors = {
    'blue': '#4682b4',
    'green': '#3cb371',
    'brown': '#8b4513',
    'dark brown': '#2b1b11',
    'hazel': '#c2b280'
  };

  const hairColors = {
    'blonde': '#faf0be',
    'brown': '#5c4033',
    'dark brown': '#2b1d0c',
    'black': '#111111',
    'red': '#b22222'
  };

  const skin = skinColors[skinTone] || '#f9cb9c';
  const eye = eyeColors[eyeColor] || '#8b4513';
  const hair = hairColors[hairColor] || '#111111';
  
  const bgColors = [
    { start: '#1e3c72', end: '#2a5298' },
    { start: '#3a7bd5', end: '#3a6073' },
    { start: '#4e54c8', end: '#8f94fb' },
    { start: '#11998e', end: '#38ef7d' },
    { start: '#fc4a1a', end: '#f7b733' },
    { start: '#7f00ff', end: '#e100ff' }
  ];
  
  let hash = 0;
  for (let idx = 0; idx < name.length; idx++) {
    hash = name.charCodeAt(idx) + ((hash << 5) - hash);
  }
  const bg = bgColors[Math.abs(hash) % bgColors.length];

  let backHairPaths = '';
  let frontHairPaths = '';

  if (hairStyle === 'long' || (gender === 'female' && hairStyle !== 'short' && hairStyle !== 'bald')) {
    backHairPaths = `
      <!-- Back long hair -->
      <path d="M 60 85 C 45 120, 45 170, 60 185 L 140 185 C 155 170, 155 120, 140 85 Z" fill="${hair}" />
    `;
    frontHairPaths = `
      <!-- Top hair cap to prevent bald spots -->
      <path d="M 70 73 A 32 32 0 0 1 130 73 Z" fill="${hair}" />
      <!-- Front long bangs & side frames -->
      <path d="M 68 76 C 80 50, 120 50, 132 76 C 115 62, 85 62, 68 76 Z" fill="${hair}" />
      <path d="M 68 71 C 61 95, 64 125, 71 130 C 74 130, 71 105, 71 71 Z" fill="${hair}" />
      <path d="M 132 71 C 139 95, 136 125, 129 130 C 126 130, 129 105, 129 71 Z" fill="${hair}" />
    `;
  } else if (hairStyle === 'short' || gender === 'male') {
    frontHairPaths = `
      <!-- Top hair cap to prevent bald spots -->
      <path d="M 70 73 A 32 32 0 0 1 130 73 Z" fill="${hair}" />
      <!-- Short hair crop -->
      <path d="M 66 75 C 66 45, 134 45, 134 75 C 120 65, 80 65, 66 75 Z" fill="${hair}" />
      <rect x="66" y="70" width="5" height="15" fill="${hair}" />
      <rect x="129" y="70" width="5" height="15" fill="${hair}" />
    `;
  } else if (hairStyle === 'bob') {
    backHairPaths = `
      <!-- Back bob hair -->
      <path d="M 64 85 C 56 100, 56 120, 68 128 L 132 128 C 144 120, 144 100, 136 85 Z" fill="${hair}" />
    `;
    frontHairPaths = `
      <!-- Top hair cap to prevent bald spots -->
      <path d="M 70 73 A 32 32 0 0 1 130 73 Z" fill="${hair}" />
      <!-- Front bob bangs & side frames -->
      <path d="M 68 76 C 80 50, 120 50, 132 76 C 115 62, 85 62, 68 76 Z" fill="${hair}" />
      <path d="M 68 71 C 61 80, 62 105, 68 114 C 71 114, 70 85, 73 71 Z" fill="${hair}" />
      <path d="M 132 71 C 139 80, 138 105, 132 114 C 129 114, 130 85, 127 71 Z" fill="${hair}" />
    `;
  } else if (hairStyle === 'curly') {
    backHairPaths = `
      <!-- Back curls -->
      <circle cx="100" cy="85" r="42" fill="${hair}" />
      <circle cx="76" cy="65" r="24" fill="${hair}" />
      <circle cx="124" cy="65" r="24" fill="${hair}" />
      <circle cx="85" cy="50" r="26" fill="${hair}" />
      <circle cx="115" cy="50" r="26" fill="${hair}" />
    `;
    frontHairPaths = `
      <!-- Front curls -->
      <circle cx="78" cy="55" r="10" fill="${hair}" />
      <circle cx="122" cy="55" r="10" fill="${hair}" />
      <circle cx="100" cy="46" r="12" fill="${hair}" />
      <circle cx="68" cy="70" r="8" fill="${hair}" />
      <circle cx="132" cy="70" r="8" fill="${hair}" />
    `;
  }

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="100%" height="100%" style="border-radius: 8px;">
  <defs>
    <linearGradient id="bgGrad-${hash}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${bg.start}" />
      <stop offset="100%" stop-color="${bg.end}" />
    </linearGradient>
    <clipPath id="circleClip-${hash}">
      <rect x="0" y="0" width="200" height="200" rx="8" />
    </clipPath>
  </defs>
  
  <g clip-path="url(#circleClip-${hash})">
    <!-- 1. Background -->
    <rect width="200" height="200" fill="url(#bgGrad-${hash})" />
    
    <!-- 2. Back Hair -->
    ${backHairPaths}
    
    <!-- 3. Neck & Neck Shadow -->
    <rect x="88" y="105" width="24" height="60" fill="${skin}" />
    <path d="M 88 120 C 95 127, 105 127, 112 120" stroke="rgba(0,0,0,0.12)" stroke-width="4" stroke-linecap="round" fill="none" />
    
    <!-- 4. Clothing/Shoulders (cutout automatically overlays skin) -->
    <path d="M 30 200 L 30 152 C 30 135, 88 135, 88 142 L 100 154 L 112 142 C 112 135, 170 135, 170 152 L 170 200 Z" fill="${clothingColor}" />
    
    <!-- 5. Head Base -->
    <circle cx="100" cy="85" r="32" fill="${skin}" />
    
    <!-- 6. Face Details -->
    <!-- Eyes -->
    <circle cx="88" cy="83" r="6.5" fill="#ffffff" />
    <circle cx="88" cy="83" r="3.5" fill="${eye}" />
    <circle cx="88" cy="83" r="1.5" fill="#000000" />
    <circle cx="86.5" cy="81.5" r="1" fill="#ffffff" />
    
    <circle cx="112" cy="83" r="6.5" fill="#ffffff" />
    <circle cx="112" cy="83" r="3.5" fill="${eye}" />
    <circle cx="112" cy="83" r="1.5" fill="#000000" />
    <circle cx="110.5" cy="81.5" r="1" fill="#ffffff" />
    
    <!-- Eyebrows -->
    <path d="M 78 74 C 82 71, 90 72, 94 76" fill="none" stroke="${hair}" stroke-width="2" stroke-linecap="round" />
    <path d="M 122 74 C 118 71, 110 72, 106 76" fill="none" stroke="${hair}" stroke-width="2" stroke-linecap="round" />
    
    <!-- Nose -->
    <path d="M 98 90 L 100 97 L 103 97" fill="none" stroke="rgba(0,0,0,0.18)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    
    <!-- Mouth -->
    <path d="M 92 104 C 95 110, 105 110, 108 104" fill="none" stroke="rgba(0,0,0,0.22)" stroke-width="2" stroke-linecap="round" />
    
    <!-- 7. Front Hair -->
    ${frontHairPaths}
  </g>
</svg>
  `.trim();
}

async function handleCharacterCoreSuggest(req, res) {
  try {
    loadNameDatabases();

    const count = Math.min(100, Math.max(1, Number(req.body?.count || 5)));
    const equitable = !!req.body?.equitable;

    const corePath = resolveStoryPath("core.json");
    let characters = {};
    if (fs.existsSync(corePath)) {
      try {
        const raw = await fs.promises.readFile(corePath, 'utf8');
        characters = JSON.parse(raw || '{}').characters || {};
      } catch (e) {
        console.warn('Failed to parse core.json in suggest, using empty object');
      }
    }

    const genders = ['female', 'male'];
    const ethnicities = ['white', 'arab', 'black', 'asian', 'hispanic', 'indian', 'korean'];
    const nationalities = ['american', 'pangean', 'indian', 'nigerian', 'russian', 'brazilian', 'japanese', 'taiwanese', 'british', 'chinese', 'polish', 'ghanaian'];
    const navGroups = ['People'];

    const genderCounts = {};
    const ethnicityCounts = {};
    const nationalityCounts = {};
    const navGroupCounts = {};

    genders.forEach(g => genderCounts[g] = 0);
    ethnicities.forEach(e => ethnicityCounts[e] = 0);
    nationalities.forEach(n => nationalityCounts[n] = 0);
    navGroups.forEach(nv => navGroupCounts[nv] = 0);

    Object.values(characters).forEach(char => {
      if (!char || char.redirect) return;
      const g = String(char.gender || 'unknown').toLowerCase().trim();
      const e = String(char.ethnicity || 'unknown').toLowerCase().trim();
      const n = String(char.nationality || 'unknown').toLowerCase().trim();
      const nv = String(char.navGroup || 'unknown').trim();

      if (genders.includes(g)) genderCounts[g]++;
      if (ethnicities.includes(e)) ethnicityCounts[e]++;
      if (nationalities.includes(n)) nationalityCounts[n]++;
      if (navGroups.includes(nv)) navGroupCounts[nv]++;
    });

    const suggestions = [];
    const usedKeys = new Set(Object.keys(characters));

    const NATIONALITY_ETHNICITY_MAP = {
      indian: { indian: 0.95, asian: 0.05 },
      nigerian: { black: 0.98, white: 0.02 },
      ghanaian: { black: 0.98, white: 0.02 },
      japanese: { asian: 0.98, white: 0.02 },
      taiwanese: { asian: 0.98, white: 0.02 },
      chinese: { asian: 0.98, white: 0.02 },
      russian: { white: 0.95, asian: 0.05 },
      polish: { white: 0.98, asian: 0.02 },
      american: { white: 0.60, black: 0.15, hispanic: 0.15, asian: 0.08, arab: 0.02 },
      british: { white: 0.80, black: 0.08, asian: 0.08, indian: 0.04 },
      brazilian: { hispanic: 0.50, white: 0.35, black: 0.15 },
      pangean: { white: 0.30, black: 0.20, asian: 0.20, hispanic: 0.15, arab: 0.15 }
    };

    const ETHNICITY_FEATURES_MAP = {
      white: {
        hair: { blonde: 0.25, brown: 0.45, 'dark brown': 0.15, black: 0.10, red: 0.05 },
        eye: { blue: 0.35, green: 0.20, brown: 0.30, hazel: 0.15 },
        skin: { pale: 0.40, fair: 0.45, rosy: 0.15 }
      },
      black: {
        hair: { black: 0.85, 'dark brown': 0.15 },
        eye: { 'dark brown': 0.85, brown: 0.15 },
        skin: { 'dark brown': 0.40, 'deep brown': 0.45, 'light brown': 0.15 }
      },
      asian: {
        hair: { black: 0.90, 'dark brown': 0.10 },
        eye: { 'dark brown': 0.90, brown: 0.10 },
        skin: { fair: 0.45, 'warm sand': 0.45, 'light beige': 0.10 }
      },
      korean: {
        hair: { black: 0.92, 'dark brown': 0.08 },
        eye: { 'dark brown': 0.92, brown: 0.08 },
        skin: { fair: 0.50, 'warm sand': 0.40, 'light beige': 0.10 }
      },
      hispanic: {
        hair: { black: 0.50, 'dark brown': 0.35, brown: 0.15 },
        eye: { brown: 0.70, 'dark brown': 0.20, hazel: 0.10 },
        skin: { olive: 0.50, 'light brown': 0.30, tan: 0.20 }
      },
      arab: {
        hair: { black: 0.75, 'dark brown': 0.25 },
        eye: { 'dark brown': 0.60, brown: 0.30, hazel: 0.10 },
        skin: { olive: 0.60, 'moderate bronze': 0.25, fair: 0.15 }
      },
      indian: {
        hair: { black: 0.98, 'dark brown': 0.02 },
        eye: { 'dark brown': 0.85, brown: 0.15 },
        skin: { brown: 0.50, 'light brown': 0.30, 'deep bronze': 0.20 }
      }
    };

    for (let i = 0; i < count; i++) {
      let genderWeights = genders.map(() => 1);
      let nationalityWeights = nationalities.map(() => 1);

      if (equitable) {
        genderWeights = genders.map(g => 1 / (genderCounts[g] + 1));
        nationalityWeights = nationalities.map(n => 1 / (nationalityCounts[n] + 1));
      }

      const gender = pickWeighted(genders, genderWeights);
      const nationality = pickWeighted(nationalities, nationalityWeights);
      const navGroup = 'People';

      // Resolve typical/equitable ethnicity for the chosen nationality
      const typical = NATIONALITY_ETHNICITY_MAP[nationality] || { white: 1 };
      const ethOptions = Object.keys(typical);
      let ethWeights;
      if (equitable) {
        ethWeights = ethOptions.map(eth => {
          const typWeight = typical[eth];
          const repWeight = 1 / ((ethnicityCounts[eth] || 0) + 1);
          return typWeight * repWeight;
        });
      } else {
        ethWeights = ethOptions.map(eth => typical[eth]);
      }
      const ethnicity = pickWeighted(ethOptions, ethWeights);

      // Roll physical characteristics based on ethnicity
      const feats = ETHNICITY_FEATURES_MAP[ethnicity] || ETHNICITY_FEATURES_MAP.white;
      
      const hairOptions = Object.keys(feats.hair);
      const hairWeights = hairOptions.map(h => feats.hair[h]);
      const hairColor = pickWeighted(hairOptions, hairWeights);

      const eyeOptions = Object.keys(feats.eye);
      const eyeWeights = eyeOptions.map(e => feats.eye[e]);
      const eyeColor = pickWeighted(eyeOptions, eyeWeights);

      const skinOptions = Object.keys(feats.skin);
      const skinWeights = skinOptions.map(s => feats.skin[s]);
      const skinTone = pickWeighted(skinOptions, skinWeights);

      let hairStyle;
      if (gender === 'female') {
        hairStyle = pickWeighted(['long', 'bob', 'curly'], [0.50, 0.35, 0.15]);
      } else {
        hairStyle = pickWeighted(['short', 'curly', 'bald'], [0.75, 0.15, 0.10]);
      }

      const clothingColors = ['#ff5722', '#3f51b5', '#4caf50', '#ffeb3b', '#9c27b0', '#00abc5', '#e91e63', '#607d8b'];
      const clothingColor = clothingColors[Math.floor(Math.random() * clothingColors.length)];

      let first = '';
      if (gender === 'female') {
        first = cachedFemaleNames[Math.floor(Math.random() * cachedFemaleNames.length)];
      } else {
        first = cachedMaleNames[Math.floor(Math.random() * cachedMaleNames.length)];
      }

      const last = cachedLastNames[Math.floor(Math.random() * cachedLastNames.length)];
      const fullName = capitalizeName(`${first} ${last}`);
      let key = String(`${first}-${last}`).toLowerCase().replace(/[^a-z0-9-]/g, '');

      let suffix = 2;
      let origKey = key;
      while (usedKeys.has(key)) {
        key = `${origKey}-${suffix}`;
        suffix++;
      }
      usedKeys.add(key);

      const svgHtml = generateSvgSketch(gender, hairColor, eyeColor, skinTone, hairStyle, clothingColor, fullName);

      suggestions.push({
        id: key,
        name: fullName,
        gender,
        ethnicity,
        nationality,
        navGroup,
        hairColor,
        eyeColor,
        skinTone,
        hairStyle,
        svgHtml
      });

      if (genderCounts[gender] !== undefined) genderCounts[gender]++;
      if (ethnicityCounts[ethnicity] !== undefined) ethnicityCounts[ethnicity]++;
      if (nationalityCounts[nationality] !== undefined) nationalityCounts[nationality]++;
      if (navGroupCounts[navGroup] !== undefined) navGroupCounts[navGroup]++;
    }

    return res.json({ ok: true, suggestions });
  } catch (error) {
    console.error('Error in handleCharacterCoreSuggest:', error);
    res.status(500).json({ ok: false, error: String(error?.message || error) });
  }
}




