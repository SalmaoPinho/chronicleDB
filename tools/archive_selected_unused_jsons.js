const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const reportPath = path.join(ROOT, 'tools', 'unused_json_report.json');
if (!fs.existsSync(reportPath)) {
  console.error('Report not found:', reportPath);
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const candidates = report.candidates || [];

const safePatterns = [
  /^\.chainlit\//,
  /^chat\/\.chainlit\//,
  /^archives\/crossover\//,
  /^tools\/test\.notebook\.json$/,
  /^tempscripts\/character_birthday_icon_focus\.json$/,
  /^tempscripts\/missing_birthday_icon_audit\.json$/,
  /^\.vscode\//
];

const outRoot = path.join(ROOT, 'archives', 'unused_jsons');
function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }
ensureDir(outRoot);

const moved = [];
for (const rel of candidates) {
  const match = safePatterns.some((re) => re.test(rel));
  if (!match) continue;
  const src = path.join(ROOT, rel);
  if (!fs.existsSync(src)) continue;
  const dest = path.join(outRoot, rel);
  ensureDir(path.dirname(dest));
  try {
    fs.renameSync(src, dest);
    moved.push(rel);
    console.log('Moved', rel);
  } catch (e) {
    try {
      // fallback to copy+unlink
      fs.copyFileSync(src, dest);
      fs.unlinkSync(src);
      moved.push(rel);
      console.log('Copied+removed', rel);
    } catch (err) {
      console.error('Failed to move', rel, err.message);
    }
  }
}

const outReport = path.join(ROOT, 'tools', 'archived_unused_jsons.json');
fs.writeFileSync(outReport, JSON.stringify({ moved, timestamp: new Date().toISOString() }, null, 2));
console.log('Archive complete. Report:', outReport);
