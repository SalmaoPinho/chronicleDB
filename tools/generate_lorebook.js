const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const CORE_JSON_PATH = path.join(ROOT_DIR, 'stories', 'earthborn', 'core.json');
const EXPORT_MD_PATH = path.join(ROOT_DIR, 'stories', 'earthborn', 'export.md');
const OUTPUT_PATH = path.join(ROOT_DIR, 'stories', 'earthborn', 'ashford_fairmount_lorebook.json');

console.log('📖 Starting SillyTavern Lorebook Compiler...');

// 1. Validate paths
if (!fs.existsSync(CORE_JSON_PATH)) {
  console.error(`❌ Character Core database not found at: ${CORE_JSON_PATH}`);
  process.exit(1);
}
if (!fs.existsSync(EXPORT_MD_PATH)) {
  console.error(`❌ Export backstory dossier not found at: ${EXPORT_MD_PATH}`);
  process.exit(1);
}

// 2. Load core.json
let core;
try {
  core = JSON.parse(fs.readFileSync(CORE_JSON_PATH, 'utf8'));
} catch (e) {
  console.error(`❌ Failed to parse core.json: ${e.message}`);
  process.exit(1);
}

const characters = core.characters || {};
console.log(`✅ Loaded ${Object.keys(characters).length} character profiles from core.json.`);

// 3. Load export.md and parse POV dossiers
const exportText = fs.readFileSync(EXPORT_MD_PATH, 'utf8');
const characterDossiers = {};

// Parse export.md sections
// Sections are separated by "* Character: Name (id)" or "* Protagonist: Name (id)"
const sectionRegex = /\*\s*(Character|Protagonist):\s*([^\(]+)\s*\(([^\)]+)\)/g;
let match;
const sections = [];

while ((match = sectionRegex.exec(exportText)) !== null) {
  sections.push({
    index: match.index,
    header: match[0],
    type: match[1],
    name: match[2].trim(),
    id: match[3].trim()
  });
}

for (let i = 0; i < sections.length; i++) {
  const current = sections[i];
  const startIdx = current.index + current.header.length;
  const endIdx = (i + 1 < sections.length) ? sections[i + 1].index : exportText.length;
  
  let contentText = exportText.substring(startIdx, endIdx).trim();
  // Strip out leading hyphens/bullets or empty lines to keep it clean
  contentText = contentText.replace(/^\s*[\-\*]\s*/gm, '').trim();
  
  characterDossiers[current.id] = contentText;
}

console.log(`✅ Extracted ${Object.keys(characterDossiers).length} detailed POVs from export.md.`);

// 4. Resolve redirects / aliases
const aliasMapping = {}; // key: canonical ID, value: array of alias strings
Object.keys(characters).forEach(id => {
  const char = characters[id];
  if (char.redirect) {
    const target = char.redirect;
    if (!aliasMapping[target]) {
      aliasMapping[target] = [];
    }
    aliasMapping[target].push(id);
  }
});

// 5. Build Lorebook entries
const entries = [];
let uidCounter = 0;

// Helper to normalize and capitalize names
const titleCase = (str) => {
  if (!str) return '';
  return str.replace(/\b\w/g, c => c.toUpperCase());
};

Object.keys(characters).forEach(id => {
  const char = characters[id];
  if (char.redirect) return; // Skip redirects, they will trigger their canonical forms

  const fullName = titleCase(char['full name'] || id);
  const affiliation = (char.groups && char.groups.length) ? char.groups.join(', ') : (char.navGroup || 'Characters');
  const birthday = char.birthday || char.birthDate || 'Unknown';
  
  // Compile physical traits
  const traits = [];
  if (char.hair) traits.push(`Hair: ${char.hair}`);
  if (char.eyes) traits.push(`Eyes: ${char.eyes}`);
  if (char.face) traits.push(`Face: ${char.face}`);
  if (char.build) traits.push(`Build: ${char.build}`);
  if (char.ethnicity) traits.push(`Ethnicity: ${char.ethnicity}`);
  if (char.gender) traits.push(`Gender: ${char.gender}`);

  // Fetch Jess's notebook POV details from export.md
  const backstoryPOV = characterDossiers[id] || '';

  // Assemble the Lorebook Content block
  let content = `Character Profile: ${fullName}\n`;
  content += `Slugs/IDs: ${id}\n`;
  if (affiliation) content += `Affiliation: ${affiliation}\n`;
  if (birthday) content += `Birthday: ${birthday}\n`;
  if (traits.length > 0) {
    content += `Visual Appearance:\n- ${traits.join('\n- ')}\n`;
  }
  if (backstoryPOV) {
    content += `\nNarrative & Background POVs (from Jess Boone's Notebooks):\n${backstoryPOV}\n`;
  }

  // Compile Trigger Keywords
  const keywordsSet = new Set([id]);
  
  // Add parts of full name as trigger keywords
  const nameParts = fullName.toLowerCase().split(/\s+/);
  nameParts.forEach(part => {
    // Skip tiny filler parts
    if (part.length > 2 && part !== 'and' && part !== 'the') {
      keywordsSet.add(part);
    }
  });

  // Add all redirect aliases as trigger keywords
  if (aliasMapping[id]) {
    aliasMapping[id].forEach(alias => {
      keywordsSet.add(alias);
    });
  }

  const triggerKeys = Array.from(keywordsSet).join(', ');

  // Create Lorebook Entry object
  entries.push({
    uid: uidCounter++,
    key: triggerKeys,
    keysecondary: '',
    comment: `Character: ${fullName}`,
    content: content.trim(),
    constant: false,
    selective: true,
    order: 100,
    depth: 4,
    enabled: true,
    position: 'after_char',
    use_regex: false,
    extensions: {
      position: 1,
      probability: 100,
      useProbability: false,
      depth: 4,
      selectiveLogic: 0,
      group: group
    }
  });
});

