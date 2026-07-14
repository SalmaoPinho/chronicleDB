#!/usr/bin/env node
/**
 * fix_encoding.js
 * 
 * Detects and fixes common UTF-8 corruption sequences in markdown files.
 * Example: 'â€”' -> '—'
 */

const fs = require('fs');
const path = require('path');

const CORRUPTIONS = {
    'â€”': '—',  // Em dash
    'â€“': '–',  // En dash
    'â€™': '’',  // Right single quote
    'â€˜': '‘',  // Left single quote
    'â€œ': '“',  // Left double quote
    'â€\u009d': '”', // Right double quote (sometimes seen with hidden char)
    'â€': '”',   // Right double quote (fallback)
    'Ã©': 'é',    // e acute
    'Ã¹': 'ù',    // u grave (optional addition)
    'Ã¡': 'á',    // a acute
    'Ã³': 'ó',    // o acute
    'Ãº': 'ú',    // u acute
    'Ã±': 'ñ',    // n tilde
    'Ã¢': 'â',    // a circumflex
    'Ã­': 'í',    // i acute
    'Ã§': 'ç',    // c cedilla
    'Ã£': 'ã',    // a tilde
    'Ãª': 'ê',    // e circumflex
    'Ã´': 'ô',    // o circumflex
    'Ã¼': 'ü',    // u umlaut
    'Glucksburg': 'Glücksburg', // Clara's last name ASCII fix
    'Â': '',      // Often phantom space/prefix
};

function fixText(text) {
    let newText = text;
    let changed = false;

    for (const [corrupt, fixed] of Object.entries(CORRUPTIONS)) {
        if (newText.includes(corrupt)) {
            const regex = new RegExp(corrupt, 'g');
            newText = newText.replace(regex, fixed);
            changed = true;
        }
    }

    return { newText, changed };
}

function processFile(filePath) {
    const text = fs.readFileSync(filePath, 'utf8');
    const { newText, changed } = fixText(text);
    if (changed) {
        console.log(`FIXED: ${filePath}`);
        fs.writeFileSync(filePath, newText, 'utf8');
    }
    return changed;
}

function walkAndProcess(paths) {
    let modified = 0;
    for (const p of paths) {
        if (!fs.existsSync(p)) continue;

        const stat = fs.statSync(p);
        if (stat.isFile()) {
            if (p.toLowerCase().endsWith('.md') || p.toLowerCase().endsWith('.json')) {
                if (processFile(p)) modified++;
            }
        } else if (stat.isDirectory()) {
            const files = fs.readdirSync(p, { recursive: true });
            for (const fn of files) {
                const filePath = path.join(p, fn);
                if (fn.toLowerCase().endsWith('.md') || fn.toLowerCase().endsWith('.json')) {
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
    const defaultPaths = [
        "story/timeline", 
        "story/relationships", 
        "story/newtimeline.md", 
        "story/newrelationship.md", 
        "story/entities.json"
    ];
    console.log(`Scanning for encoding corruption in: ${defaultPaths.join(', ')}`);

    const modified = walkAndProcess(defaultPaths.map(p => path.normalize(p)));
    console.log(`Completed. Fixed ${modified} file(s).`);
}

main();
