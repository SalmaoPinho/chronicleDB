const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const STORY_DIR = process.env.CHAR_MGR_STORY_DIR ? path.resolve(ROOT, process.env.CHAR_MGR_STORY_DIR) : ROOT;
const picturesDir = path.join(STORY_DIR, 'pictures');

function walk(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const it of items) {
    const p = path.join(dir, it.name);
    if (it.isDirectory()) results.push(...walk(p));
    else results.push(p);
  }
  return results;
}

function collectStrings(obj, out) {
  if (!out) out = [];
  if (Array.isArray(obj)) for (const v of obj) collectStrings(v, out);
  else if (obj && typeof obj === 'object') for (const k of Object.keys(obj)) collectStrings(obj[k], out);
  else if (typeof obj === 'string') out.push(obj);
  return out;
}

function isImageFile(name) {
  return /\.(jpe?g|png|gif|webp|svg)$/i.test(name);
}

const report = {
  orphanedImages: [],
  largeJsons: [],
  missingImageIndexes: [],
  duplicateFilenames: {}
};

// collect all images under pictures
const allFiles = walk(picturesDir).filter((f) => fs.existsSync(f));
const imageFiles = allFiles.filter((f) => isImageFile(f));

// collect referenced images from image_index.json files
const indexFiles = allFiles.filter((f) => path.basename(f).toLowerCase() === 'image_index.json');
const referencedBasenames = new Set();
for (const idx of indexFiles) {
  try {
    const data = JSON.parse(fs.readFileSync(idx, 'utf8'));
    const strings = collectStrings(data);
    for (const s of strings) if (isImageFile(s)) referencedBasenames.add(path.basename(s));
  } catch (e) {
    // ignore parse errors
  }
}

for (const img of imageFiles) {
  const base = path.basename(img);
  if (!referencedBasenames.has(base)) report.orphanedImages.push(path.relative(ROOT, img));
}

// large JSONs (>1MB)
const allJsons = walk(ROOT).filter((f) => f.endsWith('.json'));
for (const j of allJsons) {
  try {
    const st = fs.statSync(j);
    if (st.size > 1024 * 1024) report.largeJsons.push({ path: path.relative(ROOT, j), size: st.size });
  } catch (e) {}
}

// missing image_index.json for year-like directories: look for directories directly under pictures that contain images but no image_index.json
const topDirs = fs.existsSync(picturesDir) 
  ? fs.readdirSync(picturesDir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d=>path.join(picturesDir,d.name))
  : [];
for (const dir of topDirs) {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  const hasImages = files.some(f => !f.isDirectory() && isImageFile(f.name));
  const hasIndex = files.some(f => !f.isDirectory() && f.name.toLowerCase() === 'image_index.json');
  if (hasImages && !hasIndex) report.missingImageIndexes.push(path.relative(ROOT, dir));
}

// duplicate filenames across pictures
const nameMap = Object.create(null);
for (const img of imageFiles) {
  const b = path.basename(img).toLowerCase();
  nameMap[b] = nameMap[b] || [];
  nameMap[b].push(path.relative(ROOT, img));
}
for (const k of Object.keys(nameMap)) if (nameMap[k].length > 1) report.duplicateFilenames[k] = nameMap[k];

const out = path.join(ROOT, 'tools', 'additional_audits_report.json');
fs.writeFileSync(out, JSON.stringify(report, null, 2));
console.log('Wrote report to', out);
