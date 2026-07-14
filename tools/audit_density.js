const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

/**
 * audit_density.js
 * Identifies days with multiple timeline entries to help find candidates 
 * for recursive YAML consolidation.
 * 
 * Reports days where more than one "Root" entry exists (entries with no parent).
 */

const TIMELINE_DIR = path.resolve(__dirname, '../story/timeline');

function getMarkdownFiles(dir, files = []) {
    if (!fs.existsSync(dir)) return files;
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
        if (item.isDirectory()) {
            if (item.name === 'legacy_character_arcs') continue;
            getMarkdownFiles(path.join(dir, item.name), files);
        } else if (item.name.endsWith('.md')) {
            files.push(path.join(dir, item.name));
        }
    }
    return files;
}

function parseEntries(content, fileName) {
    const rawChunks = content.split(/<!-- entry-break -->/g);
    let currentLine = 1;
    
    return rawChunks.map((chunk, idx) => {
        const trimmed = chunk.trim();
        const startLine = currentLine;
        const lines = chunk.split(/\r?\n/).length;
        currentLine += lines;

        if (!trimmed) return null;
        const fmMatch = trimmed.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        if (!fmMatch) return null;
        try {
            const data = yaml.load(fmMatch[1]);
            let dateStr = '0000-00-00';
            if (data.date) {
                if (data.date instanceof Date) {
                    dateStr = data.date.toISOString().split('T')[0];
                } else {
                    dateStr = String(data.date).trim();
                }
            }
            const body = trimmed.slice(fmMatch[0].length).trim();
            return {
                date: dateStr,
                title: data.title || 'Untitled',
                id: data.id,
                parent: data.parent,
                file: path.basename(fileName),
                line: startLine,
                body: body,
                normalizedBody: body.toLowerCase().replace(/\s+/g, ' ')
            };
        } catch (e) { 
            return null; 
        }
    }).filter(Boolean);
}

function normalizeTitle(title) {
    return title.toLowerCase().replace(/[^a-z0-9]/g, '');
}

console.log('--- Timeline Density Audit ---');
const files = getMarkdownFiles(TIMELINE_DIR);
const allEntries = [];

files.forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    allEntries.push(...parseEntries(content, file));
});

const byDate = {};
allEntries.forEach(entry => {
    if (!byDate[entry.date]) byDate[entry.date] = [];
    byDate[entry.date].push(entry);
});

const sortedDates = Object.keys(byDate).sort((a, b) => a.localeCompare(b));

let denseDayCount = 0;
let fuzzyDuplicateCount = 0;
let identicalCopyCount = 0;

sortedDates.forEach(date => {
    const entries = byDate[date];
    const roots = entries.filter(e => !e.parent);
    
    if (roots.length > 1) {
        denseDayCount++;
        console.log(`\n[${date}] - ${entries.length} entries (${roots.length} roots)`);
        
        const seenFuzzy = new Map();
        
        entries.forEach(e => {
            const fuzzy = normalizeTitle(e.title);
            let dupStatus = '';
            
            if (seenFuzzy.has(fuzzy)) {
                const originals = seenFuzzy.get(fuzzy);
                const identical = originals.find(orig => orig.normalizedBody === e.normalizedBody);
                
                if (!e.parent) {
                    fuzzyDuplicateCount++;
                    if (identical) {
                        dupStatus = ' [!!!] IDENTICAL 1:1 COPY';
                        identicalCopyCount++;
                    } else {
                        dupStatus = ' [!] SIMILAR TITLE / DIFF CONTENT';
                    }
                }
            }
            
            if (!seenFuzzy.has(fuzzy)) seenFuzzy.set(fuzzy, []);
            seenFuzzy.get(fuzzy).push(e);

            const indent = e.parent ? '  ' : '';
            const marker = e.parent ? '└─ [CHILD] ' : '* ';
            console.log(`${indent}${marker}${e.title}${e.id ? ` (#${e.id})` : ''} [${e.file}:${e.line}]${dupStatus}`);
        });
    }
});

console.log('\n----------------------------------');
console.log(`Total Entries: ${allEntries.length}`);
console.log(`Days with multiple root entries: ${denseDayCount}`);
console.log(`Potential fuzzy duplicates: ${fuzzyDuplicateCount}`);
console.log(`Confirmed identical copies: ${identicalCopyCount}`);
console.log('----------------------------------');
