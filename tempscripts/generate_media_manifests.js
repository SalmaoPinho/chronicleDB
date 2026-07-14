const fs = require('fs');
const path = require('path');

const MEDIA_EXT_RE = /\.(png|jpe?g|webp|gif|avif|mp4)$/i;

function toPosix(val) {
  return val.replace(/\\/g, '/');
}

function scanDirRecursive(dir, baseDir = dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const absPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(absPath);
      } else if (entry.isFile() && MEDIA_EXT_RE.test(entry.name)) {
        const relPath = path.relative(baseDir, absPath);
        results.push(toPosix(relPath));
      }
    }
  }

  walk(dir);
  return results.sort((a, b) => a.localeCompare(b));
}

function scanDirFlat(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && MEDIA_EXT_RE.test(entry.name)) {
      results.push(entry.name);
    }
  }
  return results.sort((a, b) => a.localeCompare(b));
}

const ROOT_DIR = path.resolve(__dirname, '..');
const STORY_DIR = process.env.CHAR_MGR_STORY_DIR ? path.resolve(ROOT_DIR, process.env.CHAR_MGR_STORY_DIR) : ROOT_DIR;
const PICTURES_DIR = path.join(STORY_DIR, 'pictures');

console.log('Scanning global directories...');
const globalOutfits = scanDirRecursive(path.join(PICTURES_DIR, 'outfits'));
const globalGroups = scanDirRecursive(path.join(PICTURES_DIR, 'group'));
const globalLife123 = scanDirRecursive(path.join(PICTURES_DIR, 'life123'));
const globalLocations = scanDirRecursive(path.join(PICTURES_DIR, 'locations'));
const globalRoboter = scanDirRecursive(path.join(PICTURES_DIR, 'Roboter'));

const generatedAt = new Date().toISOString();

const globalManifest = {
  schemaVersion: 2,
  outfits: globalOutfits,
  groups: globalGroups,
  life123: globalLife123,
  locations: globalLocations,
  roboter: globalRoboter,
  generatedAt
};

fs.writeFileSync(
  path.join(PICTURES_DIR, 'image_index.global.json'),
  JSON.stringify(globalManifest, null, 2) + '\n',
  'utf8'
);
console.log('Generated global manifest at pictures/image_index.global.json');

console.log('Scanning yearly directories...');
const entries = fs.readdirSync(PICTURES_DIR, { withFileTypes: true });
let yearlyCount = 0;
for (const entry of entries) {
  if (entry.isDirectory() && /^\d{4}$/.test(entry.name)) {
    const year = entry.name;
    const yearDir = path.join(PICTURES_DIR, year);

    const portraits = scanDirRecursive(path.join(yearDir, 'portraits'));
    const localGroups = scanDirRecursive(path.join(yearDir, 'groups'));
    const fieldMedia = scanDirFlat(yearDir);

    // Merge year-local groups and global groups
    const mergedGroups = [...localGroups, ...globalGroups].sort((a, b) => a.localeCompare(b));

    const yearManifest = {
      schemaVersion: 2,
      year,
      portraits,
      groups: mergedGroups,
      fieldMedia,
      // Compatibility fields:
      outfits: globalOutfits,
      life123: globalLife123,
      locations: globalLocations,
      roboter: globalRoboter,
      refs: {
        global: '../image_index.global.json'
      },
      generatedAt
    };

    fs.writeFileSync(
      path.join(yearDir, 'image_index.json'),
      JSON.stringify(yearManifest, null, 2) + '\n',
      'utf8'
    );
    yearlyCount++;
  }
}
console.log(`Generated manifests for ${yearlyCount} yearly directories.`);
