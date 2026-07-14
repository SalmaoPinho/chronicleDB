const CHARACTER_CORE_SOURCE = "story/core.json";
const TIMELINE_SOURCE = "/api/timeline";
const ENTITIES_SOURCE = "/api/entities";
const YEAR_THEMES_SOURCE = "story/year_themes.json";
const ARCHIVES_SOURCE_DIR = "archives";
const GLOBAL_ASSET_INDEX_SOURCE = "pictures/global_asset_index.json";
let globalAssetIndex = new Set();
window.timelineEvents = [];

async function loadGlobalAssetIndex() {
  try {
    const response = await fetch(GLOBAL_ASSET_INDEX_SOURCE);
    if (response.ok) {
      const assets = await response.json();
      globalAssetIndex = new Set(assets.map(a => String(a || "").toLowerCase()));

      console.log(`Global asset registry loaded: ${globalAssetIndex.size} files tracked.`);
    }
  } catch (e) {
    console.warn("Global asset index failed to load. Speculative fetching enabled (may causes 404s).", e);
  }
}

function assetExists(path) {
  if (globalAssetIndex.size === 0) return true; // Fallback if index failed to load
  const normalized = path.replace(/\\/g, '/').replace(/^\//, '').toLowerCase();
  return globalAssetIndex.has(normalized);
}

function getKnownMediaFileNamesForDir(dirPath) {
  if (!dirPath || globalAssetIndex.size === 0) {
    return [];
  }

  const prefix = String(dirPath).replace(/\\/g, '/').replace(/^\//, '').replace(/\/+$/, '').toLowerCase() + '/';
  const out = [];

  globalAssetIndex.forEach((path) => {
    const normalized = String(path || '').toLowerCase();
    if (!normalized.startsWith(prefix)) {
      return;
    }

    const relative = normalized.slice(prefix.length);
    if (!relative || relative.includes('/')) {
      return;
    }

    if (!/\.(png|jpe?g|webp|gif|avif|mp4)$/i.test(relative)) {
      return;
    }

    out.push(relative);
  });

  return out;
}

function safeJoinPath(base, file) {
  if (!file) return base;
  if (!base) return file;
  const b = base.replace(/\/+$/, "");
  const f = file.replace(/^\/+/, "");
  if (f.toLowerCase().startsWith(b.toLowerCase() + "/")) return f;
  return b + "/" + f;
}

function getSecureMediaToken() {
  try {
    return String(window.localStorage.getItem(SECURE_MEDIA_TOKEN_STORAGE_KEY) || "").trim();
  } catch {
    return "";
  }
}

function isSecureMediaEnabled() {
  try {
    return String(window.localStorage.getItem(SECURE_MEDIA_ENABLED_STORAGE_KEY) || "false") === "true";
  } catch {
    return false;
  }
}

function toSecureMediaUrl(pathValue, options = {}) {
  const normalized = String(pathValue || "").replace(/\\/g, "/").replace(/^\/+/, "");
  const isSecureScope = /^pictures\/[0-9A-Za-z_-]+\//i.test(normalized)
    && (
      /(^|\/)(unmasked|exposed)\//i.test(normalized)
      || /(?:^|[-_.])(unmasked|exposed)(?:[-_.]|$)/i.test((normalized.split("/").pop() || ""))
    );
  if (!isSecureScope) {
    return normalized;
  }

  const forceSecure = !!options.forceSecure;
  if (!forceSecure && !isSecureMediaEnabled()) {
    return normalized;
  }

  const token = getSecureMediaToken();
  const params = new URLSearchParams({ path: normalized });
  if (token) {
    params.set("token", token);
  }
  return `${SECURE_MEDIA_ENDPOINT}?${params.toString()}`;
}


const MediaUtils = window.ProjectMediaUtils || {};
const DEFAULT_YEAR = "2026";
const GLOBAL_PREAMBLE_PANEL_ENTRIES = [
      {
      id: "archives",
      order: 2.5,
      navGroup: "Preamble",
      navLabel: "Archives",
      navTag: "auto",
      eyebrow: "Preamble",
      title: "Archives",
      blocks: [
        {
          type: "archive-index",
          body: "Archive entries are discovered from the archives folder automatically.",
          basePath: "archives",
          excludeFiles: [
            "index.html"
          ],
          fallbackFiles: [
            "one.html",
            "seven.html",
            "sixteen.html",
            "seventeen.html",
            "eighteen.html",
            "maps.html",
            "dm_flashbacks.html",
            "group_chats.html",
            "july4_gazette.html",
            "liz_archive_heist.html",
            "liz_website.html",
            "yearbook.html"
          ]
        }
      ]
    },
    {
      id: "life123",
      order: 2.6,
    navGroup: "Preamble",
      navLabel: "life123",
      navTag: "social",
      eyebrow: "Preamble",
      title: "life123",
      redirectUrl: "life.html",
      blocks: [
        {
          type: "field-note",
          label: "Life123",
          body: "Launching the life123 social feed project..."
        }
      ]
    },

    {
      "id": "maps",
      "order": 2.7,
      "navGroup": "Preamble",
      "navLabel": "Maps",
      "navTag": "sheet",
      "eyebrow": "Preamble",
      "title": "Maps",
      "blocks": [
        {
          "type": "map-sheet",
          "label": "Maps",
          "title": "Ashford + Fairmount Maps",
          "src": "maps.html",
          "note": "Interactive maps are embedded below. Use city toggle, location click, and interior view without leaving the reference sheet."
        }
      ]
    },
  {
    id: "gallery",
    order: 2.8,
    navGroup: "Preamble",
    navLabel: "Gallery",
    navTag: "media",
    eyebrow: "Preamble",
    title: "Gallery",
    blocks: [
      {
        type: "gallery-sheet",
        label: "Gallery",
        title: "Picture Gallery",
        note: "Grouped gallery embedded in the master reference. Dynamic source scan plus stale-file filtering."
      }
    ]
  },
  {
    id: "statistics",
    order: 2.9,
    navGroup: "Preamble",
    navLabel: "Statistics",
    navTag: "data",
    eyebrow: "Preamble",
    title: "Statistics",
    blocks: [
      {
        type: "statistics-sheet",
        label: "Statistics",
        title: "Character Statistics",
        note: "Computed cast metrics: male/female/other counts, average age, age bands, and group distribution."
      }
    ]
  },
  {
    id: "timeline",
    order: 3.0,
    navGroup: "Preamble",
    navLabel: "Timeline",
    navTag: "history",
    eyebrow: "Preamble",
    title: "Timeline",
    blocks: [
      {
        type: "timeline-sheet",
        label: "Timeline",
        title: "Historical Timeline",
        note: "Key events and milestones documented in the project's history."
      }
    ]
  }
];
const LOCAL_OVERRIDES_STORAGE_KEY = "characterManager.referenceOverrides.v1";
const IMAGE_TAG_METADATA_STORAGE_KEY = "characterManager.imageTagMetadata.v1";
const UI_SOUND_MUTED_STORAGE_KEY = "characterManager.uiSoundsMuted.v1";
const PAGE_ALIGN_STORAGE_KEY = "characterManager.pageAlign.v1";
const BACKEND_ORIGIN_STORAGE_KEY = "characterManager.backendOrigin.v1";

function resolveBackendOrigin() {
  try {
    const override = String(window.localStorage.getItem(BACKEND_ORIGIN_STORAGE_KEY) || "").trim();
    if (override) {
      return override.replace(/\/+$/, "");
    }
  } catch {
    // Ignore localStorage issues and use inferred origin.
  }

  const protocol = window.location.protocol === "file:" ? "http:" : window.location.protocol;
  const host = window.location.hostname || "127.0.0.1";
  return `${protocol}//${host}:8787`;
}

const BACKEND_ORIGIN = resolveBackendOrigin();

const mainContent = document.getElementById("main-content");
const sidebarNav = document.getElementById("sidebar-nav");
const sidebarTitle = document.getElementById("sidebar-title");
const sidebarDoc = document.getElementById("sidebar-doc");
const sidebarMeta = document.getElementById("sidebar-meta");
const entriesRoot = document.getElementById("entries-root") || mainContent;
const yearSlider = document.getElementById("year-slider");
const yearPillsContainer = document.getElementById("year-switch-pills");
const layoutAlignControls = document.getElementById("layout-align-controls");
const xrayToggleButton = document.getElementById("xray-toggle-btn");
const exportJsonButton = document.getElementById("export-json-btn");
const exportStoryButton = document.getElementById("export-story-btn");
const regenerateMediaIndexButton = document.getElementById("regenerate-media-index-btn");
const restoreDeletedButton = document.getElementById("restore-deleted-btn");
const MEDIA_MANIFEST_RUN_ENDPOINT = `${BACKEND_ORIGIN}/api/run/generate-media-manifests`;
const MEDIA_CATALOG_ENDPOINT = `${BACKEND_ORIGIN}/api/media/catalog`;
const SECURE_MEDIA_ENDPOINT = `${BACKEND_ORIGIN}/api/secure-media`;
const SECURE_MEDIA_TOKEN_STORAGE_KEY = "characterManager.secureMediaToken.v1";
const SECURE_MEDIA_ENABLED_STORAGE_KEY = "characterManager.secureMediaEnabled.v1";
const XRAY_MODE_STORAGE_KEY = "characterManager.xrayEnabled.v1";

let entries = [];
let activeEntryId = "";
let life123ProfileIds = new Set();
let life123Data = {};
const imageCatalogPromisesByYear = new Map();
const galleryIndexByEntry = new Map();
const galleryRegistry = new Map();
const galleryDisplayCountByKey = new Map();
const galleryDisplayCountBySrc = new Map();
const galleryDisplayProbePending = new Set();
const knownMediaPathsByYear = new Map();
let allVersions = {};
let activeYear = DEFAULT_YEAR;
let activeReferenceDate = null;
let characterCoreById = {};
let entitiesRegistry = {};
let yearOptions = [];
let sheetStylesByYear = {};
let appliedThemeVars = [];
let localOverridesByYear = {};
let imageTagMetadataByKey = {};
let uiAudioContext = null;
let uiSoundsMuted = false;
let pageAlignMode = "left";
let isXrayEnabled = false;
let activeVersionMeta = {};

// Multi-version year support: yearVariants[year] = [{key, label, path}]
let yearVariants = {};
// activeYearVariantKey[year] = currently selected variant key
let activeYearVariantKey = {};
const YEAR_VARIANT_STORAGE_KEY = "characterManager.yearVariants.v1";

const MONTHS_BY_NAME = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11
};

const STATS_EXCLUDED_ENTRY_IDS = new Set([
  "archives",
  "closing",
  "factions",
  "gallery",
  "intro",
  "intro-old",
  "life123",
  "maps",
  "organizations",
  "revelation-closing",
  "statistics",
  "jess-sda"
]);

const STATS_DEATH_YEAR_BY_ID = {
  patricia: 2026,
  zack: 2026,
  roboter: 2028,
  dorothy: 2045,
  "dorothy-old": 2045,
  osha: 2045,
  "osha-old": 2045
};

function getImageSourcesForYear(year) {
  const safeYear = yearOptions.includes(year) ? year : (yearOptions[0] || DEFAULT_YEAR);
  return {
    yearDir: `pictures/${safeYear}`,
    // New canonical portraits root; legacy path kept as legacyPortraitsDir for fallback.
    portraitsDir: 'portraits',
    legacyPortraitsDir: `pictures/${safeYear}/portraits`,
    outfitsDir: 'pictures/outfits',
    groupsDir: `pictures/${safeYear}/groups`,
    manifestPath: `pictures/${safeYear}/image_index.json`
  };
}

/**
 * Resolve the best portrait path for a character + year.
 * Priority: new portraits/<id>/<id><year>.ext  →  legacy pictures/<year>/portraits/<name>.ext
 * Tries both .jpg and .png for each candidate.
 */
function resolvePortraitPath(characterId, year) {
  const id = String(characterId || '').toLowerCase().replace(/[^a-z0-9.\-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  const y = String(year || '').trim();
  if (!id || !y) return '';

  for (const ext of ['jpg', 'png', 'webp']) {
    const newPath = `portraits/${id}/${id}${y}.${ext}`;
    if (assetExists(newPath)) return newPath;
  }
  // Legacy fallback — try capitalized form used in the old structure
  const originalId = String(characterId || '').trim();
  for (const ext of ['jpg', 'png', 'webp']) {
    const legacyPath = `pictures/${y}/portraits/${originalId}.${ext}`;
    if (assetExists(legacyPath)) return legacyPath;
    const legacyLower = `pictures/${y}/portraits/${id}.${ext}`;
    if (assetExists(legacyLower)) return legacyLower;
  }
  return '';
}

const {
  stripHtml,
  htmlToPlainText,
  normalizeKey,
  normalizeStatsGender,
  unique,
  escapeHtml,
  parseIsoDate,
  buildUtcDate,
  calculateAgeAtDate,
  formatBirthdayLong,
  computeAverage,
  computeMedian,
  formatStatsLabel,
  getRaceChartColor,
  toRaceKey,
  getPiePoint,
  getPieSlicePath,
  isImageFile,
  isVideoFile,
  isMediaFile,
  baseName,
  toFileName,
  prettyArchiveName,
  parsePipeList,
  escapeRegex
} = window.MasterReferenceUtils || {};

const {
  updateRaceChartSelection,
  renderRacePieChart
} = window.MasterReferenceRaceChart || {};

const {
  cgSplitStemTokens,
  cgGroupByResolution,
  cgGroupImages,
  cgRenderGroupMap
} = window.MasterReferenceGalleryGroups || {};

const {
  initExportModal
} = window.MasterReferenceExportModal || {};

function getStatsGenderForEntryId(entryId) {
  const id = String(entryId || "").toLowerCase();
  return normalizeStatsGender(characterCoreById?.[id]?.gender);
}

function getCharacterIconKey(entryId) {
  const id = String(entryId || "").toLowerCase();
  
  if (id === "archives") return "book";
  if (id === "life123") return "social";
  if (id === "maps") return "map";
  if (id === "gallery") return "gallery";
  if (id === "statistics") return "chart";

  const key = normalizeKey(
    characterCoreById?.[id]?.iconKey
      || characterCoreById?.[id]?.icon
      || entitiesRegistry?.[id]?.iconKey
      || entitiesRegistry?.[id]?.icon
      || ""
  );
  return key || "";
}

function renderCharacterIconMarkup(entryId) {
  const iconKey = getCharacterIconKey(entryId);
  if (!iconKey) {
    return "";
  }
  return `<span class="char-icon icon-${iconKey}" aria-hidden="true"></span>`;
}

function normalizePageAlignMode(mode) {
  const m = String(mode || "").toLowerCase();
  if (["left", "center", "right"].includes(m)) {
    return m;
  }
  return "left";
}

function applyPageAlignMode(mode, options = {}) {
  const nextMode = normalizePageAlignMode(mode);
  pageAlignMode = nextMode;

  if (mainContent) {
    mainContent.classList.remove("align-left", "align-center", "align-right");
    mainContent.classList.add(`align-${nextMode}`);
  }

  layoutAlignControls?.querySelectorAll(".layout-align-btn[data-align]").forEach((button) => {
    button.classList.toggle("active", button.dataset.align === nextMode);
  });

  if (options.persist !== false) {
    try {
      window.localStorage.setItem(PAGE_ALIGN_STORAGE_KEY, nextMode);
    } catch {
      // Ignore persistence failures (private mode / quota) and keep session behavior.
    }
  }
}

const PAGE_FULL_WIDTH_STORAGE_KEY = "characterReferenceFullWidth";
let isFullWidthMode = false;

function applyFullWidthMode(isFull, options = {}) {
  isFullWidthMode = !!isFull;
  if (mainContent) {
    mainContent.classList.toggle("is-full-width", isFullWidthMode);
  }

  const toggleBtn = document.getElementById("full-width-toggle");
  if (toggleBtn) {
    toggleBtn.classList.toggle("active", isFullWidthMode);
  }

  if (options.persist !== false) {
    try {
      window.localStorage.setItem(PAGE_FULL_WIDTH_STORAGE_KEY, isFullWidthMode ? "true" : "false");
    } catch {
      // Ignore storage errors
    }
  }
}

function loadFullWidthMode() {
  let stored = "false";
  try {
    stored = window.localStorage.getItem(PAGE_FULL_WIDTH_STORAGE_KEY) || "false";
  } catch {
    stored = "false";
  }
  applyFullWidthMode(stored === "true", { persist: false });
}

function loadPageAlignMode() {
  let stored = "left";
  try {
    stored = window.localStorage.getItem(PAGE_ALIGN_STORAGE_KEY) || "left";
  } catch {
    stored = "left";
  }
  applyPageAlignMode(stored, { persist: false });
}

function applyXrayMode(enabled, options = {}) {
  isXrayEnabled = !!enabled;

  if (xrayToggleButton) {
    xrayToggleButton.classList.toggle("is-active", isXrayEnabled);
    xrayToggleButton.setAttribute("aria-pressed", isXrayEnabled ? "true" : "false");
    xrayToggleButton.title = isXrayEnabled ? "Disable XRay mode" : "Enable XRay mode";
  }

  if (options.persist !== false) {
    try {
      window.localStorage.setItem(XRAY_MODE_STORAGE_KEY, isXrayEnabled ? "true" : "false");
    } catch {
      // Ignore storage failures and keep session behavior.
    }
  }
}

function loadXrayMode() {
  let stored = "true";
  try {
    const raw = window.localStorage.getItem(XRAY_MODE_STORAGE_KEY);
    stored = raw == null ? "true" : raw;
  } catch {
    stored = "true";
  }
  applyXrayMode(stored === "true", { persist: false });
}

function hasSecretIdentity(entryId) {
  const id = String(entryId || "").toLowerCase();
  if (!id) {
    return false;
  }
  const value = characterCoreById?.[id]?.["secret-identity"];
  return value === true || String(value).toLowerCase() === "true";
}

function shouldMaskSensitiveIdentityRow(entry, row) {
  if (!hasSecretIdentity(entry?.id) || isXrayEnabled) {
    return false;
  }
  const labelKey = normalizeKey(row?.label || "");
  return labelKey === "fullname" || labelKey === "birthday";
}

function loadLocalOverridesFromStorage() {
  try {
    const raw = window.localStorage.getItem(LOCAL_OVERRIDES_STORAGE_KEY);
    if (!raw) {
      localOverridesByYear = {};
      return;
    }

    const parsed = JSON.parse(raw);
    localOverridesByYear = parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    localOverridesByYear = {};
  }
}

function saveLocalOverridesToStorage() {
  try {
    window.localStorage.setItem(LOCAL_OVERRIDES_STORAGE_KEY, JSON.stringify(localOverridesByYear));
  } catch {
    // Ignore storage failures (private browsing/quota) and keep session state.
  }
}

function loadImageTagMetadataFromStorage() {
  try {
    const raw = window.localStorage.getItem(IMAGE_TAG_METADATA_STORAGE_KEY);
    if (!raw) {
      imageTagMetadataByKey = {};
      return;
    }

    const parsed = JSON.parse(raw);
    imageTagMetadataByKey = parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    imageTagMetadataByKey = {};
  }
}

function saveImageTagMetadataToStorage() {
  try {
    window.localStorage.setItem(IMAGE_TAG_METADATA_STORAGE_KEY, JSON.stringify(imageTagMetadataByKey));
  } catch {
    // Ignore storage failures and keep in-memory tags.
  }
}

function loadUiSoundSettings() {
  try {
    const raw = window.localStorage.getItem(UI_SOUND_MUTED_STORAGE_KEY);
    uiSoundsMuted = raw === "true";
  } catch {
    uiSoundsMuted = false;
  }
}

function getUiAudioContext() {
  if (uiAudioContext) {
    return uiAudioContext;
  }
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) {
    return null;
  }
  uiAudioContext = new Ctor();
  return uiAudioContext;
}

function playUiTone(kind = "tap") {
  if (uiSoundsMuted) {
    return;
  }

  const ctx = getUiAudioContext();
  if (!ctx) {
    return;
  }

  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }

  const now = ctx.currentTime;
  const presets = {
    tap: { freqA: 720, freqB: 520, dur: 0.055, gain: 0.018, type: "triangle" },
    step: { freqA: 460, freqB: 620, dur: 0.07, gain: 0.02, type: "square" },
    confirm: { freqA: 540, freqB: 860, dur: 0.085, gain: 0.022, type: "sine" },
    warn: { freqA: 420, freqB: 310, dur: 0.09, gain: 0.02, type: "sawtooth" }
  };
  const preset = presets[kind] || presets.tap;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = preset.type;
  osc.frequency.setValueAtTime(preset.freqA, now);
  osc.frequency.exponentialRampToValueAtTime(Math.max(40, preset.freqB), now + preset.dur);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(preset.gain, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + preset.dur);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + preset.dur + 0.01);
}

function getImageMetadataKey(image) {
  const src = String(image?.src || "").replace(/^\/+/, "");
  const kind = String(image?.kind || "media").toLowerCase();
  return `${kind}|${src}`;
}

function getImageTagState(image) {
  const key = getImageMetadataKey(image);
  const value = imageTagMetadataByKey?.[key];
  return value && typeof value === "object" ? value : {};
}

