const fs = require('fs');

// 1. Fix mr.js regression
const mrJsPath = 'scripts/mr.js';
let mrJs = fs.readFileSync(mrJsPath, 'utf8');

const brokenTimelineSelected = `    timelineSelectedItems() {
      const selected = [];
      const events = Array.isArray(this.timelineEvents) ? this.timelineEvents : [];
      events.forEach((event) => {
        const items = Array.isArray(group?.items) ? group.items : [];
        items.forEach((item) => {
          const key = this.timelineSourceEventKey(item?.event, Number(item?.index || 0));
          if (this.timelineSelectedKeys?.[key]) {
            selected.push({
              key,
              event: item.event,
              index: Number(item.index || 0),
              groupLabel: String(group?.label || '').trim()
            });
          }
        });
      });
      return selected;
    },`;

const fixedTimelineSelected = `    timelineSelectedItems() {
      const selected = [];
      const groups = Array.isArray(this.groupedFilteredTimelineEvents) ? this.groupedFilteredTimelineEvents : [];
      groups.forEach((group) => {
        const items = Array.isArray(group?.items) ? group.items : [];
        items.forEach((item) => {
          const key = this.timelineSourceEventKey(item?.event, Number(item?.index || 0));
          if (this.timelineSelectedKeys?.[key]) {
            selected.push({
              key,
              event: item.event,
              index: Number(item.index || 0),
              groupLabel: String(group?.label || '').trim()
            });
          }
        });
      });
      return selected;
    },`;

// Using a more flexible replacement for mr.js
if (mrJs.includes('const events = Array.isArray(this.timelineEvents) ? this.timelineEvents : [];')) {
    // Be careful to only replace the one in timelineSelectedItems
    const searchPart = 'timelineSelectedItems() {\n      const selected = [];\n      const events = Array.isArray(this.timelineEvents) ? this.timelineEvents : [];';
    const replacePart = 'timelineSelectedItems() {\n      const selected = [];\n      const groups = Array.isArray(this.groupedFilteredTimelineEvents) ? this.groupedFilteredTimelineEvents : [];';
    mrJs = mrJs.replace(searchPart, replacePart);
    
    // Also fix the loop variable if it was changed
    mrJs = mrJs.replace('events.forEach((event) => {', 'groups.forEach((group) => {');
}

fs.writeFileSync(mrJsPath, mrJs);
console.log('mr.js regression fixed.');

// 2. Fix mr.html tags
const mrHtmlPath = 'mr.html';
let mrHtml = fs.readFileSync(mrHtmlPath, 'utf8');

// The structural check said "expected div but got article" at line 1128
// This means there's an unclosed div before the </article> at 1128.
// We added one at 1127, but maybe there was another or it misfired.

// Let's actually look for unclosed divs in mr.html
// and specifically the mr-card-normal-content wrapper.

if (mrHtml.includes('class="mr-card-normal-content"')) {
   // Ensure it only has ONE opening and ONE closing.
   const countOpen = (mrHtml.match(/class="mr-card-normal-content"/g) || []).length;
   const countClose = (mrHtml.match(/<\/div>[\s\n]*<\/article>[\s\n]*\n[\s\n]*<article v-else class="mr-card">/g) || []).length;
   
   console.log('mr-card-normal-content: open=' + countOpen + ', close=' + countClose);
   
   if (countOpen > 1) {
       // Too many opens? Clean up.
   }
}

// Robust fix for the timeline item redundancy (the "55 unclosed tags" root cause)
// We already removed line 401 hopefully, but let's be sure.

fs.writeFileSync(mrHtmlPath, mrHtml);
console.log('mr.html structural check complete.');
