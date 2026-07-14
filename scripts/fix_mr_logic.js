const fs = require('fs');

const filePath = 'scripts/mr.js';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Fix buildTimelineExportPayload to export ALL events
const oldExport = `    buildTimelineExportPayload() {
      const groups = Array.isArray(this.groupedFilteredTimelineEvents) ? this.groupedFilteredTimelineEvents : [];
      // Group by date, collect descriptions as array
      const grouped = {};
      groups.forEach((group) => {
        const items = Array.isArray(group?.items) ? group.items : [];
        items.forEach((item) => {
          const event = item?.event || {};
          const date = String(event?.date || '');
          const desc = this.plainText(event?.description || '');
          if (!date) return;
          if (!grouped[date]) grouped[date] = [];
          if (desc) grouped[date].push(desc);
        });
      });
      return grouped;
    },`;

const newExport = `    buildTimelineExportPayload() {
      // Use full timelineEvents instead of filtered/paginated groupedFilteredTimelineEvents
      const events = Array.isArray(this.timelineEvents) ? this.timelineEvents : [];
      const grouped = {};
      events.forEach((event) => {
        const date = String(event?.date || '');
        const desc = this.plainText(event?.description || '');
        if (!date) return;
        if (!grouped[date]) grouped[date] = [];
        if (desc) grouped[date].push(desc);
      });
      return grouped;
    },`;

if (content.includes(oldExport)) {
  content = content.replace(oldExport, newExport);
} else {
  // Try a partial match if formatting differs
  content = content.replace(
    'const groups = Array.isArray(this.groupedFilteredTimelineEvents) ? this.groupedFilteredTimelineEvents : [];',
    'const events = Array.isArray(this.timelineEvents) ? this.timelineEvents : [];'
  );
  // Also fix the loop
  content = content.replace('groups.forEach((group) => {', 'events.forEach((event) => {');
}

// 2. Final pass on modal openers - search and wrap if not already done
const openers = [
  'startEditingActiveEntryRaw() {',
  'openStoryExportModal() {',
  'openChatModal() {',
  'openAddRecordModal() {',
  'exportCharacterSystem() {',
  'exportCharacterMarkdownSystem() {'
];

openers.forEach(opener => {
  if (content.includes(opener) && !content.includes(opener + '\n      this.closeAllModals();')) {
    content = content.replace(opener, opener + '\n      this.closeAllModals();');
  }
});

fs.writeFileSync(filePath, content);
console.log('mr.js logic updated (Full Export + Modal Cleanup).');