function setImageTagState(image, updater) {
  const key = getImageMetadataKey(image);
  if (!key) {
    return;
  }

  const current = getImageTagState(image);
  const next = updater && typeof updater === "function" ? updater(current) : current;
  const exclusiveYear = String(next?.exclusiveYear || "").trim();
  const priorityYears = next?.priorityYears && typeof next.priorityYears === "object"
    ? Object.fromEntries(Object.entries(next.priorityYears).filter(([, value]) => value === true))
    : {};

  if (!exclusiveYear && Object.keys(priorityYears).length === 0) {
    delete imageTagMetadataByKey[key];
  } else {
    imageTagMetadataByKey[key] = {
      ...(exclusiveYear ? { exclusiveYear } : {}),
      ...(Object.keys(priorityYears).length ? { priorityYears } : {})
    };
  }

  saveImageTagMetadataToStorage();
}

function applyImageTagRules(images = []) {
  const filtered = (images || []).filter((image) => {
    const tagState = getImageTagState(image);
    const exclusiveYear = String(tagState?.exclusiveYear || "").trim();
    return !exclusiveYear || exclusiveYear === String(activeYear || "");
  });

  return filtered
    .map((image, index) => {
      const tagState = getImageTagState(image);
      const isPriority = tagState?.priorityYears?.[String(activeYear || "")] === true;
      return { image, index, isPriority };
    })
    .sort((a, b) => {
      if (a.isPriority !== b.isPriority) {
        return a.isPriority ? -1 : 1;
      }
      return a.index - b.index;
    })
    .map((item) => item.image);
}

function getYearOverrideBucket(year) {
  if (!localOverridesByYear[year] || typeof localOverridesByYear[year] !== "object") {
    localOverridesByYear[year] = { rows: {}, entries: {} };
  }

  if (!localOverridesByYear[year].rows || typeof localOverridesByYear[year].rows !== "object") {
    localOverridesByYear[year].rows = {};
  }

  if (!localOverridesByYear[year].entries || typeof localOverridesByYear[year].entries !== "object") {
    localOverridesByYear[year].entries = {};
  }

  return localOverridesByYear[year];
}

function buildRowOverrideKey(entryId, blockIndex, rowIndex) {
  return `${String(entryId || "").toLowerCase()}|${Number(blockIndex)}|${Number(rowIndex)}`;
}

function parseRowOverrideKey(key) {
  const parts = String(key || "").split("|");
  if (parts.length !== 3) {
    return null;
  }

  const entryId = parts[0] || "";
  const blockIndex = Number(parts[1]);
  const rowIndex = Number(parts[2]);
  if (!entryId || !Number.isInteger(blockIndex) || !Number.isInteger(rowIndex)) {
    return null;
  }

  return { entryId, blockIndex, rowIndex };
}

function setRowOverrideForYear(year, entryId, blockIndex, rowIndex, patch) {
  const bucket = getYearOverrideBucket(year);
  const key = buildRowOverrideKey(entryId, blockIndex, rowIndex);
  const current = bucket.rows[key] && typeof bucket.rows[key] === "object" ? bucket.rows[key] : {};
  const next = { ...current, ...patch };

  const hasValue = Object.prototype.hasOwnProperty.call(next, "value");
  const hasPinned = Object.prototype.hasOwnProperty.call(next, "pinned");
  const hasDeleted = Object.prototype.hasOwnProperty.call(next, "deleted");
  if (!hasValue && !hasPinned && !hasDeleted) {
    delete bucket.rows[key];
  } else {
    bucket.rows[key] = next;
  }

  saveLocalOverridesToStorage();
}

function setEntryDeletedForYear(year, entryId, isDeleted) {
  const bucket = getYearOverrideBucket(year);
  const id = String(entryId || "").toLowerCase();
  if (!id) {
    return;
  }

  const current = bucket.entries[id] && typeof bucket.entries[id] === "object"
    ? bucket.entries[id]
    : {};

  if (isDeleted) {
    bucket.entries[id] = { ...current, deleted: true };
  } else {
    const next = { ...current };
    delete next.deleted;
    if (Object.keys(next).length) {
      bucket.entries[id] = next;
    } else {
      delete bucket.entries[id];
    }
  }

  saveLocalOverridesToStorage();
}

function setEntryNavGroupForYear(year, entryId, navGroup) {
  const bucket = getYearOverrideBucket(year);
  const id = String(entryId || "").toLowerCase();
  if (!id) {
    return;
  }

  const current = bucket.entries[id] && typeof bucket.entries[id] === "object"
    ? bucket.entries[id]
    : {};
  const nextGroup = String(navGroup || "").trim();

  if (!nextGroup) {
    const next = { ...current };
    delete next.navGroup;
    if (Object.keys(next).length) {
      bucket.entries[id] = next;
    } else {
      delete bucket.entries[id];
    }
  } else {
    bucket.entries[id] = { ...current, navGroup: nextGroup };
  }

  saveLocalOverridesToStorage();
}

function findRowByCoordinates(entryList, entryId, blockIndex, rowIndex) {
  const targetId = String(entryId || "").toLowerCase();
  const entry = (entryList || []).find((item) => String(item?.id || "").toLowerCase() === targetId);
  if (!entry) {
    return null;
  }

  const block = entry.blocks?.[Number(blockIndex)];
  if (!block || block.type !== "table" || !Array.isArray(block.rows)) {
    return null;
  }

  const row = block.rows[Number(rowIndex)];
  if (!row) {
    return null;
  }

  return { entry, block, row };
}

function applyLocalOverridesToEntries(entryList, year) {
  const bucket = localOverridesByYear?.[year];
  const rowOverrides = bucket?.rows;
  if (rowOverrides && typeof rowOverrides === "object") {
    Object.entries(rowOverrides).forEach(([key, override]) => {
      if (!override || typeof override !== "object") {
        return;
      }

      const parsed = parseRowOverrideKey(key);
      if (!parsed) {
        return;
      }

      const found = findRowByCoordinates(entryList, parsed.entryId, parsed.blockIndex, parsed.rowIndex);
      if (!found) {
        return;
      }

      if (Object.prototype.hasOwnProperty.call(override, "value")) {
        found.row.value = String(override.value ?? "");
      }

      if (Object.prototype.hasOwnProperty.call(override, "pinned")) {
        found.row.pinned = override.pinned === true;
      }

      if (Object.prototype.hasOwnProperty.call(override, "deleted")) {
        found.row.__deleted = override.deleted === true;
      }
    });
  }

  const entryOverrides = bucket?.entries;
  if (entryOverrides && typeof entryOverrides === "object") {
    entryList.forEach((entry) => {
      const id = String(entry?.id || "").toLowerCase();
      const entryOverride = entryOverrides?.[id];
      if (!entryOverride || typeof entryOverride !== "object") {
        return;
      }

      if (typeof entryOverride.navGroup === "string" && entryOverride.navGroup.trim()) {
        entry.navGroup = entryOverride.navGroup.trim();
      }
    });

    for (let index = entryList.length - 1; index >= 0; index -= 1) {
      const entry = entryList[index];
      const id = String(entry?.id || "").toLowerCase();
      if (entryOverrides?.[id]?.deleted === true) {
        entryList.splice(index, 1);
      }
    }
  }
}

function getDeletedEntryIdsForYear(year) {
  const entryOverrides = localOverridesByYear?.[year]?.entries;
  if (!entryOverrides || typeof entryOverrides !== "object") {
    return [];
  }

  return Object.entries(entryOverrides)
    .filter(([, value]) => value && typeof value === "object" && value.deleted === true)
    .map(([id]) => String(id || "").toLowerCase())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

function refreshRestoreDeletedButton() {
  if (!restoreDeletedButton) {
    return;
  }

  const deletedIds = getDeletedEntryIdsForYear(activeYear);
  restoreDeletedButton.hidden = deletedIds.length === 0;
  restoreDeletedButton.title = deletedIds.length
    ? `Restore deleted entries: ${deletedIds.join(", ")}`
    : "No deleted entries for this year";
}

function getTableRowsForRender(block) {
  return (block?.rows || [])
    .filter((row) => row?.__deleted !== true)
    .map((row, rowIndex) => ({ row, rowIndex, isPinned: row?.pinned === true }))
    .sort((a, b) => {
      if (a.isPinned === b.isPinned) {
        return a.rowIndex - b.rowIndex;
      }
      return a.isPinned ? -1 : 1;
    });
}

function initializeEmbeddedMapBlocks() {
  const inlineMapRoot = document.querySelector(".section.active [data-map-inline='true']");
  if (!inlineMapRoot) {
    return;
  }

  if (typeof window.initAshfordLocationMap === "function") {
    window.initAshfordLocationMap();
  }
}

async function refreshRenderedContent(preferredEntryId = "") {
  renderEntries();
  renderSidebar(buildGroups(entries, currentNavSort, currentNavSearch));
  renderTimelineSheet(); // Call asynchronously without blocking other renders
  await renderArchiveIndexBlocks();
  await renderEmbeddedGalleryBlocks();
  initializeEmbeddedMapBlocks();
  await renderCharacterGalleries();

  const fallbackId = entries[0]?.id || "";
  const nextId = preferredEntryId && entries.some((entry) => entry.id === preferredEntryId)
    ? preferredEntryId
    : fallbackId;

  if (nextId) {
    showEntry(nextId);
  }
}

function buildEntriesExportSnapshot(entryList = []) {
  const snapshot = cloneValue(entryList || []);

  snapshot.forEach((entry) => {
    (entry.blocks || []).forEach((block) => {
      if (block?.type !== "table" || !Array.isArray(block.rows)) {
        return;
      }

      block.rows = getTableRowsForRender(block).map((item) => item.row);
    });
  });

  return snapshot;
}

function downloadTextFile(fileName, mimeType, content) {
  const blob = new Blob([content], { type: mimeType });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
}

function exportActiveYearJson(customEntries = entries) {
  const snapshot = {
    meta: cloneValue(activeVersionMeta || {}),
    entries: buildEntriesExportSnapshot(customEntries || [])
  };

  const fileName = `reference_${String(activeYear || "year")}_edited.json`;
  const content = `${JSON.stringify(snapshot, null, 2)}\n`;
  downloadTextFile(fileName, "application/json;charset=utf-8", content);
}

function renderStoryLinesForBlock(block) {
  if (!block || typeof block !== "object") {
    return [];
  }

  if (block.type === "auto-summary-table") {
    return buildAutoSummaryRows(block).map((row) => {
      const label = htmlToPlainText(row?.label || "");
      const value = htmlToPlainText(row?.value || "");
      if (!label && !value) {
        return "";
      }
      return `${label}: ${value}`.trim();
    }).filter(Boolean);
  }

  if (block.type === "table") {
    const rows = getTableRowsForRender(block)
      .map(({ row }) => {
        const label = htmlToPlainText(row?.label || "");
        const value = htmlToPlainText(formatTableRowValue(row));
        if (!label && !value) {
          return "";
        }
        return `${label}: ${value}`.trim();
      })
      .filter(Boolean);

    return rows;
  }

  if (block.type === "faction") {
    const lines = [];
    const name = htmlToPlainText(block.name || "Faction");
    const aka = htmlToPlainText(block.aka || "");
    const note = htmlToPlainText(block.note || "");
    lines.push(`Faction: ${name}`);
    if (aka) {
      lines.push(`Alias: ${aka}`);
    }
    if (note) {
      lines.push(note);
    }

    const members = (block.members || [])
      .map((member) => htmlToPlainText(member?.text || ""))
      .filter(Boolean);
    if (members.length) {
      lines.push("Members:");
      members.forEach((member) => lines.push(`- ${member}`));
    }

    return lines;
  }

  if (block.type === "section-break") {
    const label = htmlToPlainText(block.label || "Section");
    return [label.toUpperCase()];
  }

  if (block.type === "map-sheet") {
    const label = htmlToPlainText(block.label || "Maps");
    const src = htmlToPlainText(block.src || "maps.html");
    return [`${label}: embedded sheet (${src})`];
  }

  if (block.type === "statistics-sheet") {
    const label = htmlToPlainText(block.label || "Statistics");
    return [`${label}: integrated statistics panel (native in master reference)`];
  }

  const label = htmlToPlainText(block.label || "");
  const body = htmlToPlainText(block.body || "");

  if (label && body) {
    return [`${label}:`, body];
  }

  if (body) {
    return [body];
  }

  if (label) {
    return [label];
  }

  return [];
}

function buildStoryExportString(customEntries = entries) {
  const snapshotEntries = buildEntriesExportSnapshot(customEntries || []);
  const lines = [
    `Character Story Export - ${String(activeYear || "")}`,
    "",
    "Formatting Directives (Strict):",
    "- Use a * prefix for all actions, movements, and physical beats (e.g. *Nods slowly*).",
    "- Use a ! prefix for all sound effects, music cues, or environmental noises (e.g. !Distant thunder).",
    "- Use standard dialogue for speech.",
    ""
  ];

  snapshotEntries.forEach((entry, index) => {
    const title = htmlToPlainText(entry?.title || entry?.navLabel || entry?.id || "Entry");
    const eyebrow = htmlToPlainText(entry?.eyebrow || "");
    const authorNote = htmlToPlainText(entry?.authorNote || "");

    lines.push(`=== ${title} ===`);
    if (eyebrow) {
      lines.push(eyebrow);
    }
    if (authorNote) {
      lines.push(`Author note: ${authorNote}`);
    }

    (entry.blocks || []).forEach((block) => {
      const blockLines = renderStoryLinesForBlock(block);
      if (blockLines.length) {
        lines.push("");
        lines.push(...blockLines);
      }
    });

    if (index < snapshotEntries.length - 1) {
      lines.push("", "----------------------------------------", "");
    }
  });

  return `${lines.join("\n").trim()}\n`;
}

function exportActiveYearStory(customEntries = entries) {
  const content = buildStoryExportString(customEntries);
  const fileName = `story_${String(activeYear || "year")}.md`;
  downloadTextFile(fileName, "text/markdown;charset=utf-8", content);
}

function resolveReferenceDate(year, meta = {}) {
  const fromMeta = parseIsoDate(meta?.ageAsOf || "");
  if (fromMeta) {
    return fromMeta;
  }

  const yearNumber = Number(year);
  if (Number.isFinite(yearNumber)) {
    return new Date(Date.UTC(yearNumber, 2, 1));
  }

  return new Date();
}

function parseBirthdayFromText(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const match = value.toLowerCase().match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}),\s*(\d{4})\b/i);
  if (!match) {
    return null;
  }

  const monthIndex = MONTHS_BY_NAME[match[1].toLowerCase()];
  const day = Number(match[2]);
  const year = Number(match[3]);
  return buildUtcDate(year, monthIndex, day);
}

function parseBirthdayForRow(row) {
  if (typeof row?.birthDate === "string") {
    const parsed = parseIsoDate(row.birthDate);
    if (parsed) {
      return parsed;
    }
  }

  return parseBirthdayFromText(row?.value || "");
}

function formatTableRowValue(row) {
  const labelKey = normalizeKey(row?.label || "");
  if (labelKey !== "birthday") {
    return row?.value || "";
  }

  const birthDate = parseBirthdayForRow(row);
  const age = calculateAgeAtDate(birthDate, activeReferenceDate);
  const baseValue = row?.value || "";

  if (typeof row?.valueTemplate === "string" && row.valueTemplate.trim() && age !== null && birthDate) {
    return row.valueTemplate
      .replace(/{{\s*age\s*}}/g, String(age))
      .replace(/{{\s*year\s*}}/g, String(activeYear))
      .replace(/{{\s*birthdayLong\s*}}/g, formatBirthdayLong(birthDate))
      .replace(/{{\s*birthDate\s*}}/g, row.birthDate || "");
  }

  if (age === null) {
    return baseValue;
  }

  if (/\bage\s*\d+\b/i.test(baseValue)) {
    return baseValue.replace(/\bage\s*\d+\b/i, `age ${age}`);
  }

  return baseValue;
}

function formatTableRowMedia(row) {
  if (!row || typeof row !== "object") {
    return "";
  }

  const src = typeof row.img === "string" ? row.img.trim() : "";
  if (!src) {
    return "";
  }

  const altText = typeof row.imgAlt === "string" && row.imgAlt.trim()
    ? row.imgAlt.trim()
    : `${stripHtml(row.label || "entry image")}`;

  const notesTextRaw = typeof row.imgnotes === "string" && row.imgnotes.trim()
    ? row.imgnotes.trim()
    : (typeof row.imgNotes === "string" ? row.imgNotes.trim() : "");
  const notesMarkup = notesTextRaw
    ? `<div class="char-table-inline-image-notes">${escapeHtml(notesTextRaw)}</div>`
    : "";

  return `<div class="char-table-inline-media"><img class="char-table-inline-image" src="${escapeHtml(src)}" alt="${escapeHtml(altText)}" loading="lazy" decoding="async">${notesMarkup}</div>`;
}

function getStatisticsReferenceDate(year) {
  const numericYear = Number(year);
  if (!Number.isFinite(numericYear) || numericYear < 1000 || numericYear > 9999) {
    return activeReferenceDate || new Date();
  }
  return new Date(Date.UTC(numericYear, 11, 31));
}

function getCappedStatsReferenceDate(entryId, referenceDate) {
  const deathYear = STATS_DEATH_YEAR_BY_ID[String(entryId || "").toLowerCase()];
  if (!Number.isFinite(deathYear)) {
    return referenceDate;
  }
  const deathCutoff = new Date(Date.UTC(deathYear, 11, 31));
  return referenceDate.getTime() > deathCutoff.getTime() ? deathCutoff : referenceDate;
}

function getBirthdayForStatisticsEntry(entry) {
  const tableBlock = (entry?.blocks || []).find((block) => block?.type === "table" && Array.isArray(block.rows));
  if (!tableBlock) {
    return null;
  }

  const birthdayRow = getTableRowsForRender(tableBlock)
    .map((item) => item?.row)
    .find((row) => normalizeKey(row?.label || "") === "birthday");

  return parseBirthdayForRow(birthdayRow);
}

function formatStatsRows(rows = [], totalForPercent = 1) {
  return rows.map((row, index) => {
    const pct = totalForPercent > 0 ? (row.count / totalForPercent) * 100 : 0;
    const clampedPct = Math.max(2, Math.min(100, pct));
    const rowClass = index === 1 ? "stats-row alt" : index === 2 ? "stats-row alt2" : "stats-row";
    return `
      <div class="${rowClass}">
        <div>${escapeHtml(row.label || "")}</div>
        <div>${row.count} (${pct.toFixed(1)}%)</div>
        <div class="stats-bar"><span style="width:${clampedPct}%"></span></div>
      </div>
    `;
  }).join("");
}

