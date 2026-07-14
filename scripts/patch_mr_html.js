const fs = require('fs');

const filePath = 'mr.html';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Fix the timeline item redundant div (repeating structural error)
// We look for the pattern: ...media-caption... </div> </div> </div> <div class="mr-timeline-date-shell">
// My research showed line 400 has caption, 401 is child-close, 402 is parent-close, 403 is item-media close, 404 is EXTRA.
// wait, let's just find the specific pattern.

content = content.replace(
  '</div>\n                </div>\n                </div>\n                <div class="mr-timeline-date-shell">',
  '</div>\n                </div>\n                <div class="mr-timeline-date-shell">'
);

// Allow for slightly different indentation
content = content.replace(
  '</div>[\s\n]*</div>[\s\n]*</div>[\s\n]*<div class="mr-timeline-date-shell">',
  '</div>\n                </div>\n                <div class="mr-timeline-date-shell">'
);

// 2. Wrap the character card content in a clean v-if/v-else for reactivity
// We want to wrap from the gallery down to the end of the article.
// Start: gallery section
const galleryStart = '<section v-if="activeGallery.length" class="mr-gallery">';
if (content.includes(galleryStart) && !content.includes('v-if="!isEditingActiveEntryRaw" class="mr-card-normal-content"')) {
   content = content.replace(galleryStart, '<div v-if="!isEditingActiveEntryRaw" class="mr-card-normal-content">\n        ' + galleryStart);
   
   // End: just before article closes (approx line 1124)
   const articleEnd = '      </article>\n\n      <article v-else class="mr-card">';
   content = content.replace(articleEnd, '        </div>\n      </article>\n\n      <article v-else class="mr-card">');
}

// 3. Cleanup: ensure sub-elements don't have redundant v-if="!isEditingActiveEntryRaw"
// which might be left over from previous attempts.
content = content.replace(' v-if="!isEditingActiveEntryRaw" v-for="(block, index) in normalizedBlocks"', ' v-for="(block, index) in normalizedBlocks"');

fs.writeFileSync(filePath, content);
console.log('mr.html structure patched successfully.');
