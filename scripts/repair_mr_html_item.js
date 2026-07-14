const fs = require('fs');

const filePath = 'mr.html';
let content = fs.readFileSync(filePath, 'utf8');

// The timeline item block has a redundant </div> at line 401 (approx)
// specifically right after the item-media div closes.

content = content.replace(
  '<div v-if="timelineCharacterTags(item.event).length && !isCompactTimelineEvent(item.event)" class="mr-timeline-item-media">',
  '<!-- item-media-start -->\n                <div v-if="timelineCharacterTags(item.event).length && !isCompactTimelineEvent(item.event)" class="mr-timeline-item-media">'
);

// We look for where it ends.
// Pre-repair state at 399-402:
// 399:                   </div>
// 400:                 </div>
// 401:                 </div>
// 402:                 <div class="mr-timeline-date-shell">

content = content.replace(
  '</div>\n                </div>\n                </div>\n                <div class="mr-timeline-date-shell">',
  '</div>\n                </div>\n                <div class="mr-timeline-date-shell">'
);

// Second possible pattern (if spacing differs)
content = content.replace(
  '</div>\n                </div>\n                </div>\n                <div class="mr-timeline-date-shell">',
  '</div>\n                </div>\n                <div class="mr-timeline-date-shell">'
);

// Let's also check for any other doubled closing divs in that area
content = content.replace(
  '</div>\n                  </article>\n                </div>\n              </section>',
  '                  </article>\n                </div>\n              </section>'
);

fs.writeFileSync(filePath, content);
console.log('mr.html timeline item structure repaired.');