function renderStatisticsSheet(block = {}) {
  const referenceDate = getStatisticsReferenceDate(activeYear);
  const castEntries = getStatisticsCastEntries(entries);

  const genderCounts = { female: 0, male: 0, other: 0 };
  const raceCounts = new Map();
  const raceMembers = new Map();
  const ages = [];
  const monthCounts = new Array(12).fill(0);
  const groupCounts = new Map();
  const unknownGenderIds = [];
  const unknownRaceIds = [];
  let whiteCount = 0;
  let minorityCount = 0;
  let minors = 0;
  let adults = 0;

  castEntries.forEach((entry) => {
    const id = String(entry?.id || "").toLowerCase();
    const mappedGender = getStatsGenderForEntryId(id);
    const gender = mappedGender || "other";
    if (!mappedGender) {
      unknownGenderIds.push(id);
    }
    genderCounts[gender] += 1;

    const mappedRace = String(characterCoreById?.[id]?.race || "").trim().toLowerCase();
    const race = mappedRace || "unknown";
    if (!mappedRace) {
      unknownRaceIds.push(id);
    }
    raceCounts.set(race, (raceCounts.get(race) || 0) + 1);
    if (!raceMembers.has(race)) {
      raceMembers.set(race, []);
    }
    raceMembers.get(race).push({
      id,
      name: stripHtml(entry?.navLabel || entry?.title || id).trim() || id
    });
    if (race === "white") {
      whiteCount += 1;
    } else if (race !== "unknown") {
      minorityCount += 1;
    }

    const groupLabel = String(entry?.navGroup || "Other");
    groupCounts.set(groupLabel, (groupCounts.get(groupLabel) || 0) + 1);

    const birthday = getBirthdayForStatisticsEntry(entry);
    if (!birthday) {
      return;
    }

    const cappedReferenceDate = getCappedStatsReferenceDate(id, referenceDate);
    const age = calculateAgeAtDate(birthday, cappedReferenceDate);
    if (!Number.isFinite(age) || age < 0 || age > 120) {
      return;
    }

    ages.push(age);
    monthCounts[birthday.getUTCMonth()] += 1;
    if (age < 18) {
      minors += 1;
    } else {
      adults += 1;
    }
  });

  const averageAge = computeAverage(ages);
  const medianAge = computeMedian(ages);
  const ageBands = [
    { label: "<18", count: ages.filter((age) => age < 18).length },
    { label: "18-24", count: ages.filter((age) => age >= 18 && age <= 24).length },
    { label: "25-39", count: ages.filter((age) => age >= 25 && age <= 39).length },
    { label: "40+", count: ages.filter((age) => age >= 40).length }
  ];

  const groupRows = Array.from(groupCounts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const monthRows = monthCounts
    .map((count, monthIndex) => ({
      label: Object.keys(MONTHS_BY_NAME).find((month) => MONTHS_BY_NAME[month] === monthIndex) || "",
      count
    }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const raceRows = Array.from(raceCounts.entries())
    .map(([label, count]) => ({
      label: formatStatsLabel(label),
      count
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const raceMembersByKey = {};
  raceMembers.forEach((members, raceKey) => {
    raceMembersByKey[raceKey] = [...members].sort((a, b) => a.name.localeCompare(b.name));
  });

  const uniqueUnknownIds = Array.from(new Set(unknownGenderIds));
  const unknownHtml = uniqueUnknownIds.length
    ? uniqueUnknownIds.map((id) => `<span class="stats-pill">unmapped: ${escapeHtml(id)}</span>`).join("")
    : '<span class="stats-pill is-ok">all mapped</span>';

  const uniqueUnknownRaceIds = Array.from(new Set(unknownRaceIds));
  const unknownRaceHtml = uniqueUnknownRaceIds.length
    ? uniqueUnknownRaceIds.map((id) => `<span class="stats-pill">missing race: ${escapeHtml(id)}</span>`).join("")
    : '<span class="stats-pill is-ok">all race fields mapped</span>';

  const title = block.title || "Character Statistics";
  const note = block.note || "Computed cast metrics integrated in the master reference.";

  return `
    <div class="stats-sheet-block">
      <div class="stats-sheet-head">
        <div class="stats-sheet-title">${escapeHtml(title)}</div>
      </div>
      <div class="stats-sheet-note">${escapeHtml(note)}</div>

      <div class="stats-summary-grid">
        <article class="stats-card">
          <div class="stats-card-label">Total Characters</div>
          <div class="stats-card-value">${castEntries.length}<small>Main + Supporting + Extended</small></div>
        </article>
        <article class="stats-card">
          <div class="stats-card-label">Known Ages</div>
          <div class="stats-card-value">${ages.length}<small>${castEntries.length - ages.length} unknown</small></div>
        </article>
        <article class="stats-card">
          <div class="stats-card-label">Average Age</div>
          <div class="stats-card-value">${averageAge === null ? "n/a" : averageAge.toFixed(1)}<small>${medianAge === null ? "" : `median ${medianAge.toFixed(1)}`}</small></div>
        </article>
        <article class="stats-card">
          <div class="stats-card-label">Adults / Minors</div>
          <div class="stats-card-value">${adults} / ${minors}<small>based on known ages</small></div>
        </article>
        <article class="stats-card">
          <div class="stats-card-label">Minority / White</div>
          <div class="stats-card-value">${minorityCount} / ${whiteCount}<small>based on race field</small></div>
        </article>
        <article class="stats-card">
          <div class="stats-card-label">Portraits Present</div>
          <div class="stats-card-value"><span data-stats-portrait-present>...</span><small>characters with a portrait</small></div>
        </article>
        <article class="stats-card">
          <div class="stats-card-label">Portraits Missing</div>
          <div class="stats-card-value"><span data-stats-portrait-missing>...</span><small>characters without a portrait</small></div>
        </article>
        <article class="stats-card">
          <div class="stats-card-label">Portrait Coverage</div>
          <div class="stats-card-value"><span data-stats-portrait-coverage>...</span><small>with portrait / total cast</small></div>
        </article>
      </div>

      <section class="stats-panels-grid">
        <article class="stats-panel">
          <header class="stats-panel-head"><h2 class="stats-panel-title">Gender Breakdown</h2></header>
          <div class="stats-rows">${formatStatsRows([
            { label: "Female", count: genderCounts.female },
            { label: "Male", count: genderCounts.male },
            { label: "Other", count: genderCounts.other }
          ], castEntries.length || 1)}</div>
        </article>

        <article class="stats-panel">
          <header class="stats-panel-head"><h2 class="stats-panel-title">Age Bands</h2></header>
          <div class="stats-rows">${formatStatsRows(ageBands, ages.length || 1)}</div>
        </article>

        <article class="stats-panel">
          <header class="stats-panel-head"><h2 class="stats-panel-title">Group Distribution</h2></header>
          <div class="stats-rows">${formatStatsRows(groupRows, castEntries.length || 1)}</div>
        </article>

        <article class="stats-panel">
          <header class="stats-panel-head"><h2 class="stats-panel-title">Birth Month Spread</h2></header>
          <div class="stats-rows">${formatStatsRows(monthRows, Math.max(1, ages.length))}</div>
        </article>

        <article class="stats-panel">
          <header class="stats-panel-head"><h2 class="stats-panel-title">Race Breakdown</h2></header>
          ${renderRacePieChart(raceRows, castEntries.length || 0, raceMembersByKey)}
          <div class="stats-rows">${formatStatsRows(raceRows, castEntries.length || 1)}</div>
        </article>
      </section>

      <div class="stats-small">Notes: "other" includes non-human or non-binary categories such as robots/AI entities and unclassified entries.</div>
      <div class="stats-pill-list">${unknownHtml}</div>
      <div class="stats-small">Race Metadata Coverage</div>
      <div class="stats-pill-list">${unknownRaceHtml}</div>
      <div class="stats-small">Characters Needing Portraits</div>
      <div class="stats-pill-list" data-stats-portrait-missing-list><span class="stats-pill">loading portrait coverage...</span></div>
      <div class="stats-status">Computed from ${castEntries.length} cast entries (${escapeHtml(String(activeYear || ""))}).</div>
    </div>
  `;
}

function toSentenceList(values = []) {
  const cleaned = values
    .map((value) => stripHtml(value || "").trim())
    .filter(Boolean);

  if (!cleaned.length) {
    return "none";
  }

  return cleaned.join(", ").toLowerCase();
}

function countEntriesByMatcher(entryList = [], matcher) {
  return (entryList || []).filter((entry) => {
    const haystack = [entry?.title, entry?.eyebrow, entry?.navLabel, entry?.navTag, entry?.id]
      .map((value) => stripHtml(value || ""))
      .join(" ");
    return matcher.test(haystack);
  }).length;
}

function getAutoSummaryCharacterGroups() {
  const preferredOrder = ["Main Cast", "Supporting Cast", "Extended Cast"];
  const excludedGroups = new Set(["Preamble", "Closing"]);
  const groups = new Map();

  (entries || []).forEach((entry) => {
    const groupLabel = stripHtml(entry?.navGroup || "").trim();
    if (!groupLabel || excludedGroups.has(groupLabel)) {
      return;
    }

    if (!groups.has(groupLabel)) {
      groups.set(groupLabel, []);
    }
    groups.get(groupLabel).push(entry);
  });

  const orderedLabels = [
    ...preferredOrder.filter((label) => groups.has(label)),
    ...Array.from(groups.keys())
      .filter((label) => !preferredOrder.includes(label))
      .sort((a, b) => a.localeCompare(b))
  ];

  return orderedLabels.map((label) => ({
    label,
    entries: groups.get(label) || []
  }));
}

function getAutoSummaryGroupOverview() {
  const sourceEntry = (entries || []).find((entry) => {
    const isPreamble = stripHtml(entry?.navGroup || "").trim() === "Preamble";
    if (!isPreamble) {
      return false;
    }

    return (entry.blocks || []).some((block) => block?.type === "faction");
  });

  if (!sourceEntry) {
    return null;
  }

  const names = (sourceEntry.blocks || [])
    .filter((block) => block?.type === "faction")
    .map((block) => block?.name)
    .map((value) => stripHtml(value || "").trim())
    .filter(Boolean);

  const rawLabel = stripHtml(sourceEntry?.navLabel || sourceEntry?.title || "groups")
    .replace(/\boverview\b/gi, "")
    .trim();

  const label = (rawLabel || "groups").toLowerCase();

  return {
    label,
    value: names.length
      ? `${names.length} groups documented: ${toSentenceList(names)}.`
      : "no groups documented."
  };
}

function applyAutoSummaryTemplate(template, tokens = {}) {
  return String(template || "")
    .replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, tokenName) => {
      const value = tokens[tokenName];
      return value === undefined || value === null ? "" : String(value);
    })
    .replace(/\s{2,}/g, " ")
    .trim();
}

function appendSummarySuffix(baseText, suffixText) {
  const base = String(baseText || "").trim();
  const suffix = String(suffixText || "").trim();

  if (!suffix) {
    return base;
  }

  if (!base) {
    return suffix;
  }

  const separator = /[.!?]$/.test(base) ? " " : ". ";
  return `${base}${separator}${suffix}`;
}

function buildAutoSummaryRows(block = {}) {
  const summaryOptions = (block?.summaryOptions && typeof block.summaryOptions === "object")
    ? block.summaryOptions
    : {};

  const sectionSuffixes = (summaryOptions.sectionSuffixes && typeof summaryOptions.sectionSuffixes === "object")
    ? summaryOptions.sectionSuffixes
    : {};

  const characterGroups = getAutoSummaryCharacterGroups();
  const allCharacterEntries = characterGroups.flatMap((group) => group.entries || []);
  const groupOverview = getAutoSummaryGroupOverview();

  const robotCount = countEntriesByMatcher(allCharacterEntries, /\brobot\b|\broboter\b/i);
  const untitledCount = countEntriesByMatcher(allCharacterEntries, /\buntitled\b/i);
  const draftFiveCount = countEntriesByMatcher(allCharacterEntries, /\bdraft\s*5\b|\bdraft\s*five\b/i);

  const robotLabel = robotCount === 1 ? "robot" : "robots";
  const untitledLabel = untitledCount === 1 ? "entry remains untitled" : "entries remain untitled";
  const draftFiveLabel = draftFiveCount === 1 ? "entry is draft five" : "entries are draft five";
  const entryNoun = String(summaryOptions.entryNoun || "character entries").trim() || "character entries";
  const totalLabel = String(summaryOptions.totalLabel || "total entries").trim() || "total entries";
  const totalTemplate = String(
    summaryOptions.totalTemplate
    || "{{entryCount}} {{entryNoun}}. {{robotCount}} {{robotLabel}}. {{untitledCount}} {{untitledLabel}}. {{draftFiveCount}} {{draftFiveLabel}}."
  );

  const totalText = applyAutoSummaryTemplate(totalTemplate, {
    entryCount: allCharacterEntries.length,
    entryNoun,
    robotCount,
    robotLabel,
    untitledCount,
    untitledLabel,
    draftFiveCount,
    draftFiveLabel
  });

  const sectionRows = characterGroups.map((group) => ({
    label: stripHtml(group.label || "").toLowerCase(),
    value: appendSummarySuffix(
      toSentenceList((group.entries || []).map((entry) => entry?.navLabel || entry?.title || entry?.id)),
      sectionSuffixes[normalizeKey(group.label || "")]
    )
  }));

  const groupRow = groupOverview
    ? {
      label: String(summaryOptions.groupOverviewLabel || groupOverview.label).trim() || groupOverview.label,
      value: applyAutoSummaryTemplate(
        summaryOptions.groupOverviewTemplate || groupOverview.value,
        {
          count: Number.parseInt(groupOverview.value, 10) || 0,
          value: groupOverview.value
        }
      ) || groupOverview.value
    }
    : null;

  return [
    ...sectionRows,
    ...(groupRow ? [groupRow] : []),
    {
      label: totalLabel,
      value: totalText
    }
  ];
}

function getCoreRowsForEntry(entryId) {
  const id = String(entryId || "").toLowerCase();
  const rows = characterCoreById?.[id]?.rows;
  return Array.isArray(rows) ? rows : [];
}

function mergeCoreRowsIntoEntry(entry) {
  const coreRows = getCoreRowsForEntry(entry?.id);
  if (!coreRows.length) {
    return;
  }

  const tableBlock = (entry.blocks || []).find((block) => block?.type === "table" && Array.isArray(block.rows));
  if (!tableBlock) {
    return;
  }

  const existingRows = tableBlock.rows || [];
  const existingOrderByLabel = new Map();
  existingRows.forEach((row, index) => {
    existingOrderByLabel.set(normalizeKey(row?.label || ""), index);
  });

  const existingByLabel = new Map();
  existingRows.forEach((row) => {
    existingByLabel.set(normalizeKey(row?.label || ""), row);
  });

  const pinnedCoreRows = [];
  const floatingCoreRowsByLabel = new Map();

  coreRows
    .map((coreRow) => {
      const key = normalizeKey(coreRow?.label || "");
      if (!key) {
        return null;
      }

      const existingRow = existingByLabel.get(key) || {};
      return {
        __isCoreRow: true,
        __isPinnedCoreRow: coreRow?.pinned === true,
        __coreKey: key,
        ...existingRow,
        ...coreRow,
        label: existingRow?.label || coreRow.label
      };
    })
    .filter(Boolean)
    .forEach((row) => {
      if (row.__isPinnedCoreRow) {
        pinnedCoreRows.push(row);
      } else {
        floatingCoreRowsByLabel.set(row.__coreKey, row);
      }
    });

  const usedFloatingKeys = new Set();
  const retainedRows = existingRows
    .map((row) => {
      const key = normalizeKey(row?.label || "");

      if (floatingCoreRowsByLabel.has(key)) {
        usedFloatingKeys.add(key);
        return floatingCoreRowsByLabel.get(key);
      }

      if (pinnedCoreRows.some((pinnedRow) => pinnedRow.__coreKey === key)) {
        return null;
      }

      return row;
    })
    .filter(Boolean);

  const missingFloatingRows = Array.from(floatingCoreRowsByLabel.entries())
    .filter(([key]) => !usedFloatingKeys.has(key))
    .sort((a, b) => {
      const aIndex = existingOrderByLabel.get(a[0]);
      const bIndex = existingOrderByLabel.get(b[0]);

      if (Number.isInteger(aIndex) && Number.isInteger(bIndex)) {
        return aIndex - bIndex;
      }

      if (Number.isInteger(aIndex)) {
        return -1;
      }

      if (Number.isInteger(bIndex)) {
        return 1;
      }

      return 0;
    })
    .map(([, row]) => row);

  const cleanupRow = (row) => {
    if (!row || typeof row !== "object") {
      return row;
    }

    const out = { ...row };
    delete out.__isCoreRow;
    delete out.__isPinnedCoreRow;
    delete out.__coreKey;
    return out;
  };

  tableBlock.rows = [...pinnedCoreRows, ...retainedRows, ...missingFloatingRows].map(cleanupRow);
}

function applyCharacterCoreToEntries(entryList) {
  (entryList || []).forEach((entry) => mergeCoreRowsIntoEntry(entry));
}

function readRequestedYear() {
  const params = new URLSearchParams(window.location.search || "");
  return params.get("year") || DEFAULT_YEAR;
}

function getSortedYearOptions(versions) {
  const keys = Object.keys(versions || {});
  return keys.sort((a, b) => {
    const aNum = Number(a);
    const bNum = Number(b);

    if (Number.isFinite(aNum) && Number.isFinite(bNum)) {
      return aNum - bNum;
    }

    return String(a).localeCompare(String(b));
  });
}

function loadYearVariantKeys() {
  try {
    const raw = window.localStorage.getItem(YEAR_VARIANT_STORAGE_KEY);
    if (!raw) {
      activeYearVariantKey = {};
      return;
    }
    const parsed = JSON.parse(raw);
    activeYearVariantKey = parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    activeYearVariantKey = {};
  }
}

function saveYearVariantKeys() {
  try {
    window.localStorage.setItem(YEAR_VARIANT_STORAGE_KEY, JSON.stringify(activeYearVariantKey));
  } catch {
    // Ignore storage failures.
  }
}

async function listYearJsonFiles() {
  try {
    const response = await fetch(`${CHARACTER_YEARS_SOURCE_DIR}/`, { cache: "no-store", headers: { "Accept": "text/html,application/json" } });
    if (!response.ok) {
      return [];
    }

    const html = await response.text();
    const hrefs = [...html.matchAll(/href=["']([^"']+)["']/gi)].map((m) => m[1]);

    const yearFiles = unique(
      hrefs
        .map(toFileName)
        .filter((name) => /^\d{4}\.json$/i.test(name))
    );

    return yearFiles.sort((a, b) => Number(a.replace(/\.json$/i, "")) - Number(b.replace(/\.json$/i, "")));
  } catch (err) {
    console.warn("Failed to fetch year directory listing:", err);
    return [];
  }
}

// Discover variant files inside a {year}versions/ folder by fetching its directory listing.
async function discoverYearVariants(year) {
  const dirPath = `${CHARACTER_YEARS_SOURCE_DIR}/${year}versions`;
  try {
    const response = await fetch(`${dirPath}/`, { cache: "no-store", headers: { "Accept": "text/html,application/json" } });
    if (!response.ok) {
      return [];
    }

    const html = await response.text();
    const hrefs = [...html.matchAll(/href=["']([^"']+)["']/gi)].map((m) => m[1]);

    const variantFiles = unique(
      hrefs
        .map(toFileName)
        .filter((name) => /\.json$/i.test(name))
    ).sort();

    return variantFiles.map((fileName) => {
      // Derive a display label: strip leading year-digits, trim separators, title-case
      const base = fileName.replace(/\.json$/i, "");
      const stemRaw = base.replace(/^\d{4}[-_]?/i, "") || base;
      const label = stemRaw.charAt(0).toUpperCase() + stemRaw.slice(1);
      const key = stemRaw.toLowerCase();
      const path = `${year}versions/${fileName}`;
      return { key, label, path };
    });
  } catch (err) {
    console.warn(`[year ${year}] Failed to discover variants in ${year}versions/:`, err);
    return [];
  }
}

function parseMarkdownEntries(text) {
  if (typeof jsyaml === 'undefined' || typeof marked === 'undefined') {
    console.warn('MR: js-yaml or marked not loaded.');
    return [];
  }
  const parts = text.split(/<!--\s*entry-break\s*-->/);
  return parts.map((part, idx) => {
    const trimmedPart = part.trim();
    if (!trimmedPart) return null;

    const fmMatch = trimmedPart.match(/^---\s*[\r\n]+([\s\S]*?)[\r\n]+---\s*[\r\n]*/);
    let meta = {};
    let content = trimmedPart;
    if (fmMatch) {
      try {
        meta = jsyaml.load(fmMatch[1]);
        content = trimmedPart.slice(fmMatch[0].length);
      } catch (e) {
        console.warn(`MR Logic: Failed to parse frontmatter for entry ${idx + 1}`, e);
      }
    } else {
        console.warn(`MR Logic: No frontmatter found for entry ${idx + 1}. First 50 chars:`, trimmedPart.slice(0, 50));
    }

    // Skip stub entries (empty or only HTML comments)
    if (/^(?:<!--[\s\S]*?-->\s*)*$/.test(content.trim())) {
      return null;
    }

    const blocks = parseMarkdownBlocks(content);
    return { ...meta, blocks };
  }).filter(entry => entry && entry.id);
}

function parseMarkdownBlocks(content) {
  const blockRegex = /<!--\s*block:\s*(\w+)\s*({.*?})\s*-->/g;
  const blocks = [];
  let match;
  const types = [];
  const propsList = [];
  const positions = [];

  while ((match = blockRegex.exec(content)) !== null) {
    types.push(match[1]);
    let p = {};
    try { p = JSON.parse(match[2].replace(/-- >/g, '-->')); } catch(e) {}
    propsList.push(p);
    positions.push(match.index + match[0].length);
  }

  if (types.length === 0) {
    if (content.trim()) {
      return [{ type: 'text', body: marked.parse(content).trim() }];
    }
    return [];
  }

  const firstBlockStart = content.indexOf(content.match(/<!--\s*block:[^>]*-->/)?.[0]);
  if (firstBlockStart > 0) {
    const preText = content.slice(0, firstBlockStart).trim();
    if (preText) {
      blocks.push({ type: 'text', body: marked.parse(preText).trim() });
    }
  }

  for (let i = 0; i < types.length; i++) {
    const start = positions[i];
    const end = (i + 1 < positions.length) ? (positions[i+1] - (content.match(/<!--\s*block:[^>]*-->/g)[i+1]?.length || 0)) : content.length;
    const type = types[i];
    const props = propsList[i];
    const blockContent = content.slice(start, end).trim();

    if (type === 'table') {
      const rows = [];
      const rowParts = blockContent.split(/^##\s+/m);
      rowParts.forEach(rp => {
        if (!rp.trim()) return;
        const lines = rp.split('\n');
        const label = lines[0].trim();
        let value = '';
        let img = '';
        let imgnotes = '';
        let unmasked = '';
        let exposed = '';
        for (let j = 1; j < lines.length; j++) {
          const line = lines[j].trim();
          if (line.startsWith('*(img: ')) img = line.slice(7, -2);
          else if (line.startsWith('*(imgnotes: ')) imgnotes = line.slice(12, -2);
          else if (line.startsWith('*(unmasked: ')) unmasked = line.slice(12, -2);
          else if (line.startsWith('*(exposed: ')) exposed = line.slice(11, -2);
          else if (line) value += (value ? '<BR>' : '') + line;
        }
        rows.push({ label, value, img, imgnotes, unmasked, exposed });
      });
      blocks.push({ ...props, type, rows });
    } else if (type === 'faction' || type === 'list') {
      const lines = blockContent.split('\n');
      const bodyLines = [];
      const members = [];
      lines.forEach(line => {
        const memberMatch = line.match(/^-\s+(.*)/);
        if (memberMatch) {
          let text = memberMatch[1].trim();
          const tierMatch = text.match(/\s*<!--\s*tier:\s*(.*?)\s*-->/);
          let tier = '';
          if (tierMatch) {
            tier = tierMatch[1];
            text = text.replace(tierMatch[0], '').trim();
          }
          members.push({ text, tier });
        } else {
          bodyLines.push(line);
        }
      });
      blocks.push({ ...props, type, body: bodyLines.join('<BR>'), members });
    } else {
      blocks.push({ ...props, type, body: marked.parse(blockContent).trim() });
    }
  }
  return blocks;
}

async function parseYearJsonFromFile(fileName) {
  const year = String(fileName || "").replace(/\.json$/i, "");
  if (!year) {
    return null;
  }

  try {
    let baseDir = "story/" + year;
    let indexUrl = baseDir + "/index.json";
    let isStory = true;

    let response = await fetch(indexUrl, { cache: "no-store" }).catch(() => ({ ok: false }));
    if (!response.ok) {
        response = await fetch(`${CHARACTER_YEARS_SOURCE_DIR}/${fileName}`, { cache: "no-store" });
        baseDir = CHARACTER_YEARS_SOURCE_DIR;
        isStory = false;
    }

    if (!response.ok) {
      return null;
    }

    const rawText = await response.text();
    const text = rawText.charCodeAt(0) === 0xFEFF ? rawText.slice(1) : rawText;
    const trimmed = text.trim();

    if (!trimmed) {
      return { year, data: { meta: {}, entries: [] } };
    }

    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object") {
      return { year, data: { meta: {}, entries: [] } };
    }

    const entrySources = Array.isArray(parsed.entrySources)
      ? parsed.entrySources.filter((item) => typeof item === "string" && item.trim())
      : [];

    let sourceEntries = [];
    if (entrySources.length) {
      const loadedSources = await Promise.all(entrySources.map(async (sourcePathRaw) => {
        const sourcePath = String(sourcePathRaw || "").replace(/^\/+/, "").trim();
        if (!sourcePath) {
          return [];
        }

        try {
          const fetchUrl = isStory ? baseDir + "/" + sourcePath : `${CHARACTER_YEARS_SOURCE_DIR}/${sourcePath}`;
          const sourceResponse = await fetch(fetchUrl, { cache: "no-store" });
          if (!sourceResponse.ok) {
            return [];
          }

          const sourceRawText = await sourceResponse.text();
          const sourceText = sourceRawText.charCodeAt(0) === 0xFEFF ? sourceRawText.slice(1) : sourceRawText;
          const sourceTrimmed = sourceText.trim();
          if (!sourceTrimmed) {
            return [];
          }

          const sourceParsed = JSON.parse(sourceTrimmed);
          return Array.isArray(sourceParsed?.entries) ? sourceParsed.entries : [];
        } catch {
          return [];
        }
      }));

      sourceEntries = loadedSources.flat();
    }

    return {
      year,
      data: {
        baseYear: typeof parsed.baseYear === "string" ? parsed.baseYear : undefined,
        entryMode: parsed.entryMode === "allowlist" ? "allowlist" : undefined,
        meta: parsed.meta && typeof parsed.meta === "object" ? parsed.meta : {},
        entries: [
          ...(Array.isArray(parsed.entries) ? parsed.entries : []),
          ...sourceEntries
        ]
      }
    };
  } catch (error) {
    console.error(`[year file ${fileName}] Failed to parse`, error);
    return null;
  }
}

async function loadAllVersions() {
  let yearFiles = await listYearJsonFiles();

  // HARDCODED FALLBACK FOR LOCAL SERVERS WITH DIRECTORY LISTING DISABLED
  if (!yearFiles || !yearFiles.length) {
    console.warn("Directory listing failed or empty. Falling back to known years list.");
    yearFiles = [
      "1955.json", "1962.json", "2021.json", "2024.json",
      "2025.json", "2026.json", "2028.json", "2034.json", "2047.json"
    ];
  }

  if (yearFiles && yearFiles.length) {
    const loaded = await Promise.all(yearFiles.map((fileName) => parseYearJsonFromFile(fileName)));
    const versions = {};

    // First pass: load standard year data
    loaded.filter(Boolean).forEach((item) => {
      if (item && item.year && item.data && (item.data.entries.length > 0 || item.data.baseYear)) {
        versions[item.year] = item.data;
      }
    });

    // Second pass: detect {year}versions/ folders for all year JSON files
    // Even years with 0 entries can be multi-version years (their content is in variant files)
    const variantDiscovery = await Promise.all(
      yearFiles.map(async (fileName) => {
        const year = fileName.replace(/\.json$/i, "");
        const variants = await discoverYearVariants(year);
        return { year, variants };
      })
    );

    yearVariants = {};
    variantDiscovery.forEach(({ year, variants }) => {
      if (variants.length > 0) {
        yearVariants[year] = variants;
        // Ensure the year is in allVersions even if it has no direct entries
        if (!versions[year]) {
          // Use the meta from its JSON file (already parsed above)
          const parsedItem = loaded.find((item) => item && item.year === year);
          versions[year] = {
            meta: parsedItem?.data?.meta || {},
            entries: [],
            isMultiVersion: true
          };
        } else {
          versions[year].isMultiVersion = true;
        }
      }
    });

    if (Object.keys(versions).length > 0) {
      return versions;
    }
  }

  console.warn("Falling back to legacy characters_versions.json...");
  const legacyResponse = await fetch(LEGACY_DATA_SOURCE, { cache: "no-store" });
  if (!legacyResponse.ok) {
    throw new Error(`Failed to load legacy data. HTTP ${legacyResponse.status}`);
  }

  const legacyData = await legacyResponse.json();
  return legacyData?.versions || {};
}

function cloneValue(value) {
  if (value === null || value === undefined) {
    return value;
  }
  return JSON.parse(JSON.stringify(value));
}

function normalizeEntryBlocks(blocks) {
  if (Array.isArray(blocks)) {
    return blocks;
  }

  if (blocks && typeof blocks === "object") {
    return [blocks];
  }

  return [];
}

function normalizeEntriesForRuntime(entryList = []) {
  return (Array.isArray(entryList) ? entryList : [])
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => ({
      ...entry,
      blocks: normalizeEntryBlocks(entry.blocks)
    }));
}

function ensureGlobalPreambleEntries(entryList = []) {
  const mergedById = new Map((entryList || []).map((entry) => [entry.id, cloneValue(entry)]));

  GLOBAL_PREAMBLE_PANEL_ENTRIES.forEach((panelEntry) => {
    const existing = mergedById.get(panelEntry.id);
    if (!existing) {
      mergedById.set(panelEntry.id, cloneValue(panelEntry));
      return;
    }

    // Keep year-specific extras, but enforce global panel shape/paths.
    mergedById.set(panelEntry.id, deepMerge(existing, panelEntry));
  });

  return normalizeEntriesForRuntime(Array.from(mergedById.values()))
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
}

function deepMerge(baseValue, overrideValue) {
  if (overrideValue === undefined) {
    return cloneValue(baseValue);
  }

  if (baseValue === null || baseValue === undefined) {
    return cloneValue(overrideValue);
  }

  if (Array.isArray(baseValue) || Array.isArray(overrideValue)) {
    return cloneValue(overrideValue);
  }

  if (typeof baseValue !== "object" || typeof overrideValue !== "object") {
    return cloneValue(overrideValue);
  }

  const out = { ...cloneValue(baseValue) };
  Object.keys(overrideValue).forEach((key) => {
    out[key] = deepMerge(baseValue[key], overrideValue[key]);
  });

  return out;
}

function mergeEntries(baseEntries = [], overrideEntries = [], options = {}) {
  if (!Array.isArray(overrideEntries) || !overrideEntries.length) {
    return options.allowlistOnly === true ? [] : cloneValue(baseEntries || []);
  }

  if (options.allowlistOnly === true) {
    const baseById = new Map((baseEntries || []).map((entry) => [entry.id, cloneValue(entry)]));
    const includedEntries = [];

    overrideEntries.forEach((entryOverride) => {
      if (!entryOverride?.id || entryOverride.__delete) {
        return;
      }

      const baseEntry = baseById.get(entryOverride.id);
      if (!baseEntry) {
        includedEntries.push(cloneValue(entryOverride));
        return;
      }

      includedEntries.push(deepMerge(baseEntry, entryOverride));
    });

    return includedEntries.sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  }

  const mergedById = new Map((baseEntries || []).map((entry) => [entry.id, cloneValue(entry)]));

  overrideEntries.forEach((entryOverride) => {
    if (!entryOverride?.id) {
      return;
    }

    if (entryOverride.__delete) {
      mergedById.delete(entryOverride.id);
      return;
    }

    const baseEntry = mergedById.get(entryOverride.id);
    if (!baseEntry) {
      mergedById.set(entryOverride.id, cloneValue(entryOverride));
      return;
    }

    mergedById.set(entryOverride.id, deepMerge(baseEntry, entryOverride));
  });

  return Array.from(mergedById.values()).sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
}

function resolveVersionData(year, seen = new Set()) {
  const raw = allVersions?.[year];
  if (!raw) {
    return null;
  }

  // Multi-version years: entries were pre-loaded from the active variant file
  // by applyYearData() before this function is called. Treat them as a normal
  // flat year (no baseYear inheritance needed).
  if (raw.isMultiVersion) {
    const runtimeEntries = normalizeEntriesForRuntime(cloneValue(raw.entries || []));
    return {
      meta: cloneValue(raw.meta || {}),
      entries: ensureGlobalPreambleEntries(runtimeEntries)
    };
  }

  if (!raw.baseYear) {
    const runtimeEntries = normalizeEntriesForRuntime(cloneValue(raw.entries || []));
    return {
      meta: cloneValue(raw.meta || {}),
      entries: ensureGlobalPreambleEntries(runtimeEntries)
    };
  }

  if (seen.has(year)) {
    throw new Error(`Cyclic baseYear reference detected at ${year}`);
  }
  seen.add(year);

  const base = resolveVersionData(raw.baseYear, seen);
  if (!base) {
    const runtimeEntries = normalizeEntriesForRuntime(cloneValue(raw.entries || []));
    return {
      meta: cloneValue(raw.meta || {}),
      entries: ensureGlobalPreambleEntries(runtimeEntries)
    };
  }

  const runtimeEntries = normalizeEntriesForRuntime(mergeEntries(base.entries || [], raw.entries || [], {
    allowlistOnly: raw.entryMode === "allowlist"
  }));

  return {
    meta: deepMerge(base.meta || {}, raw.meta || {}),
    entries: ensureGlobalPreambleEntries(runtimeEntries)
  };
}

function renderYearPills() {
  if (!yearPillsContainer) {
    return;
  }

  yearPillsContainer.innerHTML = yearOptions
    .map((year) => {
      const hasVariants = Array.isArray(yearVariants[year]) && yearVariants[year].length > 0;
      const dot = hasVariants ? ` <span class="year-pill-variant-dot" aria-hidden="true"></span>` : "";
      return `<button type="button" class="year-pill${hasVariants ? " has-variants" : ""}" data-year="${year}">${year}${dot}</button>`;
    })
    .join("");

  if (yearSlider) {
    yearSlider.min = "0";
    yearSlider.max = String(Math.max(0, yearOptions.length - 1));
    yearSlider.step = "1";
  }
}

function syncYearControls(year) {
  const index = yearOptions.indexOf(year);
  if (yearSlider && index >= 0) {
    yearSlider.value = String(index);
  }

  if (!yearPillsContainer) {
    return;
  }

  yearPillsContainer.querySelectorAll(".year-pill[data-year]").forEach((pill) => {
    pill.classList.toggle("active", pill.dataset.year === year);
  });

  updateVariantPills(year);
}

function updateVariantPills(year) {
  const variantRow = document.getElementById("year-variant-pills");
  if (!variantRow) {
    return;
  }

  const variants = Array.isArray(yearVariants[year]) ? yearVariants[year] : [];
  if (variants.length === 0) {
    variantRow.hidden = true;
    variantRow.innerHTML = "";
    return;
  }

  const activeKey = activeYearVariantKey[year] || variants[0]?.key || "";

  variantRow.innerHTML =
    `<span class="year-variant-label">Version</span>` +
    variants
      .map((v) => {
        const isActive = v.key === activeKey;
        return `<button type="button" class="year-variant-pill${isActive ? " active" : ""}" data-year="${year}" data-variant-key="${v.key}" data-variant-path="${v.path}">${v.label}</button>`;
      })
      .join("");

  variantRow.hidden = false;
}

function setYearInUrl(year) {
  const params = new URLSearchParams(window.location.search || "");
  params.set("year", year);
  const qs = params.toString();
  const nextUrl = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash || ""}`;
  window.history.replaceState(null, "", nextUrl);
}

function applyYearTheme(year) {
  const root = document.documentElement;
  const body = document.body;

  const clearVar = (name) => {
    if (typeof name === "string" && name.trim()) {
      root.style.removeProperty(name);
    }
  };

  if (Array.isArray(appliedThemeVars) && appliedThemeVars.length) {
    appliedThemeVars.forEach(clearVar);
  }
  appliedThemeVars = [];

  const theme = sheetStylesByYear?.[year] || sheetStylesByYear?.default || {};
  const vars = theme?.vars && typeof theme.vars === "object" ? theme.vars : {};

  Object.entries(vars).forEach(([name, value]) => {
    if (typeof name !== "string" || !name.trim()) {
      return;
    }
    root.style.setProperty(name, String(value));
    appliedThemeVars.push(name);
  });

  if (body) {
    body.setAttribute("data-sheet-style", String(theme?.styleKey || year || DEFAULT_YEAR));
  }
}

async function getDirectoryMedia(path) {
  try {
    const response = await fetch(`${path}/image_index.json`);
    if (response.ok) {
      return await response.json();
    }
  } catch (e) {
    console.warn(`Could not fetch image index for ${path}`);
  }
  return [];
}

async function getExistingMediaCandidates(path, candidates = []) {
  const checks = await Promise.all((candidates || []).map(async (fileName) => {
    const trimmed = String(fileName || "").trim();
    if (!trimmed) {
      return null;
    }

    const target = `${path}/${trimmed}`;
    try {
      const response = await fetch(target, { method: "HEAD" });
      if (response.ok) {
        return trimmed;
      }
      if (response.status !== 405 && response.status !== 501) {
        return null;
      }
    } catch {
      // Some static servers reject HEAD; fall back to a minimal GET probe.
    }

    try {
      const fallback = await fetch(target, { headers: { Range: "bytes=0-0" } });
      return fallback.ok ? trimmed : null;
    } catch {
      return null;
    }
  }));

  return checks.filter(Boolean);
}

async function getManifestImages(imageSources) {
  if (!assetExists(imageSources.manifestPath)) {
    return { portraits: [], outfits: [], groups: [], fieldMedia: [] };
  }
  try {
    const response = await fetch(imageSources.manifestPath);
    if (!response.ok) {
      return { portraits: [], outfits: [], groups: [], fieldMedia: [] };
    }

    const json = await response.json();
    
    // Handle flat array manifests (fallback for subfolders)
    if (Array.isArray(json)) {
      return {
        portraits: [],
        outfits: [],
        groups: [],
        fieldMedia: json.filter(isMediaFile)
      };
    }

    const manifestField = Array.isArray(json.fieldMedia)
      ? json.fieldMedia
      : Array.isArray(json.field)
        ? json.field
        : [];
    return {
      portraits: Array.isArray(json.portraits) ? json.portraits.filter(isMediaFile) : [],
      outfits: Array.isArray(json.outfits) ? json.outfits.filter(isMediaFile) : [],
      groups: Array.isArray(json.groups) ? json.groups.filter(isMediaFile) : [],
      fieldMedia: manifestField.filter(isMediaFile)
    };
  } catch {
    return { portraits: [], outfits: [], groups: [], fieldMedia: [] };
  }
}


async function getImageCatalog() {
  if (!imageCatalogPromisesByYear.has(activeYear)) {
    const imageSources = getImageSourcesForYear(activeYear);
    imageCatalogPromisesByYear.set(activeYear, (async () => {
      // Prefer backend-driven catalog so frontend no longer depends on image_index manifests.
      try {
        const response = await fetch(`${MEDIA_CATALOG_ENDPOINT}?year=${encodeURIComponent(String(activeYear || ""))}`, {
          cache: "no-store"
        });
        if (response.ok) {
          const payload = await response.json();
          const backendCatalog = payload?.catalog;
          if (backendCatalog && typeof backendCatalog === "object") {
            const catalog = {
              portraits: Array.isArray(backendCatalog.portraits) ? backendCatalog.portraits : [],
              outfits: Array.isArray(backendCatalog.outfits) ? backendCatalog.outfits : [],
              groups: Array.isArray(backendCatalog.groups) ? backendCatalog.groups : [],
              fieldMedia: Array.isArray(backendCatalog.fieldMedia) ? backendCatalog.fieldMedia : [],
              unmasked: Array.isArray(backendCatalog.unmasked) ? backendCatalog.unmasked : [],
              exposed: Array.isArray(backendCatalog.exposed) ? backendCatalog.exposed : []
            };

            const knownPaths = new Set();
            [
              ...(catalog.portraits || []),
              ...(catalog.outfits || []),
              ...(catalog.groups || []),
              ...(catalog.fieldMedia || []),
              ...(catalog.unmasked || []),
              ...(catalog.exposed || [])
            ]
              .map((value) => String(value || "").replace(/\\/g, "/").replace(/^\/+/, "").toLowerCase())
              .filter(Boolean)
              .forEach((value) => knownPaths.add(value));

            knownMediaPathsByYear.set(activeYear, knownPaths);
            return catalog;
          }
        }
      } catch {
        // Backend unavailable; continue with legacy/fallback loading below.
      }

      // 1. Fetch Year-Specific Manifest
      const yearManifest = await getManifestImages(imageSources);
      
      // 2. Fetch Global Manifests (Outfits, Groups, etc.)
      const [outfitsM, groupsM, life123M, roboterM] = await Promise.allSettled([
        getManifestImages({ manifestPath: "pictures/outfits/image_index.json" }),
        getManifestImages({ manifestPath: "pictures/group/image_index.json" }),
        getManifestImages({ manifestPath: "pictures/life123/image_index.json" }),
        getManifestImages({ manifestPath: "pictures/Roboter/image_index.json" })
      ]).then(results => results.map(r => r.status === "fulfilled" ? r.value : { portraits: [], outfits: [], groups: [], fieldMedia: [] }));
      const portraitsDir = imageSources.portraitsDir;
      const yearDir = imageSources.yearDir;
      const unmaskedDir = `${yearDir}/unmasked`;
      const exposedDir = `${yearDir}/exposed`;
      let unmaskedList = getKnownMediaFileNamesForDir(unmaskedDir);
      let exposedList = getKnownMediaFileNamesForDir(exposedDir);

      const needDirectoryFallback = (globalAssetIndex.size === 0)
        || !unmaskedList.length
        || !exposedList.length;

      if (needDirectoryFallback && typeof MediaUtils.getDirectoryMedia === "function") {
        const [unmaskedFallback, exposedFallback] = await Promise.all([
          MediaUtils.getDirectoryMedia(unmaskedDir, { includeVideos: false }).catch(() => []),
          MediaUtils.getDirectoryMedia(exposedDir, { includeVideos: false }).catch(() => [])
        ]);
        if (!unmaskedList.length) {
          unmaskedList = Array.isArray(unmaskedFallback) ? unmaskedFallback : [];
        }
        if (!exposedList.length) {
          exposedList = Array.isArray(exposedFallback) ? exposedFallback : [];
        }
      }

      // 3. Merge All into Catalog
      const catalog = {
        portraits: [
          ...(yearManifest.portraits || []).map(f => safeJoinPath(portraitsDir, f))
        ].filter(assetExists),
        
        outfits: [
          ...(yearManifest.outfits || []).map(f => safeJoinPath(imageSources.outfitsDir || "", f)),
          ...(outfitsM.fieldMedia || []).map(f => safeJoinPath("pictures/outfits", f)),
          ...(groupsM.fieldMedia || []).filter(f => f.toLowerCase().includes("sheet")).map(f => safeJoinPath("pictures/group", f))
        ].filter(assetExists),
        
        groups: [
          ...(yearManifest.groups || []).map(f => safeJoinPath(imageSources.groupsDir || "", f)),
          ...(groupsM.fieldMedia || []).map(f => safeJoinPath("pictures/group", f))
        ].filter(assetExists),
        
        fieldMedia: [
          ...(yearManifest.fieldMedia || []).map(f => safeJoinPath(yearDir, f)),
          ...(life123M.fieldMedia || []).map(f => safeJoinPath("pictures/life123", f)),
          ...(roboterM.fieldMedia || []).map(f => safeJoinPath("pictures/Roboter", f))
        ].filter(assetExists),

        unmasked: (unmaskedList || []).map((f) => safeJoinPath(unmaskedDir, f)),
        exposed: (exposedList || []).map((f) => safeJoinPath(exposedDir, f))
      };

      const knownPaths = new Set();
      [
        ...(catalog.portraits || []),
        ...(catalog.outfits || []),
        ...(catalog.groups || []),
        ...(catalog.fieldMedia || []),
        ...(catalog.unmasked || []),
        ...(catalog.exposed || [])
      ]
        .map((value) => String(value || "").replace(/\\/g, "/").replace(/^\/+/, "").toLowerCase())
        .filter(Boolean)
        .forEach((value) => knownPaths.add(value));

      knownMediaPathsByYear.set(activeYear, knownPaths);
      return catalog;
    })());
  }

  return imageCatalogPromisesByYear.get(activeYear);
}


function entryTokens(entry) {
  // Portrait/outfit matching is keyed off the sheet id only.
  // This prevents the title/navLabel from accidentally matching unrelated filenames.
  const entryId = stripHtml(entry.id || "");
  const token = normalizeKey(entryId);
  return token ? unique([token]) : [];
}

function factionTokens(factionName) {
  const cleaned = stripHtml(factionName || "");
  const normalized = normalizeKey(cleaned);
  const noLeadingThe = cleaned.replace(/^the\s+/i, "").trim();
  const words = cleaned.split(/\s+/).map(normalizeKey).filter(Boolean);
  const wordsNoThe = noLeadingThe.split(/\s+/).map(normalizeKey).filter(Boolean);
  return unique([
    normalized,
    normalizeKey(noLeadingThe),
    ...words,
    ...wordsNoThe
  ]);
}

function buildGroupGalleryImages(factionName, catalog, imageSources) {
  const tokens = factionTokens(factionName);
  const groupMatches = (catalog.groups || [])
    .filter((file) => {
      const fileKey = normalizeKey(baseName(file));
      return tokens.some((token) => token && (fileKey === token || fileKey.includes(token)));
    })
    .sort((a, b) => a.localeCompare(b));

  return groupMatches.map((file) => ({
    src: file, // Note: file is already a full path from catalog
    label: baseName(file),
    type: isMediaFile(file) && /\.mp4$/i.test(file) ? "video" : "image"
  }));
}

function buildGalleryImages(entry, catalog, imageSources) {
  const tokens = entryTokens(entry);
  const entryId = normalizeKey(entry?.id || "");
  const portraitFiles = catalog.portraits || [];
  const preferredPortrait = entryId === "simps"
    ? portraitFiles.find((file) => normalizeKey(baseName(file)) === "twitch")
    : null;
  const portraitMatch = preferredPortrait || portraitFiles.find((file) => {
    const fileKey = normalizeKey(baseName(file));
    return tokens.some((token) => fileKey === token || fileKey.startsWith(token));
  });

  const outfitMatches = (catalog.outfits || [])
    .filter((file) => {
      const fileKey = normalizeKey(baseName(file));
      return tokens.some((token) => fileKey.includes(token));
    })
    .sort((a, b) => a.localeCompare(b));

  const images = [];
  if (portraitMatch) {
    // Note: portraitMatch is already a full path from catalog
    images.push({
      src: portraitMatch,
      label: baseName(portraitMatch),
      type: isMediaFile(portraitMatch) && /\.mp4$/i.test(portraitMatch) ? "video" : "image",
      kind: "portrait"
    });
  }

  outfitMatches.forEach((file) => {
    // Note: file is already a full path from catalog
    images.push({
      src: file,
      label: baseName(file),
      type: isMediaFile(file) && /\.mp4$/i.test(file) ? "video" : "image",
      kind: "outfit"
    });
  });

  return applyImageTagRules(images);
}

function getGalleryDisplayCountForRatio(ratio) {
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return 1;
  }
  if (ratio < 0.85) {
    return 3;
  }
  if (ratio <= 1.15) {
    return 2;
  }
  return 1;
}

function ensureGalleryDisplayCount(galleryKey, currentMedia, container, altBase, images) {
  if (!currentMedia || currentMedia.type !== "image" || !currentMedia.src) {
    if ((galleryDisplayCountByKey.get(galleryKey) || 1) !== 1) {
      galleryDisplayCountByKey.set(galleryKey, 1);
      renderGalleryInContainer(container, galleryKey, altBase, images);
    }
    return;
  }

  const src = String(currentMedia.src || "");
  if (galleryDisplayCountBySrc.has(src)) {
    const known = galleryDisplayCountBySrc.get(src) || 1;
    if ((galleryDisplayCountByKey.get(galleryKey) || 1) !== known) {
      galleryDisplayCountByKey.set(galleryKey, known);
      renderGalleryInContainer(container, galleryKey, altBase, images);
    }
    return;
  }

  if (galleryDisplayProbePending.has(src)) {
    return;
  }

  galleryDisplayProbePending.add(src);
  const probe = new Image();
  probe.onload = () => {
    const ratio = probe.naturalWidth > 0 && probe.naturalHeight > 0
      ? (probe.naturalWidth / probe.naturalHeight)
      : NaN;
    const count = getGalleryDisplayCountForRatio(ratio);
    galleryDisplayProbePending.delete(src);
    galleryDisplayCountBySrc.set(src, count);
    if ((galleryDisplayCountByKey.get(galleryKey) || 1) !== count) {
      galleryDisplayCountByKey.set(galleryKey, count);
      renderGalleryInContainer(container, galleryKey, altBase, images);
    }
  };
  probe.onerror = () => {
    galleryDisplayProbePending.delete(src);
    galleryDisplayCountBySrc.set(src, 1);
  };
  probe.src = src;
}

function getXRayLayersForImage(src) {
  const knownPaths = Array.from(knownMediaPathsByYear.get(activeYear) || []);
  const resolverOptions = {
    availablePaths: knownPaths,
    pathExists: (candidatePath) => {
      const normalized = String(candidatePath || "").replace(/\\/g, "/").replace(/^\/+/, "");
      if (
        /^pictures\/[0-9A-Za-z_-]+\//i.test(normalized)
        && (
          /(^|\/)(unmasked|exposed)\//i.test(normalized)
          || /(?:^|[-_.])(unmasked|exposed)(?:[-_.]|$)/i.test((normalized.split("/").pop() || ""))
        )
      ) {
        // Secure files may be encrypted and absent from the static asset index.
        return true;
      }
      return assetExists(normalized);
    }
  };

  if (typeof MediaUtils.findXrayLayers === "function") {
    const layers = MediaUtils.findXrayLayers(src, resolverOptions) || {};
    return {
      revealSrc: String(layers.revealSrc || ""),
      exposedSrc: String(layers.exposedSrc || "")
    };
  }

  const revealSrc = typeof MediaUtils.findXrayPair === "function"
    ? (MediaUtils.findXrayPair(src, resolverOptions) || "")
    : "";
  const exposedSrc = typeof MediaUtils.findXrayExposed === "function"
    ? (MediaUtils.findXrayExposed(revealSrc || src, resolverOptions) || "")
    : "";

  return { revealSrc, exposedSrc };
}

function initializeXRayContainers(container) {
  if (typeof window.XRayReveal !== "function") {
    return;
  }

  const xrayFrames = Array.from(container.querySelectorAll("[data-xray-frame]"));
  xrayFrames.forEach((frame) => {
    const topSrc = frame.dataset.xrayTopSrc || "";
    const revealSrcRaw = frame.dataset.xrayRevealSrc || frame.dataset.xrayBottomSrc || "";
    const exposedSrcRaw = frame.dataset.xrayExposedSrc || "";
    const revealSrc = toSecureMediaUrl(revealSrcRaw, { forceSecure: true });
    const exposedSrc = toSecureMediaUrl(exposedSrcRaw, { forceSecure: true });
    if (!topSrc) {
      return;
    }

    if (!revealSrc) {
      frame.innerHTML = `<img class="character-photo" src="${escapeHtml(topSrc)}" alt="xray top image">`;
      return;
    }

    const top = new Image();
    const reveal = new Image();
    const exposed = exposedSrc ? new Image() : null;
    top.decoding = "async";
    reveal.decoding = "async";
    top.crossOrigin = "anonymous";
    reveal.crossOrigin = "anonymous";
    if (exposed) {
      exposed.decoding = "async";
      exposed.crossOrigin = "anonymous";
    }

    let loadedTop = false;
    let loadedReveal = false;
    let loadedExposed = !exposed;
    const tryRender = () => {
      if (!loadedTop || !loadedReveal) {
        return;
      }
      frame.innerHTML = "";
      window.XRayReveal(frame, reveal, top, {
        radius: 60,
        exposedImage: loadedExposed ? exposed : null,
        hintText: "Hover to reveal"
      });
    };

    top.onload = () => {
      loadedTop = true;
      tryRender();
    };
    reveal.onload = () => {
      loadedReveal = true;
      tryRender();
    };
    if (exposed) {
      exposed.onload = () => {
        loadedExposed = true;
        tryRender();
      };
      exposed.onerror = () => {
        loadedExposed = false;
      };
    }
    top.onerror = () => {
      frame.innerHTML = `<img class="character-photo" src="${escapeHtml(topSrc)}" alt="xray top image">`;
    };
    reveal.onerror = () => {
      if (revealSrc !== revealSrcRaw && revealSrcRaw) {
        reveal.src = revealSrcRaw;
        return;
      }
      frame.innerHTML = `<img class="character-photo" src="${escapeHtml(topSrc)}" alt="xray fallback image">`;
    };

    top.src = topSrc;
    reveal.src = revealSrc;
    if (exposed) {
      exposed.src = exposedSrc;
    }
  });
}

function renderGalleryInContainer(container, galleryKey, altBase, images) {
  if (!images.length) {
    container.innerHTML = "";
    container.classList.add("hidden");
    return;
  }

  container.classList.remove("hidden");
  const currentIndex = Math.min(galleryIndexByEntry.get(galleryKey) || 0, images.length - 1);
  galleryIndexByEntry.set(galleryKey, currentIndex);
  const current = images[currentIndex];
  const currentDisplayCount = current.type === "image"
    ? Math.max(1, Math.min(3, galleryDisplayCountByKey.get(galleryKey) || 1))
    : 1;
  const visibleCount = Math.min(currentDisplayCount, images.length);
  const visibleItems = Array.from({ length: visibleCount }, (_, offset) => {
    const index = (currentIndex + offset) % images.length;
    return images[index];
  });
  const showControls = images.length > visibleCount;
  const hasVideo = visibleItems.some((item) => item.type === "video");
  const mediaBadge = hasVideo ? "MIX" : "IMG";
  const videoClass = hasVideo ? " has-video" : "";
  const multiClass = visibleCount > 1 ? " has-multi" : "";
  const portraitCompactClass = current.type === "image" && currentDisplayCount >= 3 && visibleCount === 1
    ? " is-portrait-compact"
    : "";
  const squareCompactClass = current.type === "image" && currentDisplayCount === 2 && visibleCount === 1
    ? " is-square-compact"
    : "";

  const mediaCells = visibleItems
    .map((item, offset) => {
      const absoluteIndex = (currentIndex + offset) % images.length;
      const itemSrc = toSecureMediaUrl(item.src, { forceSecure: true });
      const tagState = getImageTagState(item);
      const isExclusive = String(tagState?.exclusiveYear || "") === String(activeYear || "");
      const isPriority = tagState?.priorityYears?.[String(activeYear || "")] === true;
      const xrayLayers = item.type === "image"
        ? getXRayLayersForImage(item.src)
        : { revealSrc: "", exposedSrc: "" };
      const media = item.type === "video"
        ? `<video class="character-photo character-video" src="${itemSrc}" autoplay muted loop playsinline preload="metadata"></video>`
        : (xrayLayers.revealSrc)
          ? `<div class="character-photo character-photo-xray" data-xray-frame="true" data-xray-top-src="${escapeHtml(itemSrc)}" data-xray-reveal-src="${escapeHtml(xrayLayers.revealSrc)}" data-xray-exposed-src="${escapeHtml(xrayLayers.exposedSrc || "")}"></div>`
          : `<img class="character-photo" src="${itemSrc}" alt="${altBase} media">`;
      return `
        <div class="character-photo-cell">
          <div class="photo-tag-controls">
            <button class="photo-tag-btn${isExclusive ? " is-active" : ""}" data-gallery-key="${galleryKey}" data-image-index="${absoluteIndex}" data-action="exclusive" title="Exclusive to ${escapeHtml(String(activeYear || ""))}" aria-label="Toggle year-exclusive image tag">Y</button>
            <button class="photo-tag-btn${isPriority ? " is-active" : ""}" data-gallery-key="${galleryKey}" data-image-index="${absoluteIndex}" data-action="priority" title="Priority first in ${escapeHtml(String(activeYear || ""))}" aria-label="Toggle priority image tag">★</button>
          </div>
          ${media}
        </div>
      `;
    })
    .join("");

  const rangeLabel = visibleCount > 1
    ? `${currentIndex + 1}-${Math.min(images.length, currentIndex + visibleCount)} / ${images.length}`
    : `${currentIndex + 1} / ${images.length}`;

  container.innerHTML = `
    <div class="character-photo-wrap">
      <div class="character-photo-stage${videoClass}${multiClass}${portraitCompactClass}${squareCompactClass}">
        <div class="character-photo-grid" style="--gallery-columns:${visibleCount};">
          ${mediaCells}
        </div>
        ${showControls ? `
          <button class="photo-nav photo-nav-prev" data-gallery-key="${galleryKey}" data-direction="prev" aria-label="Previous outfit">&#10094;</button>
          <button class="photo-nav photo-nav-next" data-gallery-key="${galleryKey}" data-direction="next" aria-label="Next outfit">&#10095;</button>
        ` : ""}
      </div>
      <div class="character-photo-meta">
        <span class="character-photo-label">${current.label}</span>
        <span class="character-photo-count"><span class="character-media-type">${mediaBadge}</span>${rangeLabel}</span>
      </div>
    </div>
  `;

  initializeXRayContainers(container);
  ensureGalleryDisplayCount(galleryKey, current, container, altBase, images);
}

function pickFieldNoteMedia(catalog = {}, imageSources) {
  const fieldMediaFiles = Array.isArray(catalog?.fieldMedia) ? catalog.fieldMedia : [];
  if (!fieldMediaFiles.length) {
    return null;
  }

  const normalizedByPriority = [
    (file) => normalizeKey(baseName(file)) === "field" && isVideoFile(file),
    (file) => normalizeKey(baseName(file)) === "field" && isImageFile(file),
    (file) => normalizeKey(baseName(file)).startsWith("field") && isVideoFile(file),
    (file) => normalizeKey(baseName(file)).startsWith("field") && isImageFile(file)
  ];

  const selected = normalizedByPriority
    .map((matcher) => fieldMediaFiles.find(matcher))
    .find(Boolean);

  if (!selected) {
    return null;
  }

  return {
    src: safeJoinPath(imageSources.yearDir, selected),
    type: isVideoFile(selected) ? "video" : "image",
    label: baseName(selected)
  };

}

function renderFieldNoteMediaBlocks(catalog, imageSources) {
  const media = pickFieldNoteMedia(catalog, imageSources);
  const slots = Array.from(mainContent.querySelectorAll(".field-note-media-slot"));
  if (!slots.length) {
    return;
  }

  slots.forEach((slot, index) => {
    if (index > 0) {
      slot.innerHTML = "";
      slot.classList.add("hidden");
      return;
    }

    if (!media) {
      slot.innerHTML = "";
      slot.classList.add("hidden");
      return;
    }

    const mediaHtml = media.type === "video"
      ? `<video class="field-note-media-asset" src="${media.src}" autoplay muted loop playsinline preload="metadata"></video>`
      : `<img class="field-note-media-asset" src="${media.src}" alt="Field note media">`;

    slot.classList.remove("hidden");
    slot.innerHTML = `
      <div class="field-note-media-wrap">
        ${mediaHtml}
      </div>
    `;
  });
}

function getStatisticsCastEntries(entryList = []) {
  return (entryList || []).filter((entry) => {
    const group = String(entry?.navGroup || "").toLowerCase();
    const id = String(entry?.id || "").toLowerCase();
    return group !== "preamble"
      && group !== "closing"
      && !entry?.excludeFromStatistics
      && !STATS_EXCLUDED_ENTRY_IDS.has(id);
  });
}

function updateStatisticsPortraitCoverage() {
  const castEntries = getStatisticsCastEntries(entries);
  let portraitPresent = 0;
  const missingPortraitEntries = [];

  castEntries.forEach((entry) => {
    const key = `entry:${entry.id}`;
    const record = galleryRegistry.get(key);
    const hasPortrait = Array.isArray(record?.images)
      && record.images.some((image) => image?.kind === "portrait");
    if (hasPortrait) {
      portraitPresent += 1;
    } else {
      missingPortraitEntries.push(entry);
    }
  });

  const portraitMissing = Math.max(0, castEntries.length - portraitPresent);
  const coveragePct = castEntries.length > 0 ? (portraitPresent / castEntries.length) * 100 : 0;
  const missingPortraitHtml = missingPortraitEntries.length
    ? missingPortraitEntries
      .map((entry) => {
        const name = stripHtml(entry?.navLabel || entry?.title || entry?.id || "").trim();
        const id = String(entry?.id || "").trim();
        return `<span class="stats-pill">${escapeHtml(name || id)} (${escapeHtml(id)})</span>`;
      })
      .join("")
    : '<span class="stats-pill is-ok">all cast entries have portraits</span>';
  document.querySelectorAll("[data-stats-portrait-present]").forEach((el) => {
    el.textContent = String(portraitPresent);
  });
  document.querySelectorAll("[data-stats-portrait-missing]").forEach((el) => {
    el.textContent = String(portraitMissing);
  });
  document.querySelectorAll("[data-stats-portrait-coverage]").forEach((el) => {
    el.textContent = `${coveragePct.toFixed(1)}%`;
  });
  document.querySelectorAll("[data-stats-portrait-missing-list]").forEach((el) => {
    el.innerHTML = missingPortraitHtml;
  });
}

async function renderCharacterGalleries() {
  const catalog = await getImageCatalog();
  const imageSources = getImageSourcesForYear(activeYear);
  galleryRegistry.clear();

  entries.forEach((entry) => {
    const images = buildGalleryImages(entry, catalog, imageSources);
    const entryContainer = mainContent.querySelector(`.character-gallery[data-entry-id="${entry.id}"]`);
    if (entryContainer) {
      const galleryKey = `entry:${entry.id}`;
      galleryRegistry.set(galleryKey, { images, altBase: entry.id });
      renderGalleryInContainer(entryContainer, galleryKey, entry.id, images);
    }

    if ((entry.id || "").toLowerCase() === "factions") {
      const factionContainers = mainContent.querySelectorAll(`.faction-gallery[data-entry-id="${entry.id}"]`);
      factionContainers.forEach((container) => {
        const factionIndex = container.dataset.factionIndex;
        const factionName = container.dataset.factionName || "Faction";
        const factionImages = buildGroupGalleryImages(factionName, catalog, imageSources);
        const factionKey = `faction:${entry.id}:${factionIndex}`;
        galleryRegistry.set(factionKey, { images: factionImages, altBase: factionName });
        renderGalleryInContainer(container, factionKey, factionName, factionImages);
      });
    }
  });

  renderFieldNoteMediaBlocks(catalog, imageSources);
  updateStatisticsPortraitCoverage();
}

async function renderArchiveIndexBlocks() {
  const blocks = Array.from(mainContent.querySelectorAll("[data-archive-list]"));
  if (!blocks.length) {
    return;
  }
  await Promise.all(
    blocks.map(async (blockEl) => {
      const basePath = blockEl.dataset.basePath || ARCHIVES_SOURCE_DIR;
      const fallbackFiles = parsePipeList(blockEl.dataset.fallback);
      const listRoot = blockEl.querySelector(".archive-index-list");
      const excluded = new Set(parsePipeList(blockEl.dataset.exclude).map((name) => name.toLowerCase()));

      const renderList = (fileNames) => {
        const htmlFiles = unique(fileNames)
          .filter((name) => /\.html$/i.test(name))
          .filter((name) => !excluded.has(name.toLowerCase()))
          .sort((a, b) => a.localeCompare(b));

        if (!htmlFiles.length) {
          listRoot.innerHTML = '<div class="archive-index-empty">No HTML archives found.</div>';
          return;
        }

        listRoot.innerHTML = htmlFiles
          .map((name) => {
            const href = `${basePath}/${name}`;
            return `
              <a class="archive-index-item" href="${href}">
                <span class="archive-index-title">${prettyArchiveName(name)}</span>
                <span class="archive-index-path">${href}</span>
              </a>
            `;
          })
          .join("\n");
      };

      try {
        const response = await fetch(`${basePath}/`);

        const html = await response.text();
        const hrefs = [...html.matchAll(/href=["']([^"']+)["']/gi)].map((m) => m[1]);
        const listedFiles = hrefs
          .map(toFileName)
          .filter(Boolean);

        renderList([...listedFiles, ...fallbackFiles]);
      } catch {
        renderList(fallbackFiles);
      }
    })
  );
}

async function loadEmbeddedGalleryImagePaths() {
  const years = (yearOptions || []).filter((year) => /^\d{4}$/.test(String(year)));
  const fromYears = await Promise.all(years.map(async (year) => {
    const manifestPath = `pictures/${year}/image_index.json`;
    if (!assetExists(manifestPath)) return [];
    
    try {
      const response = await fetch(manifestPath, { cache: "no-store" });
      if (!response.ok) return [];
      
      const json = await response.json();
      const portraits = Array.isArray(json?.portraits) ? json.portraits : [];
      const outfits = Array.isArray(json?.outfits) ? json.outfits : [];
      const groups = Array.isArray(json?.groups) ? json.groups : [];
      const field = Array.isArray(json?.fieldMedia) ? json.fieldMedia : (Array.isArray(json?.field) ? json.field : []);

      // Collect portrait paths: prefer new portraits/<char>/ tree, also include legacy.
      const portraitPaths = portraits.flatMap((file) => {
        const legacyPath = safeJoinPath(`pictures/${year}/portraits`, file);
        // Derive new-style canonical path: portraits/<stem>/<stem><year>.ext
        const stem = file.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9.\-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
        const ext = (file.match(/\.[^.]+$/) || [''])[0].toLowerCase();
        const newPath = `portraits/${stem}/${stem}${year}${ext}`;
        if (assetExists(newPath)) return [newPath];
        if (assetExists(legacyPath)) return [legacyPath];
        return [];
      });

      // Also scan the new portraits/ tree for this year (files named <char><year>.ext)
      const newTreePaths = Array.from(globalAssetIndex)
        .filter((p) => p.startsWith('portraits/') && !p.includes('/unmasked/') && !p.includes('/exposed/'))
        .filter((p) => {
          const base = p.split('/').pop() || '';
          return base.includes(year);
        });

      return unique([
        ...newTreePaths,
        ...portraitPaths,
        ...outfits.map((file) => safeJoinPath(`pictures/outfits`, file)),
        ...groups.map((file) => safeJoinPath(`pictures/${year}/groups`, file)),
        ...field.map((file) => safeJoinPath(`pictures/${year}`, file))
      ]).filter(assetExists);

    } catch {
      return [];
    }
  }));

  try {
    const fallbackResponse = await fetch("data/pictures/gallery_manifest.json", { cache: "no-store" });
    const fallbackJson = fallbackResponse.ok ? await fallbackResponse.json() : { images: [] };
    const fallback = (Array.isArray(fallbackJson?.images) ? fallbackJson.images : [])
      .filter((src) => /\.(png|jpe?g|webp|gif|avif)$/i.test(src))
      .map((src) => String(src || "").replace(/^\/+/, "").replace(/\\/g, "/"))
      .filter(assetExists);
    return { years, imagePaths: unique([...fromYears.flat(), ...fallback]) };
  } catch {
    return { years, imagePaths: unique(fromYears.flat()) };
  }
}

async function renderEmbeddedGalleryBlocks() {
  const blocks = Array.from(mainContent.querySelectorAll("[data-embedded-gallery]"));
  if (!blocks.length) {
    return;
  }

  await Promise.all(blocks.map(async (blockEl) => {
    const statusEl = blockEl.querySelector("[data-gallery-status]");
    const themesEl = blockEl.querySelector("[data-gallery-themes]");
    const resolutionsEl = blockEl.querySelector("[data-gallery-resolutions]");
    const charsEl = blockEl.querySelector("[data-gallery-characters]");
    const searchInputEl = blockEl.querySelector("[data-gallery-search]");
    const yearSelectEl = blockEl.querySelector("[data-gallery-year]");
    const minSizeSelectEl = blockEl.querySelector("[data-gallery-min-size]");
    const lightboxEl = blockEl.querySelector("[data-gallery-lightbox]");
    const lightboxImgEl = blockEl.querySelector("[data-gallery-lightbox-img]");
    if (!statusEl || !themesEl || !resolutionsEl || !charsEl || !searchInputEl || !yearSelectEl || !minSizeSelectEl || !lightboxEl || !lightboxImgEl) {
      return;
    }

    statusEl.textContent = "Loading picture groups...";
    const start = performance.now();

    const [{ years, imagePaths }] = await Promise.all([
      loadEmbeddedGalleryImagePaths()
    ]);

    yearSelectEl.innerHTML = '<option value="all">All Years</option>';
    years.forEach((year) => {
      const option = document.createElement("option");
      option.value = year;
      option.textContent = year;
      yearSelectEl.appendChild(option);
    });

    // Build a map of character id -> filename prefixes to match against image stems.
    // This ensures galleries only pick images whose filenames start with the character prefix.
    const characterPrefixMap = new Map();
    Object.entries(characterCoreById || {}).forEach(([id, payload]) => {
      const fullName = (payload?.rows || []).find((row) => row.label === "full name")?.value || "";
      const firstToken = String(fullName || "").split(/[^a-zA-Z0-9]+/).find(Boolean) || "";
      const prefixes = [];
      prefixes.push(String(id || "").toLowerCase());
      if (firstToken) prefixes.push(String(firstToken || "").toLowerCase());
      // also add compact alphanumeric variant
      prefixes.push(String(id || "").replace(/[^a-z0-9]+/gi, '').toLowerCase());
      const uniq = Array.from(new Set(prefixes.filter(Boolean)));
      if (uniq.length) characterPrefixMap.set(id, uniq);
    });

    const images = imagePaths
      .map((src) => {
        const normalizedSrc = String(src || "").replace(/^\/+/, "").replace(/\\/g, "/");
        const file = normalizedSrc.split("/").pop() || normalizedSrc;
        const stem = file.replace(/\.[^.]+$/, "");
        const yearMatch = String(normalizedSrc || "").match(/\/pictures\/(\d{4})\//i);
        return {
          src: normalizedSrc,
          displaySrc: toSecureMediaUrl(normalizedSrc, { forceSecure: true }),
          name: stem,
          tokens: cgSplitStemTokens(stem),
          year: yearMatch ? yearMatch[1] : "",
          width: 0,
          height: 0,
          resolutionGroup: "unknown · scanning..."
        };
      })
      .filter((item) => item.tokens.length > 0);

    // FIX: Instead of firing 900+ requests at once with Promise.all(images.map),
    // we render immediately and probe in small background batches.
    const { themeGroups, charGroups } = cgGroupImages(images, characterPrefixMap);
    const resolutionGroups = cgGroupByResolution(images);
    const state = { themeGroups, resolutionGroups, charGroups };

    // Background scanner removed to eliminate brute-force 404 errors.
    // Dimensions will no longer be probed in the background.
    const imagesWithResolution = []; 

    const renderAll = () => {
      const options = {
        search: searchInputEl.value || "",
        year: yearSelectEl.value || "all",
        minSize: Number(minSizeSelectEl.value || 2)
      };
      const openLightbox = (item) => {
        lightboxImgEl.src = item.displaySrc || item.src;
        lightboxImgEl.alt = item.name;
        lightboxEl.classList.add("open");
        lightboxEl.setAttribute("aria-hidden", "false");
      };
      cgRenderGroupMap(state.themeGroups, themesEl, options, openLightbox);
      cgRenderGroupMap(state.resolutionGroups, resolutionsEl, options, openLightbox);
      cgRenderGroupMap(state.charGroups, charsEl, options, openLightbox);
    };

    searchInputEl.addEventListener("input", renderAll);
    yearSelectEl.addEventListener("change", renderAll);
    minSizeSelectEl.addEventListener("change", renderAll);
    lightboxEl.addEventListener("click", () => {
      lightboxEl.classList.remove("open");
      lightboxEl.setAttribute("aria-hidden", "true");
      lightboxImgEl.removeAttribute("src");
    });

    renderAll();
    const ms = Math.round(performance.now() - start);
    statusEl.textContent = `Loaded ${images.length} images in ${ms}ms from ${years.length || 0} year manifests + fallback catalog. Theme groups: ${themeGroups.size}. Character groups: ${charGroups.size}.`;
  }));
}

function resolveFactionMemberEntryId(memberText) {
  const plain = htmlToPlainText(memberText || "");
  const candidate = String(plain.split("·")[0] || "").trim();
  const normalizedCandidate = normalizeKey(candidate);
  if (!normalizedCandidate) {
    return "";
  }

  const byExact = (entries || []).find((entry) => {
    const idKey = normalizeKey(entry?.id || "");
    const navKey = normalizeKey(stripHtml(entry?.navLabel || ""));
    const titleKey = normalizeKey(stripHtml(entry?.title || ""));
    return idKey === normalizedCandidate || navKey === normalizedCandidate || titleKey === normalizedCandidate;
  });

  if (byExact?.id) {
    return String(byExact.id);
  }

  const firstWord = normalizeKey(candidate.split(/\s+/)[0] || "");
  if (!firstWord) {
    return "";
  }

  const partialMatches = (entries || []).filter((entry) => {
    const idKey = normalizeKey(entry?.id || "");
    const navKey = normalizeKey(stripHtml(entry?.navLabel || ""));
    return idKey === firstWord || navKey.startsWith(firstWord);
  });

  return partialMatches.length === 1 ? String(partialMatches[0].id || "") : "";
}

function renderTableLabelWithEntryLinks(label) {
  const plainLabel = htmlToPlainText(label || "");
  if (!plainLabel) {
    return "";
  }

  const entryMetaByLower = new Map();
  (entries || []).forEach((entry) => {
    const entryId = String(entry?.id || "").trim();
    if (!entryId) {
      return;
    }
    entryMetaByLower.set(entryId.toLowerCase(), {
      id: entryId,
      eyebrow: htmlToPlainText(entry?.eyebrow || "").trim()
    });
  });
  const entryIds = Array.from(entryMetaByLower.values()).map((meta) => meta.id);
  if (!entryIds.length) {
    return escapeHtml(plainLabel);
  }

  const pattern = new RegExp(`\\b(${entryIds.map(escapeRegex).join("|")})\\b`, "gi");

  return escapeHtml(plainLabel).replace(pattern, (match) => {
    const meta = entryMetaByLower.get(String(match || "").toLowerCase());
    const targetId = meta?.id || "";
    if (!targetId || !meta) {
      return escapeHtml(match);
    }
    return `<button type="button" class="row-label-link" data-target="${escapeHtml(targetId)}" data-eyebrow="${escapeHtml(meta.eyebrow)}">${escapeHtml(match)}</button>`;
  });
}

function renderBlock(block, entry, blockIndex) {
  if (block.type === "html") {
    return `<div class="raw-html-block">${block.body || ""}</div>`;
  }

  if (block.type === "faction") {
    const members = (block.members || [])
      .map((member) => {
        const memberText = String(member?.text || "");
        const targetId = resolveFactionMemberEntryId(memberText);
        const tier = member.tier === "core" || member.tier === "orbit" ? ` ${member.tier}` : "";
        if (targetId) {
          return `<button type="button" class="member-tag member-link${tier}" data-target="${escapeHtml(targetId)}">${escapeHtml(memberText)}</button>`;
        }
        return `<span class="member-tag${tier}">${escapeHtml(memberText)}</span>`;
      })
      .join("");

    return `
      <div class="faction-block">
        <div class="faction-header">
          <div class="faction-name">${block.name || "Faction"}</div>
          <div class="faction-aka">${block.aka || ""}</div>
        </div>
        <div class="faction-body">
          <div class="character-gallery faction-gallery hidden" data-entry-id="${entry.id}" data-faction-index="${blockIndex}" data-faction-name="${block.name || "Faction"}"></div>
          <div class="faction-note">${block.note || ""}</div>
          <div class="faction-members">${members}</div>
        </div>
      </div>
    `;
  }

  if (block.type === "text") {
    return `<div class="${block.className || "char-intro"}">${block.body}</div>`;
  }

  if (block.type === "field-note") {
    return `
      <div class="field-note">
        <div class="field-note-media-slot hidden" data-entry-id="${entry.id}" data-block-index="${blockIndex}"></div>
        <div class="field-note-label">${block.label || "Field Note"}</div>
        <div class="field-note-body">${block.body}</div>
      </div>
    `;
  }

  if (block.type === "table") {
    const rows = getTableRowsForRender(block)
      .map(({ row, rowIndex, isPinned }) => {
        const editIcon = '<svg viewBox="0 0 16 16" focusable="false" aria-hidden="true"><path d="M11.8 1.8a1.3 1.3 0 0 1 1.9 0l.5.5a1.3 1.3 0 0 1 0 1.9L6 12.3l-2.8.7.7-2.8 8-8.4zM3 13.5h10v1H3z"/></svg>';
        const pinIcon = '<svg viewBox="0 0 16 16" focusable="false" aria-hidden="true"><path d="M5.2 1.5h5.6c.4 0 .7.3.7.7v1.1l1.6 1.6c.3.3.2.8-.2.9l-1.8.4-1.3 1.3.8 3.8c.1.6-.6 1-1 .5L8 9.8l-2 2.1c-.4.5-1.1.1-1-.5l.8-3.8-1.3-1.3-1.8-.4c-.4-.1-.5-.6-.2-.9l1.6-1.6V2.2c0-.4.3-.7.7-.7zM8 10.6l.7 2.8c.1.4-.2.8-.6.8h-.2c-.4 0-.7-.4-.6-.8l.7-2.8z"/></svg>';
        const deleteIcon = '<svg viewBox="0 0 16 16" focusable="false" aria-hidden="true"><path d="M6 1h4l.7 1.2H14v1.1H2V2.2h3.3L6 1zm-2 3.4h8.1l-.7 9.1c0 .8-.7 1.5-1.5 1.5H6.1c-.8 0-1.4-.7-1.5-1.5L4 4.4zm2.1 1.4v7.2h1.2V5.8H6.1zm2.7 0v7.2H10V5.8H8.8z"/></svg>';
        const rowLabelMarkup = renderTableLabelWithEntryLinks(row.label);
        const valueMarkup = shouldMaskSensitiveIdentityRow(entry, row)
          ? '<span class="char-value-masked" title="Hidden until XRay is active">classified</span>'
          : formatTableRowValue(row);

        return `
          <tr>
            <td class="row-label-cell${isPinned ? " is-pinned" : ""}">
              <span class="row-label-text">${rowLabelMarkup}</span>
              <span class="row-label-actions">
                <button type="button" class="row-icon-btn row-edit-btn" data-entry-id="${entry.id}" data-block-index="${blockIndex}" data-row-index="${rowIndex}" title="Edit row value" aria-label="Edit row value">${editIcon}</button>
                <button type="button" class="row-icon-btn row-pin-btn${isPinned ? " is-active" : ""}" data-entry-id="${entry.id}" data-block-index="${blockIndex}" data-row-index="${rowIndex}" title="${isPinned ? "Unpin row" : "Pin row to top"}" aria-label="${isPinned ? "Unpin row" : "Pin row to top"}">${pinIcon}</button>
                <button type="button" class="row-icon-btn row-delete-btn" data-entry-id="${entry.id}" data-block-index="${blockIndex}" data-row-index="${rowIndex}" title="Delete row" aria-label="Delete row">${deleteIcon}</button>
              </span>
            </td>
            <td>
              <div class="char-table-value-body">${valueMarkup}</div>
              ${formatTableRowMedia(row)}
            </td>
          </tr>
        `;
      })
      .join("");

    return `<table class="char-table">${rows}</table>`;
  }

  if (block.type === "auto-summary-table") {
    const rows = buildAutoSummaryRows(block)
      .map((row) => {
        return `
          <tr>
            <td class="row-label-cell">
              <span class="row-label-text">${row.label || ""}</span>
            </td>
            <td>${row.value || ""}</td>
          </tr>
        `;
      })
      .join("");

    return `<table class="char-table">${rows}</table>`;
  }

  if (block.type === "notes-app") {
    return `
      <div class="notes-app">
        <div class="notes-app-label">${block.label || "Notes App"}</div>
        <div class="notes-app-body">${block.body}</div>
      </div>
    `;
  }

  if (block.type === "section-break") {
    return `
      <div class="section-break">
        <span class="section-break-label">${block.label || "Section"}</span>
      </div>
    `;
  }

  if (block.type === "archive-index") {
    const fallback = (block.fallbackFiles || []).join("|");
    const exclude = (block.excludeFiles || ["index.html"]).join("|");
    const body = block.body || "Open archived HTML files below.";

    return `
      <div class="archive-index-block" data-archive-list data-base-path="${block.basePath || ARCHIVES_SOURCE_DIR}" data-fallback="${fallback}" data-exclude="${exclude}">
        <div class="archive-index-note">${body}</div>
        <div class="archive-index-list">
          <div class="archive-index-empty">Loading archive files...</div>
        </div>
      </div>
    `;
  }

  if (block.type === "gallery-sheet") {
    const title = block.title || "Picture Gallery";
    const note = block.note || "Grouped picture assets by theme, resolution, and character.";
    return `
      <div class="embedded-gallery-block" data-embedded-gallery>
        <div class="embedded-gallery-title">${title}</div>
        <div class="embedded-gallery-note">${note}</div>
        <div class="embedded-gallery-status" data-gallery-status>Loading gallery data...</div>
        <div class="embedded-gallery-controls">
          <div>
            <label class="embedded-gallery-label" for="embedded-gallery-search">Search Groups</label>
            <input id="embedded-gallery-search" class="embedded-gallery-input" data-gallery-search type="search" placeholder="Filter by group name or filename">
          </div>
          <div>
            <label class="embedded-gallery-label" for="embedded-gallery-year">Year</label>
            <select id="embedded-gallery-year" class="embedded-gallery-select" data-gallery-year>
              <option value="all">All Years</option>
            </select>
          </div>
          <div>
            <label class="embedded-gallery-label" for="embedded-gallery-min-size">Min Group Size</label>
            <select id="embedded-gallery-min-size" class="embedded-gallery-select" data-gallery-min-size>
              <option value="2">2+</option>
              <option value="3">3+</option>
              <option value="5">5+</option>
            </select>
          </div>
        </div>
        <section class="embedded-gallery-section">
          <h3>Theme Groups</h3>
          <div class="embedded-gallery-list" data-gallery-themes></div>
        </section>
        <section class="embedded-gallery-section">
          <h3>Resolution Groups</h3>
          <div class="embedded-gallery-list" data-gallery-resolutions></div>
        </section>
        <section class="embedded-gallery-section">
          <h3>Character Groups</h3>
          <div class="embedded-gallery-list" data-gallery-characters></div>
        </section>
        <div class="embedded-gallery-lightbox" data-gallery-lightbox aria-hidden="true">
          <img data-gallery-lightbox-img alt="Preview">
          <div class="embedded-gallery-lightbox-note">Click anywhere to close</div>
        </div>
      </div>
    `;
  }

  if (block.type === "statistics-sheet") {
    return renderStatisticsSheet(block);
  }

  if (block.type === "map-sheet") {
    const baseSrc = block.src || "maps.html";
    const src = block.syncYear === true && activeYear
      ? `${baseSrc}${baseSrc.includes("?") ? "&" : "?"}year=${encodeURIComponent(activeYear)}`
      : baseSrc;
    const title = block.title || "Maps";
    const note = block.note || "Interactive map embedded in the reference sheet.";

    if (String(baseSrc).toLowerCase() === "maps.html") {
      return `
        <div class="map-sheet-block">
          <div class="map-sheet-head">
            <div class="map-sheet-title">${title}</div>
            <div class="map-sheet-note">${note}</div>
          </div>
          <div class="map-page" data-map-inline="true">
            <div class="city-switch">
              <span class="city-switch-label">City View</span>
              <div id="citySwitchPills" class="city-switch-pills"></div>
            </div>

            <div class="page-header">
              <div id="pageTitle" class="page-title"></div>
              <div id="pageSubtitle" class="page-sub"></div>
            </div>

            <div class="map-wrap">
              <div class="map-bar">
                <span id="mapHeaderLeft"></span>
                <span id="mapHeaderRight"></span>
                <button id="gridToggle" class="map-grid-toggle" type="button">Grid: On</button>
              </div>
              <svg class="map-svg" viewBox="0 0 1000 600" xmlns="http://www.w3.org/2000/svg">
                <g id="mapGridLayer"></g>
                <g id="mapRoadLayer"></g>
                <g id="mapRoadLabelLayer"></g>
              </svg>
              <div id="mapLegend" class="map-legend"></div>
            </div>

            <div class="filter-wrap">
              <span class="filter-lbl">Filter:</span>
              <div id="filterButtons" class="filter-buttons"></div>
              <input id="promptSearch" class="search" type="text" placeholder="Search prompts...">
            </div>

            <div class="section-wrap">
              <div id="sectionTitle" class="sec-head"></div>
              <div id="groupsRoot"></div>
            </div>

          </div>
        </div>
      `;
    }

    return `
      <div class="map-sheet-block">
        <div class="map-sheet-head">
          <div class="map-sheet-title">${title}</div>
          <div class="map-sheet-note">${note}</div>
        </div>
        <iframe class="map-sheet-frame" src="${src}" title="${title}" loading="lazy" referrerpolicy="no-referrer"></iframe>
      </div>
    `;
  }

  if (block.type === "timeline-sheet") {
    const title = block.title || "Timeline";
    const note = block.note || "Chronological events database.";
    const hasData = Array.isArray(window.timelineEvents) && window.timelineEvents.length > 0;
    const initialStatusMarkup = hasData ? "" : "Loading timeline events...";
    const initialStatusClass = hasData ? "hidden" : "";
    const initialContent = hasData ? renderTimelineEventsHtml(window.timelineEvents) : "";

    return `
      <div class="timeline-sheet-block" data-timeline-sheet>
        <div class="timeline-sheet-head">
          <div class="timeline-sheet-title">${title}</div>
          <div class="timeline-sheet-note">${note}</div>
        </div>
        <div class="timeline-sheet-status ${initialStatusClass}" data-timeline-status>${initialStatusMarkup}</div>
        <div class="timeline-sheet-content" data-timeline-content>${initialContent}</div>
      </div>
    `;
  }

  return "";
}

function renderTimelineEventsHtml(events) {
  if (!Array.isArray(events) || events.length === 0) return "";
  return events.map(event => {
    const date = event.date || "Unknown Date";
    const title = event.title || "Untitled Event";
    const description = event.description || "";
    const tags = Array.isArray(event.tags) ? event.tags : [];

    // Streamline tags: show only prominent tags; collapse rare ones into a "+N" indicator.
    const prominentSet = window.timelineProminentTags instanceof Set ? window.timelineProminentTags : new Set();
    const prominentTags = tags.filter((t) => prominentSet.has(String(t)));
    const rareTags = tags.filter((t) => !prominentSet.has(String(t)));

    const prominentHtml = prominentTags.length
      ? prominentTags.map(t => {
          const iconMarkup = renderCharacterIconMarkup(t);
          const iconClass = iconMarkup ? " has-icon" : "";
          return `<span class="timeline-tag${iconClass}">${iconMarkup}${escapeHtml(t)}</span>`;
        }).join("")
      : "";

    const rareHtml = rareTags.length
      ? `<button type="button" class="timeline-more-tags" title="${escapeHtml(rareTags.join(', '))}">+${rareTags.length}</button>`
      : "";

    const tagsHtml = (prominentHtml || rareHtml)
      ? `<div class="timeline-event-tags">${prominentHtml}${rareHtml}</div>`
      : "";

    return `
      <article class="timeline-event">
        <div class="timeline-marker"></div>
        <div class="timeline-event-body">
          <header class="timeline-event-header">
            <span class="timeline-event-date">${escapeHtml(date)}</span>
            <h3 class="timeline-event-title">${renderTableLabelWithEntryLinks(title)}</h3>
          </header>
          <div class="timeline-event-description">${renderTableLabelWithEntryLinks(description)}</div>
          ${tagsHtml}
        </div>
      </article>
    `;
  }).join("");
}

// Compute global tag statistics and mark prominent tags to display directly.
function computeTimelineTagStats(events, options = {}) {
  const minCount = Number.isInteger(options.minCount) ? options.minCount : 2;
  const counts = new Map();
  (events || []).forEach((e) => {
    (Array.isArray(e.tags) ? e.tags : []).forEach((t) => {
      const key = String(t || "");
      if (!key) return;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
  });

  const prominent = new Set();
  counts.forEach((count, tag) => {
    if (count >= minCount) prominent.add(tag);
  });

  window.timelineProminentTags = prominent;
  window.timelineTagCounts = counts;
  return { prominent, counts };
}

// Render a batch (slice) of events as HTML. Kept separate for incremental rendering.
function renderTimelineEventsBatchHtml(eventsSlice) {
  return renderTimelineEventsHtml(eventsSlice);
}

async function renderTimelineSheet() {
  const blocks = Array.from(document.querySelectorAll("[data-timeline-sheet]"));
  if (blocks.length === 0) return;

  // Failsafe: If global data is missing, try a direct fetch
  if (!Array.isArray(window.timelineEvents) || window.timelineEvents.length === 0) {
    try {
      const response = await fetch(TIMELINE_SOURCE, { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        window.timelineEvents = Array.isArray(data) ? data : [];
      }
    } catch (e) {
      console.warn("[Timeline] Failsafe fetch failed:", e);
    }
  }

  const events = window.timelineEvents || [];

  // Compute and cache tag stats so we can streamline tag rendering (prominent vs rare)
  computeTimelineTagStats(events, { minCount: 2 });

  // Batch size controls how many events are rendered per incremental append.
  const TIMELINE_BATCH_SIZE = 200;

  blocks.forEach((blockEl) => {
    const statusEl = blockEl.querySelector("[data-timeline-status]");
    const contentEl = blockEl.querySelector("[data-timeline-content]");
    if (!statusEl || !contentEl) return;

    if (contentEl.children.length > 0) return; // Already rendered

    if (events.length === 0) {
      statusEl.textContent = "Data source is empty or unreachable. Please verify timeline Markdown files exist in the story directory.";
      statusEl.classList.remove("hidden");
      return;
    }

    statusEl.classList.add("hidden");
    contentEl.innerHTML = "";

    let index = 0;

    const appendNextBatch = () => {
      if (index >= events.length) {
        // Nothing left
        cleanupSentinel();
        return;
      }

      const slice = events.slice(index, index + TIMELINE_BATCH_SIZE);
      const html = renderTimelineEventsBatchHtml(slice);
      // Insert HTML for this batch
      contentEl.insertAdjacentHTML("beforeend", html);
      index += slice.length;

      // If more remain, ensure sentinel is present
      if (index < events.length) {
        ensureSentinel();
      } else {
        cleanupSentinel();
      }
    };

    // Create or ensure a sentinel element and IntersectionObserver to load more on scroll
    function ensureSentinel() {
      if (blockEl._timelineSentinel) return;
      const sentinel = document.createElement("div");
      sentinel.className = "timeline-load-sentinel";
      sentinel.innerHTML = '<div class="timeline-load-more">Loading more events...</div>';
      contentEl.appendChild(sentinel);
      blockEl._timelineSentinel = sentinel;

      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            // Schedule next batch to avoid blocking; prefer idle when available
            if (typeof window.requestIdleCallback === "function") {
              window.requestIdleCallback(() => appendNextBatch(), { timeout: 200 });
            } else {
              setTimeout(() => appendNextBatch(), 50);
            }
          }
        });
      }, { root: mainContent || null, rootMargin: "400px" });

      blockEl._timelineObserver = observer;
      observer.observe(sentinel);
    }

    function cleanupSentinel() {
      if (blockEl._timelineObserver) {
        try { blockEl._timelineObserver.disconnect(); } catch (e) {}
        blockEl._timelineObserver = null;
      }
      if (blockEl._timelineSentinel) {
        try { blockEl._timelineSentinel.remove(); } catch (e) {}
        blockEl._timelineSentinel = null;
      }
    }

    // Kick off first batch but yield to event loop so other startup work can proceed
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(() => appendNextBatch(), { timeout: 200 });
    } else {
      setTimeout(() => appendNextBatch(), 50);
    }
  });
}

function renderEntries() {
  const html = entries
    .map((entry, index) => {
      const isCurrentActive = entry.id === activeEntryId;
      const activeClass = (activeEntryId ? isCurrentActive : index === 0) ? " active" : "";
      const sectionTypeClass = String(entry?.id || "").toLowerCase() === "factions" ? " section-factions" : "";
      const renderedBlocks = (entry.blocks || []).map((block, blockIndex) => ({
        type: block?.type,
        html: renderBlock(block, entry, blockIndex)
      }));
      const isFactionsEntry = String(entry?.id || "").toLowerCase() === "factions";
      const blocks = isFactionsEntry
        ? (() => {
            const nonFaction = renderedBlocks
              .filter((block) => block.type !== "faction")
              .map((block) => block.html)
              .join("\n");
            const factionBlocks = renderedBlocks
              .filter((block) => block.type === "faction")
              .map((block) => block.html)
              .join("\n");
            const factionGrid = factionBlocks ? `<div class="faction-grid">${factionBlocks}</div>` : "";
            return [nonFaction, factionGrid].filter(Boolean).join("\n");
          })()
        : renderedBlocks.map((block) => block.html).join("\n");
      const profileId = (entry.id || "").toLowerCase();
      const hasLife123Profile = life123ProfileIds.has(profileId);
      const life123Action = hasLife123Profile
        ? `
            <div class="page-actions">
              <a class="life123-link-btn" href="life.html#profile=${encodeURIComponent(profileId)}">Open life123 profile</a>
            </div>
          `
        : "";

      return `
        <div class="section${activeClass}${sectionTypeClass}" id="s-${entry.id}">
          <div class="page-header">
            <div class="page-header-top">
              <div class="page-header-meta">${entry.eyebrow || ""}</div>
              <h1 class="page-title">${renderCharacterIconMarkup(entry.id)}${entry.title || "Untitled"}</h1>
            </div>
            ${entry.authorNote ? `<div class="page-author-note">${entry.authorNote}</div>` : ""}
            ${life123Action}
            <div class="character-gallery hidden" data-entry-id="${entry.id}"></div>
          </div>
          ${blocks}
        </div>
      `;
    })
    .join("\n");

  entriesRoot.innerHTML = html || '<div class="section active"><div class="empty-state">No entries found for this year.</div></div>';
}

function renderSidebar(groups) {
  const html = groups
    .map((group, groupIndex) => {
      const items = group.items
        .map((item, itemIndex) => {
          const isCurrentActive = item.id === activeEntryId;
          const activeClass = (activeEntryId ? isCurrentActive : (groupIndex === 0 && itemIndex === 0)) ? " active" : "";
          const iconMarkup = renderCharacterIconMarkup(item.id);
          const navTag = item.navTag ? `<span class="nav-tag">${item.navTag}</span>` : "";
          const groupKey = normalizeKey(item.navGroup || "");
          const isMovable = groupKey !== "preamble" && groupKey !== "closing";
          const moveUpButton = isMovable
            ? `<button class="nav-move-btn" data-target="${item.id}" data-direction="up" title="Move character up one section" aria-label="Move character ${item.navLabel} up one section">&#8593;</button>`
            : "";
          const moveDownButton = isMovable
            ? `<button class="nav-move-btn" data-target="${item.id}" data-direction="down" title="Move character down one section" aria-label="Move character ${item.navLabel} down one section">&#8595;</button>`
            : "";
          return `
            <div class="nav-item-row">
              <button class="nav-item${activeClass}" data-target="${item.id}">${iconMarkup}<span class="nav-item-label">${item.navLabel}</span>${navTag}</button>
              ${moveUpButton}
              ${moveDownButton}
              <button class="nav-delete-btn" data-target="${item.id}" title="Delete character" aria-label="Delete character ${item.navLabel}">
                <svg viewBox="0 0 16 16" focusable="false" aria-hidden="true"><path d="M6 1h4l.7 1.2H14v1.1H2V2.2h3.3L6 1zm-2 3.4h8.1l-.7 9.1c0 .8-.7 1.5-1.5 1.5H6.1c-.8 0-1.4-.7-1.5-1.5L4 4.4zm2.1 1.4v7.2h1.2V5.8H6.1zm2.7 0v7.2H10V5.8H8.8z"/></svg>
              </button>
            </div>
          `;
        })
        .join("\n");

      return `
        <div class="nav-section">
          <button class="nav-section-label" title="Collapse/Expand group">${group.label}</button>
          <div class="nav-section-items">
            ${items}
          </div>
        </div>
        ${groupIndex < groups.length - 1 ? '<hr class="nav-divider">' : ""}
      `;
    })
    .join("\n");

  sidebarNav.innerHTML = html;
}

