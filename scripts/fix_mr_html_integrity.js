const fs = require('fs');

const filePath = 'mr.html';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Remove v-if from gallery
content = content.replace(
  '<section v-if="!isEditingActiveEntryRaw && activeGallery.length" class="mr-gallery">',
  '<section v-if="activeGallery.length" class="mr-gallery">'
);

// 2. Remove v-if from blocks loop
content = content.replace(
  '<section v-if="!isEditingActiveEntryRaw" v-for="(block, index) in normalizedBlocks" :key="index" class="mr-block">',
  '<section v-for="(block, index) in normalizedBlocks" :key="index" class="mr-block">'
);

// 3. Add wrapping div for the normal view
// We want to wrap from gallery (usually line 175 approx) down to the end of the article (line 1123 approx)
const galleryStart = '<section v-if="activeGallery.length" class="mr-gallery">';
content = content.replace(galleryStart, '<div v-if="!isEditingActiveEntryRaw">\n        ' + galleryStart);

// Find the correct </article> at the end of the character card.
// We know it's at line 1124 approx, before <article v-else.
const cardEnd = '      </article>\n\n      <article v-else class="mr-card">';
content = content.replace(cardEnd, '        </div>\n      </article>\n\n      <article v-else class="mr-card">');

fs.writeFileSync(filePath, content);
console.log('mr.html structure fixed and wrapped in v-if.');
