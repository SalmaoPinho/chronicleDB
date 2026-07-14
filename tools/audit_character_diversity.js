const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const corePath = path.join(ROOT, 'stories', 'earthborn', 'core.json');

const args = process.argv.slice(2);
const isBackfill = args.includes('--backfill');

if (!fs.existsSync(corePath)) {
  console.error(`Error: core.json not found at ${corePath}`);
  process.exit(1);
}

function runAudit() {
  let rawData;
  try {
    rawData = fs.readFileSync(corePath, 'utf8');
  } catch (error) {
    console.error(`Error reading core.json: ${error.message}`);
    process.exit(1);
  }

  let core;
  try {
    core = JSON.parse(rawData);
  } catch (error) {
    console.error(`Error parsing core.json: ${error.message}`);
    process.exit(1);
  }

  if (!core.characters || typeof core.characters !== 'object') {
    console.error('Error: core.json characters section is invalid.');
    process.exit(1);
  }

  const characters = core.characters;
  const characterIds = Object.keys(characters);
  const totalCharacters = characterIds.filter(id => !characters[id].redirect).length;
  const totalRedirects = characterIds.length - totalCharacters;

  console.log(`=== CHARACTER DIVERSITY AUDIT ===`);
  console.log(`Total active characters (excluding redirects): ${totalCharacters}`);
  console.log(`Total redirects: ${totalRedirects}\n`);

  const missingGender = [];
  const missingEthnicity = [];
  const missingNationality = [];

  const genderBreakdown = {};
  const ethnicityBreakdown = {};
  const nationalityBreakdown = {};

  let modified = false;

  characterIds.forEach(id => {
    const char = characters[id];
    // Skip redirects
    if (char.redirect) return;

    // Check gender
    let gender = char.gender;
    if (gender === undefined || gender === null) {
      missingGender.push(id);
      if (isBackfill) {
        char.gender = 'unknown';
        modified = true;
      }
      gender = 'unknown';
    } else if (gender.trim() === '' || gender.toLowerCase() === 'unknown') {
      missingGender.push(id);
      gender = 'unknown';
    }
    genderBreakdown[gender.toLowerCase()] = (genderBreakdown[gender.toLowerCase()] || 0) + 1;

    // Check ethnicity
    let ethnicity = char.ethnicity;
    if (ethnicity === undefined || ethnicity === null) {
      missingEthnicity.push(id);
      if (isBackfill) {
        char.ethnicity = 'unknown';
        modified = true;
      }
      ethnicity = 'unknown';
    } else if (ethnicity.trim() === '' || ethnicity.toLowerCase() === 'unknown') {
      missingEthnicity.push(id);
      ethnicity = 'unknown';
    }
    ethnicityBreakdown[ethnicity.toLowerCase()] = (ethnicityBreakdown[ethnicity.toLowerCase()] || 0) + 1;

    // Check nationality
    let nationality = char.nationality;
    if (nationality === undefined || nationality === null) {
      missingNationality.push(id);
      if (isBackfill) {
        char.nationality = 'unknown';
        modified = true;
      }
      nationality = 'unknown';
    } else if (nationality.trim() === '' || nationality.toLowerCase() === 'unknown') {
      missingNationality.push(id);
      nationality = 'unknown';
    }
    nationalityBreakdown[nationality.toLowerCase()] = (nationalityBreakdown[nationality.toLowerCase()] || 0) + 1;
  });

  console.log(`--- GAPS & UNTRACKED DATA ---`);
  console.log(`Missing/Unknown Gender: ${missingGender.length} characters`);
  if (missingGender.length > 0 && missingGender.length < 15) {
    console.log(`  List: ${missingGender.join(', ')}`);
  }
  console.log(`Missing/Unknown Ethnicity (Race): ${missingEthnicity.length} characters`);
  if (missingEthnicity.length > 0 && missingEthnicity.length < 15) {
    console.log(`  List: ${missingEthnicity.join(', ')}`);
  }
  console.log(`Missing/Unknown Nationality: ${missingNationality.length} characters`);
  if (missingNationality.length > 0 && missingNationality.length < 15) {
    console.log(`  List: ${missingNationality.join(', ')}`);
  }
  console.log();

  console.log(`--- DEMOGRAPHICS BREAKDOWN ---`);
  console.log(`Gender:`);
  Object.entries(genderBreakdown).forEach(([k, v]) => {
    const pct = ((v / totalCharacters) * 100).toFixed(1);
    console.log(`  - ${k}: ${v} (${pct}%)`);
  });

  console.log(`\nEthnicity (Race):`);
  Object.entries(ethnicityBreakdown).forEach(([k, v]) => {
    const pct = ((v / totalCharacters) * 100).toFixed(1);
    console.log(`  - ${k}: ${v} (${pct}%)`);
  });

  console.log(`\nNationality:`);
  Object.entries(nationalityBreakdown).forEach(([k, v]) => {
    const pct = ((v / totalCharacters) * 100).toFixed(1);
    console.log(`  - ${k}: ${v} (${pct}%)`);
  });
  console.log();

  if (isBackfill && modified) {
    try {
      const output = JSON.stringify(core, null, 2) + '\n';
      fs.writeFileSync(corePath, output, 'utf8');
      console.log(`[Success] Automatically backfilled missing fields with 'unknown' and saved core.json.`);
    } catch (error) {
      console.error(`[Error] Failed to write back to core.json: ${error.message}`);
      process.exit(1);
    }
  } else if (isBackfill) {
    console.log(`[Info] No modifications needed. All characters already possess gender, ethnicity, and nationality fields.`);
  } else {
    console.log(`[Tip] Run with '--backfill' flag to automatically add missing fields as 'unknown' in core.json.`);
  }
}

runAudit();
