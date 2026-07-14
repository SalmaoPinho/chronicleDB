#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function toPosix(p) {
  return String(p || '').replace(/\\/g, '/');
}

function findYearFiles(root) {
  const results = [];
  function walk(dir) {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      return;
    }
    for (const ent of entries) {
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(abs);
        continue;
      }
      if (!ent.isFile()) continue;
      if (!ent.name.toLowerCase().endsWith('.json')) continue;
      results.push(abs);
    }
  }
  walk(root);
  return results;
}

function loadJsonSafe(file) {
  try {
    const text = fs.readFileSync(file, 'utf8');
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

function normalizeEntryList(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.entries)) return payload.entries;
  return [];
}

function renderBlockAsMarkdown(block) {
  if (!block || typeof block !== 'object') return '';
  const t = String(block.type || '').toLowerCase();
  if (t === 'table' || Array.isArray(block.rows)) {
    const rows = Array.isArray(block.rows) ? block.rows : [];
    return rows.map((r) => {
      const label = r.label || r.name || '';
      const img = r.img || r.image || '';
      const notes = r.imgnotes || '';
      const value = r.value || r.note || '';
      return `- **${label}**\n\n  ${value ? value + '\\n\\n' : ''}${img ? `  _image_: ${img}\\n\\n` : ''}${notes ? `  _notes_: ${notes}\\n` : ''}`;
    }).join('\n');
  }
  if (t === 'field-note' || t === 'rich' || block.body) {
    return String(block.body || block.note || '').trim();
  }
  return JSON.stringify(block, null, 2);
}

function usage() {
  console.log('Usage: node tools/export_character.js <characterId> [outDir]');
  process.exit(1);
}

async function main() {
  const argv = process.argv.slice(2);
  if (!argv[0]) return usage();
  const charId = String(argv[0] || '').toLowerCase().trim();
  if (!charId) return usage();
  const outDir = argv[1] ? String(argv[1]) : path.join(process.cwd(), 'exports', 'characters');
  const yearsRoot = path.join(process.cwd(), 'data', 'characters', 'years');

  const files = findYearFiles(yearsRoot);
  const found = [];

  for (const abs of files) {
    const rel = toPosix(path.relative(process.cwd(), abs));
    const payload = loadJsonSafe(abs);
    if (!payload) continue;
    const entries = normalizeEntryList(payload);
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') continue;
      const id = String(entry.id || '').toLowerCase().trim();
      if (!id) continue;
      if (id === charId) {
        // attempt to derive year from filename
        const filename = path.basename(abs);
        const yearMatch = filename.match(/^(\d{4})/);
        const year = yearMatch ? yearMatch[1] : '';
        found.push({ source: rel, year, entry });
      }
    }
  }

  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outJson = path.join(outDir, `${charId}.json`);
  const outMd = path.join(outDir, `${charId}.md`);

  fs.writeFileSync(outJson, JSON.stringify(found, null, 2) + '\n', 'utf8');

  const mdParts = [];
  mdParts.push(`# Character Export: ${charId}\n`);
  if (!found.length) {
    mdParts.push('_No entries found._\n');
  }
  for (const item of found) {
    mdParts.push(`## Source: ${item.source} ${item.year ? `(Year: ${item.year})` : ''}\n`);
    const e = item.entry;
    mdParts.push(`- **id**: ${e.id || ''}`);
    mdParts.push(`- **title**: ${e.title || e.navLabel || ''}`);
    mdParts.push(`- **navGroup**: ${e.navGroup || ''}`);
    if (e.authorNote) mdParts.push(`- **authorNote**: ${e.authorNote}\n`);
    if (Array.isArray(e.blocks)) {
      mdParts.push('\n### Blocks\n');
      for (const block of e.blocks) {
        mdParts.push(`#### ${block.label || block.type || 'Block'}\n`);
        mdParts.push(renderBlockAsMarkdown(block) + '\n');
      }
    }
    mdParts.push('\n```json\n' + JSON.stringify(e, null, 2) + '\n```\n');
  }

  fs.writeFileSync(outMd, mdParts.join('\n'), 'utf8');

  console.log('Export completed:', outJson, outMd);
}

main().catch((err) => {
  console.error('Export failed', err);
  process.exit(2);
});
