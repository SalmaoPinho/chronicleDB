const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

/**
 * sort_timeline.js — Sorts, deduplicates, and routes timeline entries
 * across the modular decade-based directory structure.
 *
 * For each decade directory it:
 *   1. Discovers all .md files (top-level only, skips subdirs)
 *   2. Pools every entry from every file
 *   3. Deduplicates across files
 *   4. Routes each entry to the correct file by matching year
 *   5. Sorts entries within each file chronologically
 *   6. Writes everything back
 *
 * Usage:
 *   node sort_timeline.js              (process all decades)
 *   node sort_timeline.js 2020s        (process single decade)
 *   node sort_timeline.js --dry-run    (show plan, don't write)
 */

const TIMELINE_DIR = process.env.CHAR_MGR_STORY_DIR ? path.resolve(process.env.CHAR_MGR_STORY_DIR, 'timeline') : path.resolve(__dirname, '../story/timeline');
const SEPARATOR = '<!-- entry-break -->';
const dryRun = process.argv.includes('--dry-run');
const targetDecade = process.argv.find(a => !a.startsWith('-') && a !== process.argv[0] && a !== process.argv[1]);

// ── Parsing ──────────────────────────────────────────────────────────

function parseTimelineEntries(content, sourceName) {
    const rawChunks = content.split(/<!\-\- entry-break \-\->/g);

    return rawChunks.map((chunk, index) => {
        const trimmed = chunk.trim();
        if (!trimmed) return null;

        const fmMatch = trimmed.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        let date = '0000-00-00';
        let id = null;
        let parentId = null;
        let title = (trimmed.match(/title:\s*["']?(.*?)["']?\r?\n/) || [])[1] || 'Untitled';
        let tags = [];
        let metaObj = {};

        if (fmMatch) {
            try {
                const data = yaml.load(fmMatch[1]);
                metaObj = data || {};
                if (data && data.id) id = String(data.id);
                if (data && data.parent) parentId = String(data.parent);
                if (data && data.date) {
                    if (data.date instanceof Date) {
                        date = data.date.toISOString().split('T')[0];
                    } else {
                        date = String(data.date).trim();
                    }
                }
                if (data && data.title) title = data.title;
                if (data && Array.isArray(data.tags)) {
                    tags = data.tags.map(tag => String(tag).toLowerCase());
                }
            } catch (error) {
                console.warn(`  [!] YAML parse error in chunk ${index} of ${sourceName}`);
            }
        } else {
            console.warn(`  [!] Missing frontmatter in chunk ${index} of ${sourceName}`);
            console.warn(`      Snippet: ${trimmed.substring(0, 60).replace(/\n/g, ' ')}...`);
        }

        const body = fmMatch ? trimmed.slice(fmMatch[0].length).trim() : trimmed;

        return {
            date,
            id,
            parentId,
            content: trimmed,
            index,
            title,
            tags,
            body,
            meta: metaObj,
            searchText: `${title}\n${body}`.toLowerCase()
        };
    }).filter(e => e !== null);
}

function isStubBody(body) {
    if (!body || !body.trim()) return true;
    return /^(?:<!--[\s\S]*?-->\s*)*$/.test(body.trim());
}

function getPreferredEntry(existing, entry) {
    const existingInjected = existing.originFile && path.basename(existing.originFile).startsWith('_');
    const entryInjected = entry.originFile && path.basename(entry.originFile).startsWith('_');
    
    // Protect rich entries from being overwritten by stubs
    const existingStub = isStubBody(existing.body);
    const entryStub = isStubBody(entry.body);
    if (existingStub && !entryStub) {
        return entry;
    }
    if (!existingStub && entryStub) {
        return existing;
    }
    
    if (entryInjected && !existingInjected) {
        return entry;
    }
    if (existingInjected && !entryInjected) {
        return existing;
    }
    
    // Fallback: keep the one with longer/richer content
    const existingLen = (existing.body || '').length;
    const entryLen = (entry.body || '').length;
    if (entryLen > existingLen) {
        return entry;
    }
    
    return existing;
}

function dedupeEntries(entries) {
    const dedupedMap = new Map(); // key -> entry
    const duplicates = [];

    for (const entry of entries) {
        let dupKey = null;
        let dupType = null;
        
        if (entry.id) {
            const idKey = `id:${entry.id}`;
            if (dedupedMap.has(idKey)) {
                dupKey = idKey;
                dupType = 'id';
            }
        }
        
        if (!dupKey) {
            const fuzzyTitle = entry.title.toLowerCase().replace(/[^a-z0-9]/g, '');
            const fuzzyKey = `fuzzy:${entry.date}|${fuzzyTitle}`;
            if (dedupedMap.has(fuzzyKey)) {
                dupKey = fuzzyKey;
                dupType = 'fuzzy';
            }
        }
        
        if (dupKey) {
            const existing = dedupedMap.get(dupKey);
            
            // Preserve the older datecreated
            let originalDateCreated = existing.meta?.datecreated || existing.datecreated;
            let entryDateCreated = entry.meta?.datecreated || entry.datecreated;
            let resolvedDateCreated = null;
            if (originalDateCreated && entryDateCreated) {
                resolvedDateCreated = originalDateCreated < entryDateCreated ? originalDateCreated : entryDateCreated;
            } else {
                resolvedDateCreated = originalDateCreated || entryDateCreated;
            }

            const preferred = getPreferredEntry(existing, entry);
            
            const existingInjected = existing.originFile && path.basename(existing.originFile).startsWith('_');
            const entryInjected = entry.originFile && path.basename(entry.originFile).startsWith('_');
            
            if (preferred === entry) {
                // If preferred is injected and existing is standard, keep it in the standard file
                if (entryInjected && !existingInjected) {
                    entry.originFile = existing.originFile;
                }
                // Replace existing with entry in the map
                duplicates.push(existing);
                dedupedMap.set(dupKey, entry);
                
                // Sync the other key mapping to also point to the new entry
                if (dupType === 'id') {
                    const fuzzyTitle = entry.title.toLowerCase().replace(/[^a-z0-9]/g, '');
                    const fuzzyKey = `fuzzy:${entry.date}|${fuzzyTitle}`;
                    dedupedMap.set(fuzzyKey, entry);
                } else if (entry.id) {
                    const idKey = `id:${entry.id}`;
                    dedupedMap.set(idKey, entry);
                }
            } else {
                // If existing is preferred (and was injected) but entry is standard, keep it in standard file
                if (existingInjected && !entryInjected) {
                    existing.originFile = entry.originFile;
                }
                duplicates.push(entry);
            }

            // Apply the resolved older datecreated to the preferred entry
            if (resolvedDateCreated) {
                if (!preferred.meta) preferred.meta = {};
                preferred.meta.datecreated = resolvedDateCreated;
                preferred.datecreated = resolvedDateCreated;
            }
        } else {
            // Register new entry
            if (entry.id) {
                dedupedMap.set(`id:${entry.id}`, entry);
            }
            const fuzzyTitle = entry.title.toLowerCase().replace(/[^a-z0-9]/g, '');
            const fuzzyKey = `fuzzy:${entry.date}|${fuzzyTitle}`;
            dedupedMap.set(fuzzyKey, entry);
        }
    }

    // Resolve unique entry references from the map values
    const deduped = Array.from(new Set(dedupedMap.values()));
    return { deduped, duplicates };
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

function sortEntries(entries, entryById = new Map()) {
    const getRootAndDepth = (entry) => {
        let depth = 0;
        let current = entry;
        const visited = new Set();
        while (current && current.parentId) {
            if (visited.has(current.id || current)) break;
            if (current.id) visited.add(current.id);
            else visited.add(current);
            const parent = entryById.get(current.parentId);
            if (!parent) break;
            depth++;
            current = parent;
        }
        return { root: current, depth };
    };

    return [...entries].sort((a, b) => {
        const da = parseDate(a.date);
        const db = parseDate(b.date);
        if (da.year !== db.year) return da.year - db.year;
        if (da.month !== db.month) return da.month - db.month;
        if (da.day !== db.day) return da.day - db.day;

        // Same day parent-first topological sort
        const infoA = getRootAndDepth(a);
        const infoB = getRootAndDepth(b);

        if (infoA.root.id !== infoB.root.id) {
            // Different trees: compare root ancestors by original index
            return infoA.root.index - infoB.root.index;
        }

        // Same tree: compare depth (smaller depth comes first)
        if (infoA.depth !== infoB.depth) {
            return infoA.depth - infoB.depth;
        }

        // Same depth: preserve original relative order
        return a.index - b.index;
    });
}

function serializeEntry(entry) {
    if (!entry.meta) return entry.content;
    const fm = yaml.dump(entry.meta, { lineWidth: -1, flowLevel: 3 }).trim();
    return `---\n${fm}\n---\n${entry.body}`;
}

function renderEntries(entries) {
    return entries.map(entry => serializeEntry(entry)).join('\n\n' + SEPARATOR + '\n\n');
}

function writeTimelineFile(filePath, entries) {
    if (path.basename(filePath).startsWith('_') && entries.length === 0) {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        return;
    }
    const content = renderEntries(entries);
    const finalContent = content.trim() ? `${content.trim()}\n` : '';
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, finalContent, 'utf8');
}

// ── File Discovery & Year Extraction ─────────────────────────────────

/**
 * Extract year(s) from a filename.
 * Handles:  "01-foo-2020.md"           → [2020]
 *           "02-bar-1991-1992.md"       → [1991, 1992]
 *           "09-peace-2038-2039.md"     → [2038, 2039]
 *           "01-pangea-and-watchers.md" → []  (thematic, no year)
 */
function extractYearsFromFilename(filename) {
    // Strip extension for matching
    const base = filename.replace(/\.md$/, '');

    // Find all 4-digit sequences that look like years
    const allYears = [...base.matchAll(/\b(\d{4})\b/g)]
        .map(m => parseInt(m[1], 10))
        .filter(y => y >= 1800 && y <= 2100);

    if (allYears.length === 0) return [];

    // If exactly 2 years found, treat as range
    if (allYears.length === 2) {
        const lo = Math.min(...allYears);
        const hi = Math.max(...allYears);
        const years = [];
        for (let y = lo; y <= hi; y++) years.push(y);
        return years;
    }

    return allYears;
}

/**
 * Discover .md files directly inside a decade directory (non-recursive).
 * Returns array of file profile objects.
 */
function discoverDecadeFiles(decadeDir) {
    if (!fs.existsSync(decadeDir)) return [];

    return fs.readdirSync(decadeDir, { withFileTypes: true })
        .filter(d => d.isFile() && d.name.endsWith('.md'))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(d => {
            const years = extractYearsFromFilename(d.name);
            return {
                filePath: path.join(decadeDir, d.name),
                fileName: d.name,
                years: years,
                isExplicit: years.length > 0
            };
        });
}

/**
 * For files with no year in their name (e.g. ancient/ thematic files),
 * infer the date range from the entries they already contain.
 */
function getEntryYear(entry) {
    const d = String(entry.date || '');
    const match = d.match(/^(-?\d+)-/);
    if (match) return parseInt(match[1], 10);
    return parseInt(d.split('-')[0], 10) || 0;
}

function inferYearsFromEntries(entries) {
    const years = new Set();
    for (const e of entries) {
        const y = getEntryYear(e);
        if (!isNaN(y)) years.add(y);
    }
    return [...years].sort((a, b) => a - b);
}

/**
 * Find the best file for an entry based on:
 *   1. Origin file (entry stays where it was unless date is wrong)
 *   2. Exact year match in the file's year range
 *   3. Tag overlap (tiebreaker when multiple files cover same year)
 *   4. Closest year (fallback)
 */
function findBestFile(entry, fileProfiles) {
    const year = getEntryYear(entry);

    // 1. Files whose year range includes this entry's year
    const yearMatches = fileProfiles.filter(f => f.years.includes(year));

    if (yearMatches.length === 1) return yearMatches[0];

    if (yearMatches.length > 1) {
        // If the entry's origin file is among the year matches, keep it there.
        // This prevents reshuffling between files that share the same year.
        // EXCEPTION: If the origin file is a temporary/injected file (starts with _), allow movement.
        if (entry.originFile && !path.basename(entry.originFile).startsWith('_')) {
            const origin = yearMatches.find(f => f.filePath === entry.originFile);
            if (origin) return origin;
        }

        // Tiebreak by tag overlap
        let best = yearMatches[0];
        let bestScore = -1;
        for (const f of yearMatches) {
            let score = f.isExplicit ? 100 : 0;
            for (const tag of entry.tags) {
                if (f.tagProfile && f.tagProfile.has(tag)) score++;
            }
            if (score > bestScore) { bestScore = score; best = f; }
        }
        return best;
    }

    // 2. No exact year match — if origin file is in this decade, keep it
    if (entry.originFile) {
        const origin = fileProfiles.find(f => f.filePath === entry.originFile);
        if (origin) return origin;
    }

    // 3. Closest year file
    let closest = null;
    let closestDist = Infinity;
    for (const f of fileProfiles) {
        for (const y of f.years) {
            const dist = Math.abs(y - year);
            if (dist < closestDist) {
                closestDist = dist;
                closest = f;
            }
        }
    }
    return closest;
}

// ── Decade Processing ────────────────────────────────────────────────

function sortDecade(decadeDir) {
    const decadeName = path.basename(decadeDir);
    const files = discoverDecadeFiles(decadeDir);
    if (files.length === 0) {
        console.log(`  ${decadeName}: no files found, skipping.`);
        return;
    }

    console.log(`\n─── ${decadeName} (${files.length} files) ───`);

    // 1. Read all files once, collect entries with origin tracking
    const allEntries = [];
    const originalFileCounts = new Map();
    const fileEntryMap = new Map();

    for (const f of files) {
        const content = fs.readFileSync(f.filePath, 'utf8');
        const entries = parseTimelineEntries(content, f.fileName);

        // Tag each entry with its origin file
        for (const e of entries) e.originFile = f.filePath;

        originalFileCounts.set(f.fileName, entries.length);
        allEntries.push(...entries);

        // Build tag profile from this file's entries (for tiebreaking)
        f.tagProfile = new Set();
        for (const e of entries) {
            for (const t of e.tags) f.tagProfile.add(t);
        }

        fileEntryMap.set(f.filePath, []);

        // Infer years from content for thematic files (no year in name)
        if (f.years.length === 0) {
            f.years = inferYearsFromEntries(entries);
            if (f.years.length > 0) {
                console.log(`  Inferred years [${f.years[0]}..${f.years[f.years.length - 1]}] for ${f.fileName}`);
            }
        }
    }

    // 2. Deduplicate across all files in this decade
    const { deduped, duplicates } = dedupeEntries(allEntries);
    if (duplicates.length > 0) {
        console.log(`  Removed ${duplicates.length} duplicate(s):`);
        for (const d of duplicates) {
            console.log(`    - [${d.date}] ${d.title.substring(0, 60)}`);
        }
    }

    // 3. Route each entry to best file
    const unrouted = [];
    const entryById = new Map(deduped.map(e => [e.id, e]));

    // Resolve parent dates for child entries without dates
    for (const entry of deduped) {
        if (entry.date === '0000-00-00' && entry.parentId) {
            let parent = entryById.get(entry.parentId);
            const visited = new Set([entry.id]);
            while (parent && parent.date === '0000-00-00' && parent.parentId) {
                if (visited.has(parent.id)) break;
                visited.add(parent.id);
                parent = entryById.get(parent.parentId);
            }
            if (parent && parent.date !== '0000-00-00') {
                entry.date = parent.date;
            }
        }
    }

    const targetFiles = files.filter(f => !f.fileName.startsWith('_'));

    for (const entry of deduped) {
        let best = null;
        if (entry.parentId && entryById.has(entry.parentId)) {
            // Child entry: always follow parent
            const parent = entryById.get(entry.parentId);
            best = findBestFile(parent, targetFiles);
        } else {
            best = findBestFile(entry, targetFiles);
        }

        if (best) {
            fileEntryMap.get(best.filePath).push(entry);
        } else {
            unrouted.push(entry);
        }
    }

    // 4. Sort within each file and write
    for (const f of files) {
        const entries = sortEntries(fileEntryMap.get(f.filePath), entryById);
        const orig = originalFileCounts.get(f.fileName) || 0;
        const delta = entries.length - orig;
        const deltaStr = delta > 0 ? ` (+${delta})` : delta < 0 ? ` (${delta})` : '';

        if (!dryRun) {
            writeTimelineFile(f.filePath, entries);
        }
        console.log(`  ${f.fileName}: ${entries.length} entries${deltaStr}`);
    }

    // 5. Handle unrouted entries
    if (unrouted.length > 0) {
        console.log(`  ⚠ ${unrouted.length} entries could not be routed:`);
        for (const e of unrouted) {
            console.log(`    - [${e.date}] ${e.title.substring(0, 60)}`);
        }
        if (!dryRun) {
            const catchAll = path.join(decadeDir, '_unrouted.md');
            writeTimelineFile(catchAll, sortEntries(unrouted, entryById));
            console.log(`  → Wrote unrouted entries to _unrouted.md`);
        }
    }
}

// ── Main ─────────────────────────────────────────────────────────────

const main = () => {
    try {
        if (!fs.existsSync(TIMELINE_DIR)) {
            console.error(`Error: Timeline directory not found at ${TIMELINE_DIR}`);
            process.exit(1);
        }

        if (dryRun) console.log('[DRY RUN — no files will be written]\n');

        // Discover all decade directories
        const decades = fs.readdirSync(TIMELINE_DIR, { withFileTypes: true })
            .filter(d => d.isDirectory())
            .map(d => d.name)
            .sort();

        if (targetDecade) {
            if (!decades.includes(targetDecade)) {
                console.error(`Error: Decade "${targetDecade}" not found. Available: ${decades.join(', ')}`);
                process.exit(1);
            }
            sortDecade(path.join(TIMELINE_DIR, targetDecade));
        } else {
            for (const decade of decades) {
                sortDecade(path.join(TIMELINE_DIR, decade));
            }
        }

        console.log(`\n✓ Done.${dryRun ? ' (dry run — nothing was written)' : ''}`);
    } catch (err) {
        console.error('Critical error during sorting:', err);
        process.exit(1);
    }
};

if (require.main === module) {
    main();
}