function showEntry(entryId) {
  const prevEntryId = activeEntryId;
  activeEntryId = entryId;
  const entry = entries.find((item) => item.id === entryId);
  if (entry?.redirectUrl) {
    window.location.href = entry.redirectUrl;
    return;
  }

  document.querySelectorAll(".section").forEach((section) => {
    section.classList.remove("active");
  });

  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.remove("active");
  });

  const section = document.getElementById(`s-${entryId}`);
  const navItem = sidebarNav.querySelector(`[data-target="${entryId}"]`);

  if (!section || !navItem) {
    return;
  }

  section.classList.add("active");
  navItem.classList.add("active");
  initializeEmbeddedMapBlocks();

  // Only scroll to top if switching to a different entry
  if (prevEntryId && prevEntryId !== entryId) {
    if (typeof mainContent.scrollTo === "function") {
      mainContent.scrollTo({ top: 0, behavior: "smooth" });
    }
    mainContent.scrollTop = 0;
    if (typeof window.scrollTo === "function") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      window.scrollTo(0, 0);
    }
  }

  if (window.history && typeof window.history.replaceState === "function") {
    const base = `${window.location.pathname}${window.location.search || ""}`;
    window.history.replaceState(null, "", `${base}#${entryId}`);
  } else {
    window.location.hash = entryId;
  }
}

