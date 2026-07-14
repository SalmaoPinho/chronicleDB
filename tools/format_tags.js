#!/usr/bin/env node
/**
 * format_tags.js
 * 
 * Standardizes YAML frontmatter in markdown files.
 * Fixes:
 * - Scalar fields (date, title, etc.) use double quotes.
 * - List fields (tags, members, etc.) use block lists with double quotes.
 * - Handles multiple frontmatter blocks per file correctly.
 */

const fs = require('fs');
const path = require('path');

const EQUIVALENCIES = {
    "aegis-protocol": ["Anomalous Geometric Inscription Systems"],
    "aftermath": ["long-war-aftermath"],
    "aisha": ["simurg"],
    "aldrich": ["director-aldrich", "michael-aldrich"],
    "amber": ["amber-cole"],
    "amy": ["princess-amelia"],
    "ana": ["ana-sokolov"],
    "ancient": ["fauna"],
    "andrew": ["andrew-vance", "spectral-shade"],
    "annies": ["the-annies"],
    "apex": ["apex-hq"],
    "ari": ["ari-braun"],
    "arthur": ["arthur-vance", "knightfall"],
    "ashford": ["weston-hospital"],
    "ashley": ["ashley-blair"],
    "astrid-nonomiya": ["astrid"],
    "aya": ["star"],
    "azure-knight": ["azure_knight"],
    "bea": ["bea-santos", "beatriz", "beatriz-santos"],
    "betrayal": ["treason"],
    "blair": ["blair-hotel", "blairs"],
    "boone": ["boone-family"],
    "callum": ["axiom"],
    "camila": ["camila-torres"],
    "carlos": ["carlos-ferreira-matos"],
    "carmen": ["carmen-reyes", "tempest"],
    "caroline": ["caroline-blair", "mrs-blair"],
    "carter": ["carter-james"],
    "cass": ["cass-thorne"],
    "catherine": ["calypso"],
    "childhood": ["cooking", "foster-system", "puberty"],
    "chloe": ["chloe-mercer", "viridian"],
    "clara": ["frost"],
    "cliff": ["cliff-blair"],
    "clint": ["clint-harris"],
    "coda": ["the-coda"],
    "conjurer": ["david", "david-park"],
    "crane": ["aldous-crane"],
    "cybernetics": ["hacking"],
    "dalia": ["raatgirl"],
    "dandy-jack": ["jack"],
    "danny": ["danny-oneil"],
    "dawn": ["dusk"],
    "denny": ["principal"],
    "diya": ["nightcracker"],
    "dorothy": ["dorothy-blair"],
    "dr-braun": ["braun", "conrad", "conrad-braun"],
    "draft": ["pandora-draft"],
    "eleanor": ["eleanor-voss"],
    "elena": ["elena-vasquez"],
    "eli": ["eli-cross"],
    "elias": ["elias-harris"],
    "emma": ["emma-braun-cross", "sarah-kelley-thorne"],
    "enhanced": ["mutation", "prodigy"],
    "ennui": ["president-ennui"],
    "essence": ["godly-essence", "watcher-essence"],
    "eurasia": ["caucasus", "china", "middle-east", "serbia"],
    "evan": ["evan-davis"],
    "ezra": ["vector"],
    "family": ["protection", "soccer-moms"],
    "fault-line": ["fault-lines", "the-fault-line"],
    "felix": ["adeyemi"],
    "ferrymen": ["the-ferrymen"],
    "friendship": ["mentorship"],
    "gareth": ["gareth-ellis", "ghosts"],
    "geology": ["geo"],
    "gerald": ["gerald-blair", "mr-blair"],
    "gracie": ["gracie-torres"],
    "grief": ["funerals"],
    "grims": ["the-grims"],
    "harris": ["harris-family"],
    "heroes": ["the-heroes"],
    "hillary": ["hillary-weston"],
    "history": ["1942-dinner", "archivist", "current", "h", "historical", "operational-reference", "order-records", "outside-record", "redaction", "routing-test", "the-civilian"],
    "humor": ["ventriloquist"],
    "hunting": ["the-hunting"],
    "hwan": ["apollyon"],
    "index": ["the-index"],
    "institutions": ["hayes-adaptive", "hospital-division", "ivory", "the-firm"],
    "ivy": ["queen-ivy"],
    "janet-jean": ["billie-jean", "dirty-diana", "isabelle-beaumont", "janet-jane"],
    "jess": ["jess-boone", "jess-harris"],
    "jessie": ["jessie-sato"],
    "judge": [],
    "jury": ["jessie"],
    "karen": ["karen-vance", "scarlet-shade"],
    "kayla": ["kayla-lee"],
    "keepsake": ["keepsake-foundation"],
    "kenji": ["kenji-sato"],
    "knightfall-event": ["knightfall-origin"],
    "laura": ["laura-park"],
    "leo": ["leo-park"],
    "li": ["li-wei"],
    "lina": ["lina-braun"],
    "linda": ["linda-boone"],
    "liz": ["liz-hartley"],
    "liz-dare": ["the_liz_dare"],
    "lorelei": ["liora"],
    "lotus": ["saki", "saki-nonomiya"],
    "luana": ["luana-ferreira"],
    "lucius": ["lucius-weston"],
    "margaux": ["margaux-fleury-weston"],
    "margot": ["blossom"],
    "margot-foundation": ["the-margot-foundation"],
    "marv": ["marvin"],
    "maxine": ["max"],
    "maya": ["maya-harris"],
    "media": ["public-opinion", "public-spectacle", "truthseekers"],
    "mei": ["lantern"],
    "mercy": ["nightingale"],
    "mermaid": ["mermaids"],
    "mia": ["mia-henderson"],
    "military": ["militarism", "military-deployment", "military-operation"],
    "minnie": ["bepop"],
    "morality": ["ethics"],
    "morgan": ["dred", "mo", "morgan-dred"],
    "murder": ["serial-killer"],
    "music": ["idol"],
    "naomi": ["infra", "naomi-sato"],
    "natalya": ["natalia", "natalya-vasiliev"],
    "new-zealand": ["new-zeland"],
    "noah": ["noah-perkinson", "perkinson"],
    "nora": ["nora-morrow"],
    "nuke": ["nuclear-strike"],
    "nullifier": ["raymond-cole"],
    "nur": ["nur-chen"],
    "obrien": ["o-b-r-i-e-n"],
    "obsidian": ["obsidian-rig"],
    "olav": ["clint-fo"],
    "order": ["o", "order-council", "the-order"],
    "origin": ["character-origin", "character-origins", "name-change", "origins"],
    "osha": ["osha-kelley"],
    "oswald": ["oswald-company", "oswald-world"],
    "outlaws": ["syndicate", "vagabonds"],
    "pangea": ["pg"],
    "pat-davis": ["pat", "patdavis", "patty-lin", "vp-ayers"],
    "patricia": ["patricia-voss", "voss"],
    "paulo": ["paulo", "paulo-vetor"],
    "politics": ["conspiracy", "libertarianism", "political-shift", "restructuring"],
    "powers": ["invulnerability"],
    "principal": ["denny-okafor", "okafor"],
    "prism": [],
    "project-phoenix": ["phoenix", "phoenix-program", "phoenix-project"],
    "psychology": ["character-shift", "identities"],
    "quan": ["sarah-quan"],
    "rant-notebook": ["the-rant-notebook"],
    "regent": ["cruor", "the-regent"],
    "rejection": ["denial"],
    "relationship": ["resolution"],
    "rin": ["rin-hasegawa"],
    "roboter": ["limbo"],
    "rod": ["rod-the-dog"],
    "romance": ["aesthetic"],
    "roza": ["beli"],
    "ryan": ["cobalt", "ryan-lee"],
    "sarah": ["sarah-kelley", "vanguard"],
    "serpent": ["the-serpent", "viktor", "viktor-volkov"],
    "sinclair": ["sinclair-aldrich"],
    "skinwalker": ["bob-thorne"],
    "sloane": ["magenta"],
    "society": ["the-society"],
    "sofia": [],
    "spinball": ["madison-prie"],
    "strand": ["nikolai-strand"],
    "succession": ["inheritance"],
    "sultan": ["zara"],
    "swan": ["clara", "clara-glücksburg"],
    "tactics": ["deployment", "military"],
    "the-civilian": ["The Civilian"],
    "theory": ["methodology"],
    "time-travel": ["paradox"],
    "tragedy": ["car-crash", "mundane-tragedy"],
    "trauma": ["decay"],
    "travel": ["emigration"],
    "turner": ["turner-weston"],
    "united-front": ["united_front"],
    "veritas": ["joanna", "joanna-carter"],
    "vex-varga": ["vex"],
    "vigilantes": ["crews", "feral-years", "mercenaries", "solo-era", "vigilante", "vigilantism"],
    "violence": ["arson", "atrocities", "bat", "c4-explosion", "injury"],
    "vivian": ["vivian-hayes"],
    "viviane": ["relampago"],
    "volkov": ["elena-volkov", "volkovs"],
    "volt": ["daniela", "daniela-murphy", "daniella-murphy", "dorothy-kelley"],
    "vp-ayers": ["patricia-davis"],
    "warren": ["warren-blair"],
    "wei": ["wei-wukong"],
    "wei-hong": ["hong"],
    "whisper": ["aleksi", "aleksi-olav"],
    "wraith": ["elena-volkov", "victoria", "victoria-cross", "w"],
    "writing": ["journalism"],
    "yara": ["iara"],
    "yue": ["song-yue"],
    "yuki": ["prism"],
    "yuna": ["englishteacher", "yuna-park"],
    "zack": ["zack-morrison"],
    "zola": ["bone"]
};

