const fs = require('fs');

const chars = [
  "abraham", "adaeze", "adina", "adwoa", "akira", "albani", "aldric", "alice",
  "amara", "andreas", "ashton-vane", "bert", "blossom", "brianna", "calypso", "cerise",
  "clint-fo", "cruor", "dalbit", "dana", "dani", "denise", "dolly", "dolores",
  "donna", "drummond", "eliphaz", "elliot", "ethan", "fallow", "faro", "fernanda",
  "frost", "garfield", "gershon", "gina", "halyna", "hao", "helena", "hiroshi",
  "hwan", "isa", "james", "janet", "jason", "jerry", "joel", "june", "kai",
  "konstantinos", "kwame", "lenora", "liberty", "linus", "liora", "liss", "liu",
  "lucinda", "mallow", "mandela", "margaret", "marie", "mauro", "max", "mercy", "messi",
  "mikhail", "mirae", "miriam", "mud-tooth", "nightcracker", "nightingale", "olivia",
  "pace", "petra", "pyotr", "qing", "ray-cross", "relampago", "rodrigo", "ronan",
  "rue", "sable", "sabrina", "sally", "shem", "simmons", "sio", "sterling", "su",
  "tara", "theo", "tian", "tommy-reyes", "uncle", "vector", "viviane", "xiao",
  "zhen", "zola"
];

const places = [
  "aldenmere", "aldercross", "ark", "aztlan", "cage", "flowing-gate", "foundry",
  "green-corridor", "guidestones", "henderson-branch", "hollow-earth", "lubumbashi",
  "merchant-district", "orphanage", "sato-house", "tatui", "tokyo",
  "underground", "washington"
];

const countries = [
  "drc", "europe", "russia", "ukraine", "ghana", "mongolia", "persia"
];

const organizations = [
  "acu", "afrique", "bandeira", "covenant", "criterion", "dead-air", "h.o.t.",
  "irs", "ishtar", "middle-cohort", "people-press", "satoplays", "wayfarers",
  "verdant-initiative"
];

const themes = [
  "accountability", "antagonist", "between-spaces", "charity",
  "closure", "cute", "dark", "domestic", "faith", "isolation",
  "leverage", "redemption", "rehabilitation", "retirement",
  "rivalry", "secret-identity", "social", "transparency", "world"
];

const topics = [
  "civil-rights", "college", "comics", "commission", "cross", "dimensional",
  "documentary", "eng", "faction", "harris-lineage", "identity",
  "injected-tag-test", "ironside", "kazakh", "legal", "load-bearing",
  "magic", "medusa", "meta-human", "moon", "pangean", "performance", "pinketto",
  "rail", "reconstruction", "rusalki", "song", "soul-sight", "still",
  "stream", "sunrise", "terraforming", "trafficking", "true-crime", "twilight",
  "vanguard-legacy", "westons"
];

const events = [
  "declaration", "graduation", "pandemic", "purge", "truce"
];

const items = [
  "artifact", "artifacts", "biscuit", "blair", "bone", "bonnie-clyde", "chassis", "chocolate", "cyan",
  "holy-grail", "mirror", "muster", "nph", "saxophone", "strangelove", "tree"
];

function toTitleCase(tag) {
  if (tag.toLowerCase() === 'drc') return 'DRC';
  if (tag.toLowerCase() === 'acu') return 'ACU';
  if (tag.toLowerCase() === 'irs') return 'IRS';
  if (tag.toLowerCase() === 'h.o.t.') return 'H.O.T.';
  if (tag.toLowerCase() === 'nph') return 'NPH';
  return tag.split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

const coreJsonPath = 'c:/Projects/character-manager/stories/earthborn/core.json';
const entitiesJsonPath = 'c:/Projects/character-manager/stories/earthborn/entities.json';

const core = JSON.parse(fs.readFileSync(coreJsonPath, 'utf8'));
const entities = JSON.parse(fs.readFileSync(entitiesJsonPath, 'utf8'));

// 1. Update core.json characters
let charsAdded = 0;
for (const char of chars) {
  const lower = char.toLowerCase();
  if (!core.characters[lower]) {
    core.characters[lower] = {
      "full name": toTitleCase(char),
      "gender": "unknown",
      "ethnicity": "unknown",
      "navGroup": "Extended Cast",
      "groups": ["Extended Cast"],
      "iconKey": "social"
    };
    charsAdded++;
  }
}

// Helper to update entities category
let entitiesAdded = 0;
function updateCategory(categoryName, list, defaultIcon, defaultTag) {
  if (!entities[categoryName]) {
    entities[categoryName] = {};
  }
  for (const item of list) {
    const lower = item.toLowerCase();
    if (!entities[categoryName][lower]) {
      entities[categoryName][lower] = {
        "name": toTitleCase(item),
        "iconKey": defaultIcon,
        "tags": [defaultTag]
      };
      entitiesAdded++;
    }
  }
}

updateCategory("places", places, "map-pin", "location");
updateCategory("countries", countries, "landmark", "geopolitical");
updateCategory("organizations", organizations, "shield", "organization");
updateCategory("themes", themes, "tag", "theme");
updateCategory("topics", topics, "tag", "theme");
updateCategory("events", events, "tag", "theme");
updateCategory("items", items, "tag", "theme");

// Write back core.json
fs.writeFileSync(coreJsonPath, JSON.stringify(core, null, 2) + '\n', 'utf8');
console.log(`Updated core.json: Added ${charsAdded} characters.`);

// Write back entities.json
fs.writeFileSync(entitiesJsonPath, JSON.stringify(entities, null, 2) + '\n', 'utf8');
console.log(`Updated entities.json: Added ${entitiesAdded} entities.`);