function buildGroups(allEntries, sortMode = "standard", searchQuery = "") {
  const byGroup = new Map();
  let filteredEntries = (allEntries || []).slice();

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filteredEntries = filteredEntries.filter(entry => {
      const haystack = [entry.title, entry.navLabel, entry.navTag, entry.id].map(s => String(s || "")).join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }

  filteredEntries
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .forEach((entry) => {
      const groupLabel = entry.navGroup || "Entries";
      if (!byGroup.has(groupLabel)) {
        byGroup.set(groupLabel, { label: groupLabel, items: [] });
      }

      byGroup.get(groupLabel).items.push({
        id: entry.id,
        navGroup: groupLabel,
        navLabel: entry.navLabel || entry.title || entry.id,
        navTag: entry.navTag || ""
      });
    });

  const groups = Array.from(byGroup.values());
  
  if (sortMode === "ascending") {
    groups.forEach(g => g.items.sort((a, b) => a.navLabel.localeCompare(b.navLabel)));
  } else if (sortMode === "descending") {
    groups.forEach(g => g.items.sort((a, b) => b.navLabel.localeCompare(a.navLabel)));
  }

  return groups;
}

function checkLuminanceIsDark(bgHex, pageHex) {
  const parse = (hex) => {
    const cleaned = String(hex).replace('#', '');
    if (cleaned.length === 3) {
      return [
        parseInt(cleaned[0] + cleaned[0], 16),
        parseInt(cleaned[1] + cleaned[1], 16),
        parseInt(cleaned[2] + cleaned[2], 16)
      ];
    }
    return [
      parseInt(cleaned.slice(0, 2), 16),
      parseInt(cleaned.slice(2, 4), 16),
      parseInt(cleaned.slice(4, 6), 16)
    ];
  };
  
  const lum = (rgb) => 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  
  try {
    const bgRgb = parse(bgHex || '#ffffff');
    const pageRgb = parse(pageHex || '#ffffff');
    return (lum(bgRgb) < 70 || lum(pageRgb) < 90);
  } catch (e) {
    return true;
  }
}

function expandMinimalThemes(themes) {
  const expanded = {};
  for (const [key, theme] of Object.entries(themes)) {
    if (!theme || !theme.vars) {
      expanded[key] = theme;
      continue;
    }
    
    const vars = { ...theme.vars };
    const bg = vars['--bg'];
    const page = vars['--page'];
    const ink = vars['--ink'];
    const accent = vars['--accent'];

    if (bg && ink && accent) {
      const isDark = checkLuminanceIsDark(bg, page);
      const mixBase = isDark ? 'black' : 'white';
      const oppositeBase = isDark ? 'white' : 'black';

      const defaults = {
        '--ink2': vars['--ink2'] || `color-mix(in srgb, ${ink} 80%, ${bg})`,
        '--dim': vars['--dim'] || `color-mix(in srgb, ${ink} 65%, ${bg})`,
        '--dimmer': vars['--dimmer'] || `color-mix(in srgb, ${ink} 45%, ${bg})`,
        '--faint': vars['--faint'] || `color-mix(in srgb, ${accent} 12%, transparent)`,
        '--border': vars['--border'] || `color-mix(in srgb, ${accent} 20%, ${bg})`,
        '--border2': vars['--border2'] || `color-mix(in srgb, ${accent} 30%, ${bg})`,
        '--sidebar-bg': vars['--sidebar-bg'] || `color-mix(in srgb, ${page} 94%, ${mixBase})`,
        '--sidebar-text': vars['--sidebar-text'] || `color-mix(in srgb, ${ink} 85%, ${bg})`,
        '--sidebar-dim': vars['--sidebar-dim'] || `color-mix(in srgb, ${ink} 55%, ${bg})`,
        '--sidebar-active': vars['--sidebar-active'] || accent,
        '--sidebar-hover': vars['--sidebar-hover'] || `color-mix(in srgb, ${accent} 8%, ${bg})`,
        '--accent2': vars['--accent2'] || `color-mix(in srgb, ${accent} 80%, ${oppositeBase})`,
        '--gold': vars['--gold'] || accent,
        '--red': vars['--red'] || '#ff385c',
        '--highlight': vars['--highlight'] || `color-mix(in srgb, ${accent} 8%, transparent)`,
        '--highlight2': vars['--highlight2'] || `color-mix(in srgb, ${accent} 14%, transparent)`,
        '--note-bg': vars['--note-bg'] || `color-mix(in srgb, ${page} 92%, ${bg})`,
        '--tag-bg': vars['--tag-bg'] || `color-mix(in srgb, ${page} 88%, ${bg})`,
        '--pin-color': vars['--pin-color'] || accent,
        '--body-bg': vars['--body-bg'] || bg,
        '--sidebar-surface': vars['--sidebar-surface'] || `linear-gradient(180deg, color-mix(in srgb, ${page} 94%, ${mixBase}) 0%, ${bg} 100%)`,
        '--main-surface': vars['--main-surface'] || `linear-gradient(180deg, ${page} 0%, ${bg} 100%)`,
        '--year-switch-bg': vars['--year-switch-bg'] || `linear-gradient(180deg, color-mix(in srgb, ${page} 96%, transparent) 0%, color-mix(in srgb, ${bg} 95%, transparent) 100%)`,
        '--year-switch-border-top': vars['--year-switch-border-top'] || `color-mix(in srgb, ${accent} 20%, transparent)`,
        '--year-switch-border-bottom': vars['--year-switch-border-bottom'] || `color-mix(in srgb, ${accent} 25%, transparent)`,
        '--sidebar-edge': vars['--sidebar-edge'] || `color-mix(in srgb, ${accent} 18%, transparent)`,
        '--sidebar-scrollbar': vars['--sidebar-scrollbar'] || `color-mix(in srgb, ${accent} 75%, transparent)`,
        '--nav-active-bg': vars['--nav-active-bg'] || `linear-gradient(90deg, color-mix(in srgb, ${accent} 12%, transparent), color-mix(in srgb, ${accent} 3%, transparent))`,
        '--year-track-bg': vars['--year-track-bg'] || `linear-gradient(90deg, color-mix(in srgb, ${accent} 30%, transparent), ${accent})`,
        '--year-track-border': vars['--year-track-border'] || `color-mix(in srgb, ${accent} 40%, transparent)`,
        '--year-thumb-border': vars['--year-thumb-border'] || `color-mix(in srgb, ${accent} 90%, transparent)`,
        '--year-thumb-bg': vars['--year-thumb-bg'] || `radial-gradient(circle at 35% 35%, ${oppositeBase} 0%, ${accent} 100%)`,
        '--year-thumb-ring': vars['--year-thumb-ring'] || `0 0 0 2px ${bg}, 0 0 12px color-mix(in srgb, ${accent} 55%, transparent)`,
        '--page-title-shadow': vars['--page-title-shadow'] || `0 0 24px color-mix(in srgb, ${accent} 18%, transparent)`,
        '--notes-ink': vars['--notes-ink'] || `color-mix(in srgb, ${ink} 95%, ${bg})`,
        '--notes-label-ink': vars['--notes-label-ink'] || accent,
        '--notes-body-ink': vars['--notes-body-ink'] || `color-mix(in srgb, ${ink} 80%, ${bg})`,
        '--notes-body-shadow': vars['--notes-body-shadow'] || `0 0.3px 0 color-mix(in srgb, ${accent} 15%, transparent)`,
        '--error-ink': vars['--error-ink'] || `color-mix(in srgb, #ff385c 85%, ${bg})`
      };

      Object.assign(vars, defaults);
    }

    expanded[key] = { ...theme, vars };
  }
  return expanded;
}

async function loadCharacterData() {
  await loadGlobalAssetIndex();
  try {
    loadLocalOverridesFromStorage();
    loadImageTagMetadataFromStorage();
    loadUiSoundSettings();
    loadYearVariantKeys();

    const [
      coreResponse,
      timelineResponse,
      entitiesResponse,
      themesResponse,
      versions
    ] = await Promise.all([
      fetch(CHARACTER_CORE_SOURCE, { cache: "no-store" }).catch(() => null),
      fetch(TIMELINE_SOURCE, { cache: "no-store" }).catch(() => null),
      fetch(ENTITIES_SOURCE, { cache: "no-store" }).catch(() => null),
      fetch(YEAR_THEMES_SOURCE, { cache: "no-store" }).catch(() => null),
      loadAllVersions().catch(() => null)
    ]);

    life123Data = {};
    life123ProfileIds = new Set();
    allVersions = {};
    sheetStylesByYear = {};

    if (themesResponse?.ok) {
      try {
        const themes = await themesResponse.json();
        sheetStylesByYear = expandMinimalThemes(themes);
      } catch (e) {
        console.error("Themes JSON parse error:", e);
        sheetStylesByYear = {};
      }
    }

    if (coreResponse?.ok) {
      const coreData = await coreResponse.json();
      characterCoreById = coreData?.characters || {};
    } else {
      characterCoreById = {};
    }

    if (entitiesResponse?.ok) {
      try {
        const payload = await entitiesResponse.json();
        // Flatten nested categories into a single lookup map
        const flat = {};
        if (payload && typeof payload === 'object') {
          Object.entries(payload).forEach(([category, entities]) => {
            if (entities && typeof entities === 'object') {
              Object.entries(entities).forEach(([id, data]) => {
                flat[id.toLowerCase()] = {
                  ...data,
                  _category: category
                };
              });
            }
          });
        }
        entitiesRegistry = flat;
        console.log(`[Entities] Successfully loaded and flattened entities registry.`);
      } catch (e) {
        console.error("Entities JSON parse error:", e);
      }
    }


    if (timelineResponse?.ok) {
      try {
        const timelineData = await timelineResponse.json();
        window.timelineEvents = Array.isArray(timelineData) ? timelineData : [];
        console.log(`[Timeline] Successfully loaded ${window.timelineEvents.length} events.`);
      } catch (e) {
        console.error("Timeline JSON parse error:", e);
        window.timelineEvents = [];
      }
    } else {
      console.warn("[Timeline] Response not OK or missing");
      window.timelineEvents = [];
    }

    // Automatically inject missing birth events from Character Core
    if (typeof characterCoreById === "object" && characterCoreById !== null) {
      Object.entries(characterCoreById).forEach(([charId, charData]) => {
        if (!charData || !Array.isArray(charData.rows)) return;
        
        const birthRow = charData.rows.find(r => r.birthDate);
        if (birthRow && birthRow.birthDate) {
          const nameRow = charData.rows.find(r => r.label && String(r.label).toLowerCase() === "full name");
          const rawCharName = nameRow?.value || charId;
          const charName = String(rawCharName).split('.')[0].replace(/\(.*\)/, '').trim().split(' ').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
          
          const alreadyExists = window.timelineEvents.some(e => {
            const title = String(e.title || "").toLowerCase();
            const tags = Array.isArray(e.tags) ? e.tags : [];
            const isBirthEvent = title.includes("born") || title.includes("birth") || tags.includes("birth");
            const isSameChar = title.includes(charId.toLowerCase()) || title.includes(charName.toLowerCase()) || tags.includes(charId.toLowerCase());
            return isBirthEvent && isSameChar;
          });

          if (!alreadyExists) {
            window.timelineEvents.push({
              date: birthRow.birthDate,
              title: `${charName} is Born`,
              description: `Birth of ${charName}.`,
              tags: ["birth", charId]
            });
          }
        }
      });
      
      window.timelineEvents.sort((a, b) => {
        const da = String(a.date || "9999-99-99");
        const db = String(b.date || "9999-99-99");
        return da.localeCompare(db);
      });
    }

    allVersions = versions || {};
    yearOptions = getSortedYearOptions(allVersions);
    renderYearPills();

    const requestedYear = readRequestedYear();
    activeYear = allVersions[requestedYear] ? requestedYear : (allVersions[DEFAULT_YEAR] ? DEFAULT_YEAR : yearOptions[0]);

    if (!activeYear) {
      throw new Error("No year versions found. Both primary and legacy fetch attempts failed. Make sure your local server is returning valid JSON headers, or that you have character data configured.");
    }

    await applyYearData(activeYear, { syncUrl: true });
  } catch (error) {
    console.error("FATAL ERROR IN loadCharacterData:", error);
    entriesRoot.innerHTML = `
      <div class="section active">
        <div class="error-state" style="text-align: left; padding: 2rem;">
          <h2 style="color: var(--warning-color, #ff6b6b); margin-top: 0;">Data Loading Failed</h2>
          <p>Unable to load character year data from <code>${CHARACTER_YEARS_SOURCE_DIR}</code> or <code>${LEGACY_DATA_SOURCE}</code>.</p>
          <pre style="background: var(--surface-bg, rgba(0,0,0,0.2)); padding: 1rem; border-radius: 4px; overflow-x: auto; font-family: monospace; white-space: pre-wrap; font-size: 0.9em;">Error: ${String(error.message || error)}
${error.stack ? '\\n' + error.stack : ''}</pre>
          <p style="margin-top: 1.5rem; color: var(--text-muted, #999);"><strong>Possible causes:</strong></p>
          <ul style="color: var(--text-muted, #999); padding-left: 1.5rem;">
            <li>You are opening the file directly from the filesystem (using a <code>file:///</code> URL). Most modern browsers block JSON fetch requests. Please use a local dev server.</li>
            <li>Your local server (like Live Server) is injecting scripts that break the JSON parsing.</li>
            <li>A syntax error exists in the core JSON configuration files.</li>
          </ul>
        </div>
      </div>
    `;
  }
}

async function loadVariantIntoYear(year, variantKey) {
  const variants = yearVariants[year];
  if (!Array.isArray(variants) || variants.length === 0) {
    return;
  }

  const variant = variants.find((v) => v.key === variantKey) || variants[0];
  if (!variant) {
    return;
  }

  // Store the chosen key
  activeYearVariantKey[year] = variant.key;
  saveYearVariantKeys();

  try {
    const response = await fetch(`${CHARACTER_YEARS_SOURCE_DIR}/${variant.path}`, { cache: "no-store" });
    if (!response.ok) {
      console.warn(`[year ${year}] Failed to load variant file: ${variant.path}`);
      return;
    }

    const rawText = await response.text();
    const text = rawText.charCodeAt(0) === 0xFEFF ? rawText.slice(1) : rawText;
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }

    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object") {
      return;
    }

    // Merge variant's meta on top of the year's base meta, and replace entries.
    const baseMeta = allVersions[year]?.meta || {};
    allVersions[year] = {
      ...allVersions[year],
      meta: deepMerge(baseMeta, parsed.meta && typeof parsed.meta === "object" ? parsed.meta : {}),
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
      isMultiVersion: true
    };
  } catch (err) {
    console.error(`[year ${year}] Error loading variant ${variant.path}:`, err);
  }
}