function getReplacementMap() {
    const mapping = {};
    for (const [canonical, aliases] of Object.entries(EQUIVALENCIES)) {
        for (const alias of aliases) {
            mapping[alias] = canonical;
        }
    }
    return mapping;
}

const REPLACEMENT_MAP = getReplacementMap();
const TAG_FIELDS = ["tags", "members", "children", "participants"];
const SCALAR_FIELDS = ["date", "title", "id", "location", "character", "image", "img", "redirect"];

function getLineEnd(str, pos) {
    let end = str.indexOf('\n', pos);
    if (end === -1) return str.length;
    return end;
}

function parseFrontmatterField(fm, fieldName) {
    const pattern = new RegExp(`^[ \\t]*${fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[ \\t]*:[ \\t]*(.*)$`, 'm');
    const match = fm.match(pattern);
    if (!match) return { start: -1, end: -1, tags: [] };

    const start = match.index;
    const after = match[1].trim();
    let lineEnd = getLineEnd(fm, start);

    if (after.startsWith('[')) {
        let endBracketPos = fm.indexOf(']', start);
        if (endBracketPos !== -1) {
            const fullVal = fm.substring(start + match[0].length - after.length, endBracketPos + 1).trim();
            const inner = fullVal.slice(1, -1);
            const tags = inner.split(',').map(t => t.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
            const finalEnd = getLineEnd(fm, endBracketPos);
            return { start, end: finalEnd, tags };
        }
    }

    // Inline or Single Line
    const nextLineStart = lineEnd + 1;
    const nextLine = nextLineStart < fm.length ? fm.substring(nextLineStart, getLineEnd(fm, nextLineStart)).trim() : "";

    if (after.startsWith('[') || !nextLine.startsWith('-')) {
        let tags;
        if (after.startsWith('[')) {
            tags = after.replace(/^\[|\]$/g, '').split(',').map(t => t.trim().replace(/^['"]|['"]$/g, ''));
        } else {
            tags = after.split(',').map(t => t.trim().replace(/^['"]|['"]$/g, ''));
        }
        return { start, end: lineEnd, tags: tags.filter(Boolean) };
    }

    // Block list
    const tags = [];
    let currentPos = lineEnd + 1;
    let finalEnd = lineEnd;

    while (currentPos < fm.length) {
        const nextLineEnd = getLineEnd(fm, currentPos);
        const line = fm.substring(currentPos, nextLineEnd);
        if (/^\s*-\s+/.test(line)) {
            tags.push(line.trim().replace(/^-/, '').trim().replace(/^['"]|['"]$/g, ''));
            finalEnd = nextLineEnd;
            currentPos = nextLineEnd + 1;
        } else if (!line.trim() || line.trim().startsWith('#')) {
            currentPos = nextLineEnd + 1;
        } else {
            break;
        }
    }
    return { start, end: finalEnd, tags };
}

function standardizeFm(fm) {
    let currentFm = fm;
    let changed = false;

    // 1. Scalars
    for (const field of SCALAR_FIELDS) {
        const regex = new RegExp(`^([ \\t]*${field}[ \\t]*:[ \\t]*)(.*)$`, 'm');
        const match = currentFm.match(regex);
        if (match) {
            const fullLine = match[0];
            const prefix = match[1];
            let value = match[2].trim();
            if (!value) continue;

            let unquoted = value;
            if (value.startsWith('"') && value.endsWith('"')) {
                unquoted = value.slice(1, -1).replace(/\\"/g, '"');
            } else if (value.startsWith("'") && value.endsWith("'")) {
                unquoted = value.slice(1, -1).replace(/''/g, "'");
            }
            const standardized = `${prefix}"${unquoted.replace(/"/g, '\\"')}"`;
            if (fullLine !== standardized) {
                currentFm = currentFm.substring(0, match.index) + standardized + currentFm.substring(match.index + fullLine.length);
                changed = true;
            }
        }
    }

    // 2. Lists
    for (const fieldName of TAG_FIELDS) {
        const { start, end, tags } = parseFrontmatterField(currentFm, fieldName);
        if (start === -1) continue;

        const finalTags = [];
        const seen = new Set();

        for (const t of tags) {
            // 1. Character/Alias Replacement
            let current = REPLACEMENT_MAP[t] || t;

            // 2. Formatting cleanup
            current = String(current).trim();
            const normalized = current.toLowerCase();

            // 3. Filter out malformed/placeholder tags or year/decade tags (e.g., 2025, 2020s, 2024-2025)
            if (
                !normalized ||
                normalized === "--" ||
                normalized === "-" ||
                normalized.length === 1 ||
                /^-?\d{4}s?$/.test(normalized) ||
                /^-?\d{4}-\d{4}$/.test(normalized)
            ) {
                continue;
            }

            if (!seen.has(normalized)) {
                seen.add(normalized);
                finalTags.push(current);
            }
        }
        finalTags.sort();

        const oldBlock = currentFm.substring(start, end);
        const newBlock = `${fieldName}:` + finalTags.map(t => `\n  - "${t}"`).join('');

        if (oldBlock !== newBlock) {
            currentFm = currentFm.substring(0, start) + newBlock + currentFm.substring(end);
            changed = true;
        }
    }

    return { newFm: currentFm, changed };
}

function formatTagsInText(text) {
    let newText = text;
    let overallChanged = false;
    let searchPos = 0;

    while (true) {
        let fmStart = newText.indexOf('---', searchPos);
        if (fmStart === -1) break;

        // Ensure start of line
        if (fmStart > 0 && newText[fmStart - 1] !== '\n') {
            searchPos = fmStart + 3;
            continue;
        }

        // Check if this is a valid frontmatter start (must be followed by date/id/title before next ---)
        let isValidFmStart = (() => {
            const nextFence = newText.indexOf('---', fmStart + 3);
            if (nextFence === -1) return false;
            const blockContent = newText.substring(fmStart + 3, nextFence);
            return /^[ \t]*(date|id|title)[ \t]*:/mi.test(blockContent);
        })();

        if (!isValidFmStart) {
            searchPos = fmStart + 3;
            continue;
        }

        let fmEndMarker = newText.indexOf('\n---', fmStart + 3);
        if (fmEndMarker === -1) break;

        const fmEnd = fmEndMarker + 5;
        const fm = newText.substring(fmStart, fmEnd);

        const { newFm, changed } = standardizeFm(fm);
        if (changed) {
            overallChanged = true;
            newText = newText.substring(0, fmStart) + newFm + newText.substring(fmEnd);
            searchPos = fmStart + newFm.length;
        } else {
            searchPos = fmEnd;
        }
    }
    return { newText, changed: overallChanged };
}

function processFile(filePath) {
    const text = fs.readFileSync(filePath, 'utf8');
    const { newText, changed } = formatTagsInText(text);
    if (changed) {
        console.log(`MODIFY: ${filePath}`);
        fs.writeFileSync(filePath, newText, 'utf8');
    }
    return changed;
}

function walkAndProcess(paths) {
    let modified = 0;
    for (const p of paths) {
        if (!fs.existsSync(p)) continue;
        const stat = fs.statSync(p);
        if (stat.isFile() && p.toLowerCase().endsWith('.md')) {
            if (processFile(p)) modified++;
        } else if (stat.isDirectory()) {
            const files = fs.readdirSync(p, { recursive: true });
            for (const fn of files) {
                if (fn.toLowerCase().endsWith('.md')) {
                    const filePath = path.join(p, fn);
                    if (fs.statSync(filePath).isFile()) {
                        if (processFile(filePath)) modified++;
                    }
                }
            }
        }
    }
    return modified;
}

function main() {
    const args = process.argv.slice(2);
    let paths = [];
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--paths') {
            while (i + 1 < args.length && !args[i + 1].startsWith('--')) {
                paths.push(args[++i]);
            }
        }
    }
    if (paths.length === 0) {
        const storyDir = process.env.CHAR_MGR_STORY_DIR || "story";
        paths = [
            path.join(storyDir, "timeline"),
            path.join(storyDir, "relationships"),
            path.join(storyDir, "newtimeline.md")
        ];
    } else if (process.env.CHAR_MGR_STORY_DIR) {
        // Map paths that start with 'story/' or 'story\' to CHAR_MGR_STORY_DIR
        paths = paths.map(p => {
            const normalized = p.replace(/\\/g, '/');
            if (normalized === 'story') {
                return process.env.CHAR_MGR_STORY_DIR;
            }
            if (normalized.startsWith('story/')) {
                return path.join(process.env.CHAR_MGR_STORY_DIR, p.substring(6));
            }
            return p;
        });
    }
    paths = paths.map(p => path.normalize(p));
    console.log(`Streamlining YAML (Robust) in: ${paths.join(', ')}`);
    const modified = walkAndProcess(paths);
    console.log(`Completed. Streamlined ${modified} file(s).`);
}

if (require.main === module) {
    main();
}
