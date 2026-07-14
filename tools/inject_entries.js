const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const STORY_DIR = process.env.CHAR_MGR_STORY_DIR || path.join(ROOT_DIR, 'story');
const TIMELINE_SRC = path.join(STORY_DIR, 'newtimeline.md');
const REL_SRC = path.join(STORY_DIR, 'newrelationship.md');
const SORTER_BIN = path.join(ROOT_DIR, 'tools', 'sort_timeline.js');

const REL_MAP = {
  personal: ['family', 'romance', 'friendship', 'personal'],
  operational: ['operation', 'organization', 'partnership'],
  historical: ['incident', 'arc', 'historical'],
  meta: ['note', 'complicated', 'meta']
};

function getRelCategory(type) {
  for (const [cat, types] of Object.entries(REL_MAP)) {
    if (types.includes(type)) return cat;
  }
  return 'meta';
}

function isHeaderOrCommentPrecedingEntry(lines, startIndex) {
  for (let j = startIndex; j < lines.length; j++) {
    const line = lines[j];
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    // Check if this line is the start of a new entry
    const isDateOrIdLine = /^(date|id)\s*:/i.test(trimmed);
    const isStart = isDateOrIdLine || (trimmed === '---' && j < lines.length - 1 && (() => {
      for (let k = j + 1; k < lines.length; k++) {
        const nextTrimmed = lines[k].trim();
        if (!nextTrimmed) continue;
        return /^(date|id|title)\s*:/i.test(nextTrimmed);
      }
      return false;
    })());
    
    if (isStart) {
      return true;
    }
    
    // If it's a header line or a comment line or entry-break, we skip and look ahead
    const isHeader = trimmed.startsWith('#');
    const isComment = (trimmed.startsWith('<!--') || trimmed.endsWith('-->'));
    
    if (isHeader || isComment) {
      continue;
    }
    
    // Any other text means it's not preceding an entry (it's normal body content)
    return false;
  }
  return false;
}

function parseMdBlocs(content) {
  const entries = [];
  const lines = content.split(/\r?\n/);
  
  let currentMetaLines = [];
  let currentBodyLines = [];
  let inMeta = false;
  let hasOpeningFence = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Detect start of a new entry (e.g. date: or id: or a separator leading into one)
    const isDateOrIdLine = /^(date|id)\s*:/i.test(trimmed);
    const isStartOfEntry = !inMeta && (isDateOrIdLine || (trimmed === '---' && i < lines.length - 1 && (() => {
      for (let j = i + 1; j < lines.length; j++) {
        const nextTrimmed = lines[j].trim();
        if (!nextTrimmed) continue;
        return /^(date|id|title)\s*:/i.test(nextTrimmed);
      }
      return false;
    })()));
    
    if (isStartOfEntry && (!inMeta || currentMetaLines.length > 0 || currentBodyLines.length > 0)) {
      if (currentMetaLines.length > 0) {
        const rawMeta = currentMetaLines.join('\n').trim();
        const body = currentBodyLines.join('\n').trim().replace(/<!--\s*entry-break\s*-->/g, '').trim();
        try {
          const meta = yaml.load(rawMeta);
          if (meta && typeof meta === 'object' && (meta.date || meta.title)) {
            entries.push({ meta, rawMeta, body });
          }
        } catch (e) {
          // Ignore invalid YAML
        }
      }
      currentMetaLines = [];
      currentBodyLines = [];
      inMeta = true;
      hasOpeningFence = (trimmed === '---');
      
      if (trimmed === '---') {
        continue;
      }
    }
    
    if (inMeta) {
      if (trimmed === '---') {
        inMeta = false;
        continue;
      }
      
      // If we are in raw (no-fence) mode, check if this line is NOT part of YAML
      if (!hasOpeningFence) {
        const isYamlField = /^[a-zA-Z0-9_-]+\s*:/i.test(trimmed) || /^\s*-\s+/.test(line) || /^\s+/.test(line);
        if (!trimmed || !isYamlField) {
          inMeta = false;
          currentBodyLines.push(line);
          continue;
        }
      }
      
      currentMetaLines.push(line);
    } else {
      if (!isHeaderOrCommentPrecedingEntry(lines, i)) {
        currentBodyLines.push(line);
      }
    }
  }
  
  if (currentMetaLines.length > 0) {
    const rawMeta = currentMetaLines.join('\n').trim();
    const body = currentBodyLines.join('\n').trim().replace(/<!--\s*entry-break\s*-->/g, '').trim();
    try {
      const meta = yaml.load(rawMeta);
      if (meta && typeof meta === 'object' && (meta.date || meta.title)) {
        entries.push({ meta, rawMeta, body });
      }
    } catch (e) {
      // Ignore invalid YAML
    }
  }
  
  return entries;
}