async function applyYearData(year, options = {}) {
  // For multi-version years: pre-load the active (or first) variant into allVersions
  if (allVersions[year]?.isMultiVersion) {
    const requestedVariantKey = options.variantKey || activeYearVariantKey[year] || yearVariants[year]?.[0]?.key || "";
    await loadVariantIntoYear(year, requestedVariantKey);
  }

  const versionData = resolveVersionData(year);
  if (!versionData) {
    return;
  }

  activeYear = year;
  activeReferenceDate = resolveReferenceDate(activeYear, versionData.meta || {});
  activeVersionMeta = cloneValue(versionData.meta || {});
  applyYearTheme(activeYear);
  entries = versionData.entries || [];
  applyCharacterCoreToEntries(entries);
  applyLocalOverridesToEntries(entries, activeYear);

  sidebarTitle.textContent = versionData.meta?.sidebarTitle || "Character Reference";
  sidebarDoc.innerHTML = versionData.meta?.sidebarDoc || "Field Notes<br>Combined Edition";
  sidebarMeta.innerHTML = versionData.meta?.sidebarMeta || "";
  document.title = versionData.meta?.documentTitle || "Character Reference";

  renderEntries();
  renderSidebar(buildGroups(entries, currentNavSort, currentNavSearch));
  refreshRestoreDeletedButton();
  await renderArchiveIndexBlocks();
  await renderEmbeddedGalleryBlocks();
  try {
    await renderCharacterGalleries();
  } catch (error) {
    console.error(`[year ${year}] Gallery render failed`, error);
  }

  const hashTarget = window.location.hash.replace("#", "");
  // Try to preserve the active entry; fall back to hash target, then first entry
  const preferredId = [activeEntryId, hashTarget, entries[0]?.id].find((id) => id && entries.some((entry) => entry.id === id));
  if (preferredId) {
    showEntry(preferredId);
  }

  syncYearControls(activeYear);
  if (options.syncUrl !== false) {
    setYearInUrl(activeYear);
  }
}

