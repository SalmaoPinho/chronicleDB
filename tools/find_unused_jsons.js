const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const IGNORE_DIRS = new Set(['.git', 'node_modules', '.venv', 'venv', 'dist', 'build']);
const TEXT_EXTS = new Set(['.js', '.ts', '.jsx', '.tsx', '.html', '.md', '.py', '.json', '.css', '.txt']);

function walk(dir) {
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (IGNORE_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...walk(full));
    } else if (e.isFile()) {
      out.push(full);
    }
  }
  return out;
}

function isTextFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return TEXT_EXTS.has(ext);
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    return '';
  }
}

function main() {
  const allFiles = walk(ROOT);
  const jsonFiles = allFiles.filter(f => f.toLowerCase().endsWith('.json'));

  const textFiles = allFiles.filter(isTextFile);

  const textContents = {};
  for (const f of textFiles) {
    textContents[f] = readText(f);
  }

  const report = { generatedAt: new Date().toISOString(), candidates: [], details: {} };

  for (const jf of jsonFiles) {
    const rel = path.relative(ROOT, jf).replace(/\\/g, '/');
    const base = path.basename(jf);
    let refs = [];
    for (const tf of Object.keys(textContents)) {
      if (tf === jf) continue;
      const txt = textContents[tf];
      if (!txt) continue;
      if (txt.includes(rel) || txt.includes(base)) {
        refs.push(path.relative(ROOT, tf).replace(/\\/g, '/'));
      }
    }

    report.details[rel] = { path: rel, references: refs };
    if (refs.length === 0) {
      report.candidates.push(rel);
    }
  }

  const outPath = path.join(ROOT, 'tools', 'unused_json_report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`Report written to ${outPath}`);
}

main();
