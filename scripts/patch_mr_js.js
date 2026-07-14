const fs = require('fs');
const path = require('path');

const filePath = 'scripts/mr.js';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Fix buildTimelineExportPayload
const oldBody = `    buildTimelineExportPayload() {
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

const newBody = `    buildTimelineExportPayload() {
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

// Use a more flexible replace to find the function even with spacing issues
const funcRegex = /buildTimelineExportPayload\(\s*\)[\s\n]*\{[\s\S]*?return grouped;[\s\n]*\},/;
content = content.replace(funcRegex, newBody);

// 2. Add closeAllModals logic
if (!content.includes('closeAllModals() {')) {
  const dataEndLine = '    },'; // End of data() or similar
  const closeAllModals = `    closeAllModals() {
      this.addRecordModalOpen = false;
      this.storyExportOpen = false;
      this.chatModalOpen = false;
      this.exportModalOpen = false;
      this.dateMenuOpen = false;
      this.isEditingActiveEntryRaw = false;
    },
`;
  // Insert before methods: {
  content = content.replace('  methods: {', '  methods: {\n' + closeAllModals);
}

// 3. Wrap openers
const openers = ['openAddRecordModal() {', 'openStoryExportModal() {', 'openChatModal() {', 'startEditingActiveEntryRaw() {'];
openers.forEach(opener => {
  if (content.includes(opener) && !content.includes(opener + '\n      this.closeAllModals();')) {
     content = content.replace(opener, opener + '\n      this.closeAllModals();');
  }
});

fs.writeFileSync(filePath, content);
console.log('mr.js patched successfully via script.');
