const fs = require('fs');

const filePath = 'mr.html';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Fix the timeline item structure (remove extra/misplaced divs)
// Based on my research, the timeline item should be a clean article with sibling divs.
// I detected unclosed article/div in each item.

// I'll re-standardize the timeline item block.
const itemStart = '<article\n                    v-for="item in group.items"';
const itemEnd = '</article>';

// I'll check if there's a missing </div> inside the item.
// Let's actually use a more robust way: re-write the whole timeline item template if I can find its boundaries.

// 2. Fix the character card wrapper for Raw Editor reactivity.
// I'll wrap the "Normal" content in a div v-if="!isEditingActiveEntryRaw".
// This ensures that when we toggle, the browser doesn't have to diff the broken parts.

const characterCardStart = '<article v-if="activeEntry" class="mr-card">';
const characterCardEnd = '      </article>\n\n      <article v-else class="mr-card">';

if (content.includes(characterCardStart) && !content.includes('<div v-if="!isEditingActiveEntryRaw" class="mr-card-normal-content">')) {
  // We insert the wrapper after the Raw Editor div (approx line 173)
  const rawEditorEnd = '        </div>\n\n        <section v-if="activeGallery.length" class="mr-gallery">';
  const wrappedStart = '        </div>\n\n        <div v-if="!isEditingActiveEntryRaw" class="mr-card-normal-content">\n        <section v-if="activeGallery.length" class="mr-gallery">';
  content = content.replace(rawEditorEnd, wrappedStart);
  
  // And close it at the end of the article
  content = content.replace(characterCardEnd, '        </div>\n      </article>\n\n      <article v-else class="mr-card">');
}

// 3. Ensure no v-if="!isEditingActiveEntryRaw" remains on sub-elements (clean it up)
content = content.replace(' v-if="!isEditingActiveEntryRaw" v-for="(block, index) in normalizedBlocks"', ' v-for="(block, index) in normalizedBlocks"');

fs.writeFileSync(filePath, content);
console.log('mr.html structural repair completed.');