async function inject(destPath, content) {
  let existing = '';
  if (fs.existsSync(destPath)) {
    existing = fs.readFileSync(destPath, 'utf8').trim();
  }
  
  const separator = existing ? '\n\n<!-- entry-break -->\n\n' : '';
  const newContent = `${existing}${separator}${content}\n`;
  fs.writeFileSync(destPath, newContent, 'utf8');
}

async function main() {
  console.log('--- Timeline Injection Started ---');
  const touchedDecades = new Set();

  // 1. Process Timeline
  if (fs.existsSync(TIMELINE_SRC)) {
    const raw = fs.readFileSync(TIMELINE_SRC, 'utf8');
    if (raw.trim()) {
      const entries = parseMdBlocs(raw);
      console.log(`Found ${entries.length} timeline entries in newtimeline.md`);
      
      for (const entry of entries) {
        const title = entry.meta.title || 'Untitled';
        const dateStr = String(entry.meta.date || '');
        const dateMatch = dateStr.match(/^(-?\d+)/);
        const yearStr = dateMatch ? dateMatch[1] : null;
        
        if (yearStr) {
          const year = parseInt(yearStr);
          let dest;
          let decadeKey;
          
          if (year < 1900 || year > 2100) {
            decadeKey = 'ancient';
          } else {
            const decade = Math.floor(year / 10) * 10;
            decadeKey = `${decade}s`;
          }
          
          dest = path.join(STORY_DIR, 'timeline', decadeKey, '_injected.md');
          touchedDecades.add(decadeKey);
          
          let rawMeta = entry.rawMeta;
          if (!/datecreated\s*:/i.test(rawMeta)) {
            const d = new Date();
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            const todayStr = `${yyyy}-${mm}-${dd}`;
            rawMeta = rawMeta.trim() + `\ndatecreated: "${todayStr}"`;
          }
          const formatted = `---\n${rawMeta}\n---\n${entry.body}`;
          
          process.stdout.write(`  > Injecting: [${dateStr}] ${title} ... `);
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          await inject(dest, formatted);
          process.stdout.write(`Done (${decadeKey})\n`);
        } else {
          console.warn(`\n  [!] Invalid date for "${title}":`, entry.meta.date);
        }
      }
      fs.writeFileSync(TIMELINE_SRC, '', 'utf8');
    }
  }

  // 2. Process Relationships
  if (fs.existsSync(REL_SRC)) {
    const raw = fs.readFileSync(REL_SRC, 'utf8');
    if (raw.trim()) {
      const entries = parseMdBlocs(raw);
      console.log(`Found ${entries.length} relationship entries in newrelationship.md`);
      
      for (const entry of entries) {
        const title = entry.meta.title || 'Untitled Relationship';
        const cat = getRelCategory(entry.meta.type);
        const destFile = `${cat}.md`;
        const dest = path.join(STORY_DIR, 'relationships', destFile);
        const formatted = `---\n${entry.rawMeta}\n---\n${entry.body}`;
        
        process.stdout.write(`  > Injecting: ${title} ... `);
        await inject(dest, formatted);
        process.stdout.write(`Done (${destFile})\n`);
      }
      fs.writeFileSync(REL_SRC, '', 'utf8');
    }
  }

  // 3. Post-Process (Sort and Cleanup)
  if (touchedDecades.size > 0) {
    console.log('\n--- Sorting Touched Decades ---');
    for (const decade of touchedDecades) {
      try {
        console.log(`  > Sorting ${decade}...`);
        execSync(`node "${SORTER_BIN}" ${decade}`, { stdio: 'inherit' });
        
        // Cleanup empty _injected.md
        const injPath = path.join(STORY_DIR, 'timeline', decade, '_injected.md');
        if (fs.existsSync(injPath)) {
          const content = fs.readFileSync(injPath, 'utf8').trim();
          if (!content) {
            fs.unlinkSync(injPath);
            console.log(`  > Cleaned up empty _injected.md in ${decade}`);
          }
        }
      } catch (err) {
        console.error(`  [!] Error sorting ${decade}:`, err.message);
      }
    }
  }

  console.log('\n--- Injection Complete ---');
}

main().catch(console.error);