mainContent.addEventListener("click", async (event) => {
  const raceSelector = event.target.closest("[data-race-chart] [data-race-key]");
  if (raceSelector) {
    const chartEl = raceSelector.closest("[data-race-chart]");
    const raceKey = raceSelector.dataset.raceKey || "";
    updateRaceChartSelection(chartEl, raceKey);
    return;
  }

  const memberLink = event.target.closest(".member-link[data-target]");
  if (memberLink) {
    showEntry(memberLink.dataset.target || "");
    return;
  }

  const tableLabelLink = event.target.closest(".row-label-link[data-target]");
  if (tableLabelLink) {
    showEntry(tableLabelLink.dataset.target || "");
    return;
  }

  const tagButton = event.target.closest(".photo-tag-btn[data-gallery-key][data-action]");
  if (tagButton) {
    const galleryKey = String(tagButton.dataset.galleryKey || "");
    const action = String(tagButton.dataset.action || "");
    const imageIndex = Number(tagButton.dataset.imageIndex || -1);
    const gallery = galleryRegistry.get(galleryKey);
    const image = gallery?.images?.[imageIndex];
    if (!gallery || !image || imageIndex < 0) {
      return;
    }

    if (action === "exclusive") {
      setImageTagState(image, (current) => {
        const isActive = String(current?.exclusiveYear || "") === String(activeYear || "");
        return { ...current, exclusiveYear: isActive ? "" : String(activeYear || "") };
      });
    } else if (action === "priority") {
      setImageTagState(image, (current) => {
        const yearKey = String(activeYear || "");
        const priorityYears = current?.priorityYears && typeof current.priorityYears === "object"
          ? { ...current.priorityYears }
          : {};
        if (priorityYears[yearKey] === true) {
          delete priorityYears[yearKey];
        } else {
          priorityYears[yearKey] = true;
        }
        return { ...current, priorityYears };
      });
    }

    playUiTone("confirm");
    await renderCharacterGalleries();
    return;
  }

  const editButton = event.target.closest(".row-edit-btn[data-entry-id]");
  if (editButton) {
    const entryId = editButton.dataset.entryId || "";
    const blockIndex = Number(editButton.dataset.blockIndex || -1);
    const rowIndex = Number(editButton.dataset.rowIndex || -1);
    const found = findRowByCoordinates(entries, entryId, blockIndex, rowIndex);
    if (!found) {
      return;
    }

    const currentValue = stripHtml(found.row.value || "");
    const nextValue = window.prompt(`Edit \"${found.row.label || "row"}\"`, currentValue);
    if (nextValue === null) {
      return;
    }

    found.row.value = nextValue;
    setRowOverrideForYear(activeYear, entryId, blockIndex, rowIndex, { value: nextValue });
    await refreshRenderedContent(entryId);
    return;
  }

  const pinButton = event.target.closest(".row-pin-btn[data-entry-id]");
  if (pinButton) {
    const entryId = pinButton.dataset.entryId || "";
    const blockIndex = Number(pinButton.dataset.blockIndex || -1);
    const rowIndex = Number(pinButton.dataset.rowIndex || -1);
    const found = findRowByCoordinates(entries, entryId, blockIndex, rowIndex);
    if (!found) {
      return;
    }

    const isPinned = found.row.pinned === true;
    found.row.pinned = !isPinned;
    setRowOverrideForYear(activeYear, entryId, blockIndex, rowIndex, { pinned: !isPinned });
    await refreshRenderedContent(entryId);
    return;
  }

  const deleteRowButton = event.target.closest(".row-delete-btn[data-entry-id]");
  if (deleteRowButton) {
    const entryId = deleteRowButton.dataset.entryId || "";
    const blockIndex = Number(deleteRowButton.dataset.blockIndex || -1);
    const rowIndex = Number(deleteRowButton.dataset.rowIndex || -1);
    const found = findRowByCoordinates(entries, entryId, blockIndex, rowIndex);
    if (!found) {
      return;
    }

    const rowLabel = stripHtml(found.row.label || "this row");
    const shouldDelete = window.confirm(`Delete row \"${rowLabel}\"? This can be reverted only by clearing local overrides.`);
    if (!shouldDelete) {
      return;
    }

    found.row.__deleted = true;
    setRowOverrideForYear(activeYear, entryId, blockIndex, rowIndex, { deleted: true });
    playUiTone("warn");
    await refreshRenderedContent(entryId);
    return;
  }

  const navButton = event.target.closest(".photo-nav");
  if (!navButton) {
    return;
  }

  const galleryKey = navButton.dataset.galleryKey;
  const direction = navButton.dataset.direction;
  const gallery = galleryRegistry.get(galleryKey);
  if (!gallery || !gallery.images.length) {
    return;
  }

  const container = navButton.closest(".character-gallery");
  if (!container) {
    return;
  }

  const current = galleryIndexByEntry.get(galleryKey) || 0;
  const step = Math.max(1, Math.min(3, galleryDisplayCountByKey.get(galleryKey) || 1));
  const delta = direction === "prev" ? -step : step;
  const next = (current + delta + gallery.images.length) % gallery.images.length;
  galleryIndexByEntry.set(galleryKey, next);
  playUiTone("step");
  renderGalleryInContainer(container, galleryKey, gallery.altBase, gallery.images);
});

