(function initMrConstants(global) {
const SPECIAL_ENTRY_ICONS = {
  archives: "book",
  life123: "social",
  maps: "map",
  gallery: "gallery",
  statistics: "chart",
  timeline: "history",
  progress: "chart"
};

const NAV_GROUP_ORDER = [
  'Preamble',
  'Main Cast',
  'Ratgirlz',
  'Supporting Cast',
  'Load-Bearing Scenes',
  'Extended Cast',
  'Organizations',
  'Old Memories',
  'Orbiter',
  'Closing'
];

const TIMELINE_EVENT_TAG_HINTS = new Set([
  'birth',
  'incident',
  'key-event',
  'history',
  'postwar',
  'shutdown',
  'war',
  'ww1',
  'ww2',
  'ww3',
  'operation',
  'discovery',
  'end',
  'origin'
]);

const TIMELINE_LOCATION_TAG_HINTS = new Set([
  'ashford',
  'fairmount',
  'new-canaan',
  'harrow',
  'north-pole',
  'new-york',
  'moscow',
  'cuba',
  'iran',
  'argentina',
  'utah',
  'middle-east',
  'latin-america',
  'africa',
  'india',
  'korea',
  'japan',
  'eurasia',
  'america',
  'brazil',
  'britain'
]);

const TIMELINE_SOURCE = "/api/timeline";

const TIMELINE_ORG_TAG_HINTS = new Set([
  'order',
  'obrien',
  'braun-inc',
  'meridian',
  'militia',
  'blair-angels',
  'un',
  'amazon',
  'lechun'
]);

const TIMELINE_THEME_TAG_HINTS = new Set([
  'history',
  'romance',
  'music',
  'wedding',
  'breakup',
  'friendship',
  'adoption',
  'spiral',
  'therapy',
  'notebook',
  'enhanced',
  'death'
]);

const TIMELINE_TAG_ALIASES = {
  "clint": ["azure-knight", "clint-harris"],
  "karen": ["scarlet-shade", "karen-vance"],
  "elena-volkov": ["wraith", "the-serpent"],
  "tobias": ["midnight-ii"],
  "jess": ["jess-boone", "jester"],
  "ashley": ["ashley-blair"],
  "elena": ["shade", "elena-vasquez"],
  "marcus": ["smog"],
  "bea": ["blindspot", "bea-santos", "beatriz-santos"],
  "arthur": ["knightfall", "midnight", "arthur-vance"],
  "lotus": ["saki", "saki-nonomiya"],
  "chloe": ["viridian", "chloe-mercer"],
  "naomi": ["infra", "naomi-sato"],
  "thema": ["tremor"],
  "patricia": ["sirin", "voss", "patricia-voss"],
  "carmen": ["tempest", "carmen-reyes"],
  "yuki": ["prism"],
  "mei": ["lantern"],
  "aya": ["star"],
  "lina": ["encore", "lina-braun"],
  "dalia": ["raatgirl"],
  "veritas": ["fault-line", "joanna", "joanna-carter"],
  "rin-hasegawa": ["msy"],
  "roboter": ["pangean", "limbo"],
  "vanguard": ["american-hero"],
  "elena-vasquez": ["shade"],
  "viktor-volkov": ["serpent"],
  "warren": ["warren-blair"],
  "volkov": ["elena-volkov", "viktor-volkov", "volkovs"],
  "obsidian": ["obsidian-rig"],
  "apex": ["apex-hq"],
  "origin": ["origins", "character-origin", "character-origins"],
  "mermaid": ["mermaids"],
  "vigilantes": ["vigilante", "vigilantism"],
  "draft": ["pandora-draft"],
  "succession": ["inheritance"],
  "history": ["historical"],
  "tragedy": ["mundane-tragedy"],
  "aftermath": ["long-war-aftermath"],
  "military": ["militarism", "military-operation", "military-deployment"],
  "betrayal": ["treason"],
  "childhood": ["puberty"],
  "ghosts": ["ghost"],
  "rejection": ["denial"],
  "time-travel": ["paradox"],
  "writing": ["journalism"],
  "sloane": ["magenta"],
  "morgan": ["dred", "morgan-dred"],
  "gareth": ["ghost", "gareth-ellis"],
  "hwan": ["apollyon"],
  "callum": ["axiom"],
  "ryan": ["cobalt", "ryan-lee"],
  "sarah": ["vanguard"],
  "wraith": ["mavka", "pincoya"]
};

const SPECIAL_PORTRAIT_TAGS = new Set([
  'gala', 
  'disguise', 
  'uniform', 
  'war', 
  'formal', 
  'beach', 
  'winter', 
  'cyber', 
  'apocalyptic',
  'masked'
]);

const MR_UI_STATE_KEY = 'mr_vue_state_v1';
const MAX_ROW_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_TIMELINE_PORTRAIT_QUEUE = 100;
// Toggle for aggressive direct filename probing. Set to true to rely on automated filename resolution 
// instead of strictly requiring media catalogs (prevents needing stale image_index.json files).
const ENABLE_DIRECT_PROBES = true;

const STORY_SET_PRESETS = [
  {
    key: 'drama',
    label: 'Drama',
    guidance: 'Prioritize character conflict, emotional reversals, and difficult choices.'
  },
  {
    key: 'post-apocalyptic',
    label: 'Post-Apocalyptic',
    guidance: 'Emphasize scarcity, survival pressure, fractured trust, and adaptation to ruined systems.'
  },
  {
    key: 'superhero',
    label: 'Superhero',
    guidance: 'Balance personal life with powers, public consequences, and ethical use of force.'
  },
  {
    key: 'horror',
    label: 'Horror',
    guidance: 'Build dread through uncertainty, sensory unease, and escalating threat.'
  },
  {
    key: 'mystery',
    label: 'Mystery',
    guidance: 'Structure scenes around clues, contradictions, and high-tension reveals.'
  },
  {
    key: 'romance',
    label: 'Romance',
    guidance: 'Center emotional chemistry, vulnerability, and meaningful relational progression.'
  }
];

const STORY_VOICE_TAGS = [
  { key: 'observational', label: 'Observational', phrase: 'observational and detail-attentive' },
  { key: 'precise', label: 'Precise', phrase: 'precise and exact in wording' },
  { key: 'honest', label: 'Honest', phrase: 'emotionally honest and direct' },
  { key: 'dishonest', label: 'Dishonest', phrase: 'strategically evasive and selectively truthful' },
  { key: 'erratic', label: 'Erratic', phrase: 'erratic, jump-cut, and volatile in rhythm' },
  { key: 'obsessive', label: 'Obsessive', phrase: 'obsessive and fixated on recurring details' },
  { key: 'silly', label: 'Silly', phrase: 'playful, silly, and unexpectedly funny' },
  { key: 'comedic', label: 'Comedic', phrase: 'comedic and timing-conscious in delivery' },
  { key: 'heroic', label: 'Heroic', phrase: 'heroic, principled, and forward-driving' },
  { key: 'villainous', label: 'Villainous', phrase: 'villainous, ruthless, and self-justifying' },
  { key: 'curses-a-lot', label: 'Curses A Lot', phrase: 'casually profane and curse-heavy in diction' },
  { key: 'pumpy', label: 'Pump-y', phrase: 'high-energy, pump-up, and adrenaline-forward' },
  { key: 'cool', label: 'Cool', phrase: 'cool, controlled, and low-flinch under pressure' },
  { key: 'dorky', label: 'Dorky', phrase: 'dorky, earnest, and endearingly awkward' },
  { key: 'tender', label: 'Tender', phrase: 'tender and quietly intimate' },
  { key: 'clinical', label: 'Clinical', phrase: 'clinical and detached in observation' },
  { key: 'sarcastic', label: 'Sarcastic', phrase: 'sarcastic with sharp tonal edges' },
  { key: 'paranoid', label: 'Paranoid', phrase: 'suspicious and threat-aware' },
  { key: 'melancholic', label: 'Melancholic', phrase: 'melancholic and reflective' },
  { key: 'mythic', label: 'Mythic', phrase: 'mythic and larger-than-life in framing' },
  { key: 'minimalist', label: 'Minimalist', phrase: 'minimalist and compressed' }
];

const CHARSHEET_TONE_OPTIONS = ['sincere', 'detached', 'sarcastic', 'aggressive', 'poetic'];
const CHARSHEET_PRECISION_OPTIONS = ['precise', 'vague', 'erratic'];
const CHARSHEET_CAPS_OPTIONS = ['normal', 'all lowercase', 'ALL CAPS sometimes', 'mixed/erratic'];
const CHARSHEET_HONESTY_OPTIONS = ['honest', 'unreliable narrator', 'omits details', 'deflects with humor'];
const CHARSHEET_FORMALITY_OPTIONS = ['casual', 'formal', 'military briefing', 'stream of consciousness'];

const CHARSHEET_COLOR_PALETTE = [
  { name: 'crimson', hex: '#c8373d' },
  { name: 'blood orange', hex: '#f2674a' },
  { name: 'gold', hex: '#ffb04d' },
  { name: 'amber', hex: '#d4a053' },
  { name: 'sand', hex: '#d9b684' },
  { name: 'olive', hex: '#6b7c3f' },
  { name: 'teal', hex: '#1ea7a1' },
  { name: 'jade', hex: '#2e8b57' },
  { name: 'cerulean', hex: '#3a8fd4' },
  { name: 'navy', hex: '#17364d' },
  { name: 'indigo', hex: '#4b0082' },
  { name: 'violet', hex: '#7b2d8e' },
  { name: 'orchid', hex: '#da70d6' },
  { name: 'rose', hex: '#e8879a' },
  { name: 'slate', hex: '#5a6878' },
  { name: 'charcoal', hex: '#2c2c2c' },
  { name: 'bone', hex: '#f4ead4' },
  { name: 'cream', hex: '#fff5df' },
  { name: 'silver', hex: '#b0bec5' },
  { name: 'obsidian', hex: '#0a0608' },
];
const CHARSHEET_FONT_VIBES = [
  'gothic serif', 'military tech', 'handwritten', 'brutalist mono',
  'elegant classic', 'retro futurism', 'newspaper editorial', 'cyberpunk',
  'warm humanist', 'cold clinical'
];
const CHARSHEET_MODE_OPTIONS = ['dark', 'light'];

const ICON_SYMBOLS = {
  book: "\u25A4",
  social: "\u25CD",
  map: "\u2316",
  gallery: "\u25A3",
  chart: "\u25EB",
  eye: "\u25C9",
  gear: "\u2733",
  sword: "\u2020",
  shield: "\u2B12",
  bolt: "\u27E1",
  ghost: "\u25CC",
  crown: "\u265B",
  heart: "\u2661",
  flower: "\u273F",
  cloud: "\u2601",
  feather: "\u2767",
  mask: "\u25C8",
  flame: "\u2736",
  camera: "\u25E7",
  star: "\u2726",
  history: "\u25F7",
  gift: "\u25A6",
  smile: "\u263A",
  frown: "\u2639",
  meh: "\u2610",
  terminal: "\u2328",
  // ── New semantic icons (2026.06) ──
  scroll: "\u2234",      // ∴
  scales: "\u2696",      // ⚖
  skull: "\u2620",       // ☠
  handshake: "\u2629",   // ☩
  brain: "\u29BB",       // ⦻
  dna: "\u2742",         // ❂
  megaphone: "\u25C0",   // ◀
  flag: "\u2691",        // ⚑
  film: "\u25FB",        // ◻
  music: "\u266B",       // ♫
  lock: "\u26BF",        // ⚿
  target: "\u25CE",      // ◎
  alert: "\u26A0",       // ⚠
  truck: "\u25B7",       // ▷
  layers: "\u2756",      // ❖
  radio: "\u25D5",       // ◕
  cross: "\u271E",       // ✞
  baby: "\u25D4",        // ◔
  sparkle: "\u2728",     // ✨
  notebook: "\u25A5",    // ▥
  castle: "\u2656",      // ♖
  globe: "\u2641",       // ♁
  rings: "\u26AD",       // ⚭
  gavel: "\u2318",       // ⌘
  trophy: "\u2655",      // ♕
  users: "\u25CD",       // ◍
  compass: "\u2316",     // ⌖
  knife: "\u2716",       // ✖
  dog: "\u25CB",         // ○
  microscope: "\u2295",   // ⊕
  butterfly: "\uD83E\uDD8B" // 🦋
};

const CANONICAL_JESS_IDS = new Set([
  'one', 'nb2', 'three', 'four-five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'nb12', 'nb13', 'nb14', 'nb15', 'nb16', 'nb17', 'nb20', 'nb21'
]);

  global.MR_CONSTANTS = {
    SPECIAL_ENTRY_ICONS,
    NAV_GROUP_ORDER,
    TIMELINE_EVENT_TAG_HINTS,
    TIMELINE_LOCATION_TAG_HINTS,
    TIMELINE_SOURCE,
    TIMELINE_ORG_TAG_HINTS,
    TIMELINE_THEME_TAG_HINTS,
    MR_UI_STATE_KEY,
    MAX_ROW_UPLOAD_BYTES,
    MAX_TIMELINE_PORTRAIT_QUEUE,
    ENABLE_DIRECT_PROBES,
    STORY_SET_PRESETS,
    STORY_VOICE_TAGS,
    CHARSHEET_TONE_OPTIONS,
    CHARSHEET_PRECISION_OPTIONS,
    CHARSHEET_CAPS_OPTIONS,
    CHARSHEET_HONESTY_OPTIONS,
    CHARSHEET_FORMALITY_OPTIONS,
    CHARSHEET_COLOR_PALETTE,
    CHARSHEET_FONT_VIBES,
    CHARSHEET_MODE_OPTIONS,
    ICON_SYMBOLS,
    TIMELINE_TAG_ALIASES,
    SPECIAL_PORTRAIT_TAGS,
    CANONICAL_JESS_IDS
  };
}(window));
