#!/usr/bin/env node
/**
 * compact_timeline.js
 * 
 * Generates a token-optimized, single-line-per-entry version of the timeline.
 * Designed for AI ingestion (Claude, GPT, etc.) to minimize context window usage.
 * 
 * Usage:
 *   node tools/compact_timeline.js
 *   node tools/compact_timeline.js --profile ultra --validate
 *   node tools/compact_timeline.js --profile narrative --max-body 500
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT_DIR = path.resolve(__dirname, '..');

const STORY_DIR = process.env.CHAR_MGR_STORY_DIR
    ? path.resolve(process.env.CHAR_MGR_STORY_DIR)
    : (fs.existsSync(path.join(ROOT_DIR, 'stories', 'earthborn'))
        ? path.join(ROOT_DIR, 'stories', 'earthborn')
        : path.join(ROOT_DIR, 'story'));

const TIMELINE_DIRS = [
    path.join(STORY_DIR, 'timeline'),
    path.join(STORY_DIR, 'relationships') // Relationships also have dates
];

const TAG_ABBREVIATIONS = {
    "history": "h",
    "key-event": "!",
    "pangea": "pg",
    "pre-flood": "pf",
    "order": "o",
    "roboter": "r",
    "fairmount": "f",
    "eden": "e",
    "watchers": "w",
    "nephilim": "nph",
    "long-war": "lw",
    "management-operation": "mo",
    "character": "c",
    "location": "l",
    "america": "usa",
    "technology": "tech",
    "engineering": "eng",
    "geopolitics": "geo",
    "violence": "v",
    "propaganda": "prp",
    "historical": "hist",
    "militia": "mil",
    "shadow-unit": "su",
    "ratgirlz": "rg",
    "amazon": "amz",
    "brazil": "br"
};

function compactTags(tags, entryId) {
    return tags
        .filter(t => t !== entryId) // Remove redundant ID from tags
        .map(t => TAG_ABBREVIATIONS[t] || t);
}

/**
 * Robustly parses frontmatter into a clean object using js-yaml.
 */
function parseEntry(text) {
    const fmMatch = text.match(/^---+\s*\n([\s\S]*?)\n---+\s*\n?/);
    if (!fmMatch) return null;

    const fmContent = fmMatch[1];
    const body = text.substring(fmMatch[0].length).trim();
    
    // Skip stub entries (empty or only HTML comments)
    if (/^(?:<!--[\s\S]*?-->\s*)*$/.test(body)) {
        return null;
    }
    
    let metadata;
    try {
        metadata = yaml.load(fmContent);
    } catch (e) {
        console.warn(`▲ Warning: Failed to parse YAML front-matter: ${e.message}`);
        return null;
    }

    if (!metadata || typeof metadata !== 'object') return null;

    // Clean up body: remove images, HTML tags, and collapse whitespace
    let cleanBody = body
        .replace(/!\[.*?\]\(.*?\)/g, '') // Remove images
        .replace(/<.*?>/gs, '')          // Remove HTML tags
        .replace(/\s+/g, ' ')
        .trim();

    let parsedTitle = "";
    if (metadata.title) {
        parsedTitle = String(metadata.title).trim();
    } else if (metadata.label) {
        parsedTitle = String(metadata.label).trim();
    } else if (metadata.type) {
        parsedTitle = `[${String(metadata.type).trim()}]`;
    } else {
        parsedTitle = cleanBody.substring(0, 60).trim();
        if (cleanBody.length > 60) parsedTitle += "...";
    }

    const result = {
        date: metadata.date ? String(metadata.date).trim() : "",
        title: parsedTitle,
        id: metadata.id ? String(metadata.id).trim() : "",
        parent: metadata.parent ? String(metadata.parent).trim() : "",
        type: metadata.type ? String(metadata.type).trim() : "",
        tags: new Set()
    };

    // Standardize and normalize tags
    const tagFields = ['tags', 'members', 'participants'];
    tagFields.forEach(field => {
        const val = metadata[field];
        if (Array.isArray(val)) {
            val.forEach(t => { if (t) result.tags.add(String(t).trim()); });
        } else if (typeof val === 'string') {
            val.split(',').forEach(t => { if (t) result.tags.add(t.trim()); });
        }
    });

    const singleTagFields = ['location', 'character'];
    singleTagFields.forEach(field => {
        const val = metadata[field];
        if (val) {
            result.tags.add(String(val).trim());
        }
    });

    return {
        ...result,
        tags: Array.from(result.tags).sort(),
        body: cleanBody
    };
}

function processFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const entries = [];
    
    // Split entries primarily on <!-- entry-break -->, fall back to regex separator if not present
    let chunks;
    if (content.includes('<!-- entry-break -->')) {
        chunks = content.split('<!-- entry-break -->');
    } else {
        chunks = content.split(/\n---+\s*\n(?=date:|title:|tags:|id:|parent:)/i);
    }
    
    for (let chunk of chunks) {
        chunk = chunk.trim();
        if (!chunk) continue;
        
        // Ensure standard entry boundary starts with ---
        if (!chunk.startsWith('---')) {
            const index = chunk.indexOf('---');
            if (index !== -1) {
                chunk = chunk.substring(index);
            } else {
                continue;
            }
        }
        
        const entry = parseEntry(chunk);
        if (entry && (entry.date || entry.parent)) {
            entries.push(entry);
        }
    }
    return entries;
}

function extractYear(dateStr) {
    if (!dateStr) return '';
    const trimStr = dateStr.trim();
    const isBC = trimStr.startsWith('-');
    const absStr = isBC ? trimStr.substring(1) : trimStr;
    const parts = absStr.split('-');
    if (parts.length > 0 && parts[0]) {
        return (isBC ? '-' : '') + parts[0];
    }
    return '';
}

function parseDate(d) {
    const match = String(d || '').trim().match(/^(-?\d+)-(\d{1,2})-(\d{1,2})$/);
    if (!match) return { year: 0, month: 0, day: 0 };
    return {
        year: parseInt(match[1], 10),
        month: parseInt(match[2], 10),
        day: parseInt(match[3], 10)
    };
}

function validateDate(dateStr) {
    if (!dateStr) return false;
    const match = String(dateStr).trim().match(/^(-?\d{1,8})-(\d{2})-(\d{2})$/);
    if (!match) return false;
    const month = parseInt(match[2], 10);
    const day = parseInt(match[3], 10);
    if (month < 0 || month > 12) return false;
    if (day < 0 || day > 31) return false;
    return true;
}

function levenshtein(a, b) {
    const tmp = [];
    let i, j;
    for (i = 0; i <= a.length; i++) {
        tmp[i] = [i];
    }
    for (j = 1; j <= b.length; j++) {
        tmp[0][j] = j;
    }
    for (i = 1; i <= a.length; i++) {
        for (j = 1; j <= b.length; j++) {
            tmp[i][j] = Math.min(
                tmp[i - 1][j] + 1,
                tmp[i][j - 1] + 1,
                tmp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
            );
        }
    }
    return tmp[a.length][b.length];
}

function escapeYamlString(str) {
    if (!str) return '""';
    return '"' + String(str).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '') + '"';
}

