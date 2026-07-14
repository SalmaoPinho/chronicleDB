const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT_DIR = path.resolve(__dirname, '..');
const NOTEBOOK_DIR = path.join(ROOT_DIR, 'story', 'notebooks');

function cleanText(val) {
  if (typeof val !== 'string') return '';
  return val.trim();
}

function slugifyNotebookId(val, fallback = 'notebook') {
  if (typeof val !== 'string') val = String(val || '');
  let slug = val
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}

function parseNotebookImportText(rawText) {
  const fields = {};
  let body = rawText;
  const fmMatch = rawText.match(/^---\s*[\r\n]+([\s\S]*?)[\r\n]+---\s*[\r\n]*/);
  if (fmMatch) {
    body = rawText.slice(fmMatch[0].length);
    try {
      const parsed = yaml.load(fmMatch[1]);
      if (parsed && typeof parsed === 'object') {
        Object.assign(fields, parsed);
      }
    } catch (e) {
      console.error('Failed to parse YAML frontmatter in import', e);
    }
  }
  return { fields, body };
}

function buildNotebookMarkdown(payload) {
  const {
    notebookId,
    number,
    title,
    subtitle,
    metadata,
    filename,
    entryId,
    entryTitle,
    entryDate,
    rawMarkdown,
    stickers,
    coverDoodles
  } = payload;

  const fm = {
    id: notebookId,
    number: number !== undefined ? Number(number) : 0,
    title: title || '',
    subtitle: subtitle || '',
    metadata: metadata || '',
    stickers: Array.isArray(stickers) ? stickers : [],
    coverDoodles: Array.isArray(coverDoodles) ? coverDoodles : []
  };

  const yamlStr = yaml.dump(fm).trim();
  
  // Format body with Entry header if not already present
  let body = rawMarkdown.trim();
  if (!body.startsWith('# Entry:')) {
    body = `# Entry: ${entryId}\n> Date: ${entryDate}\n> Title: ${entryTitle}\n\n${body}`;
  }

  const markdown = `---\n${yamlStr}\n---\n\n${body}\n`;
  
  const manifestEntry = {
    id: fm.id,
    number: fm.number,
    title: fm.title,
    subtitle: fm.subtitle,
    metadata: fm.metadata,
    stickers: fm.stickers,
    coverDoodles: fm.coverDoodles,
    filename: filename || `nb_${fm.id}.md`
  };

  return {
    filename: filename || `nb_${fm.id}.md`,
    markdown,
    notebookId,
    manifestEntry
  };
}

function compileNotebooks(notebookDir = NOTEBOOK_DIR) {
  if (!fs.existsSync(notebookDir)) {
    fs.mkdirSync(notebookDir, { recursive: true });
  }
  const files = fs.readdirSync(notebookDir);
  const notebooks = [];

  for (const file of files) {
    if (file.endsWith('.md') && file.startsWith('nb_')) {
      const absPath = path.join(notebookDir, file);
      const content = fs.readFileSync(absPath, 'utf8');
      const fmMatch = content.match(/^---\s*[\r\n]+([\s\S]*?)[\r\n]+---\s*[\r\n]*/);
      
      let fm = {};
      if (fmMatch) {
        try {
          fm = yaml.load(fmMatch[1]) || {};
        } catch (e) {
          console.error(`Failed to parse YAML in ${file}:`, e);
        }
      }

      // Fill in fallback values if YAML didn't specify them
      const id = fm.id || file.replace(/^nb_/, '').replace(/\.md$/, '');
      const number = fm.number !== undefined ? Number(fm.number) : 999;
      const title = fm.title || id;
      const subtitle = fm.subtitle || '';
      const metadata = fm.metadata || '';
      const stickers = Array.isArray(fm.stickers) ? fm.stickers : [];
      const coverDoodles = Array.isArray(fm.coverDoodles) ? fm.coverDoodles : [];

      notebooks.push({
        id,
        number,
        title,
        subtitle,
        metadata,
        stickers,
        coverDoodles,
        filename: file
      });
    }
  }

  // Sort by number ascending, then ID
  notebooks.sort((a, b) => {
    if (a.number !== b.number) {
      return a.number - b.number;
    }
    return a.id.localeCompare(b.id);
  });

  const manifest = { notebooks };
  fs.writeFileSync(
    path.join(notebookDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
    'utf8'
  );

  console.log(`Compiled ${notebooks.length} notebooks into manifest.json`);
  return manifest;
}

module.exports = {
  NOTEBOOK_DIR,
  buildNotebookMarkdown,
  compileNotebooks,
  cleanText,
  parseNotebookImportText,
  slugifyNotebookId
};
