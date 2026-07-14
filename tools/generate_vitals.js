const fs = require('fs');
const path = require('path');

// ── Root Directories ──────────────────────────────────────────────────
const ROOT_DIR = path.resolve(__dirname, '..');
const STORY_DIR = process.env.CHAR_MGR_STORY_DIR 
  ? path.resolve(process.env.CHAR_MGR_STORY_DIR)
  : path.join(ROOT_DIR, 'stories', 'earthborn');

const CORE_JSON_PATH = path.join(STORY_DIR, 'core.json');
const VITALS_MD_PATH = path.join(STORY_DIR, 'timeline', 'births_deaths.md');

// ── Helper Functions matching frontend logic ──────────────────────────

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function getCoreBirthRaw(core) {
  if (!core || typeof core !== 'object') return '';
  if (typeof core.birthDate === 'string' && core.birthDate.trim()) return core.birthDate.trim();
  if (typeof core.birthday === 'string' && core.birthday.trim()) return core.birthday.trim();
  if (typeof core.born === 'string' && core.born.trim()) return core.born.trim();
  if (typeof core.birth === 'string' && core.birth.trim()) return core.birth.trim();

  if (Array.isArray(core.rows)) {
    const row = core.rows.find((r) => r && (r.birthDate || r.birthdate || r.birthday || r.born || (r.label && normalize(r.label).includes('birth'))));
    return row?.birthDate || row?.birthdate || row?.birthday || row?.born || row?.value || '';
  }
  return '';
}

function getCoreDeathRaw(core) {
  if (!core || typeof core !== 'object') return '';
  if (typeof core.deathDate === 'string' && core.deathDate.trim()) return core.deathDate.trim();
  if (typeof core.deathday === 'string' && core.deathday.trim()) return core.deathday.trim();
  if (typeof core.died === 'string' && core.died.trim()) return core.died.trim();
  if (typeof core.death === 'string' && core.death.trim()) return core.death.trim();

  if (Array.isArray(core.rows)) {
    const row = core.rows.find((r) => r && (r.deathDate || r.deathdate || r.deathday || r.died || (r.label && normalize(r.label).includes('death'))));
    return row?.deathDate || row?.deathdate || row?.deathday || row?.died || row?.value || '';
  }
  return '';
}

function parseTimelineDateParts(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(-?\d+)-(\d{1,2})-(\d{1,2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year)) return null;
  if (!Number.isFinite(month) || month < 0 || month > 12) return null;
  if (!Number.isFinite(day) || day < 0 || day > 31) return null;
  return { year, month, day };
}

function compareEvents(a, b) {
  const pa = parseTimelineDateParts(a.date);
  const pb = parseTimelineDateParts(b.date);
  if (!pa && !pb) return 0;
  if (!pa) return 1;
  if (!pb) return -1;
  if (pa.year !== pb.year) return pa.year - pb.year;
  if (pa.month !== pb.month) return pa.month - pb.month;
  if (pa.day !== pb.day) return pa.day - pb.day;
  return a.id.localeCompare(b.id);
}

// ── Main Generation Flow ─────────────────────────────────────────────

function main() {
  console.log(`Reading core database from: ${CORE_JSON_PATH}`);
  if (!fs.existsSync(CORE_JSON_PATH)) {
    console.error(`Error: core.json not found at ${CORE_JSON_PATH}`);
    process.exit(1);
  }

  const rawData = fs.readFileSync(CORE_JSON_PATH, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(rawData);
  } catch (e) {
    console.error(`Error parsing core.json:`, e);
    process.exit(1);
  }

  const characters = parsed?.characters || {};
  if (typeof characters !== 'object' || Array.isArray(characters)) {
    console.error(`Error: 'characters' property is not a valid object in core.json`);
    process.exit(1);
  }

  const events = [];

  Object.keys(characters).forEach((charId) => {
    const char = characters[charId];
    if (!char || typeof char !== 'object') return;
    if (char.redirect) {
      console.log(`Skipping redirected character: ${charId} -> ${char.redirect}`);
      return;
    }

    const charTag = charId.toLowerCase();
    const fullName = char['full name'] || char.navLabel || charId;

    // Process birth
    const birthRaw = getCoreBirthRaw(char);
    if (birthRaw) {
      const birthParts = parseTimelineDateParts(birthRaw);
      if (birthParts) {
        events.push({
          id: `vitals-${charTag}-birth`,
          date: birthRaw,
          title: `${fullName} is Born`,
          description: `The beginning of the documented path for ${fullName}.`,
          tags: [charTag, 'vitals', 'birth']
        });
      } else {
        console.warn(`Warning: Invalid birthDate format "${birthRaw}" for character "${charId}"`);
      }
    }

    // Process death
    const deathRaw = getCoreDeathRaw(char);
    if (deathRaw) {
      const deathParts = parseTimelineDateParts(deathRaw);
      if (deathParts) {
        events.push({
          id: `vitals-${charTag}-death`,
          date: deathRaw,
          title: `${fullName} Passes Away`,
          description: `The conclusion of the documented path for ${fullName}.`,
          tags: [charTag, 'vitals', 'death']
        });
      } else {
        console.warn(`Warning: Invalid deathDate format "${deathRaw}" for character "${charId}"`);
      }
    }
  });

  // Sort chronologically (BC first, then AD, stable sorting)
  events.sort(compareEvents);

  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const todayStr = `${yyyy}-${mm}-${dd}`;

  // Format as timeline entries separated by <!-- entry-break -->
  const formattedEntries = events.map((event) => {
    const yamlMeta = `date: "${event.date}"\ntitle: "${event.title}"\ntags:\n  - "${event.tags[0]}"\n  - "${event.tags[1]}"\n  - "${event.tags[2]}"\nid: "${event.id}"\ndatecreated: "${todayStr}"`;
    return `---\n${yamlMeta}\n---\n${event.description}`;
  });

  const outputContent = formattedEntries.join('\n\n<!-- entry-break -->\n\n') + '\n';

  // Ensure output directory exists and write file (UTF-8 without BOM)
  const dir = path.dirname(VITALS_MD_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(VITALS_MD_PATH, outputContent, 'utf8');
  console.log(`Successfully generated ${events.length} vitals entries in: ${VITALS_MD_PATH}`);
}

if (require.main === module) {
  main();
}