function main() {
    const startBuildTime = Date.now();
    console.log(`◇ Initializing Compact Timeline Builder v2.0`);

    // Parse arguments
    let profile = 'tree';
    let outputDir = path.join(ROOT_DIR, 'tools/compact_timeline');
    let maxBodyLen = 120;
    let validate = false;

    const args = process.argv.slice(2);
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--profile' && args[i+1]) {
            profile = args[i+1].toLowerCase();
            i++;
        } else if ((args[i] === '--output' || args[i] === '--output-dir') && args[i+1]) {
            outputDir = path.resolve(args[i+1]);
            if (outputDir.endsWith('.txt')) {
                outputDir = outputDir.replace(/\.txt$/, '');
            }
            i++;
        } else if (args[i] === '--max-body' && args[i+1] !== undefined) {
            maxBodyLen = parseInt(args[i+1], 10);
            i++;
        } else if (args[i] === '--validate') {
            validate = true;
        }
    }

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    function loadAndMergeJson(fileName, storyDir, visited = new Set()) {
        const activePath = path.join(storyDir, fileName);
        let activeData = {};
        if (fs.existsSync(activePath)) {
            try {
                activeData = JSON.parse(fs.readFileSync(activePath, 'utf8'));
            } catch (e) {
                console.error(`Failed to parse ${fileName} in ${storyDir}: ${e.message}`);
            }
        }

        const metaPath = path.join(storyDir, 'metadata.json');
        let baseStory = null;
        if (fs.existsSync(metaPath)) {
            try {
                const metaContent = fs.readFileSync(metaPath, 'utf8');
                const metaJson = JSON.parse(metaContent);
                baseStory = metaJson.baseStory || metaJson.parentStory;
            } catch (e) {
                // Ignore
            }
        }

        if (baseStory) {
            const baseStoryDir = path.join(ROOT_DIR, 'stories', baseStory);
            const storyName = path.basename(storyDir);
            if (fs.existsSync(baseStoryDir) && !visited.has(baseStory) && baseStory !== storyName) {
                visited.add(baseStory);
                const baseData = loadAndMergeJson(fileName, baseStoryDir, visited);
                if (fileName === 'core.json') {
                    const mergedCharacters = { ...(baseData.characters || {}), ...(activeData.characters || {}) };
                    return { ...baseData, ...activeData, characters: mergedCharacters };
                } else if (fileName === 'entities.json') {
                    const merged = { ...baseData, ...activeData };
                    for (const key of ['organizations', 'locations', 'themes', 'misc']) {
                        merged[key] = { ...(baseData[key] || {}), ...(activeData[key] || {}) };
                    }
                    return merged;
                }
            }
        }
        return activeData;
    }

    // 1. Load characters database
    console.log(`◇ Loading character database...`);
    const core = loadAndMergeJson('core.json', STORY_DIR);
    const allCharIds = Object.keys(core.characters || {});
    const charIdsSet = new Set(allCharIds);
    console.log(`✔ Loaded ${allCharIds.length} characters (with inheritance)`);

    // Load entities database for tag validation
    const validTags = new Set([...allCharIds, ...Object.keys(TAG_ABBREVIATIONS)]);
    const entities = loadAndMergeJson('entities.json', STORY_DIR);
    for (const category of Object.values(entities)) {
        if (category && typeof category === 'object') {
            Object.keys(category).forEach(key => validTags.add(key));
        }
    }
    console.log(`✔ Loaded entities (with inheritance)`);

    // Add character redirects to valid tags
    for (const [id, char] of Object.entries(core.characters || {})) {
        if (char && char.redirect) {
            validTags.add(id);
        }
    }

    // 2. Discover files and process entries
    const rawEntries = [];
    const entryMap = new Map();
    let totalSourceSize = 0;

    function loadEntriesForStory(storyDir, visitedStories = new Set()) {
        const storyName = path.basename(storyDir);
        if (visitedStories.has(storyName)) return [];
        visitedStories.add(storyName);

        const timelineDirs = [
            path.join(storyDir, 'timeline'),
            path.join(storyDir, 'relationships')
        ];

        const entriesList = [];

        function walkDir(dir) {
            if (!fs.existsSync(dir)) return;
            const files = fs.readdirSync(dir, { withFileTypes: true });
            for (const file of files) {
                const res = path.join(dir, file.name);
                if (file.isDirectory()) {
                    if (file.name === 'legacy_character_arcs') continue;
                    walkDir(res);
                } else if (file.isFile() && res.endsWith('.md')) {
                    totalSourceSize += fs.statSync(res).size;
                    const fileEntries = processFile(res);
                    fileEntries.forEach(e => {
                        entriesList.push(e);
                    });
                }
            }
        }

        timelineDirs.forEach(walkDir);

        // Check for baseStory in metadata.json
        const metaPath = path.join(storyDir, 'metadata.json');
        let baseStoryName = null;
        if (fs.existsSync(metaPath)) {
            try {
                const metaContent = fs.readFileSync(metaPath, 'utf8');
                const metaJson = JSON.parse(metaContent);
                baseStoryName = metaJson.baseStory || metaJson.parentStory;
            } catch (e) {
                // Ignore
            }
        }

        if (baseStoryName) {
            const baseStoryDir = path.join(ROOT_DIR, 'stories', baseStoryName);
            if (fs.existsSync(baseStoryDir) && baseStoryName !== storyName) {
                // Find earliest date in entriesList
                let earliestDate = null;
                for (const e of entriesList) {
                    if (e.date && e.date !== '0000-00-00') {
                        if (!earliestDate || e.date < earliestDate) {
                            earliestDate = e.date;
                        }
                    }
                }

                const baseEntries = loadEntriesForStory(baseStoryDir, visitedStories);

                // Filter base story events: keep only those with date < earliestDate
                const filteredBase = earliestDate
                    ? baseEntries.filter(e => !e.date || e.date === '0000-00-00' || e.date < earliestDate)
                    : baseEntries;

                // Prepend base entries
                entriesList.unshift(...filteredBase);
            }
        }

        return entriesList;
    }

    const loadedEntries = loadEntriesForStory(STORY_DIR);
    loadedEntries.forEach(e => {
        rawEntries.push(e);
        if (e.id) {
            entryMap.set(e.id, e);
        }
    });
    console.log(`✔ Parsed ${rawEntries.length} raw events across database using js-yaml`);

    // 3. Date inheritance for recursive entries
    rawEntries.forEach(e => {
        if (!e.date && e.parent) {
            let current = e;
            const visited = new Set();
            while (current && !current.date && current.parent) {
                if (visited.has(current.id)) break;
                if (current.id) visited.add(current.id);
                current = entryMap.get(current.parent);
            }
            if (current && current.date) {
                e.date = current.date;
            }
        }
    });

    // 3.5 Deduplicate entries after date inheritance is fully resolved
    const allEntries = [];
    const seenContentKeys = new Map(); // Maps key (date + normTitle) -> chosen entry
    const seenIdsMap = new Map();      // Maps id -> chosen entry
    const duplicateRedirects = new Map(); // Maps duplicate ID -> original ID

    rawEntries.forEach(e => {
        // 1. Check duplicate ID first
        if (e.id) {
            if (seenIdsMap.has(e.id)) {
                const original = seenIdsMap.get(e.id);
                // Compare bodies and keep the one with longer/richer content
                if ((e.body || '').length > (original.body || '').length) {
                    duplicateRedirects.set(original.id, e.id);
                    seenIdsMap.set(e.id, e);
                    
                    const origNormTitle = (original.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                    const origContentKey = `${original.date || ''}::${origNormTitle}`;
                    seenContentKeys.delete(origContentKey);

                    const normTitle = (e.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                    const contentKey = `${e.date || ''}::${normTitle}`;
                    seenContentKeys.set(contentKey, e);
                } else {
                    duplicateRedirects.set(e.id, original.id);
                }
                return;
            }
            seenIdsMap.set(e.id, e);
        }

        // 2. Check duplicate Date + Title next
        const normTitle = (e.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const contentKey = `${e.date || ''}::${normTitle}`;

        if (seenContentKeys.has(contentKey)) {
            const original = seenContentKeys.get(contentKey);
            // Compare bodies and keep the one with longer/richer content
            if ((e.body || '').length > (original.body || '').length) {
                if (original.id && e.id) {
                    duplicateRedirects.set(original.id, e.id);
                    seenIdsMap.delete(original.id);
                    seenIdsMap.set(e.id, e);
                }
                seenContentKeys.set(contentKey, e);
            } else {
                if (e.id && original.id) {
                    duplicateRedirects.set(e.id, original.id);
                }
            }
            return;
        }
        seenContentKeys.set(contentKey, e);
    });

    // Re-collect the deduplicated entries
    seenContentKeys.forEach(e => {
        allEntries.push(e);
    });

    // Update parent references to ensure referential integrity
    allEntries.forEach(e => {
        if (e.parent && duplicateRedirects.has(e.parent)) {
            e.parent = duplicateRedirects.get(e.parent);
        }
    });

    // Rebuild entryMap from the final deduplicated set of entries
    entryMap.clear();
    allEntries.forEach(e => {
        if (e.id) entryMap.set(e.id, e);
    });

    console.log(`✔ Deduplicated to ${allEntries.length} unique events`);

    // 4. Run Integrity & Validation check
    const validationWarnings = [];
    let invalidDates = 0;
    let orphans = 0;
    let misspelledTags = 0;

    for (const e of allEntries) {
        // Date validation
        if (e.date && !validateDate(e.date)) {
            validationWarnings.push(`▲ Warning: Event "${e.id || e.title}" has an invalid date format: "${e.date}"`);
            invalidDates++;
        }

        // Parent validation
        if (e.parent && !entryMap.has(e.parent)) {
            validationWarnings.push(`▲ Warning: Event "${e.id || e.title}" references parent "${e.parent}" which does not exist! (Orphan)`);
            orphans++;
        }
    }

    if (validate || validationWarnings.length > 0) {
        console.log(`\n[VALIDATION REPORT]`);
        if (validationWarnings.length === 0) {
            console.log(`✔ 0 integrity or date warnings found.`);
        } else {
            validationWarnings.forEach(w => console.warn(w));
            console.log(`▲ Validation Summary: ${invalidDates} invalid dates, ${orphans} orphans, ${misspelledTags} misspelled tags.`);
        }
    }

    // 5. Parse and build dynamic relationships bidirectional mapping
    console.log(`◇ Aggregating relationship graphs...`);
    const relationsMap = new Map();
    const relationshipsDir = path.join(STORY_DIR, 'relationships');
    if (fs.existsSync(relationshipsDir)) {
        const files = fs.readdirSync(relationshipsDir);
        for (const file of files) {
            if (file.endsWith('.md')) {
                const filePath = path.join(relationshipsDir, file);
                const relEntries = processFile(filePath);
                for (const e of relEntries) {
                    const type = e.type || 'relation';
                    if (!['romance', 'family', 'personal'].includes(type)) {
                        continue;
                    }
                    const tags = e.tags || [];
                    for (let i = 0; i < tags.length; i++) {
                        const charA = tags[i];
                        if (!relationsMap.has(charA)) relationsMap.set(charA, new Set());
                        for (let j = 0; j < tags.length; j++) {
                            if (i !== j) {
                                const charB = tags[j];
                                relationsMap.get(charA).add(`${type}:${charB}`);
                            }
                        }
                    }
                }
            }
        }
    }

    // 6. Build the dynamic brackets Character & Entity Directory
    const characterLines = [];
    let featuredIds = new Set();
    const statsPath = path.join(STORY_DIR, 'character_stats.json');
    if (fs.existsSync(statsPath)) {
        try {
            const stats = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
            stats.filter(s => s.count >= 5).forEach(s => featuredIds.add(s.id));
        } catch (e) {}
    }
    const targetIds = featuredIds.size > 0 ? featuredIds : new Set(allCharIds);

    for (const id of allCharIds) {
        if (!targetIds.has(id)) continue;
        const char = core.characters[id];
        if (!char || char.redirect) continue;

        const birth = extractYear(char.birthDate);
        const death = extractYear(char.deathDate);
        const lifeSpan = birth || death ? `${birth}-${death}` : '';

        const faction = (char.groups && char.groups.length) ? char.groups.join(', ') : (char.navGroup || '');
        const details = [char.gender, char.ethnicity].filter(Boolean).join(', ');
        
        const relationsSet = relationsMap.get(id) || new Set();
        const relationsStr = Array.from(relationsSet).join(', ');

        const parts = [
            char['full name'] || id,
            lifeSpan,
            faction,
            details,
            relationsStr
        ].map(p => p.trim()).filter(Boolean);

        characterLines.push(`${id}[${parts.join(' | ')}]`);
    }

    // 7. Sort entries by date stably
    allEntries.sort((a, b) => {
        const da = parseDate(a.date);
        const db = parseDate(b.date);
        if (da.year !== db.year) return da.year - db.year;
        if (da.month !== db.month) return da.month - db.month;
        if (da.day !== db.day) return da.day - db.day;
        return (a.id || '').localeCompare(b.id || '');
    });

    // 8. Build hierarchy roots
    const childrenOf = new Map();
    const roots = [];
    allEntries.forEach(e => {
        if (e.parent && entryMap.has(e.parent)) {
            if (!childrenOf.has(e.parent)) childrenOf.set(e.parent, []);
            childrenOf.get(e.parent).push(e);
        } else {
            roots.push(e);
        }
    });

    function getPartitionedTags(tags, entryId) {
        const entryChars = [];
        const entryThemes = [];
        if (!tags) return { characters: [], tags: [] };
        
        for (const t of tags) {
            if (t === entryId) continue;
            if (charIdsSet.has(t)) {
                entryChars.push(t);
            } else {
                entryThemes.push(TAG_ABBREVIATIONS[t] || t);
            }
        }
        
        return {
            characters: entryChars.sort(),
            tags: entryThemes.sort()
        };
    }

    // Recursive YAML tree renderer
    function renderEntryRecursive(e, depth = 0) {
        const indent = "  ".repeat(depth);
        const innerIndent = indent + "  ";
        let yaml = '';
        let first = true;

        function addKey(key, value) {
            if (first) {
                yaml += `${indent}- ${key}: ${value}\n`;
                first = false;
            } else {
                yaml += `${innerIndent}${key}: ${value}\n`;
            }
        }

        if (e.id) addKey('id', escapeYamlString(e.id));
        if (e.date) addKey('date', escapeYamlString(e.date));
        if (e.title) addKey('title', escapeYamlString(e.title));
        
        const partitioned = getPartitionedTags(e.tags, e.id);
        if (partitioned.characters.length > 0) {
            addKey('characters', `[${partitioned.characters.map(escapeYamlString).join(', ')}]`);
        }
        if (partitioned.tags.length > 0) {
            addKey('tags', `[${partitioned.tags.map(escapeYamlString).join(', ')}]`);
        }

        if (e.body) {
            let renderedBody = e.body;
            if (maxBodyLen === 0) {
                renderedBody = "";
            } else if (maxBodyLen > 0 && renderedBody.length > maxBodyLen) {
                renderedBody = renderedBody.substring(0, maxBodyLen).trim() + "...";
            }
            if (renderedBody) {
                addKey('body', escapeYamlString(renderedBody));
            }
        }
        
        const children = childrenOf.get(e.id) || [];
        if (children.length > 0) {
            const childrenKey = 'children';
            if (first) {
                yaml += `${indent}- ${childrenKey}:\n`;
                first = false;
            } else {
                yaml += `${innerIndent}${childrenKey}:\n`;
            }
            const childLines = children.map(c => renderEntryRecursive(c, depth + 2));
            yaml += childLines.join('');
        }
        return yaml;
    }

    // Ultra JSONL renderer
    function renderEntryUltra(e) {
        const obj = {
            d: e.date || undefined,
            t: e.title || undefined
        };
        
        const partitioned = getPartitionedTags(e.tags, e.id);
        if (partitioned.characters.length > 0) {
            obj.ch = partitioned.characters;
        }

        const children = childrenOf.get(e.id) || [];
        if (children.length > 0) {
            obj.c = children.map(renderEntryUltra);
        }
        return obj;
    }

    // Narrative renderer
    function renderEntryNarrative(e, depth = 0) {
        const indent = "  ".repeat(depth);
        const dateStr = e.date ? `[${e.date}] ` : '';
        const bodyStr = e.body ? ` - ${e.body}` : '';
        let text = `${indent}- ${dateStr}${e.title}${bodyStr}\n`;

        const children = childrenOf.get(e.id) || [];
        for (const child of children) {
            text += renderEntryNarrative(child, depth + 1);
        }
        return text;
    }

    // 9. Serialize all three profiles
    const relationsLegendComments = 
        "# Relationship Legend:\n" +
        "# - romance: Romantic partners/spouse\n" +
        "# - family: Family members/relatives\n" +
        "# - personal: Friends/personal connections\n";

    // 9.1 Build Tree Profile (YAML)
    let legend = "# Legend: id=id, date=date, title=title, characters=characters, tags=tags, body=body, children=children\n" +
                 "# Tag abbreviations: " + Object.entries(TAG_ABBREVIATIONS).map(([k, v]) => `${v}=${k}`).join(', ') + "\n\n";

    let treeRegistryHeader = "# --- CHARACTER DIRECTORY ---\n" + 
                     "# Format: id[Full Name | Birth-Death | Faction | Details | Key Relations]\n" +
                     relationsLegendComments +
                     characterLines.map(line => line).join('\n') + "\n# ---------------------------\n\n";

    const treeOutput = legend + treeRegistryHeader + roots.map(root => renderEntryRecursive(root, 0)).join('\n') + '\n';

    // 9.2 Build Ultra Profile (JSONL)
    const directoryObj = {
        type: "directory",
        format: "id[Full Name | Birth-Death | Faction | Details | Key Relations]",
        relationsLegend: {
            romance: "Romantic partners/spouse",
            family: "Family members/relatives",
            personal: "Friends/personal connections"
        },
        characters: characterLines
    };
    const dirLine = JSON.stringify(directoryObj);
    const ultraLines = roots.map(root => JSON.stringify(renderEntryUltra(root)));
    const ultraOutput = [dirLine, ...ultraLines].join('\n') + '\n';

    // 9.3 Build Narrative Profile (Markdown Indented Plot)
    let narrativeRegistryHeader = "# --- CHARACTER DIRECTORY ---\n" + 
                     "# Format: id[Full Name | Birth-Death | Faction | Details | Key Relations]\n" +
                     relationsLegendComments +
                     characterLines.map(line => line).join('\n') + "\n# ---------------------------\n\n";

    const narrativeOutput = narrativeRegistryHeader + roots.map(root => renderEntryNarrative(root, 0)).join('\n') + '\n';

    // Write all three profile files to disk
    const treePath = path.join(outputDir, 'timeline.txt');
    const ultraPath = path.join(outputDir, 'timeline_ultra.txt');
    const narrativePath = path.join(outputDir, 'timeline_narrative.txt');

    fs.writeFileSync(treePath, treeOutput, 'utf8');
    fs.writeFileSync(ultraPath, ultraOutput, 'utf8');
    fs.writeFileSync(narrativePath, narrativeOutput, 'utf8');

    // Clean up old stale split files
    const staleFiles = ['full_timeline.txt', 'bc_timeline.txt', 'ac_timeline.txt', 'timeline_tree.txt'];
    staleFiles.forEach(file => {
        const filePath = path.join(outputDir, file);
        if (fs.existsSync(filePath)) {
            try {
                fs.unlinkSync(filePath);
                console.log(`- Cleaned up stale file: ${filePath}`);
            } catch (e) {
                console.warn(`▲ Warning: Could not delete stale file ${file}: ${e.message}`);
            }
        }
    });

    // 10. Generate flat-text registry (ground truth for parity audits)
    const flatLines = [];
    const sortedEntries = [...allEntries].sort((a, b) => a.date.localeCompare(b.date));
    for (const e of sortedEntries) {
        if (!e.date || !e.title) continue;
        const tagsPart = e.tags && e.tags.length ? e.tags.join('|') : '';
        const line = `${e.date}[${e.title}|${tagsPart}] ${e.body || ''}`;
        flatLines.push(line);
    }
    const flatPath = path.join(ROOT_DIR, 'tools/compact_timeline.txt');
    fs.writeFileSync(flatPath, flatLines.join('\n') + '\n', 'utf8');

    // 11. Print Compression and Token Estimation Statistics
    const treeSize = fs.statSync(treePath).size;
    const ultraSize = fs.statSync(ultraPath).size;
    const narrativeSize = fs.statSync(narrativePath).size;

    const sourceTokens = Math.round(totalSourceSize / 4);

    const getStats = (size) => {
        const reduction = ((1 - size / totalSourceSize) * 100).toFixed(1);
        const tokens = Math.round(size / 4);
        const tokenReduction = ((1 - tokens / sourceTokens) * 100).toFixed(1);
        const claudePct = ((tokens / 200000) * 100).toFixed(2);
        const gptPct = ((tokens / 128000) * 100).toFixed(2);
        return {
            sizeMB: (size / 1024 / 1024).toFixed(2),
            tokens: tokens.toLocaleString(),
            reduction,
            tokenReduction,
            claudePct,
            gptPct
        };
    };

    const treeStats = getStats(treeSize);
    const ultraStats = getStats(ultraSize);
    const narrativeStats = getStats(narrativeSize);

    console.log(`\n✔ Success! Compacted all profiles written to: ${outputDir}`);
    console.log(`  - Tree (YAML) Profile:     [timeline.txt]`);
    console.log(`  - Ultra (JSONL) Profile:   [timeline_ultra.txt]`);
    console.log(`  - Narrative (MD) Profile:  [timeline_narrative.txt]`);

    console.log(`\n[COMPILATION STATISTICS]`);
    console.log(`- Original Size:     ${(totalSourceSize / 1024 / 1024).toFixed(2)} MB (~${sourceTokens.toLocaleString()} tokens)`);
    
    console.log(`\nProfile 1: Tree (YAML)`);
    console.log(`  - Compacted Size:    ${treeStats.sizeMB} MB (~${treeStats.tokens} tokens)`);
    console.log(`  - Data Reduction:    ${treeStats.reduction}% reduction`);
    console.log(`  - Token Reduction:   ${treeStats.tokenReduction}% reduction`);
    console.log(`  - Claude 3.5 Use:    ${treeStats.claudePct}% of 200k limit`);
    console.log(`  - GPT-4o Use:        ${treeStats.gptPct}% of 128k limit`);

    console.log(`\nProfile 2: Ultra (JSONL)`);
    console.log(`  - Compacted Size:    ${ultraStats.sizeMB} MB (~${ultraStats.tokens} tokens)`);
    console.log(`  - Data Reduction:    ${ultraStats.reduction}% reduction`);
    console.log(`  - Token Reduction:   ${ultraStats.tokenReduction}% reduction`);
    console.log(`  - Claude 3.5 Use:    ${ultraStats.claudePct}% of 200k limit`);
    console.log(`  - GPT-4o Use:        ${ultraStats.gptPct}% of 128k limit`);

    console.log(`\nProfile 3: Narrative (MD)`);
    console.log(`  - Compacted Size:    ${narrativeStats.sizeMB} MB (~${narrativeStats.tokens} tokens)`);
    console.log(`  - Data Reduction:    ${narrativeStats.reduction}% reduction`);
    console.log(`  - Token Reduction:   ${narrativeStats.tokenReduction}% reduction`);
    console.log(`  - Claude 3.5 Use:    ${narrativeStats.claudePct}% of 200k limit`);
    console.log(`  - GPT-4o Use:        ${narrativeStats.gptPct}% of 128k limit`);

    console.log(`\n- Active Selected Profile: ${profile.toUpperCase()}`);
    console.log(`- Elapsed Build Time:      ${Date.now() - startBuildTime}ms`);
}

if (require.main === module) {
    main();
}
