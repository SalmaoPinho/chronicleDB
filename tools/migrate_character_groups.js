const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const STORIES_DIR = path.join(ROOT_DIR, 'stories');

function migrateCoreJson(corePath) {
  console.log(`Checking core.json at ${corePath}...`);
  try {
    const data = fs.readFileSync(corePath, 'utf8');
    const parsed = JSON.parse(data);

    if (!parsed || !parsed.characters) {
      console.log(`No characters found in ${corePath}. Skipping.`);
      return;
    }

    let modified = false;
    Object.keys(parsed.characters).forEach(charId => {
      const char = parsed.characters[charId];
      if (!char || typeof char !== 'object' || char.redirect) {
        return;
      }

      let groups = char.groups;
      if (groups === undefined || groups === null) {
        groups = [];
      } else if (typeof groups === 'string') {
        groups = groups.split(',').map(s => s.trim()).filter(Boolean);
      }

      // Default mapping: if groups is empty, try to populate from navGroup
      if (groups.length === 0 && char.navGroup) {
        groups.push(char.navGroup);
      }

      // Always ensure navGroup is one of the groups if it's set
      if (char.navGroup && !groups.includes(char.navGroup)) {
        groups.push(char.navGroup);
      }

      // Deduplicate and clean up
      const cleanedGroups = Array.from(new Set(groups.map(g => String(g || '').trim()).filter(Boolean)));
      
      const currentGroupsStr = JSON.stringify(char.groups || []);
      const newGroupsStr = JSON.stringify(cleanedGroups);

      if (currentGroupsStr !== newGroupsStr) {
        char.groups = cleanedGroups;
        modified = true;
        console.log(`  Character '${charId}': ${currentGroupsStr} -> ${newGroupsStr}`);
      }
    });

    if (modified) {
      fs.writeFileSync(corePath, JSON.stringify(parsed, null, 2) + '\n', 'utf8');
      console.log(`Saved updates to ${corePath}`);
    } else {
      console.log(`No changes needed for ${corePath}`);
    }
  } catch (err) {
    console.error(`Error processing ${corePath}:`, err);
  }
}

function findCoreJsons(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(findCoreJsons(fullPath));
    } else if (file === 'core.json') {
      results.push(fullPath);
    }
  });
  return results;
}

if (fs.existsSync(STORIES_DIR)) {
  const corePaths = findCoreJsons(STORIES_DIR);
  corePaths.forEach(migrateCoreJson);
} else {
  console.error(`Stories directory not found at ${STORIES_DIR}`);
}