console.log(`✅ Compiled ${entries.length} character lorebook entries.`);

// 6. Inject Global World Lore Bibles (Limbo, Factions, Timelines)
const worldBibles = [
  {
    keys: 'Limbo, dream pathway, dreaming consciousness, limbo collapse',
    comment: 'World Lore: Limbo Dimension',
    group: 'World Lore',
    content: `Limbo (The Dream Pathway):
- Metaphysics and Origin: Limbo is a vast, structured dream pathway that serves as the primary transit corridor and source of most supernatural and anomalous phenomena in the Ashford & Fairmount universe.
- Roboter's Dreaming Consciousness: The dimension was organized, anchored, and held in physical structure entirely by Roboter's indestructible dreaming consciousness when he went dormant ("died") in September 1973.
- Collapse (2039): When Roboter was resurrected and woke up from his dormancy in 2039, the dreaming mind anchoring Limbo returned to waking reality. Consequently, Limbo collapsed completely, dissolving the dream pathway and bringing an end to the supernatural transit corridor.`
  },
  {
    keys: 'Roboter, Atchison crew, ancient robot',
    comment: 'World Lore: Roboter',
    group: 'World Lore',
    content: `Roboter (Autonomous anomalous agent):
- Creation (-2400 BC): An ancient, non-human, hyper-capable autonomous agent created during the Watcher breach in ancient Pangea.
- Reawakenings:
  - 1930s (Fairmount): Roboter reawakens, establishing the foundational research that leads to the anomalous engineering of Fairmount.
  - 2030s-2040s (Pangean Prototype): Wakes from his 1973 dormancy in 2039. Reclassified as the "Antichrist" by religious scholars, Roboter undergoes a Pangean reawakening, serving as a central, silent observer and protector.
- Partners: Maintained a 50-year partnership of deep mutual accountability and regret with Osha Kelley on the Atchison crew, building Fairmount's infrastructure from the air until they were shut down in 1966.`
  },
  {
    keys: 'Vanguard, Sarah Kelley, sarah',
    comment: 'World Lore: The Vanguard',
    group: 'World Lore',
    content: `The Vanguard (Sarah Kelley):
- Concept: Sarah Kelley is a recurring, reincarnating core repeating character representing exactness, supreme competence, and absolute human agency.
- Purpose: She recurs across history (from ancient Pangean eras to modern Fairmount) as a natural counterweight to the institutional control and subjugation of The Order.
- Voss Conflict: Driven by a pathological need to save broken things, Vanguard tried to protect a young Patricia Voss. Voss, viewing relationships purely as possessive ownership, became obsessed with Vanguard. This culminated in Voss withholding warning of the nuclear strike in Australia to prevent Vanguard from dying while trying to stop it—wiping out the continent and causing Vanguard to permanently reject Voss, caging her muse.`
  },
  {
    keys: 'Shadow Unit, shadow resistance, clint resistance',
    comment: 'World Lore: The Shadow Unit',
    group: 'World Lore',
    content: `The Shadow Unit (Grassroots Resistance):
- Founding (2027): An anti-establishment, highly competent black-ops resistance cell dedicated to dismantling corporate hegemony and contesting Meridian Corporation/Order operations. Founded by Clint Harris (Azure Knight), Elena Vasquez (Shade), and Gareth Ellis (Ghost).
- Roster: Clint, Elena (Shade), Gareth (Ghost), Daniela Murphy (Volt), Aleksei Voss (Whisper), Carmen Reyes (Tempest), Tobias, Lina Braun (Encore), Jess Boone (Jester), and Mike (Polaris).
- Tone: Highly competent, cold pragmatism. Operates through spreadsheets-with-legs competence and tactical subversion rather than standard heroic tropes.`
  },
  {
    keys: 'Militia Unit, corporate black ops, Arthur Vance, Meridian force',
    comment: 'World Lore: The Militia Unit',
    group: 'World Lore',
    content: `The Militia Unit (Establishment Security):
- Concept: A highly structured, corporate-backed establishment security force and black-ops arm of Meridian Corporation (started in 2008). Operates on corporate contracts, managed interests, and institutional security.
- Roster: Arthur Vance (Midnight, operational lead until 2025), Caleb Sterling (Aero), Chloe Mercer (Viridian), Luke Smith (Killjoy), David Park (Conjurer), and Naomi Sato.
- Conflict: Locked in asymmetrical administrative and tactical warfare against the Shadow Unit, though boundaries between security and grassroots survival are constantly shifting.`
  },
  {
    keys: 'The Order, Nimrod, lineage of control, secret society',
    comment: 'World Lore: The Order',
    group: 'World Lore',
    content: `The Order:
- Lineage of Control: A secretive, ancient, and deeply institutional organization tracing its roots back to ancient epochs (established in -2200 BC by Nimrod).
- Objective: To manage human history, control geopolitical vectors, suppress anomalous awareness, and enforce conformity. Operates from the shadows by establishing banking cartels, military groups, and political dynasties. Elena Volkov (Wraith) operates at its highest levels.`
  },
  {
    keys: 'WWIII, Cuban Crisis, Long War, global realignment',
    comment: 'World Lore: World War III Realignment',
    group: 'World Lore',
    content: `Post-WWIII Realignment:
- 1962 Cuban Crisis & WWIII: In 1962, a geopolitical flashpoint triggers a nuclear exchange, escalating into World War III.
- The Long War: This exchange fractures the globe, initiating "The Long War" and splitting the world into two competing superpowers: Oceania and the Eurasian Directorate. Underground bunkers and militarized fallout zones define populations.
- Japan\'s Exemption: Japan was notably NOT nuked during the WWIII exchanges, allowing it to preserve its advanced infrastructure and emerge as a hyper-technological powerhouse. Its primary tech metropolis is Lechun.`
  },
  {
    keys: 'Fairmount, Ashford, grace fellowship',
    comment: 'World Lore: Ashford & Fairmount Setting',
    group: 'World Lore',
    content: `Setting:
- Ashford, USA: A quiet, seemingly safe suburban community characterized by petty high school social hierarchies, intense observations, and hidden emotional currents. Home of Ashford High School.
- Fairmount, USA: A volatile, opsec-dense, deep-state intelligence hub populated by veterans carrying crushing ledgers of military guilt. Features corruption, dangerous streets, and the vigilante patrol routes of the Azure Knight.`
  }
];

