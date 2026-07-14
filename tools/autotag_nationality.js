const fs = require('fs');
const path = require('path');

const corePath = path.resolve(__dirname, '../stories/earthborn/core.json');

if (!fs.existsSync(corePath)) {
  console.error(`core.json not found at ${corePath}`);
  process.exit(1);
}

const raw = fs.readFileSync(corePath, 'utf8');
const data = JSON.parse(raw);

const exceptions = {
  russian: ['wraith', 'ana', 'pyotr', 'klara'],
  brazilian: ['bea', 'luana', 'paulo', 'thales-scott'],
  british: ['ivy', 'amy', 'piper', 'dandy-jack', 'harris'],
  polish: ['catherine'],
  ghanaian: ['amara'],
  nigerian: ['zuri'],
  pangean: ['roboter', 'nimrod', 'enoch'],
  indian: ['priya', 'tara'],
  japanese: ['lotus', 'rin', 'yamato'],
  taiwanese: ['mei'],
  chinese: ['wei', 'wei-wukong']
};

// Map each character to their nationality for fast lookup
const charToNat = {};
Object.entries(exceptions).forEach(([nat, chars]) => {
  chars.forEach(charId => {
    charToNat[charId.toLowerCase().trim()] = nat;
  });
});

let count = 0;
Object.entries(data.characters).forEach(([id, char]) => {
  if (char.redirect) return;

  const lowerId = id.toLowerCase().trim();
  const targetNat = charToNat[lowerId] || 'american';

  char.nationality = targetNat;
  count++;
});

fs.writeFileSync(corePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
console.log(`Successfully autotagged ${count} characters' nationalities in core.json.`);
console.log(`Defaulted to 'american' with exceptions:`);
Object.entries(exceptions).forEach(([nat, chars]) => {
  console.log(`  - ${nat}: ${chars.join(', ')}`);
});
