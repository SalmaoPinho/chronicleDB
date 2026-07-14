const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const STORIES_DIR = path.join(ROOT_DIR, 'stories');

// Helper to clean punctuation and get the last word as surname
function getSurname(fullName) {
  if (!fullName || typeof fullName !== 'string') return null;
  // Clean parentheticals, quotes, and commas
  let cleanName = fullName.replace(/\(.*?\)/g, '')
                          .replace(/['"“”’‘]/g, '')
                          .replace(/[,.]/g, '')
                          .replace(/\s+/g, ' ')
                          .trim();
  const parts = cleanName.split(' ').filter(Boolean);
  if (parts.length < 2) return null; // Needs first & last name
  const lastWord = parts[parts.length - 1].toLowerCase();
  
  // Skip names that aren't real surnames
  const skipWords = new Set(['unknown', 'human', 'precursor', 'unit', 'crew', 'press', 'dynasty', 'front', 'sun', 'court']);
  if (skipWords.has(lastWord) || lastWord.length < 2) return null;
  
  return lastWord;
}

function processStory(storyDir) {
  const corePath = path.join(storyDir, 'core.json');
  const entitiesPath = path.join(storyDir, 'entities.json');

  if (!fs.existsSync(corePath)) return;
  console.log(`\nProcessing story at ${storyDir}...`);

  const core = JSON.parse(fs.readFileSync(corePath, 'utf8'));
  const entities = fs.existsSync(entitiesPath) ? JSON.parse(fs.readFileSync(entitiesPath, 'utf8')) : { organizations: {} };

  if (!core.characters) return;

  // Group character IDs by surname
  const families = {}; // surname -> [ { id, fullName } ]

  Object.keys(core.characters).forEach(id => {
    const char = core.characters[id];
    if (!char || typeof char !== 'object' || char.redirect) return;

    const fullName = char['full name'] || id;
    const surname = getSurname(fullName);
    if (!surname) return;

    if (!families[surname]) {
      families[surname] = [];
    }
    families[surname].push({ id, fullName });
  });

  let coreModified = false;
  let entitiesModified = false;

  // Find families with at least 2 members
  Object.keys(families).forEach(surname => {
    const members = families[surname];
    if (members.length < 2) return; // Only mass-group if size >= 2

    const capitalizedSurname = surname.charAt(0).toUpperCase() + surname.slice(1);
    const familyGroupName = `${capitalizedSurname} Family`;
    const familyEntityId = `${surname}-family`;

    console.log(`Found family: "${familyGroupName}" with ${members.length} members: ${members.map(m => m.id).join(', ')}`);

    // 1. Add to core.json characters' groups
    members.forEach(member => {
      const char = core.characters[member.id];
      if (!char.groups) {
        char.groups = [];
      }
      if (!char.groups.includes(familyGroupName)) {
        char.groups.push(familyGroupName);
        coreModified = true;
        console.log(`  Added "${familyGroupName}" to character "${member.id}"`);
      }
    });

    // 2. Add family as organization to entities.json
    if (!entities.organizations) {
      entities.organizations = {};
    }
    if (!entities.organizations[familyEntityId]) {
      entities.organizations[familyEntityId] = {
        name: familyGroupName,
        iconKey: 'users',
        tags: ['organization']
      };
      entitiesModified = true;
      console.log(`  Created entity "${familyEntityId}" in entities.json`);
    }
  });

  if (coreModified) {
    fs.writeFileSync(corePath, JSON.stringify(core, null, 2) + '\n', 'utf8');
    console.log(`Saved updates to ${corePath}`);
  }
  if (entitiesModified) {
    fs.writeFileSync(entitiesPath, JSON.stringify(entities, null, 2) + '\n', 'utf8');
    console.log(`Saved updates to ${entitiesPath}`);
  }
}

// Scan stories
if (fs.existsSync(STORIES_DIR)) {
  const dirs = fs.readdirSync(STORIES_DIR);
  dirs.forEach(d => {
    const fullPath = path.join(STORIES_DIR, d);
    if (fs.statSync(fullPath).isDirectory()) {
      processStory(fullPath);
    }
  });
}