worldBibles.forEach(bible => {
  entries.push({
    uid: uidCounter++,
    key: bible.keys,
    keysecondary: '',
    comment: bible.comment,
    content: bible.content.trim(),
    constant: false,
    selective: true,
    order: 50, // Higher priority for core lore bibles
    depth: 4,
    enabled: true,
    position: 'after_char',
    use_regex: false,
    extensions: {
      position: 1,
      probability: 100,
      useProbability: false,
      depth: 4,
      selectiveLogic: 0,
      group: bible.group
    }
  });
});

console.log(`✅ Injected ${worldBibles.length} global world lore bibles.`);

// 7. Write the Lorebook JSON file
const lorebookPayload = {
  entries: entries,
  name: 'Ashford & Fairmount Lorebook'
};

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(lorebookPayload, null, 2), 'utf8');

console.log(`\n🎉 SUCCESS! Compiled SillyTavern Lorebook written to:\n📁 ${OUTPUT_PATH}\n`);
console.log('💡 How to Import to SillyTavern:');
console.log('1. Open SillyTavern and click on the "World Info" (globe icon) tab.');
console.log('2. Click "Import" and select the generated "ashford_fairmount_lorebook.json" file.');
console.log('3. All entries will be beautifully sorted by Factions/Groups with automated triggers configured! enjoy storytelling! 🕵️‍♂️✨');
