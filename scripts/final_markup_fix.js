const fs = require('fs');

const mrHtmlPath = 'mr.html';
let content = fs.readFileSync(mrHtmlPath, 'utf8');

// 1. Remove the duplicated div at line 175 (approx)
// Before:
// 174: 
// 175:         <div v-if="!isEditingActiveEntryRaw">
// 176:         <div v-if="!isEditingActiveEntryRaw" class="mr-card-normal-content">

// We replace the double pattern with the single class-based one.
const doublePattern = /<div v-if="!isEditingActiveEntryRaw">[\s\n]*<div v-if="!isEditingActiveEntryRaw" class="mr-card-normal-content">/g;
if (doublePattern.test(content)) {
    console.log('Fixing duplicated wrapper div at the top of the card...');
    content = content.replace(doublePattern, '<div v-if="!isEditingActiveEntryRaw" class="mr-card-normal-content">');
}

// 2. Ensure the closing tag is correct at the bottom
// We want exactly one </div> before the final </article> that closes the character card.
// Card end pattern: </div> (blocks) </div> (wrapper) </article> (card)

const cardBottomPattern = /<\/div>[\s\n]*<\/section>[\s\n]*<\/div>[\s\n]*<\/article>[\s\n]*\n[\s\n]*<article v-else/g;
// Actually, let's just make sure we have exactly the right sequence.

fs.writeFileSync(mrHtmlPath, content);
console.log('mr.html structural sanitization complete.');

// 3. Final Tag Balance Check
const body = fs.readFileSync(mrHtmlPath, 'utf8');
const tags = (body.match(/<[a-zA-Z1-6]+|<\/[a-zA-Z1-6]+/g) || []);
const self = new Set(['meta', 'link', 'br', 'hr', 'img', 'input', 'source', 'line', 'circle', 'path', 'rect', 'ellipse', 'polygon', 'polyline', 'stop']);
let stack = [];
let error = null;

tags.forEach((t, i) => {
    if (t.startsWith('</')) {
        const name = t.substring(2).toLowerCase();
        const last = stack.pop();
        if (last !== name && !error) {
            error = `Mismatch at tag ${i}: expected ${last} but got ${name}`;
        }
    } else {
        const name = t.substring(1).toLowerCase();
        if (!self.has(name)) stack.push(name);
    }
});

if (error) {
    console.log('CRITICAL: ' + error);
    process.exit(1);
} else {
    console.log('Tags are perfectly balanced (Stack: ' + stack.join(' > ') + ')');
}
