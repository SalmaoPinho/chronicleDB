const fs = require('fs');

const filePath = 'scripts/mr.js';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add closeAllModals to methods
// Search for closeAddRecordModal to get a good spot
const target = '    closeAddRecordModal() {';
const closeAllModalsCode = `    closeAllModals() {
      this.addRecordModalOpen = false;
      this.storyExportOpen = false;
      this.chatModalOpen = false;
      this.exportModalOpen = false;
      this.dateMenuOpen = false;
    },
`;

if (!content.includes('closeAllModals() {')) {
  content = content.replace(target, closeAllModalsCode + target);
}

// 2. Wrap modal opening logic
const openMethods = [
  { name: 'openAddRecordModal() {', code: '      this.closeAllModals();' },
  { name: 'openStoryExportModal() {', code: '      this.closeAllModals();' },
  { name: 'openChatModal() {', code: '      this.closeAllModals();' }
];

openMethods.forEach(m => {
  if (content.includes(m.name) && !content.includes(m.name + '\n' + m.code)) {
    content = content.replace(m.name, m.name + '\n' + m.code);
  }
});

fs.writeFileSync(filePath, content);
console.log('mr.js modal management updated.');
