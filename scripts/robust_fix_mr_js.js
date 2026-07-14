const fs = require('fs');

const filePath = 'scripts/mr.js';
let content = fs.readFileSync(filePath, 'utf8');

// Use a regex that is insensitive to exact spacing and line endings
const searchRegex = /timelineSelectedItems\s*\(\s*\)\s*\{[\s\n\r]*const selected = \[\];[\s\n\r]*const events = Array.isArray\(this.timelineEvents\) \? this.timelineEvents : \[\];[\s\n\r]*groups.forEach\(\(group\) => \{/;

const replacement = `timelineSelectedItems() {
      const selected = [];
      const groups = Array.isArray(this.groupedFilteredTimelineEvents) ? this.groupedFilteredTimelineEvents : [];
      groups.forEach((group) => {`;

if (searchRegex.test(content)) {
    console.log('Found the broken timelineSelectedItems pattern. Fixing...');
    const newContent = content.replace(searchRegex, replacement);
    fs.writeFileSync(filePath, newContent);
    console.log('Successfully fixed mr.js ReferenceError.');
} else {
    // Try an even simpler search if the first one fails
    console.log('First regex failed. Trying simpler search...');
    if (content.includes('const events = Array.isArray(this.timelineEvents) ? this.timelineEvents : [];')) {
        // We find the one right before groups.forEach
        const brokenPart = 'const events = Array.isArray(this.timelineEvents) ? this.timelineEvents : [];\n      groups.forEach';
        const fixedPart = 'const groups = Array.isArray(this.groupedFilteredTimelineEvents) ? this.groupedFilteredTimelineEvents : [];\n      groups.forEach';
        if (content.includes(brokenPart)) {
            fs.writeFileSync(filePath, content.replace(brokenPart, fixedPart));
            console.log('Fixed via simple search-replace.');
        } else {
            console.log('Could not find the specific broken line.');
        }
    }
}