sidebarNav.addEventListener("click", async (event) => {
  const collapseBtn = event.target.closest(".nav-section-label");
  if (collapseBtn) {
    const section = collapseBtn.closest(".nav-section");
    if (section) {
      section.classList.toggle("collapsed");
      playUiTone("step");
    }
    return;
  }

  const moveButton = event.target.closest(".nav-move-btn[data-target][data-direction]");
  if (moveButton) {
    const targetId = moveButton.dataset.target || "";
    const direction = moveButton.dataset.direction === "up" ? "up" : "down";
    const targetEntry = entries.find((entry) => entry.id === targetId);
    if (!targetId || !targetEntry) {
      return;
    }

    const movableGroupLabels = buildGroups(entries)
      .map((group) => stripHtml(group?.label || "").trim())
      .filter((label) => {
        const key = normalizeKey(label);
        return key && key !== "preamble" && key !== "closing";
      });

    const currentGroup = stripHtml(targetEntry.navGroup || "").trim();
    const currentIndex = movableGroupLabels.findIndex((label) => label === currentGroup);
    if (currentIndex < 0) {
      return;
    }

    const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (nextIndex < 0 || nextIndex >= movableGroupLabels.length) {
      return;
    }

    const nextGroup = movableGroupLabels[nextIndex];
    if (!nextGroup || nextGroup === currentGroup) {
      return;
    }

    setEntryNavGroupForYear(activeYear, targetId, nextGroup);
    playUiTone("step");
    await applyYearData(activeYear, { syncUrl: false });
    showEntry(targetId);
    return;
  }

  const deleteButton = event.target.closest(".nav-delete-btn[data-target]");
  if (deleteButton) {
    const targetId = deleteButton.dataset.target || "";
    const targetEntry = entries.find((entry) => entry.id === targetId);
    if (!targetId || !targetEntry) {
      return;
    }

    const label = stripHtml(targetEntry.navLabel || targetEntry.title || targetId);
    const shouldDelete = window.confirm(`Delete character \"${label}\" from ${activeYear}?`);
    if (!shouldDelete) {
      return;
    }

    setEntryDeletedForYear(activeYear, targetId, true);
    playUiTone("warn");
    await applyYearData(activeYear, { syncUrl: false });
    return;
  }

  const navButton = event.target.closest(".nav-item");
  if (!navButton) {
    return;
  }

  showEntry(navButton.dataset.target);
  playUiTone("tap");
});

restoreDeletedButton?.addEventListener("click", async () => {
  const deletedIds = getDeletedEntryIdsForYear(activeYear);
  if (!deletedIds.length) {
    refreshRestoreDeletedButton();
    return;
  }

  const shouldRestore = window.confirm(`Restore deleted entries for ${activeYear}?\n\n${deletedIds.join(", ")}`);
  if (!shouldRestore) {
    return;
  }

  deletedIds.forEach((entryId) => {
    setEntryDeletedForYear(activeYear, entryId, false);
  });

  playUiTone("confirm");
  await applyYearData(activeYear, { syncUrl: false });
  if (deletedIds[0] && entries.some((entry) => entry.id === deletedIds[0])) {
    showEntry(deletedIds[0]);
  }
});

if (yearSlider) {
  yearSlider.addEventListener("input", async () => {
    const index = Number(yearSlider.value || 0);
    const year = yearOptions[index] || yearOptions[0] || DEFAULT_YEAR;
    playUiTone("step");
    await applyYearData(year, { syncUrl: true });
  });
}

yearPillsContainer?.addEventListener("click", async (event) => {
  const pill = event.target.closest(".year-pill[data-year]");
  if (!pill) {
    return;
  }

  const year = pill.dataset.year;
  if (!year || !yearOptions.includes(year)) {
    return;
  }

  playUiTone("tap");
  await applyYearData(year, { syncUrl: true });
});

// Variant pill click handler
document.getElementById("year-variant-pills")?.addEventListener("click", async (event) => {
  const pill = event.target.closest(".year-variant-pill[data-variant-key]");
  if (!pill) {
    return;
  }

  const year = pill.dataset.year || activeYear;
  const variantKey = pill.dataset.variantKey || "";
  if (!variantKey || !year) {
    return;
  }

  // Don't reload if already active
  if (activeYearVariantKey[year] === variantKey) {
    return;
  }

  playUiTone("tap");
  await applyYearData(year, { syncUrl: false, variantKey });
});

layoutAlignControls?.addEventListener("click", (event) => {
  const alignBtn = event.target.closest(".layout-align-btn[data-align]");
  if (alignBtn) {
    applyPageAlignMode(alignBtn.dataset.align);
    playUiTone("tap");
    return;
  }

  const fullWidthBtn = event.target.closest("#full-width-toggle");
  if (fullWidthBtn) {
    applyFullWidthMode(!isFullWidthMode);
    playUiTone("confirm");
    return;
  }
});

xrayToggleButton?.addEventListener("click", async () => {
  applyXrayMode(!isXrayEnabled);
  playUiTone("confirm");
  await refreshRenderedContent(activeEntryId || entries[0]?.id || "");
});

const exportModalApi = typeof initExportModal === "function"
  ? initExportModal({
    getEntries: () => entries,
    buildGroups,
    renderCharacterIconMarkup,
    escapeHtml,
    onExportJson: (customEntries) => exportActiveYearJson(customEntries),
    onExportStory: (customEntries) => exportActiveYearStory(customEntries)
  })
  : { openExportModal: () => {} };

exportJsonButton?.addEventListener("click", () => {
  exportModalApi.openExportModal("json");
});

exportStoryButton?.addEventListener("click", () => {
  exportModalApi.openExportModal("story");
});

regenerateMediaIndexButton?.addEventListener("click", async () => {
  if (regenerateMediaIndexButton.disabled) {
    return;
  }

  playUiTone("tap");
  const originalLabel = regenerateMediaIndexButton.textContent;
  regenerateMediaIndexButton.disabled = true;
  regenerateMediaIndexButton.classList.add("is-running");
  regenerateMediaIndexButton.textContent = "Rebuilding...";

  try {
    const response = await fetch(MEDIA_MANIFEST_RUN_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      }
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const reason = payload?.error || payload?.message || `Request failed (${response.status})`;
      throw new Error(reason);
    }

    playUiTone("confirm");
    const message = payload?.message || "image_index.json files regenerated.";
    window.alert(`Media manifest complete.\n\n${message}`);
  } catch (error) {
    playUiTone("warn");
    const details = error instanceof Error ? error.message : String(error || "Unknown error");
    window.alert(
      "Could not run media manifest generator.\n\n" +
      "Make sure the local backend is running with: npm run dev:backend\n\n" +
      `Details: ${details}`
    );
  } finally {
    regenerateMediaIndexButton.disabled = false;
    regenerateMediaIndexButton.classList.remove("is-running");
    regenerateMediaIndexButton.textContent = originalLabel || "Rebuild Img Index";
  }
});

// Sidebar Search and Sort Logic
let currentNavSort = "standard";
let currentNavSearch = "";
const sidebarSearchInput = document.getElementById("sidebar-search-input");
const sidebarSearchClear = document.getElementById("sidebar-search-clear");
const sidebarSortBtn = document.getElementById("sidebar-sort-btn");

sidebarSearchInput?.addEventListener("input", (e) => {
  currentNavSearch = e.target.value;
  if (sidebarSearchClear) {
    sidebarSearchClear.hidden = currentNavSearch.length === 0;
  }
  renderSidebar(buildGroups(entries, currentNavSort, currentNavSearch));
});

sidebarSearchClear?.addEventListener("click", () => {
  if (sidebarSearchInput) {
    sidebarSearchInput.value = "";
    currentNavSearch = "";
    sidebarSearchClear.hidden = true;
    sidebarSearchInput.focus();
    renderSidebar(buildGroups(entries, currentNavSort, currentNavSearch));
  }
});

sidebarSortBtn?.addEventListener("click", () => {
  if (currentNavSort === "standard") {
    currentNavSort = "ascending";
    sidebarSortBtn.title = "Sort: Ascending (A-Z)";
    sidebarSortBtn.innerHTML = `<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="1em" height="1em"><path d="M3 18h6v-2H3v2zM3 6v2h18V6H3zm0 7h12v-2H3v2z"/><path d="M15 14h6v2h-6zM15 10h4v2h-4zM15 6h2v2h-2z" fill="var(--gold)"/></svg>`;
  } else if (currentNavSort === "ascending") {
    currentNavSort = "descending";
    sidebarSortBtn.title = "Sort: Descending (Z-A)";
    sidebarSortBtn.innerHTML = `<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="1em" height="1em"><path d="M3 18h6v-2H3v2zM3 6v2h18V6H3zm0 7h12v-2H3v2z"/><path d="M15 14h2v2h-2zM15 10h4v2h-4zM15 6h6v2h-6z" fill="var(--gold)"/></svg>`;
  } else {
    currentNavSort = "standard";
    sidebarSortBtn.title = "Sort: Standard";
    sidebarSortBtn.innerHTML = `<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="1em" height="1em"><path d="M3 18h6v-2H3v2zM3 6v2h18V6H3zm0 7h12v-2H3v2z"/></svg>`;
  }
  renderSidebar(buildGroups(entries, currentNavSort, currentNavSearch));
});


// Sidebar Toggle Logic
const sidebarEl = document.querySelector(".sidebar");
const sidebarToggleBtn = document.getElementById("sidebar-toggle-btn");

function isMobileShellViewport() {
  if (window.matchMedia && window.matchMedia("(max-width: 900px)").matches) {
    return true;
  }
  if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) {
    return true;
  }
  return false;
}

function applyMobileShellState() {
  const mobileShell = isMobileShellViewport();
  document.body.classList.toggle("mobile-shell", mobileShell);
  if (mobileShell) {
    sidebarEl?.classList.add("collapsed");
  }
}

function updateSidebarState(isCollapsed) {
  if (isCollapsed) {
    sidebarEl?.classList.add("collapsed");
  } else {
    sidebarEl?.classList.remove("collapsed");
  }
}

sidebarToggleBtn?.addEventListener("click", () => {
  const isCollapsed = sidebarEl?.classList.toggle("collapsed");
  localStorage.setItem("sidebarCollapsed", isCollapsed ? "true" : "false");
});

// Initialize sidebar state
const savedSidebarState = localStorage.getItem("sidebarCollapsed");
if (savedSidebarState === null && window.matchMedia && window.matchMedia("(max-width: 900px)").matches) {
  updateSidebarState(true);
} else {
  updateSidebarState(savedSidebarState === "true");
}
applyMobileShellState();
window.addEventListener("resize", applyMobileShellState);

// Moved to local-ai.js
loadPageAlignMode();
loadFullWidthMode();
loadXrayMode();
loadCharacterData();

