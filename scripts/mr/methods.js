(function initMrMethods(global) {
  const {
    SPECIAL_ENTRY_ICONS,
    NAV_GROUP_ORDER,
    TIMELINE_EVENT_TAG_HINTS,
    TIMELINE_LOCATION_TAG_HINTS,
    TIMELINE_SOURCE,
    TIMELINE_ORG_TAG_HINTS,
    TIMELINE_THEME_TAG_HINTS,
    MR_UI_STATE_KEY,
    MAX_ROW_UPLOAD_BYTES,
    MAX_TIMELINE_PORTRAIT_QUEUE,
    ENABLE_DIRECT_PROBES,
    STORY_SET_PRESETS,
    STORY_VOICE_TAGS,
    CHARSHEET_TONE_OPTIONS,
    CHARSHEET_PRECISION_OPTIONS,
    CHARSHEET_CAPS_OPTIONS,
    CHARSHEET_HONESTY_OPTIONS,
    CHARSHEET_FORMALITY_OPTIONS,
    CHARSHEET_COLOR_PALETTE,
    CHARSHEET_FONT_VIBES,
    CHARSHEET_MODE_OPTIONS,
    ICON_SYMBOLS,
    TIMELINE_TAG_ALIASES,
    CANONICAL_JESS_IDS
  } = global.MR_CONSTANTS || {};
  const MediaUtils = global.ProjectMediaUtils || {};
  const NOTEBOOK_SFX_MAP = {
    // Combat
    'punch': ['sfx/sort/thump1.wav', 'sfx/sort/thump2.wav', 'sfx/sort/thump3.wav'],
    'kick': ['sfx/sort/thump4.wav', 'sfx/sort/thump5.wav', 'sfx/sort/thump6.wav'],
    'thud': ['sfx/sort/Thumpdistant01.wav', 'sfx/sort/Thumpdistant02.wav', 'sfx/sort/thumpa1.wav'],
    'bash': ['sfx/sort/sledgehammer.wav', 'sfx/sort/breakdoor.wav'],
    'unsheathe': 'sfx/unsheathe.ogg',
    'whoosh': 'sfx/whoosh.wav',
    'sword': 'sfx/unsheathe.ogg',
    'clash': 'sfx/bash.wav'
  };

  global.MR_METHODS = global.MR_METHODS || {};
  Object.assign(global.MR_METHODS, {
    parseMarkdownBlocks(content, entryId) {
      const blockRegex = /<!--\s*block:\s*([\w\-]+)\s*({.*?})\s*-->/g;
      const hasExplicitBlocks = /<!--\s*block:[^>]*-->/.test(content);

      if (!hasExplicitBlocks) {
        // SMART PARSING MODE (Implicit blocks)
        const blocks = [];
        const paragraphs = content.split(/\n\s*\n/);

        let introParagraphs = [];
        let tableRows = [];
        let noteParagraphs = [];

        let phase = 'intro'; // 'intro' -> 'table' -> 'notes'

        paragraphs.forEach(p => {
          const trimmed = p.trim();
          if (!trimmed) return;

          if (phase === 'intro') {
            if (trimmed.startsWith('## ')) {
              phase = 'table';
              tableRows.push(trimmed);
            } else {
              introParagraphs.push(trimmed);
            }
          } else if (phase === 'table') {
            if (trimmed.startsWith('## ')) {
              tableRows.push(trimmed);
            } else {
              phase = 'notes';
              noteParagraphs.push(trimmed);
            }
          } else {
            noteParagraphs.push(trimmed);
          }
        });

        // 1. Flush Intro
        if (introParagraphs.length) {
          blocks.push({
            type: 'text',
            body: marked.parse(introParagraphs.join('\n\n')).trim(),
            className: 'char-intro'
          });
        }

        // 2. Flush Table
        if (tableRows.length) {
          const rows = [];
          tableRows.forEach(tr => {
            const lines = tr.split('\n');
            const label = lines[0].slice(3).trim();
            let value = '';
            let img = '';
            let imgnotes = '';
            let unmasked = '';
            let exposed = '';
            for (let j = 1; j < lines.length; j++) {
              const line = lines[j].trim();
              if (line.startsWith('*(img: ')) img = line.slice(7, -2);
              else if (line.startsWith('*(imgnotes: ')) imgnotes = line.slice(12, -2);
              else if (line.startsWith('*(unmasked: ')) unmasked = line.slice(12, -2);
              else if (line.startsWith('*(exposed: ')) exposed = line.slice(11, -2);
              else if (line) value += (value ? '<BR>' : '') + line;
            }

            // Automatic Image Resolution fallback
            if (!img && label && entryId) {
              const slug = this.slugify(label);
              img = `portraits/${entryId}/${this.activeYear}-${slug}.jpg`;
            }

            rows.push({ label, value, img, imgnotes, unmasked, exposed });
          });
          blocks.push({ type: 'table', rows });
        }

        // 3. Flush Notes
        if (noteParagraphs.length) {
          blocks.push({
            type: 'text',
            body: marked.parse(noteParagraphs.join('\n\n')).trim(),
            className: 'obs-box'
          });
        }

        return blocks;
      }

      // EXPLICIT MODE
      // EXPLICIT MODE
      const blocks = [];
      let match;
      const types = [];
      const propsList = [];
      const positions = [];

      while ((match = blockRegex.exec(content)) !== null) {
        types.push(match[1]);
        let p = {};
        try { p = JSON.parse(match[2].replace(/-- >/g, '-->')); } catch (e) { }
        propsList.push(p);
        positions.push(match.index + match[0].length);
      }

      const firstBlockStart = content.indexOf(content.match(/<!--\s*block:[^>]*-->/)?.[0]);
      if (firstBlockStart > 0) {
        const preText = content.slice(0, firstBlockStart).trim();
        if (preText) {
          blocks.push({ type: 'text', body: marked.parse(preText).trim(), className: 'char-intro' });
        }
      } else if (firstBlockStart === -1 && content.trim()) {
        return [{ type: 'text', body: marked.parse(content).trim(), className: 'char-intro' }];
      }

      for (let i = 0; i < types.length; i++) {
        const start = positions[i];
        let nextBlockMatch = content.slice(start).match(/<!--\s*block:[^>]*-->/);
        const end = nextBlockMatch ? (start + nextBlockMatch.index) : content.length;
        const type = types[i];
        const props = propsList[i];
        const blockContent = content.slice(start, end).trim();

        if (type === 'table') {
          const rows = [];
          const rowParts = blockContent.split(/^##\s+/m);
          rowParts.forEach(rp => {
            if (!rp.trim()) return;
            const lines = rp.split('\n');
            const label = lines[0].trim();
            let value = '';
            let img = '';
            let imgnotes = '';
            let unmasked = '';
            let exposed = '';
            for (let j = 1; j < lines.length; j++) {
              const line = lines[j].trim();
              if (line.startsWith('*(img: ')) img = line.slice(7, -2);
              else if (line.startsWith('*(imgnotes: ')) imgnotes = line.slice(12, -2);
              else if (line.startsWith('*(unmasked: ')) unmasked = line.slice(12, -2);
              else if (line.startsWith('*(exposed: ')) exposed = line.slice(11, -2);
              else if (line) value += (value ? '<BR>' : '') + line;
            }

            // Automatic Image Resolution fallback
            if (!img && label && entryId) {
              const slug = this.slugify(label);
              // Try .jpg by default. Migration script will ensure files are there.
              img = `portraits/${entryId}/${this.activeYear}-${slug}.jpg`;
            }

            rows.push({ label, value, img, imgnotes, unmasked, exposed });
          });
          blocks.push({ ...props, type, rows });
        } else if (type === 'faction' || type === 'list') {
          const lines = blockContent.split('\n');
          const bodyLines = [];
          const members = [];
          lines.forEach(line => {
            const memberMatch = line.match(/^- \s+(.*)/);
            if (memberMatch) {
              let text = memberMatch[1].trim();
              const tierMatch = text.match(/\s*<!--\s*tier:\s*(.*?)\s*-->/);
              let tier = '';
              if (tierMatch) { tier = tierMatch[1]; text = text.replace(tierMatch[0], '').trim(); }
              members.push({ text, tier });
            } else { bodyLines.push(line); }
          });
          blocks.push({ ...props, type, body: bodyLines.join('<BR>'), members });
        } else {
          blocks.push({ ...props, type, body: marked.parse(blockContent).trim() });
        }
      }
      return blocks;
    },

    scrollStateKey(year, entryId) {
      const y = String(year || '').trim();
      const e = String(entryId || '').trim();
      if (!y || !e) return '';
      return `${y}::${e}`;
    },
    loadUiState() {
      try {
        const raw = window.localStorage.getItem(MR_UI_STATE_KEY)
          || window.sessionStorage.getItem(MR_UI_STATE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') {
          return {};
        }
        return parsed;
      } catch {
        return {};
      }
    },
    startEditingActiveEntryRaw() {
      this.closeAllModals();
      if (!this.activeEntry) return;
      this.activeEntryRawDraft = this.activeEntry.raw || '';
      this.isEditingActiveEntryRaw = true;
      this.activeEntryRawError = '';
    },
    cancelEditingActiveEntryRaw() {
      this.isEditingActiveEntryRaw = false;
      this.activeEntryRawDraft = '';
    },
    async uploadRawEditorImage(file) {
      if (!file) return;
      this.activeEntryRawSaving = true;
      const previousError = this.activeEntryRawError;
      this.activeEntryRawError = 'Uploading pasted image...';
      
      try {
        // Slugify entry title/id
        let entrySlug = 'pasted_character_image';
        if (this.activeEntry) {
          const rawTitle = this.activeEntry.title || this.activeEntry.id || '';
          entrySlug = String(rawTitle)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '');
        }
        if (!entrySlug) entrySlug = 'pasted_character_image';
        
        // Scan active raw editor draft for existing images to calculate the next index
        const text = this.activeEntryRawDraft || '';
        const imgRegex = /!\[.*?\]\(\.\.\/\.\.\/portraits\/events\/.*?\)/g;
        const matches = text.match(imgRegex) || [];
        const imageIndex = matches.length + 1;
        
        const ext = file.name && file.name.lastIndexOf('.') !== -1 
          ? file.name.substring(file.name.lastIndexOf('.')).toLowerCase()
          : '.png';
          
        const customFileName = `${entrySlug}_${imageIndex}${ext}`;
        const base64 = await this.fileToBase64(file);
        const response = await fetch(`${this.backendOrigin()}/api/portraits/upload-event`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: customFileName,
            mimeType: String(file.type || 'image/png'),
            dataBase64: base64,
            useExactName: true
          })
        });
        const result = await response.json();
        if (!result.ok) {
          throw new Error(result.error || 'Upload failed');
        }
        
        // Insert markdown image link at current cursor position
        const textarea = this.$refs.rawEditorTextarea;
        const markdown = `![alt text](../../portraits/events/${result.fileName})`;
        
        if (textarea) {
          const start = textarea.selectionStart;
          const end = textarea.selectionEnd;
          const text = this.activeEntryRawDraft || '';
          this.activeEntryRawDraft = text.substring(0, start) + markdown + text.substring(end);
          
          this.$nextTick(() => {
            textarea.focus();
            textarea.selectionStart = textarea.selectionEnd = start + markdown.length;
          });
        } else {
          this.activeEntryRawDraft = (this.activeEntryRawDraft || '') + '\n' + markdown + '\n';
        }
        
        this.activeEntryRawError = '';
      } catch (err) {
        console.error('Failed to upload pasted raw editor image:', err);
        this.activeEntryRawError = `Pasted image upload failed: ${err.message}`;
      } finally {
        this.activeEntryRawSaving = false;
      }
    },
    async onRawEditorPaste(event) {
      const clipboardData = event.clipboardData || window.clipboardData;
      if (!clipboardData) return;
      
      const items = clipboardData.items;
      let imageFile = null;
      
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          imageFile = items[i].getAsFile();
          break;
        }
      }
      
      if (imageFile) {
        // Prevent default paste of image data/binary text into textarea
        event.preventDefault();
        await this.uploadRawEditorImage(imageFile);
      }
    },
    async pasteImageFromClipboard() {
      try {
        if (navigator.clipboard && typeof navigator.clipboard.read === 'function') {
          const clipboardItems = await navigator.clipboard.read();
          let imageBlob = null;
          
          for (const item of clipboardItems) {
            const imageTypes = item.types.filter(t => t.startsWith('image/'));
            if (imageTypes.length > 0) {
              imageBlob = await item.getType(imageTypes[0]);
              break;
            }
          }
          
          if (imageBlob) {
            const ext = imageBlob.type.split('/')[1] || 'png';
            const file = new File([imageBlob], `pasted_image_${Date.now()}.${ext}`, { type: imageBlob.type });
            await this.uploadRawEditorImage(file);
            return;
          }
        }
      } catch (err) {
        console.warn('Clipboard read failed or not allowed, falling back to file picker:', err);
      }
      
      // Fallback: Open file picker
      const picker = this.$refs.rawEditorFileInput;
      if (picker) {
        picker.click();
      }
    },
    async onRawEditorFileSelected(event) {
      const file = event?.target?.files?.[0] || null;
      if (file) {
        await this.uploadRawEditorImage(file);
      }
      if (event?.target) {
        event.target.value = '';
      }
    },
    async uploadTimelineEditorImage(file, eventObj, index = 0) {
      if (!file) return;
      const key = this.timelineTextSourceKey(eventObj, index);
      
      this.timelineTextErrorByKey = {
        ...(this.timelineTextErrorByKey || {}),
        [key]: 'Uploading pasted image...'
      };
      
      try {
        const draft = this.timelineTextDraftFor(eventObj, index);
        const text = draft.description || '';
        
        // Slugify entry title
        let entrySlug = 'pasted_event_image';
        const currentTitle = draft.title || (eventObj && eventObj.title) || '';
        if (currentTitle) {
          entrySlug = String(currentTitle)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '');
        }
        if (!entrySlug) entrySlug = 'pasted_event_image';
        
        // Scan current timeline draft description for existing images to calculate the next index
        const imgRegex = /!\[.*?\]\(\.\.\/\.\.\/portraits\/events\/.*?\)/g;
        const matches = text.match(imgRegex) || [];
        const imageIndex = matches.length + 1;
        
        const ext = file.name && file.name.lastIndexOf('.') !== -1 
          ? file.name.substring(file.name.lastIndexOf('.')).toLowerCase()
          : '.png';
          
        const customFileName = `${entrySlug}_${imageIndex}${ext}`;
        const base64 = await this.fileToBase64(file);
        const response = await fetch(`${this.backendOrigin()}/api/portraits/upload-event`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: customFileName,
            mimeType: String(file.type || 'image/png'),
            dataBase64: base64,
            useExactName: true
          })
        });
        const result = await response.json();
        if (!result.ok) {
          throw new Error(result.error || 'Upload failed');
        }
        
        const textarea = document.querySelector('.mr-timeline-inline-desc-input');
        const markdown = `![alt text](../../portraits/events/${result.fileName})`;
        
        if (textarea) {
          const start = textarea.selectionStart;
          const end = textarea.selectionEnd;
          const newDesc = text.substring(0, start) + markdown + text.substring(end);
          this.setTimelineTextDraft(eventObj, index, { description: newDesc });
          
          this.$nextTick(() => {
            textarea.focus();
            textarea.selectionStart = textarea.selectionEnd = start + markdown.length;
            textarea.style.height = 'auto';
            textarea.style.height = textarea.scrollHeight + 'px';
          });
        } else {
          this.setTimelineTextDraft(eventObj, index, { description: text + '\n' + markdown + '\n' });
        }
        
        this.timelineTextErrorByKey = {
          ...(this.timelineTextErrorByKey || {}),
          [key]: ''
        };
      } catch (err) {
        console.error('Failed to upload pasted timeline editor image:', err);
        this.timelineTextErrorByKey = {
          ...(this.timelineTextErrorByKey || {}),
          [key]: `Pasted image upload failed: ${err.message}`
        };
      }
    },
    async onTimelineEditorPaste(event, eventObj, index = 0) {
      const clipboardData = event.clipboardData || window.clipboardData;
      if (!clipboardData) return;
      
      const items = clipboardData.items;
      let imageFile = null;
      
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          imageFile = items[i].getAsFile();
          break;
        }
      }
      
      if (imageFile) {
        event.preventDefault();
        await this.uploadTimelineEditorImage(imageFile, eventObj, index);
      }
    },
    async pasteImageFromClipboardForTimeline(eventObj, index = 0) {
      try {
        if (navigator.clipboard && typeof navigator.clipboard.read === 'function') {
          const clipboardItems = await navigator.clipboard.read();
          let imageBlob = null;
          
          for (const item of clipboardItems) {
            const imageTypes = item.types.filter(t => t.startsWith('image/'));
            if (imageTypes.length > 0) {
              imageBlob = await item.getType(imageTypes[0]);
              break;
            }
          }
          
          if (imageBlob) {
            const ext = imageBlob.type.split('/')[1] || 'png';
            const file = new File([imageBlob], `pasted_image_${Date.now()}.${ext}`, { type: imageBlob.type });
            await this.uploadTimelineEditorImage(file, eventObj, index);
            return;
          }
        }
      } catch (err) {
        console.warn('Clipboard read failed or not allowed, falling back to file picker:', err);
      }
      
      const refKey = 'timelineEditorFileInput-' + this.timelineEventKey(eventObj, index);
      const pickerArray = this.$refs[refKey];
      const picker = Array.isArray(pickerArray) ? pickerArray[0] : pickerArray;
      if (picker) {
        picker.click();
      }
    },
    async onTimelineEditorFileSelected(event, eventObj, index = 0) {
      const file = event?.target?.files?.[0] || null;
      if (file) {
        await this.uploadTimelineEditorImage(file, eventObj, index);
      }
      if (event?.target) {
        event.target.value = '';
      }
    },
    async saveActiveEntryRaw() {
      if (!this.activeEntry || !this.activeEntry.source) {
        this.activeEntryRawError = 'Missing source file for entry.';
        return;
      }
      this.activeEntryRawSaving = true;
      this.activeEntryRawError = '';
      try {
        const response = await fetch(`${this.backendOrigin()}/api/character/update-raw`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            characterId: this.activeEntry.id,
            sourceFile: this.activeEntry.source,
            newRaw: this.activeEntryRawDraft
          })
        });
        const result = await response.json();
        if (!result.ok) {
          throw new Error(result.error || 'Failed to save');
        }

        // Success
        this.isEditingActiveEntryRaw = false;
        // Reload characters to get updated raw and blocks
        await this.loadCharacterEntries();
        // The activeEntry should be updated automatically if loadCharacterEntries 
        // refreshes the list and keeps activeEntryId
      } catch (err) {
        console.error('MR: failed to save raw entry', err);
        this.activeEntryRawError = err.message;
      } finally {
        this.activeEntryRawSaving = false;
      }
    },
    pageReaderContextKey() {
      const notebookContext = this.activeEntry?.id && String(this.activeEntry.id || '').toLowerCase() === 'notebook-archive'
        ? String(this.activeNotebookId || '')
        : '';
      return `${String(this.activeYear || '')}::${String(this.activeEntryId || '')}::${notebookContext}`;
    },
    parseDialogueLine(text) {
      if (!text || typeof text !== 'string') return null;
      const match = text.match(/^\s*(?:\[([^\]\n]{2,25})\]|([^:\n]{2,25})):\s+(.*)$/);
      if (!match) return null;

      const speaker = (match[1] || match[2]).trim();
      let dialogue = match[3].trim();

      if (this.resolveCharacterIdByName(speaker)) {
        dialogue = dialogue.replace(/^["'â€œ](.*)["'â€ ]$/, '$1').trim();
        dialogue = dialogue.replace(/^\[[^\]]*\]\s*/, '').trim();
        return { speaker, dialogue };
      }
      return null;
    },
    resolveCharacterIdByName(name) {
      if (!name || !this.characterCore) return null;
      const n = name.toLowerCase().trim();

      if (this.characterCore[n]) {
        return n;
      }
      const dashed = n.replace(/\s+/g, '-');
      if (this.characterCore[dashed]) {
        return dashed;
      }

      for (const [id, char] of Object.entries(this.characterCore)) {
        const fullName = String(char['full name'] || '').toLowerCase();
        if (fullName === n || fullName.split(' ')[0] === n) {
          return id;
        }
        const navLabel = String(char.navLabel || '').toLowerCase();
        if (navLabel === n) {
          return id;
        }
      }

      if (this.entitiesRegistry && this.entitiesRegistry[n]) return n;
      return null;
    },
    collectPageReadableElements() {
      const mainPane = this.$refs?.mainPane || null;
      if (!mainPane) {
        return [];
      }

      const notebookPane = mainPane.querySelector('.mr-notebook-pane');
      if (notebookPane) {
        const found = Array.from(notebookPane.querySelectorAll([
          '.mr-notebook-entry-date',
          '.mr-notebook-entry-title',
          '.mr-notebook-entry-body > div',
          '.mr-notebook-entry-body p',
          '.mr-notebook-entry-body .obs-box',
          '.mr-notebook-entry-body .rant-box',
          '.mr-notebook-entry-body .sticky',
          '.mr-notebook-entry-body .dialogue .dl',
          '.mr-notebook-entry-body .mr-dialogue-bubble',
          '.mr-notebook-entry-body .mr-bubble-action',
          '.mr-notebook-entry-body .mr-bubble-sound'
        ].join(',')));

        const unique = [];
        const seen = new Set();
        found.forEach((el) => {
          if (!el || seen.has(el)) {
            return;
          }
          if (el.closest('button, select, input, .mr-sidebar, .mr-notebooks-list')) {
            return;
          }
          const text = this.pageReaderText(el);
          if (!text) {
            return;
          }
          seen.add(el);
          unique.push(el);
        });

        const nonOverlapping = unique.filter(el => {
          return !unique.some(other => other !== el && el.contains(other));
        });
        return nonOverlapping;
      }

      const cards = Array.from(mainPane.querySelectorAll('.mr-card'));
      const searchRoots = cards.length ? cards : [mainPane];

      const selectors = this.isTimelineEntryActive
        ? [
            '.mr-timeline-date',
            '.mr-timeline-item-title',
            '.mr-timeline-desc',
            '.mr-timeline-desc-paragraph',
            '.mr-timeline-desc .mr-dialogue-bubble'
          ].join(',')
        : [
            '.mr-eyebrow',
            '.mr-header-row .mr-h1',
            '.mr-card-normal-content .mr-block > .mr-label',
            '.mr-card-normal-content .mr-block > .mr-body',
            '.mr-card-normal-content .mr-block .mr-body p',
            '.mr-card-normal-content .mr-block .mr-body li',
            '.mr-card-normal-content .mr-timeline-note',
            '.mr-card-normal-content .mr-body',
            '.mr-table tr td:first-child',
            '.mr-table tr td:nth-child(2) .mr-body',
            '.mr-table tr td:nth-child(2) .mr-muted',
            '.mr-timeline-date',
            '.mr-timeline-item-title',
            '.mr-timeline-desc',
            '.mr-timeline-desc-paragraph',
            '.mr-timeline-desc .mr-dialogue-bubble',
            '.mr-notebook-cover-title',
            '.mr-notebook-cover-sub',
            '.mr-notebook-entry-date',
            '.mr-notebook-entry-title',
            '.mr-notebook-entry-body p',
            '.mr-notebook-entry-body .obs-box',
            '.mr-notebook-entry-body .rant-box',
            '.mr-notebook-entry-body .sticky',
            '.mr-notebook-entry-body .dialogue .dl',
            '.mr-notebook-entry-body .mr-dialogue-bubble',
            '.mr-notebook-entry-body .mr-bubble-action',
            '.mr-notebook-entry-body .mr-bubble-sound'
          ].join(',');

      const unique = [];
      const seen = new Set();

      for (const root of searchRoots) {
        const found = Array.from(root.querySelectorAll(selectors));
        found.forEach((el) => {
          if (!el || seen.has(el)) {
            return;
          }
          if (el.closest('button, select, input, .mr-sidebar, .mr-notebooks-list')) {
            return;
          }
          const text = this.pageReaderText(el);
          if (!text) {
            return;
          }
          seen.add(el);
          unique.push(el);
        });
      }

      // Filter out elements that contain other readable elements (keep only the deepest matching nodes)
      const nonOverlapping = unique.filter(el => {
        return !unique.some(other => other !== el && el.contains(other));
      });

      return nonOverlapping;
    },
    firstVisibleReadableIndex(elements, rootEl = null) {
      const list = Array.isArray(elements) ? elements : [];
      if (!list.length) {
        return 0;
      }

      const rootRect = rootEl && typeof rootEl.getBoundingClientRect === 'function'
        ? rootEl.getBoundingClientRect()
        : { top: 0, bottom: Number(window.innerHeight || 0) };

      let bestIndex = 0;
      let bestTop = Number.POSITIVE_INFINITY;

      list.forEach((el, index) => {
        if (!el || typeof el.getBoundingClientRect !== 'function') {
          return;
        }
        const rect = el.getBoundingClientRect();
        const isVisible = rect.bottom > (rootRect.top + 2) && rect.top < (rootRect.bottom - 2);
        if (!isVisible) {
          return;
        }
        if (rect.top < bestTop) {
          bestTop = rect.top;
          bestIndex = index;
        }
      });

      return bestIndex;
    },
    pageReaderText(el) {
      if (el.classList.contains('dl')) {
        return String(el.querySelector('.dt')?.textContent || el.textContent || '').trim();
      }
      if (el.classList.contains('mr-dialogue-bubble')) {
        return String(el.querySelector('.mr-bubble-text')?.textContent || el.textContent || '').trim();
      }
      if (el.classList.contains('mr-bubble-action')) {
        const actor = el.dataset.actor || '';
        const text = String(el.querySelector('.mr-action-content')?.textContent || el.textContent || '').trim();
        return actor ? `${actor}: ${text}` : text;
      }
      if (el.classList.contains('mr-bubble-sound')) {
        return String(el.querySelector('.mr-sfx-content')?.textContent || el.textContent || '').trim();
      }
      const rawText = String(el?.textContent || '').replace(/\s+/g, ' ').trim();
      const dialogue = this.parseDialogueLine(rawText);
      return dialogue ? dialogue.dialogue : rawText;
    },
    copyCharacterJsonToClipboard() {
      const active = this.activeEntry;
      if (!active || !active.id) {
        alert('No active character selected to copy.');
        return;
      }
      const charId = String(active.id || '').toLowerCase().trim();
      if (!charId) {
        alert('Active character id is invalid.');
        return;
      }
      const url = `${this.backendOrigin()}/api/export/character?characterId=${encodeURIComponent(charId)}`;
      this.copyAsyncTextToClipboard(url, 'JSON', charId);
    },
    copyCharacterMdToClipboard() {
      const active = this.activeEntry;
      if (!active || !active.id) {
        alert('No active character selected to copy.');
        return;
      }
      const charId = String(active.id || '').toLowerCase().trim();
      if (!charId) {
        alert('Active character id is invalid.');
        return;
      }
      const url = `${this.backendOrigin()}/api/export/character?characterId=${encodeURIComponent(charId)}&format=markdown`;
      this.copyAsyncTextToClipboard(url, 'Markdown', charId);
    },
    async copyAsyncTextToClipboard(url, formatName, charId) {
      this.closeAllModals();
      const isMarkdown = formatName === 'Markdown';

      // Check if ClipboardItem promise approach is supported
      if (typeof ClipboardItem !== 'undefined') {
        try {
          const promise = fetch(url)
            .then(async (res) => {
              if (!res.ok) {
                throw new Error(`Server returned ${res.status}`);
              }
              const data = await res.json();
              const text = isMarkdown ? data.markdown : JSON.stringify(data, null, 2);
              if (isMarkdown && !text) {
                throw new Error('No markdown content returned from server.');
              }
              // Set success notice
              setTimeout(() => {
                this.setTimelineBatchNotice(`Copied ${charId} ${formatName} data to clipboard!`, 'success');
              }, 100);
              return new Blob([text], { type: 'text/plain' });
            });

          const item = new ClipboardItem({
            'text/plain': promise
          });
          await navigator.clipboard.write([item]);
          return;
        } catch (err) {
          console.warn('ClipboardItem promise approach failed, falling back to standard copy:', err);
        }
      }

      // Fallback: fetch, then copy
      try {
        const res = await fetch(url);
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(txt || `Server returned ${res.status}`);
        }
        const data = await res.json();
        const text = isMarkdown ? data.markdown : JSON.stringify(data, null, 2);
        if (isMarkdown && !text) {
          throw new Error('No markdown content returned from server.');
        }

        let copied = false;
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          try {
            await navigator.clipboard.writeText(text);
            copied = true;
          } catch (writeErr) {
            console.warn('writeText failed:', writeErr);
          }
        }

        if (!copied) {
          // execCommand fallback
          const textArea = document.createElement("textarea");
          textArea.value = text;
          textArea.style.position = "fixed";
          textArea.style.opacity = "0";
          document.body.appendChild(textArea);
          textArea.focus();
          textArea.select();
          try {
            copied = document.execCommand('copy');
          } catch (execErr) {
            console.warn('execCommand copy failed:', execErr);
          }
          document.body.removeChild(textArea);
        }

        if (copied) {
          this.setTimelineBatchNotice(`Copied ${charId} ${formatName} data to clipboard!`, 'success');
        } else {
          this.showManualCopyFallback(text, charId, formatName);
        }
      } catch (err) {
        console.error(`Failed to copy character ${formatName}:`, err);
        alert(`Failed to fetch and copy character ${formatName}.`);
      }
    },
    showManualCopyFallback(text, charId, formatName) {
      this.manualCopyText = text;
      this.manualCopyCharId = charId;
      this.manualCopyFormat = formatName;
      this.manualCopyOpen = true;
      this.$nextTick(() => {
        const ta = this.$refs.manualCopyTextarea;
        if (ta) {
          ta.focus();
          ta.select();
        }
      });
    },
    selectManualCopyText() {
      const ta = this.$refs.manualCopyTextarea;
      if (ta) {
        ta.focus();
        ta.select();
      }
    },
    formatTimelineDate(value) {
      const raw = String(value || '').trim();
      if (!raw) {
        return 'Unknown Date';
      }

      const match = raw.match(/^(-?\d+)-(\d{1,2})-(\d{1,2})$/);
      if (!match) {
        return this.plainText(raw);
      }

      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];

      if (!Number.isFinite(year)) {
        return this.plainText(raw);
      }
      const isBC = year < 0;
      const yearLabel = isBC ? `${Math.abs(year)} BC` : `${year}`;
      if (!Number.isFinite(month) || month <= 0 || month > 12) {
        return yearLabel;
      }

      const monthName = monthNames[month - 1] || '';
      if (!Number.isFinite(day) || day <= 0 || day > 31) {
        return `${monthName} ${yearLabel}`;
      }

      return `${monthName} ${day}, ${yearLabel}`;
    },
    formatTimelineCardDate(value) {
      return this.formatTimelineDate(value);
    },
    parseTimelineDateParts(value) {
      const raw = String(value || '').trim();
      const match = raw.match(/^(-?\d+)-(\d{1,2})-(\d{1,2})$/);
      if (!match) {
        return null;
      }
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      if (!Number.isFinite(year)) {
        return null;
      }
      return {
        year,
        month: Number.isFinite(month) && month >= 0 && month <= 12 ? month : 0,
        day: Number.isFinite(day) && day >= 0 && day <= 31 ? day : 0
      };
    },
    extractYear(value) {
      if (!value) return null;
      const raw = this.plainText(value);
      const parts = this.parseTimelineDateParts(raw);
      if (parts?.year) return parts.year;

      const match = raw.match(/\b(\d{4})\b/);
      if (match) return Number(match[1]);
      return null;
    },
    findMentionedCharacterId(text, excludeId = '') {
      if (!text || !this.characterCore) return null;

      const candidates = [];
      Object.entries(this.characterCore).forEach(([id, char]) => {
        if (id.length > 2 && id !== excludeId) candidates.push({ id, name: id });
        const spaceId = id.replace(/-/g, ' ');
        if (spaceId !== id && spaceId.length > 2 && id !== excludeId) candidates.push({ id, name: spaceId });
        const fullName = char?.['full name'];
        if (fullName && fullName.length > 2 && id !== excludeId) candidates.push({ id, name: fullName });
        const navLabel = char?.navLabel;
        if (navLabel && navLabel.length > 2 && id !== excludeId) candidates.push({ id, name: navLabel });
      });

      candidates.sort((a, b) => b.name.length - a.name.length);

      for (const cand of candidates) {
        const regex = new RegExp(`\\b${this.escapeRegExp(cand.name)}\\b`, 'i');
        if (regex.test(text)) return cand.id;
      }
      return null;
    },
    getCoreBirthRaw(core) {
      if (!core || typeof core !== 'object') return '';
      // Check specific fields in order of precision
      if (typeof core.birthDate === 'string' && core.birthDate.trim()) return core.birthDate.trim();
      if (typeof core.birthday === 'string' && core.birthday.trim()) return core.birthday.trim();
      if (typeof core.born === 'string' && core.born.trim()) return core.born.trim();
      if (typeof core.birth === 'string' && core.birth.trim()) return core.birth.trim();
      
      if (Array.isArray(core.rows)) {
        const row = core.rows.find((r) => r && (r.birthDate || r.birthdate || r.birthday || r.born || (r.label && this.normalize(r.label).includes('birth'))));
        return row?.birthDate || row?.birthdate || row?.birthday || row?.born || row?.value || '';
      }
      return '';
    },
    getCoreDeathRaw(core) {
      if (!core || typeof core !== 'object') return '';
      if (typeof core.deathDate === 'string' && core.deathDate.trim()) return core.deathDate.trim();
      if (typeof core.deathday === 'string' && core.deathday.trim()) return core.deathday.trim();
      if (typeof core.died === 'string' && core.died.trim()) return core.died.trim();
      if (typeof core.death === 'string' && core.death.trim()) return core.death.trim();

      if (Array.isArray(core.rows)) {
        const row = core.rows.find((r) => r && (r.deathDate || r.deathdate || r.deathday || r.died || (r.label && this.normalize(r.label).includes('death'))));
        return row?.deathDate || row?.deathdate || row?.deathday || row?.died || row?.value || '';
      }
      return '';
    },
    compareTimelineDateParts(a, b) {
      if (!a || !b) return 0;
      if (a.year !== b.year) return a.year - b.year;
      if ((a.month || 0) !== (b.month || 0)) return (a.month || 0) - (b.month || 0);
      return (a.day || 0) - (b.day || 0);
    },
    isCharacterDeadAtDate(characterId, dateStr) {
      const id = String(characterId || '').toLowerCase().trim();
      if (!id) return false;
      const deathParts = this.characterDeathParts(id);
      if (!deathParts) return false;
      const eventParts = this.parseTimelineDateParts(dateStr || '');
      if (!eventParts) return false;
      return this.compareTimelineDateParts(eventParts, deathParts) >= 0;
    },
    timelinePortraitAgeLabel(characterId, event) {
      const cid = String(characterId || '').toLowerCase().trim();
      if (!cid) {
        return 'Age: Unknown';
      }

      const age = this.characterAgeAtDate(cid, event?.date || '');
      if (age === null || !Number.isFinite(age) || age < 0) {
        return 'Age: Unknown';
      }
      return `Age: ${age}`;
    },
    initPageReader() {
      if (!this.pageReaderUiVisible) {
        this.pageReaderReady = false;
        return;
      }
      if (typeof window.UniversalListener !== 'function') {
        this.pageReaderReady = false;
        return;
      }

      const voiceSelect = this.$refs?.pageReaderVoiceSelect || null;
      const speedInput = this.$refs?.pageReaderSpeedInput || null;
      const speedValue = this.$refs?.pageReaderSpeedValue || null;
      const volumeInput = this.$refs?.pageReaderVolumeInput || null;
      const volumeValue = this.$refs?.pageReaderVolumeValue || null;

      const controlsKey = `${Boolean(voiceSelect)}:${Boolean(speedInput)}:${Boolean(speedValue)}:${Boolean(volumeInput)}:${Boolean(volumeValue)}`;
      if (this._pageReader && this._pageReaderControlsKey === controlsKey) {
        this._pageReader.setContext(this.pageReaderContextKey());
        const elements = this.collectPageReadableElements();
        this.pageReaderProgress = elements.length ? `0 / ${elements.length}` : '0 / 0';
        this.pageReaderCurrentIndex = 0;
        this.pageReaderTotalSegments = elements.length;
        this.pageReaderReady = true;
        return;
      }

      if (this._pageReader) {
        this._pageReader.destroy();
        this._pageReader = null;
      }

      this._pageReader = new window.UniversalListener({
        storageKey: 'mr-page-reader',
        voiceSelect,
        speedInput,
        speedLabel: speedValue,
        volumeInput,
        volumeLabel: volumeValue,
        backendOrigin: this.backendOrigin(),
        highlightClass: 'mr-speaking-now',
        getElements: () => this.collectPageReadableElements(),
        resolveAudio: (el) => {
          const text = this.pageReaderText(el);
          if (el.classList.contains('mr-bubble-action')) {
            return this.getNotebookSFXPath(text);
          }
          if (el.classList.contains('mr-bubble-sound') || (text && text.trim().startsWith('!'))) {
            return this.getNotebookSFXPath(text);
          }
          return null;
        },
        resolveSpeechText: (el) => {
          return this.pageReaderText(el);
        },
        resolveVoice: (el) => {
          const rawText = String(el?.textContent || '').trim();
          const dialogue = this.parseDialogueLine(rawText);
          let speakerId = null;

          if (dialogue) {
            speakerId = this.resolveCharacterIdByName(dialogue.speaker);
          }

          if (!speakerId) {
            speakerId = el.dataset.speaker || this.getResolvedCharacterId(this.activeEntryId);
          }

          if (speakerId) {
            const char = this.getResolvedCharacterCore(speakerId);
            if (char && char.voice) {
              return {
                name: char.voice,
                pitch: char.voicePitch || char.pitch || 1.05,
                rate: char.voiceRate || char.rate || null,
                gender: char.gender || null
              };
            }
          }
          return null;
        },
        onProgress: ({ index, total }) => {
          this.pageReaderProgress = `${index + 1} / ${total}`;
          this.pageReaderCurrentIndex = index + 1;
          this.pageReaderTotalSegments = total;
        },
        onState: (reading) => {
          this.pageReaderReading = Boolean(reading);
          if (!reading) {
            this.pageReaderProgress = this.pageReaderProgress || '0 / 0';
          }
        }
      });
      this._pageReader.init();
      this._pageReader.setContext(this.pageReaderContextKey());
      const elements = this.collectPageReadableElements();
      this.pageReaderProgress = elements.length ? `0 / ${elements.length}` : '0 / 0';
      this.pageReaderCurrentIndex = 0;
      this.pageReaderTotalSegments = elements.length;
      this.pageReaderReady = true;
      if (voiceSelect) {
        voiceSelect.addEventListener('focus', () => {
          this._pageReader?.refreshVoices();
        });
        voiceSelect.addEventListener('pointerdown', () => {
          this._pageReader?.refreshVoices();
        });
      }
      this._pageReaderControlsKey = controlsKey;
      this.pageReaderReady = true;
    },
    handlePageReaderClick(event) {
      if (!this.pageReaderUiVisible || !this._pageReader) return;

      const elements = this.collectPageReadableElements();
      if (!elements.length) return;

      // Find if we clicked a readable element or one of its children
      const clickedEl = elements.find((el) => el === event.target || el.contains(event.target));



      if (clickedEl) {
        const index = elements.indexOf(clickedEl);
        if (index !== -1) {
          event.preventDefault();
          event.stopPropagation();
          this._pageReader.start(index);
        }
      }
    },
    syncPageReaderToElement(targetEl) {
      if (!this.pageReaderUiVisible || !this._pageReader || !targetEl) return;

      const elements = this.collectPageReadableElements();
      // Find the element in the readable list, or the first readable child/parent
      let index = elements.indexOf(targetEl);
      if (index === -1) {
        // Fallback: find if targetEl contains any of the readable elements
        const firstChild = elements.find(el => targetEl.contains(el));
        if (firstChild) index = elements.indexOf(firstChild);
      }

      if (index !== -1) {
        console.log(`Syncing Page Reader to index ${index}`);
        this._pageReader.start(index);
      }
    },
    toggleTimelinePortraits() {
      this.timelinePortraitsVisible = !this.timelinePortraitsVisible;
      this.saveUiState();
    },
    togglePageReader() {
      if (!this._pageReader) {
        this.initPageReader();
      }
      if (!this._pageReader) return;
      if (this._pageReader.isReading) {
        this._pageReader.stop();
        return;
      }
      this._pageReader.setContext(this.pageReaderContextKey());

      const elements = this.collectPageReadableElements();
      const firstVisible = this.firstVisibleReadableIndex(elements, this.$refs?.mainPane || null);
      const savedIndex = this._pageReader.getSavedProgress();

      console.log('MR: togglePageReader', { 
        elementsCount: elements.length, 
        savedIndex, 
        firstVisible 
      });

      if (elements.length === 0) {
        this.pageReaderProgress = '0 / 0';
        this.pageReaderCurrentIndex = 0;
        this.pageReaderTotalSegments = 0;
        return;
      }

      // Resume from saved index if at the top of the page, otherwise start from view
      if (firstVisible === 0 && savedIndex > 0) {
        this._pageReader.start(savedIndex);
      } else {
        this._pageReader.start(firstVisible);
      }
    },
    togglePageReaderUi() {
      this.pageReaderUiVisible = !this.pageReaderUiVisible;
      if (!this.pageReaderUiVisible) {
        if (this._pageReader?.isReading) {
          this._pageReader.stop();
        }
        this.pageReaderReady = false;
        this.pageReaderProgress = '0 / 0';
        this.pageReaderCurrentIndex = 0;
        this.pageReaderTotalSegments = 0;
        return;
      }
      this.$nextTick(() => this.initPageReader());
    },
    skipPageReader(delta) {
      if (!this._pageReader) {
        this.initPageReader();
      }
      if (!this._pageReader) {
        return;
      }
      const step = Number(delta || 0);
      if (!Number.isFinite(step) || step === 0) {
        return;
      }
      const current = Number(this._pageReader.currentIndex || 0);
      this._pageReader.skipTo(current + step);
    },
    skipPageReaderEntry(delta) {
      if (!this._pageReader) {
        this.initPageReader();
      }
      if (!this._pageReader) {
        return;
      }
      const direction = Number(delta || 0);
      if (!Number.isFinite(direction) || direction === 0) {
        return;
      }

      const elements = this._pageReader.elements;
      if (!elements || !elements.length) {
        return;
      }

      const currentIndex = this._pageReader.currentIndex;
      const currentEl = elements[currentIndex];
      if (!currentEl) {
        return;
      }

      const currentEntry = currentEl.closest('.mr-timeline-item, .mr-notebook-entry, .mr-block');

      if (direction > 0) {
        // Find the first element that is in a different (succeeding) entry
        let targetIndex = currentIndex + 1;
        while (targetIndex < elements.length) {
          const el = elements[targetIndex];
          const entry = el.closest('.mr-timeline-item, .mr-notebook-entry, .mr-block');
          if (entry && entry !== currentEntry) {
            this._pageReader.skipTo(targetIndex);
            return;
          }
          targetIndex++;
        }
        // If not found, stop playback
        this._pageReader.stop();
      } else {
        // Find all elements in the current entry to locate its start
        let currentEntryStartIndex = -1;
        for (let i = 0; i < elements.length; i++) {
          const el = elements[i];
          const entry = el.closest('.mr-timeline-item, .mr-notebook-entry, .mr-block');
          if (entry === currentEntry) {
            if (currentEntryStartIndex === -1) {
              currentEntryStartIndex = i;
            }
          }
        }

        if (currentIndex > currentEntryStartIndex && currentEntryStartIndex !== -1) {
          // Restart current entry
          this._pageReader.skipTo(currentEntryStartIndex);
        } else {
          // Go to the previous entry
          const checkIndex = currentEntryStartIndex !== -1 ? currentEntryStartIndex : currentIndex;
          let targetIndex = checkIndex - 1;
          if (targetIndex >= 0) {
            const prevEl = elements[targetIndex];
            const prevEntry = prevEl.closest('.mr-timeline-item, .mr-notebook-entry, .mr-block');
            if (prevEntry) {
              // Find the start of the previous entry
              let firstIdx = targetIndex;
              while (firstIdx > 0) {
                const el = elements[firstIdx - 1];
                const entry = el.closest('.mr-timeline-item, .mr-notebook-entry, .mr-block');
                if (entry !== prevEntry) {
                  break;
                }
                firstIdx--;
              }
              this._pageReader.skipTo(firstIdx);
            } else {
              this._pageReader.skipTo(targetIndex);
            }
          }
        }
      }
    },
    handlePageReaderProgressInputChange(event) {
      if (!this._pageReader) return;
      let val = Number(event.target.value);
      if (!Number.isFinite(val)) {
        event.target.value = this.pageReaderCurrentIndex;
        return;
      }
      const total = this.pageReaderTotalSegments;
      if (val < 1) val = 1;
      if (val > total) val = total;
      this._pageReader.skipTo(val - 1);
    },
    openCharsheetPromptModal() {
      this.closeAllModals();
      this.charsheetPromptOpen = true;
      this.charsheetPromptNotice = '';

      // Pre-select subjects based on the computed property
      const subjects = {};
      this.charsheetPromptSubjectList.forEach(tag => {
        subjects[tag] = true;
      });
      this.charsheetPromptSubjects = subjects;
    },
    closeCharsheetPromptModal() {
      this.charsheetPromptOpen = false;
      this.saveUiState();
    },
    async _buildCharsheetPromptText() {
      if (!this.charsheetPromptWriter) {
        this.charsheetPromptNotice = 'Please select a Narrator/Writer first.';
        return null;
      }

      const selectedSubjects = Object.keys(this.charsheetPromptSubjects).filter(tag => this.charsheetPromptSubjects[tag]);
      if (selectedSubjects.length === 0) {
        this.charsheetPromptNotice = 'Please select at least one subject character.';
        return null;
      }

      this.charsheetPromptLoading = true;
      this.charsheetPromptNotice = 'Generating prompt...';

      try {
        let guideContent = '';
        try {
          const resp = await fetch('docs/AI_MD_GUIDE.md');
          if (resp.ok) {
            guideContent = await resp.text();
          }
        } catch (e) {
          console.error('Failed to fetch AI_MD_GUIDE.md', e);
        }

        const writerFull = this.characterCore[this.charsheetPromptWriter]?.['full name'] || this.charsheetPromptWriter;
        const voiceConfig = [
          `Narrator/Writer: ${writerFull} (${this.charsheetPromptWriter})`,
          `Tone: ${this.charsheetPromptTone}`,
          `Precision: ${this.charsheetPromptPrecision}`,
          `Capitalization Style: ${this.charsheetPromptCaps}`,
          `Narrative Honesty: ${this.charsheetPromptHonesty}`,
          `Formality Level: ${this.charsheetPromptFormality}`
        ].join('\n');

        const activeRanges = [];
        if (Array.isArray(this.timelineYearRanges)) activeRanges.push(...this.timelineYearRanges);
        if ((this.timelineYearFrom !== null && this.timelineYearFrom !== '') || (this.timelineYearTo !== null && this.timelineYearTo !== '')) {
          activeRanges.push({
            from: this.timelineYearFrom,
            to: this.timelineYearTo,
            monthFrom: this.timelineMonthFrom || '',
            monthTo: this.timelineMonthTo || '',
            exclude: this.timelineExcludeYearRange === true
          });
        }
        const rangeStrings = activeRanges.map(r => {
          const fromPart = r.from || 'Start';
          const toPart = r.to || 'End';
          const mFrom = (this.timelineMonthsOpen && r.monthFrom) ? `-${r.monthFrom}` : '';
          const mTo = (this.timelineMonthsOpen && r.monthTo) ? `-${r.monthTo}` : '';
          const prefix = r.exclude ? 'Excluding ' : '';
          return `${prefix}${fromPart}${mFrom} - ${toPart}${mTo}`;
        });
        const yearRange = rangeStrings.length ? rangeStrings.join(', ') : 'All Time';
        const timelineHeader = `## Timeline Digest for Year Range: ${yearRange}\n(Context for the writer's POV)`;
        const subjectsToExport = [...selectedSubjects];
        const relevantTags = new Set([...subjectsToExport, this.charsheetPromptWriter].map(s => s.toLowerCase().trim()));
        const timelineEntries = this.filteredTimelineEvents
          .filter(ev => {
            const tagsArr = Array.isArray(ev.tags) ? ev.tags : (ev.tags ? [ev.tags] : []);
            return tagsArr.some(t => relevantTags.has(String(t || '').toLowerCase().trim()));
          })
          .map(ev => {
            const date = this.plainText(ev.date || 'Unknown Date');
            const title = this.plainText(ev.title || 'Untitled Event');
            const desc = this.plainText(ev.description || '').substring(0, 300);
            const tagsArr = Array.isArray(ev.tags) ? ev.tags : (ev.tags ? [ev.tags] : []);
            const tags = tagsArr.join(', ');
            return `- ${date}: ${title} — ${desc} [Tags: ${tags}]`;
          }).join('\n');

        const characterStubs = subjectsToExport.map(tag => {
          const lower = tag.toLowerCase().trim();
          const core = this.characterCore[lower] || {};
          const fullName = core['full name'] || tag;
          const navGroup = core.navGroup || core.group || 'Characters';
          const navLabel = core.navLabel || tag;
          const order = core.order || 10;

          const otherSubjects = selectedSubjects.filter(s => s !== tag);
          const onStubs = otherSubjects.map(other => {
            const otherCore = this.characterCore[other.toLowerCase().trim()] || {};
            const otherName = otherCore['full name'] || other;
            return `## on ${other}\n[Write ${writerFull}'s perspective on ${otherName}. How does the narrator see them? What do they notice? What do they not say?]`;
          }).join('\n\n');

          return [
            '<!-- entry-break -->',
            '',
            '---',
            `id: "${lower}"`,
            `order: ${order}`,
            `navGroup: "${navGroup}"`,
            `navLabel: "${navLabel}"`,
            `eyebrow: "${navGroup} Â· POV: ${this.charsheetPromptWriter}"`,
            `title: "${fullName}"`,
            `authorNote: ""`,
            '---',
            '',
            `<!-- block: text {"className":"char-intro"} -->`,
            `[Write a 1â€“3 paragraph character introduction for ${fullName} from the perspective of ${writerFull}. This is the narrator's voice speaking about the subject â€” personal, opinionated, colored by the voice settings above. Reference relevant timeline events.]`,
            '',
            `<!-- block: table {} -->`,
            `## default outfit`,
            `[Describe ${fullName}'s typical clothing, accessories, and style. Include *(imgnotes: ...)* on the next line.]`,
            `*(imgnotes: [describe what would be in a reference image])* `,
            '',
            `## living situation`,
            `[Where do they live? With whom? What does the space say about them?]`,
            `*(imgnotes: [describe reference image])* `,
            '',
            `## carry`,
            `[What do they always have with them? What objects define them?]`,
            `*(imgnotes: [describe reference image])* `,
            '',
            `## beliefs`,
            `[What do they believe in? What are their positions on the world, the supernatural, politics, etc.?]`,
            `*(imgnotes: [describe reference image])* `,
            '',
            otherSubjects.length > 0 ? onStubs : `## on [other characters]\n[Write relationship entries for characters this subject interacts with.]`,
            '',
            `<!-- block: field-note {"label":"Field Notes Â· ${fullName}"} -->`,
            `[Write a short, diaristic aside â€” a personal observation, a memory, or something the narrator noticed that didn't fit anywhere else. This should feel like a margin note.]`,
            '',
            `<!-- block: notes-app {"label":"Notes App Â· On ${fullName}"} -->`,
            `[Write a brief, intimate notes-app-style entry â€” the kind of thing the narrator would type into their phone at 2am. Raw, unedited, honest.]`,
            '',
          ].join('\n');
        }).join('\n\n');

        const formatGuide = [
          '### Entry Structure Reference',
          '',
          'Each character entry MUST include the following structural elements:',
          '',
          '1. **YAML frontmatter** (id, order, navGroup, navLabel, eyebrow, title, authorNote)',
          '2. **`<!-- block: text {"className":"char-intro"} -->`** â€” 1â€“3 paragraphs of narrative introduction',
          '3. **`<!-- block: table {} -->`** â€” followed by multiple `## heading` rows, each with descriptive content.',
          '   - Each table row is a `## heading` followed by prose and an optional `*(imgnotes: ...)*` line.',
          '   - Include at minimum: **default outfit**, **living situation**, **carry**, and **beliefs**.',
          '   - Add topical rows as needed: **faith**, **sleep**, **languages**, **the family**, **core**, etc.',
          '   - Add **relationship rows**: `## on [name]` for other characters the subject interacts with.',
          '4. **`<!-- block: field-note {"label":"..."} -->`** â€” at least one field-note block per entry.',
          '5. **`<!-- block: notes-app {"label":"..."} -->`** â€” at least one notes-app block per entry.',
          '',
          '### Voice Rules',
          '',
          '- The narrator writes in the voice described above (tone, precision, capitalization, honesty, formality).',
          '- `*(imgnotes: ...)*` lines describe what a reference photo would show â€” write these as casual, in-character asides.',
          '- Line breaks within table rows use `<BR>` tags, NOT blank lines.',
          '- Status tags use: `<SPAN class="status-tag status-ongoing">ongoing</SPAN>`, `status-draft`, `status-new`.',
          '- The narrator\'s own entry (if they are a subject) should be written in first person.',
          '- All other entries are written about the subject in second or third person from the narrator\'s POV.',
        ].join('\n');

        const finalPrompt = [
          '# Character Sheet Generation Prompt',
          '',
          `> Generated: ${new Date().toLocaleString()}`,
          `> Writer/Narrator: ${writerFull} (${this.charsheetPromptWriter})`,
          `> Subjects: ${selectedSubjects.join(', ')}`,
          `> Year Range: ${yearRange}`,
          '',
          '---',
          '',
          '## 1. Markdown Format Standard',
          '',
          guideContent || '_AI_MD_GUIDE.md could not be loaded. Follow standard Character Manager Markdown format._',
          '',
          '---',
          '',
          '## 2. Entry Format Guide (CRITICAL)',
          '',
          formatGuide,
          '',
          '---',
          '',
          '## 3. Voice & Persona Configuration',
          '',
          'Adopt the following persona for ALL writing in this document:',
          '',
          '\`\`\`yaml',
          voiceConfig,
          '\`\`\`',
          '',
          '---',
          '',
          '## 4. Timeline Reference Data',
          '',
          timelineHeader,
          '',
          timelineEntries || '_No timeline events found for this range._',
          '',
          '---',
          '',
          '## 5. Output: Character Sheet Document',
          '',
          'Generate the following complete document. Fill in all `[bracketed instructions]` with actual content.',
          'Remove all instruction brackets from the final output.',
          '',
          '\`\`\`markdown',
          '---',
          'entryMode: allowlist',
          'meta:',
          `  documentTitle: "Field Notes â€” ${writerFull} â€” ${yearRange}"`,
          `  sidebarDoc: "Field Notes<br>${yearRange}"`,
          `  sidebarMeta: "documented by ${this.charsheetPromptWriter} Â· range: ${yearRange}"`,
          '  sidebarTitle: Character Reference',
          `writer: ${this.charsheetPromptWriter}`,
          '---',
          '\`\`\`',
          '',
          characterStubs,
          '',
          '---',
          '',
          '## 6. Output: Stylesheet Entry',
          '',
          'Generate a JSON entry for `sheet_styles.json` based on the following aesthetic preferences chosen by the user:',
          `- **Mode**: ${this.charsheetStyleMode}`,
          `- **Font Vibe**: ${this.charsheetStyleFontVibe}`,
          `- **Palette Colors**: ${this.charsheetStyleColors.length ? this.charsheetStyleColors.join(', ') : 'Default'}`,
          '',
          'The JSON should use a unique key (e.g. the writer\'s name and year) and follow the standard structure with CSS `vars`.',
          'Ensure the generated colors and fonts strongly reflect the chosen font vibe and palette colors.',
          '',
          '\`\`\`json',
          `"${writerFull.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${this.timelineYearFrom || 'custom'}": {`,
          `  "styleKey": "${writerFull.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${this.timelineYearFrom || 'custom'}",`,
          `  "vars": {`,
          `    // Generate complete CSS variables here based on the requested vibe/colors`,
          `  }`,
          `}`,
          '\`\`\`'
        ].join('\n');

        return { finalPrompt, writerFull };
      } catch (err) {
        console.error('Failed to generate charsheet prompt', err);
        this.charsheetPromptNotice = 'Error: ' + err.message;
        return null;
      } finally {
        this.charsheetPromptLoading = false;
      }
    },
    async generateCharsheetPrompt(mode = 'clipboard') {
      const result = await this._buildCharsheetPromptText();
      if (!result) return;

      const { finalPrompt, writerFull } = result;

      if (mode === 'clipboard') {
        await navigator.clipboard.writeText(finalPrompt);
        this.charsheetPromptNotice = 'Prompt copied to clipboard!';
      } else {
        const blob = new Blob([finalPrompt], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const safeName = writerFull.toLowerCase().replace(/[^a-z0-9]/g, '-');
        a.href = url;
        a.download = `charsheet_prompt_${safeName}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this.charsheetPromptNotice = 'Prompt file download started.';
      }
      setTimeout(() => { if (this.charsheetPromptNotice.includes('started') || this.charsheetPromptNotice.includes('copied')) this.charsheetPromptNotice = ''; }, 3000);
    },
    async useCharsheetAsStoryPrompt() {
      const result = await this._buildCharsheetPromptText();
      if (!result) return;

      const { finalPrompt, writerFull } = result;
      // Store in dedicated state instead of clogging extra instructions
      this.charsheetGeneratedPrompt = finalPrompt;

      // Switch to the correct year context
      const prevYear = this.activeYear;
      if (this.timelineYearTo && Number.isFinite(Number(this.timelineYearTo))) {
        this.activeYear = Number(this.timelineYearTo);
      } else if (this.timelineYearFrom && Number.isFinite(Number(this.timelineYearFrom))) {
        this.activeYear = Number(this.timelineYearFrom);
      }

      this.closeCharsheetPromptModal();
      this.openStoryExportModal({ stackOnCharsheet: true });

      // Synchronize selections: only enable subjects and writer
      const applySelections = () => {
        const subjects = { ...this.charsheetPromptSubjects };
        if (this.charsheetPromptWriter) {
          subjects[this.charsheetPromptWriter] = true;
          this.storyExportProtagonistId = this.charsheetPromptWriter;
        }

        const newSelections = {};
        const groups = this.storyExportGroups || [];
        if (groups.length === 0) {
          // If groups not loaded yet, we'll try again in a bit or rely on the subjects list directly
          Object.keys(subjects).forEach(id => {
            if (subjects[id]) newSelections[id] = true;
          });
        } else {
          groups.forEach(group => {
            (group.characters || []).forEach(item => {
              newSelections[item.id] = !!subjects[item.id];
            });
          });
        }
        this.storyExportSelections = newSelections;
      };

      // If year changed, wait for data
      if (this.activeYear !== prevYear) {
        // Wait for the year change to propagate and potentially trigger fetches
        setTimeout(() => applySelections(), 300);
      } else {
        applySelections();
      }

      // Clear extra instructions so the user can provide fresh story-specific directions
      this.storyExportExtraInstructions = '';

      this.charsheetPromptNotice = 'Charsheet context piped to story exporter!';
      setTimeout(() => { if (this.charsheetPromptNotice.includes('piped')) this.charsheetPromptNotice = ''; }, 3000);
    },
    saveUiState(force = false) {
      if (this._hydratingState && !force) {
        return;
      }
      try {
        const mainTop = Number(this.$refs?.mainPane?.scrollTop ?? this._mainScrollTop ?? 0);
        const sidebarTop = Number(this.$refs?.sidebarPane?.scrollTop ?? this._sidebarScrollTop ?? 0);
        const windowTop = Number(window.scrollY || window.pageYOffset || this._windowScrollTop || 0);
        const byEntry = { ...(this._scrollByEntry || {}) };
        const activeKey = this.scrollStateKey(this.activeYear, this.activeEntryId);
        if (activeKey) {
          byEntry[activeKey] = {
            mainScrollTop: Number.isFinite(mainTop) ? Math.max(0, Math.round(mainTop)) : 0,
            sidebarScrollTop: Number.isFinite(sidebarTop) ? Math.max(0, Math.round(sidebarTop)) : 0
          };
        }

        const entryKeys = Object.keys(byEntry);
        if (entryKeys.length > 200) {
          entryKeys.slice(0, entryKeys.length - 200).forEach((key) => delete byEntry[key]);
        }
        this._scrollByEntry = byEntry;

        const payload = {
          year: String(this.activeYear || ''),
          entryId: String(this.activeEntryId || ''),
          notebookId: String(this.activeNotebookId || ''),
          mainScrollTop: Number.isFinite(mainTop) ? Math.max(0, Math.round(mainTop)) : 0,
          sidebarScrollTop: Number.isFinite(sidebarTop) ? Math.max(0, Math.round(sidebarTop)) : 0,
          windowScrollTop: Number.isFinite(windowTop) ? Math.max(0, Math.round(windowTop)) : 0,
          timelineSearch: String(this.timelineSearch || ''),
          timelineYearFrom: this.timelineYearFrom,
          timelineYearTo: this.timelineYearTo,
          timelineMonthFrom: this.timelineMonthFrom,
          timelineMonthTo: this.timelineMonthTo,
          timelineMonthsOpen: this.timelineMonthsOpen === true,
          timelineExcludeYearRange: this.timelineExcludeYearRange === true,
          timelineYearRanges: Array.isArray(this.timelineYearRanges) ? this.timelineYearRanges : [],
          timelinePortraitsVisible: this.timelinePortraitsVisible,
          timelineActiveTags: this.timelineActiveTagsNormalized,
          timelineActiveWordTags: Array.isArray(this.timelineActiveWordTags) ? [...this.timelineActiveWordTags] : [],
          timelineLimit: Number(this.timelineLimit || 50),
          timelineReverseOrder: this.timelineReverseOrder === true,
          timelineSequentialMode: this.timelineSequentialMode === true,
          timelineTagMode: String(this.timelineTagMode || 'or'),
          heartbeatMode: String(this.heartbeatMode || 'full'),
          timelineDateCreatedFilterMode: String(this.timelineDateCreatedFilterMode || 'all'),
          timelineDateCreatedCustom: String(this.timelineDateCreatedCustom || ''),
          heartbeatZoom: Number(this.heartbeatZoom || 0),
          timelineFiltersCollapsed: this.timelineFiltersCollapsed === true,
          charsheetPromptWriter: String(this.charsheetPromptWriter || ''),
          charsheetPromptTone: String(this.charsheetPromptTone || 'sincere'),
          charsheetPromptPrecision: String(this.charsheetPromptPrecision || 'precise'),
          charsheetPromptCaps: String(this.charsheetPromptCaps || 'all lowercase'),
          charsheetPromptHonesty: String(this.charsheetPromptHonesty || 'honest'),
          charsheetPromptFormality: String(this.charsheetPromptFormality || 'casual'),
          charsheetStyleColors: Array.isArray(this.charsheetStyleColors) ? [...this.charsheetStyleColors] : [],
          charsheetStyleFontVibe: String(this.charsheetStyleFontVibe || 'gothic serif'),
          charsheetStyleMode: String(this.charsheetStyleMode || 'dark'),
          notebookSearch: String(this.notebookSearch || ''),
          notebookRulesEnabled: this.notebookRulesEnabled !== false,
          coreEditMode: this.coreEditMode === true,
          pageReaderUiVisible: this.pageReaderUiVisible === true,
          showLifecycleMilestones: this.showLifecycleMilestones === true,
          timelineCharactersOnly: this.timelineCharactersOnly === true,
          timelineDialogueBubbles: this.timelineDialogueBubbles !== false,
          timelineAddEventOpen: this.timelineAddEventOpen === true,
          timelineAddEventDateCreated: String(this.timelineAddEventDateCreated || ''),
          imgPromptNaming: String(this.imgPromptNaming || 'names'),
          imgPromptOrientation: String(this.imgPromptOrientation || 'vertical'),
          imgPromptType: String(this.imgPromptType || 'candid'),
          imgPromptFraming: String(this.imgPromptFraming || 'head-to-waist'),
          imgPromptBackground: String(this.imgPromptBackground || 'auto'),
          imgPromptClothing: String(this.imgPromptClothing || 'auto'),
          imgPromptCustomBackground: String(this.imgPromptCustomBackground || ''),
          imgPromptCustomAction: String(this.imgPromptCustomAction || ''),
          imgPromptMood: String(this.imgPromptMood || 'relaxed'),
          imgPromptLighting: String(this.imgPromptLighting || 'natural'),
          imgPromptStyle: String(this.imgPromptStyle || 'candid-phone'),
          imgPromptIncludeAppearance: this.imgPromptIncludeAppearance !== false,
          imgPromptIncludeContext: this.imgPromptIncludeContext !== false,
          imgPromptContextMode: String(this.imgPromptContextMode || 'brief'),
          imgPromptReferenceYear: String(this.imgPromptReferenceYear || ''),
          imgPromptLookingAt: String(this.imgPromptLookingAt || 'none'),
          imgPromptCustomLookingAt: String(this.imgPromptCustomLookingAt || ''),
          imgPromptExtraInstructions: String(this.imgPromptExtraInstructions || ''),
          imgPromptMoodIntensity: Number(this.imgPromptMoodIntensity || 5),
          imgPromptLightingIntensity: Number(this.imgPromptLightingIntensity || 5),
          imgPromptAdaptAge: this.imgPromptAdaptAge === true,
          imgPromptMotionBlur: this.imgPromptMotionBlur === true,
          imgPromptAspectRatio: String(this.imgPromptAspectRatio || '9:16'),
          imgPromptCharacterPositions: this.imgPromptCharacterPositions || {},
          scrollByEntry: byEntry
        };
        window.localStorage.setItem(MR_UI_STATE_KEY, JSON.stringify(payload));
        window.sessionStorage.setItem(MR_UI_STATE_KEY, JSON.stringify(payload));
      } catch {
        // Storage can be unavailable in some contexts.
      }
    },
    openIconPicker(entryId) {
      const id = String(entryId || '').toLowerCase().trim();
      if (!id) return;
      this.iconPickerTarget = id;
      // preselect any existing icon key
      const existing = String(this.characterCore?.[id]?.iconKey || this.characterCore?.[id]?.icon || '');
      this.iconPickerSelection = this.iconKeyToFeather(existing) || '';
      this.iconPickerQuery = '';
      this.iconPickerOpen = true;
      console.debug('MR: openIconPicker', { id, existing, selection: this.iconPickerSelection });
      this.$nextTick(() => { try { window.feather && window.feather.replace(); } catch (e) { } });
    },
    closeIconPicker() {
      this.iconPickerOpen = false;
      this.iconPickerTarget = '';
      this.iconPickerSelection = '';
      this.iconPickerQuery = '';
    },
    pickIcon(key) {
      this.iconPickerSelection = String(key || '');
      this.$nextTick(() => { try { window.feather && window.feather.replace(); } catch (e) { } });
    },
    applyIconPicker() {
      const id = String(this.iconPickerTarget || '').toLowerCase().trim();
      const key = String(this.iconPickerSelection || '').trim();
      if (!id) return this.closeIconPicker();
      // Apply to in-memory character core so UI updates immediately.
      if (!this.characterCore) this.characterCore = {};
      if (!this.characterCore[id]) this.characterCore[id] = {};
      this.characterCore[id].iconKey = key;
      // also write the legacy `icon` field for other consumers
      this.characterCore[id].icon = key;
      console.debug('MR: applyIconPicker set', { id, key, core: this.characterCore[id] });
      // force a Vue re-render and close modal
      try { this.$forceUpdate && this.$forceUpdate(); } catch (e) { }
      // Persist to backend character_core.json
      (async () => {
        try {
          const backendOrigin = (window && window.__CM_BACKEND_ORIGIN__) || (location.protocol + '//' + location.hostname + ':8787');
          const resp = await fetch(backendOrigin + '/api/character-core/set-icon', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ characterId: id, iconKey: key })
          });
          let json = {};
          try {
            json = await resp.json();
          } catch (e) {
            const text = await resp.text().catch(() => '');
            console.warn('MR: backend returned non-JSON response', { status: resp.status, text });
            json = {};
          }
          if (!resp.ok || !json?.ok) {
            console.warn('MR: failed to persist icon to backend', { status: resp.status, body: json });
          } else {
            console.debug('MR: persisted icon to backend', json);
          }
        } catch (err) {
          console.error('MR: error persisting icon', err);
        } finally {
          this.closeIconPicker();
          // trigger feather replacement to ensure DOM shows new icon
          setTimeout(() => { try { /* no-op */ } catch (e) { } }, 0);
        }
      })();
      // trigger feather.replace a couple times (short and delayed) to ensure replacement
      setTimeout(() => { try { window.feather && window.feather.replace(); console.debug('MR: feather.replace() 1'); } catch (e) { console.error(e); } }, 60);
      setTimeout(() => { try { window.feather && window.feather.replace(); console.debug('MR: feather.replace() 2'); } catch (e) { console.error(e); } }, 400);
    },
     onPaneScroll(kind, event) {
       const top = Number(event?.target?.scrollTop || 0);
       if (kind === 'main') {
         this._mainScrollTop = top;
       } else if (kind === 'sidebar') {
         this._sidebarScrollTop = top;
       }
 
       // Dismiss floating UI elements on scroll to prevent ghosting
       this.hoverCardOpen = false;
       this.dateMenuOpen = false;
       this.sidebarExportOpen = false;
       this.timelineTagDropdownKey = '';
 
       clearTimeout(this._uiSaveTimer);
       this._uiSaveTimer = setTimeout(() => this.saveUiState(), 120);
     },
    restorePaneScroll() {
      const uiState = this.loadUiState();
      const byEntry = (uiState && typeof uiState.scrollByEntry === 'object' && uiState.scrollByEntry)
        ? uiState.scrollByEntry
        : {};
      this._scrollByEntry = { ...(this._scrollByEntry || {}), ...byEntry };

      const activeKey = this.scrollStateKey(this.activeYear, this.activeEntryId);
      const activeState = activeKey ? this._scrollByEntry?.[activeKey] : null;

      const mainTop = Number(activeState?.mainScrollTop ?? uiState?.mainScrollTop);
      const sidebarTop = Number(activeState?.sidebarScrollTop ?? uiState?.sidebarScrollTop);
      const windowTop = Number(uiState?.windowScrollTop);

      const apply = () => {
        if (Number.isFinite(mainTop) && this.$refs?.mainPane) {
          this.$refs.mainPane.scrollTop = Math.max(0, Math.round(mainTop));
        }
        if (Number.isFinite(sidebarTop) && this.$refs?.sidebarPane) {
          this.$refs.sidebarPane.scrollTop = Math.max(0, Math.round(sidebarTop));
        }
        if (Number.isFinite(windowTop)) {
          window.scrollTo({ top: Math.max(0, Math.round(windowTop)), behavior: 'auto' });
        }
      };

      const schedule = [0, 120, 320, 700];
      schedule.forEach((ms) => {
        setTimeout(() => {
          this.$nextTick(() => apply());
        }, ms);
      });
    },
    normalize(value) {
      return String(value || '')
        .toLowerCase()
        .replace(/\.[a-z0-9]+$/i, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
    },
    matchSearchQuery(rawSearch, haystack) {
      const trimmed = String(rawSearch || '').trim();
      if (!trimmed) return true;

      // If there are double quotes, parse out quoted and unquoted parts
      if (trimmed.includes('"')) {
        const quotedTerms = [];
        const unquotedPhrases = [];
        
        // Extract quoted terms
        const quoteRegex = /"([^"]+)"/g;
        let match;
        let lastIndex = 0;
        while ((match = quoteRegex.exec(trimmed)) !== null) {
          const before = trimmed.slice(lastIndex, match.index).trim();
          if (before) {
            const normBefore = this.normalize(before);
            if (normBefore) unquotedPhrases.push(normBefore);
          }
          
          const term = match[1].trim();
          if (term) {
            const normTerm = this.normalize(term);
            if (normTerm) quotedTerms.push(normTerm);
          }
          lastIndex = quoteRegex.lastIndex;
        }
        
        const after = trimmed.slice(lastIndex).trim();
        if (after) {
          const normAfter = this.normalize(after);
          if (normAfter) unquotedPhrases.push(normAfter);
        }

        // Check if all unquoted phrases match as substrings in haystack
        const matchesUnquoted = unquotedPhrases.every(phrase => haystack.includes(phrase));
        if (!matchesUnquoted) return false;
        
        // Check if all quoted terms match as exact words/phrases in haystack
        const matchesQuoted = quotedTerms.every(term => {
          const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp('\\b' + escaped + '\\b', 'i');
          return regex.test(haystack);
        });
        
        return matchesQuoted;
      } else {
        // Simple substring check
        const searchQ = this.normalize(trimmed);
        return haystack.includes(searchQ);
      }
    },
    normalizeId(value) {
      return String(value || '').toLowerCase().trim();
    },
    iconKeyToFeather(rawKey) {
      const key = String(rawKey || '').toLowerCase().trim();
      if (!key) return '';
      const MAP = {
        book: 'book',
        social: 'users',
        map: 'map',
        gallery: 'image',
        chart: 'bar-chart-2',
        eye: 'eye',
        gear: 'settings',
        sword: 'ph-sword',
        knife: 'ph-knife',
        dog: 'ph-dog',
        shield: 'shield',
        crown: 'award',
        heart: 'heart',
        camera: 'camera',
        history: 'clock',
        landmark: 'map',
        school: 'book-open',
        civic: 'briefcase',
        industry: 'activity',
        park: 'sun',
        home: 'home',
        bass: 'ph-guitar',
        calculator: 'ph-calculator',
        // ── New semantic icons (2026.06) ──
        scroll: 'ph-scroll',
        scales: 'ph-scales',
        skull: 'ph-skull',
        handshake: 'ph-handshake',
        brain: 'ph-brain',
        dna: 'ph-dna',
        megaphone: 'ph-megaphone',
        flag: 'flag',
        film: 'film',
        music: 'music',
        lock: 'lock',
        target: 'target',
        alert: 'alert-triangle',
        truck: 'truck',
        layers: 'layers',
        radio: 'radio',
        cross: 'ph-cross',
        baby: 'ph-baby',
        sparkle: 'ph-sparkle',
        notebook: 'ph-notebook',
        castle: 'ph-castle-turret',
        globe: 'globe',
        rings: 'ph-unite',
        gavel: 'ph-gavel',
        trophy: 'ph-trophy',
        users: 'users',
        frown: 'frown',
        mask: 'ph-mask-happy',
        microscope: 'ph-microscope',
        compass: 'compass',
        butterfly: 'ph-butterfly'
      };
      const LEGACY = {
        shade: 'moon',
        ghost: 'user',
        volt: 'zap',
        scarlet: 'heart',
        bolt: 'zap',
        flower: 'star',
        flame: 'zap'
      };
      if (LEGACY[key]) return LEGACY[key];
      if (MAP[key]) return MAP[key];
      return key;
    },
    featherSvg(key, className) {
      const k = String(key || '').trim();
      if (!k) return '';

      const cacheKey = `${k}:${className || ''}`;
      if (!this._featherSvgCache) {
        this._featherSvgCache = {};
      }
      if (this._featherSvgCache[cacheKey]) {
        return this._featherSvgCache[cacheKey];
      }

      let result = '';
      if (k.startsWith('ph-')) {
        result = `<i class="ph ${k} ${className || 'mr-feather-icon'}"></i>`;
      } else {
        try {
          if (window.feather && window.feather.icons && window.feather.icons[k]) {
            result = window.feather.icons[k].toSvg({ class: className || 'mr-feather-svg' });
          }
        } catch (e) {
          // fall through
        }
        if (!result) {
          result = `<span class="mr-feather-fallback ${className || ''}">${k}</span>`;
        }
      }

      this._featherSvgCache[cacheKey] = result;
      return result;
    },
    groupRank(entry) {
      const label = String(entry?.navGroup || '').trim();
      const lower = label.toLowerCase();
      const customOrder = Array.isArray(this.navGroupOrder)
        ? this.navGroupOrder.map((item) => String(item || '').trim())
        : [];
      const customIndex = customOrder.findIndex((value) => value.toLowerCase() === lower);
      if (customIndex >= 0) {
        return customIndex;
      }
      const baseIndex = NAV_GROUP_ORDER.findIndex((value) => value.toLowerCase() === lower);
      if (baseIndex >= 0) {
        return customOrder.length + baseIndex;
      }
      return customOrder.length + NAV_GROUP_ORDER.length + 1;
    },
    compareEntries(a, b) {
      const groupDelta = this.groupRank(a) - this.groupRank(b);
      if (groupDelta !== 0) return groupDelta;

      const groupLabelA = this.plainText(a?.navGroup || '').toLowerCase();
      const groupLabelB = this.plainText(b?.navGroup || '').toLowerCase();
      if (groupLabelA !== groupLabelB) return groupLabelA.localeCompare(groupLabelB);

      const orderDelta = Number(a?.order || 0) - Number(b?.order || 0);
      if (orderDelta !== 0) return orderDelta;

      return this.entryDisplayLabel(a).localeCompare(this.entryDisplayLabel(b));
    },
    isGroupCollapsed(name) {
      return Boolean(this.collapsedGroups?.[name]);
    },
    navGroupIndex(name) {
      const source = Array.isArray(this.groupedEntries) ? this.groupedEntries.map((group) => String(group?.name || '').trim()) : [];
      const target = String(name || '').trim().toLowerCase();
      return source.findIndex((item) => String(item || '').toLowerCase() === target);
    },
    canMoveNavGroup(name, direction = 0) {
      if (this.navGroupOrderSaving) {
        return false;
      }
      const idx = this.navGroupIndex(name);
      if (idx < 0) {
        return false;
      }
      const next = idx + Number(direction || 0);
      return next >= 0 && next < (this.groupedEntries?.length || 0);
    },
    async moveNavGroup(name, direction = 0) {
      const dir = Number(direction || 0);
      if (!dir) {
        return;
      }

      const visibleNames = Array.isArray(this.groupedEntries)
        ? this.groupedEntries.map((group) => String(group?.name || '').trim()).filter(Boolean)
        : [];

      const vIdx = visibleNames.findIndex(n => n.toLowerCase() === String(name || '').trim().toLowerCase());
      const vNext = vIdx + dir;

      if (vIdx < 0 || vNext < 0 || vNext >= visibleNames.length) {
        return;
      }

      const targetName = visibleNames[vIdx];
      const neighborName = visibleNames[vNext];

      // Reconstruct master list starting from current navGroupOrder or default NAV_GROUP_ORDER
      let master = Array.isArray(this.navGroupOrder) && this.navGroupOrder.length > 0
        ? [...this.navGroupOrder]
        : [...NAV_GROUP_ORDER];

      // CRITICAL FIX: Ensure ALL groups in the current year data are part of the master list
      // This prevents hidden groups from being deleted when we overwrite navGroupOrder.
      const allYearGroups = Array.from(new Set((this.entries || []).map(e => String(e?.navGroup || 'Other').trim() || 'Other')));
      allYearGroups.forEach(g => {
        if (!master.some(m => m.toLowerCase() === g.toLowerCase())) {
          master.push(g);
        }
      });

      const mIdx = master.findIndex(n => n.toLowerCase() === targetName.toLowerCase());
      const mNext = master.findIndex(n => n.toLowerCase() === neighborName.toLowerCase());

      if (mIdx < 0 || mNext < 0) {
        return; // Safety fallback
      }

      const snapshot = [...master];
      const tmp = master[mIdx];
      master[mIdx] = master[mNext];
      master[mNext] = tmp;

      this.navGroupOrder = master;
      await this.persistNavGroupOrder(snapshot);
    },
    async persistNavGroupOrder(fallbackOrder = []) {
      const year = String(this.activeYear || '').trim();
      if (!/^\d{4}$/.test(year)) {
        return;
      }

      // Prefer the actual source file if available (works for MD or JSON sources)
      // Use the root source file for the current year/variant (index.json or versions/xxx.json)
      const sourcePath = this.activeYearSourceFile || 'index.json';
      this.navGroupOrderSaving = true;
      try {
        const response = await fetch(this.apiUrl('/api/nav-groups/reorder'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            year,
            sourcePath,
            navGroupOrder: this.navGroupOrder
          })
        });

        let payload = null;
        let rawText = null;
        try {
          rawText = await response.text();
          try {
            payload = rawText ? JSON.parse(rawText) : null;
          } catch (e) {
            payload = null;
          }
        } catch (e) {
          rawText = null;
          payload = null;
        }

        if (!response.ok || payload?.ok === false) {
          const serverMsg = payload?.error || rawText || `nav-group-reorder-${response.status}`;
          throw new Error(String(serverMsg));
        }

        const persisted = Array.isArray(payload?.navGroupOrder)
          ? payload.navGroupOrder.map((item) => String(item || '').trim()).filter(Boolean)
          : [];
        if (persisted.length) {
          this.navGroupOrder = persisted;
        }
      } catch (error) {
        console.warn('MR Vue: failed to persist nav group order.', error);
        this.navGroupOrder = Array.isArray(fallbackOrder) ? fallbackOrder : [];
      } finally {
        this.navGroupOrderSaving = false;
      }
    },
    toggleGroup(name) {
      this.collapsedGroups = {
        ...(this.collapsedGroups || {}),
        [name]: !this.isGroupCollapsed(name)
      };
    },
    plainText(value) {
      return String(value || '')
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<[^>]*>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    },
    entryDisplayLabel(entry) {
      return this.plainText(entry?.navLabel || entry?.title || entry?.id || 'Entry');
    },
    entryDisplayTitle(entry) {
      return this.plainText(entry?.title || entry?.navLabel || entry?.id || 'Entry');
    },
    formatRowValue(value) {
      return String(value || '')
        .replace(/<BR\s*\/?>/gi, '<br>')
        .replace(/\n/g, '<br>');
    },
    coreRowValue(characterId, rowLabel) {
      const core = this.characterCore?.[String(characterId || '').toLowerCase()];
      if (!core || !Array.isArray(core.rows)) {
        return '';
      }
      const wanted = this.normalize(rowLabel);
      const match = core.rows.find((row) => this.normalize(row?.label || '') === wanted);
      return String(match?.value || '').trim();
    },
    characterEyebrowById(characterId) {
      const key = String(characterId || '').toLowerCase();
      const core = this.characterCore?.[key] || {};
      const direct = String(core?.eyebrow || '').trim();
      if (direct) {
        return direct;
      }
      const fromRows = this.coreRowValue(key, 'eyebrow');
      if (fromRows) {
        return fromRows;
      }
      const fromEntry = this.entries.find((entry) => this.normalizeId(entry?.id) === key);
      return String(fromEntry?.eyebrow || '').trim();
    },
    characterNameById(characterId) {
      const key = this.getResolvedCharacterId(characterId);
      const core = this.characterCore?.[key];
      if (core) {
        const topLevelName = core['full name'] || core.name || core.fullName || core.navLabel;
        if (topLevelName) return this.plainText(topLevelName);
        const fromRows = this.coreRowValue(key, 'full name') || this.coreRowValue(key, 'name');
        if (fromRows) {
          return this.plainText(fromRows);
        }
      }
      const fromEntry = this.entries.find((entry) => this.normalizeId(entry?.id) === key);
      if (!fromEntry) {
        return String(characterId || '').trim();
      }
      return this.entryDisplayTitle(fromEntry);
    },
    relationshipDisplayNameById(characterId) {
      const full = String(this.characterNameById(characterId) || '').trim();
      if (!full) {
        return String(characterId || '').trim();
      }
      return this.plainText(full.split('.')[0] || '').trim() || full;
    },
    findEntryForOnLabel(nameToken) {
      const target = this.normalize(nameToken);
      if (!target) {
        return null;
      }

      const candidates = Array.isArray(this.entries) ? this.entries : [];
      let best = null;

      candidates.forEach((entry) => {
        const entryId = String(entry?.id || '').trim();
        if (!entryId) {
          return;
        }
        const values = [
          this.normalize(entryId),
          this.normalize(entry?.title || ''),
          this.normalize(entry?.navLabel || ''),
          this.normalize(this.characterNameById(entryId))
        ].filter(Boolean);
        const compactValues = values.map((value) => value.replace(/[^a-z0-9]+/g, ''));
        const compactTarget = target.replace(/[^a-z0-9]+/g, '');

        let score = 0;
        values.forEach((value) => {
          if (value === target) {
            score = Math.max(score, 100);
          } else if (value.startsWith(`${target} `) || value.endsWith(` ${target}`) || value.includes(` ${target} `)) {
            score = Math.max(score, 85);
          } else if (value.includes(target)) {
            score = Math.max(score, 70);
          }
        });
        if (compactTarget) {
          compactValues.forEach((value) => {
            if (value === compactTarget) {
              score = Math.max(score, 95);
            } else if (value.includes(compactTarget)) {
              score = Math.max(score, 72);
            }
          });
        }

        if (!best || score > best.score) {
          best = { entry, score };
        }
      });

      return best && best.score >= 70 ? best.entry : null;
    },
    resolveOnRowTarget(row) {
      const label = this.plainText(row?.label || '');
      const match = label.match(/^(?:on|with)\s+(.+)$/i);
      if (!match) {
        return null;
      }

      const targetEntry = this.findEntryForOnLabel(match[1]);
      if (!targetEntry?.id) {
        return null;
      }

      const eyebrow = this.characterEyebrowById(targetEntry.id);
      const displayName = this.characterNameById(targetEntry.id) || this.entryDisplayTitle(targetEntry);

      return {
        label,
        entryId: targetEntry.id,
        tooltip: eyebrow || `Open ${displayName}`
      };
    },
    openOnRowTarget(row) {
      const target = this.resolveOnRowTarget(row);
      if (!target?.entryId) {
        return;
      }
      this.selectEntry(target.entryId);
    },
    toggleTimelineTag(tag) {
      this.hoverCardOpen = false;
      let cleaned = this.plainText(tag || '').trim();
      if (!cleaned) {
        return;
      }
      const isNeg = cleaned.startsWith('-');
      const baseTag = isNeg ? cleaned.slice(1).trim() : cleaned;
      const resolvedBase = this.getResolvedCharacterId(baseTag).toLowerCase().trim();
      
      const current = Array.isArray(this.timelineActiveTags) ? [...this.timelineActiveTags] : [];
      const index = current.findIndex((value) => {
        const valCleaned = String(value || '').trim();
        const valIsNeg = valCleaned.startsWith('-');
        const valBase = valIsNeg ? valCleaned.slice(1).trim() : valCleaned;
        const valResolved = this.getResolvedCharacterId(valBase).toLowerCase().trim();
        return valResolved === resolvedBase;
      });

      if (index >= 0) {
        current.splice(index, 1);
      } else {
        current.push(isNeg ? `-${resolvedBase}` : resolvedBase);
        const excl = Array.isArray(this.timelineSequentialExcludedTags) ? [...this.timelineSequentialExcludedTags] : [];
        const exclIndex = excl.indexOf(resolvedBase);
        if (exclIndex >= 0) {
          excl.splice(exclIndex, 1);
          this.timelineSequentialExcludedTags = excl;
        }
      }
      this.timelineActiveTags = current;
    },
    dismissSequentialTag(tag) {
      let cleaned = this.plainText(tag || '').trim();
      if (!cleaned) return;
      const baseTag = cleaned.startsWith('-') ? cleaned.slice(1).trim() : cleaned;
      const resolved = this.getResolvedCharacterId(baseTag).toLowerCase().trim();
      const current = Array.isArray(this.timelineSequentialExcludedTags) ? [...this.timelineSequentialExcludedTags] : [];
      if (!current.includes(resolved)) {
        current.push(resolved);
        this.timelineSequentialExcludedTags = current;
      }
    },
    toggleTimelineTagNegative(tag) {
      let cleaned = this.plainText(tag || '').trim();
      if (!cleaned) {
        return;
      }
      const isNeg = cleaned.startsWith('-');
      const baseTag = isNeg ? cleaned.slice(1).trim() : cleaned;
      const resolvedBase = this.getResolvedCharacterId(baseTag).toLowerCase().trim();
      
      const current = Array.isArray(this.timelineActiveTags) ? [...this.timelineActiveTags] : [];
      const index = current.findIndex((value) => {
        const valCleaned = String(value || '').trim();
        const valIsNeg = valCleaned.startsWith('-');
        const valBase = valIsNeg ? valCleaned.slice(1).trim() : valCleaned;
        const valResolved = this.getResolvedCharacterId(valBase).toLowerCase().trim();
        return valResolved === resolvedBase;
      });

      if (index >= 0) {
        const valCleaned = String(current[index] || '').trim();
        const currentlyNeg = valCleaned.startsWith('-');
        if (currentlyNeg) {
          current[index] = resolvedBase;
        } else {
          current[index] = `-${resolvedBase}`;
        }
      } else {
        current.push(`-${resolvedBase}`);
      }
      this.timelineActiveTags = current;
    },
    toggleTimelineTagGroup(tags) {
      if (!Array.isArray(tags) || !tags.length) return;
      const current = Array.isArray(this.timelineActiveTags) ? [...this.timelineActiveTags] : [];
      const cleanTags = tags.map(t => this.getResolvedCharacterId(this.plainText(t || '')).toLowerCase().trim()).filter(Boolean);
      
      const normalizedCurrent = current.map(t => this.getResolvedCharacterId(this.plainText(t || '')).toLowerCase().trim()).filter(Boolean);
      const allActive = cleanTags.every(t => normalizedCurrent.includes(t));
      
      let nextTags;
      if (allActive) {
        nextTags = current.filter(t => !cleanTags.includes(this.getResolvedCharacterId(this.plainText(t || '')).toLowerCase().trim()));
      } else {
        const seen = new Set();
        nextTags = [];
        [...current, ...cleanTags].forEach(t => {
          const norm = this.getResolvedCharacterId(this.plainText(t || '')).toLowerCase().trim();
          if (norm && !seen.has(norm)) {
            seen.add(norm);
            nextTags.push(norm);
          }
        });
      }
      this.timelineActiveTags = nextTags;
    },
    clearTimelineTags() {
      this.timelineActiveTags = [];
      this.timelineActiveWordTags = [];
      this.timelineSequentialExcludedTags = [];
    },
    toggleTimelineWordTag(word) {
      const cleaned = String(word || '').trim();
      if (!cleaned) return;
      const current = Array.isArray(this.timelineActiveWordTags) ? [...this.timelineActiveWordTags] : [];
      const index = current.findIndex(w => w.toLowerCase() === cleaned.toLowerCase());
      if (index >= 0) {
        current.splice(index, 1);
      } else {
        current.push(cleaned);
      }
      this.timelineActiveWordTags = current;
    },
    toggleTimelineWordTagNegative(word) {
      const cleaned = String(word || '').trim();
      if (!cleaned) return;
      const isNeg = cleaned.startsWith('-');
      const base = isNeg ? cleaned.slice(1).trim() : cleaned;
      
      const current = Array.isArray(this.timelineActiveWordTags) ? [...this.timelineActiveWordTags] : [];
      const index = current.findIndex(w => {
        const wCleaned = String(w || '').trim();
        const wIsNeg = wCleaned.startsWith('-');
        const wBase = wIsNeg ? wCleaned.slice(1).trim() : wCleaned;
        return wBase.toLowerCase() === base.toLowerCase();
      });

      if (index >= 0) {
        current[index] = isNeg ? base : `-${base}`;
      } else {
        current.push(isNeg ? base : `-${base}`);
      }
      this.timelineActiveWordTags = current;
    },
    handleTimelineSearchInput(event) {
      const val = event.target.value;
      if (!val) {
        if (this._searchDebounceTimer) {
          clearTimeout(this._searchDebounceTimer);
          this._searchDebounceTimer = null;
        }
        this.timelineSearchLocal = '';
        return;
      }

      if (!val.startsWith('/') && !val.startsWith('-')) {
        if (this._searchDebounceTimer) {
          clearTimeout(this._searchDebounceTimer);
        }
        this._searchDebounceTimer = setTimeout(() => {
          this.timelineSearchLocal = val;
          this._searchDebounceTimer = null;
        }, 300);
      } else {
        // Starts with '/' or '-': debounce slightly to prevent lag during rapid typing
        if (this._searchDebounceTimer) {
          clearTimeout(this._searchDebounceTimer);
        }
        this._searchDebounceTimer = setTimeout(() => {
          this.timelineSearchLocal = val;
          this._searchDebounceTimer = null;
        }, 100);
      }
    },
    handleTimelineSearchDelete(event) {
      const val = event.target.value;
      if (!val) {
        if (this.timelineActiveWordTags && this.timelineActiveWordTags.length) {
          this.toggleTimelineWordTag(this.timelineActiveWordTags[this.timelineActiveWordTags.length - 1]);
        } else if (this.timelineActiveTagsNormalized.length) {
          this.toggleTimelineTag(this.timelineActiveTagsNormalized[this.timelineActiveTagsNormalized.length - 1]);
        }
      }
    },
    commitTimelineSearch() {
      if (this.$refs.timelineSearchInput) {
        this.timelineSearchLocal = this.$refs.timelineSearchInput.value;
      }
      if (this._searchDebounceTimer) {
        clearTimeout(this._searchDebounceTimer);
        this._searchDebounceTimer = null;
      }
      let query = (this.timelineSearchLocal || '').trim();
      
      // Extract quoted phrases to add to timelineActiveWordTags
      if (query.includes('"')) {
        const quoteRegex = /(-?)"([^"]+)"/g;
        let match;
        const newWordTags = [];
        while ((match = quoteRegex.exec(query)) !== null) {
          const isNeg = match[1] === '-';
          const term = match[2].trim();
          if (term) {
            newWordTags.push(isNeg ? `-${term}` : term);
          }
        }
        
        // Remove the quoted phrases from the query string
        query = query.replace(/(-?)"([^"]+)"/g, '').replace(/\s+/g, ' ').trim();
        
        // Add new word tags to timelineActiveWordTags, avoiding duplicates (case-insensitive check)
        const current = Array.isArray(this.timelineActiveWordTags) ? [...this.timelineActiveWordTags] : [];
        newWordTags.forEach(newTag => {
          const normNew = newTag.toLowerCase();
          if (!current.some(c => c.toLowerCase() === normNew)) {
            current.push(newTag);
          }
        });
        this.timelineActiveWordTags = current;
      }

      const isSlash = query.startsWith('/');
      const isDash = query.startsWith('-');
      if (isSlash || isDash) {
        const tagContent = query.slice(1).trim();
        if (tagContent) {
          // If there are suggestions, use the first suggestion's ID.
          // Otherwise, toggle the literal text entered after the slash/dash.
          const targetTag = this.timelineTagSuggestions.length
            ? this.timelineTagSuggestions[0].id
            : tagContent;
          this.toggleTimelineTag(isDash ? `-${targetTag}` : targetTag);
        }
        this.timelineSearchLocal = '';
        this.timelineSearch = '';
      } else {
        this.timelineSearchLocal = query;
        this.timelineSearch = query;
      }
      if (this.$refs.timelineSearchInput) {
        this.$refs.timelineSearchInput.blur();
      }
    },
    clearTimelineFilters() {
      this.timelineActiveTags = [];
      this.timelineActiveWordTags = [];
      this.timelineSearch = '';
      this.timelineYearFrom = null;
      this.timelineYearTo = null;
      this.timelineMonthFrom = '';
      this.timelineMonthTo = '';
      this.timelineExcludeYearRange = false;
      this.timelineYearRanges = [];
      this.timelineLimit = 50;
      this.timelineSearchLocal = '';
      this.timelineFiltersCollapsed = true;
      this.timelineDateCreatedFilterMode = 'all';
      this.timelineDateCreatedCustom = '';
    },
    addTimelineRange() {
      const from = this.timelineYearFrom;
      const to = this.timelineYearTo;
      if ((from === null || from === '') && (to === null || to === '')) return; // nothing to add
      
      if (!Array.isArray(this.timelineYearRanges)) {
        this.timelineYearRanges = [];
      }

      this.timelineYearRanges.push({
        from: (from !== null && from !== '') ? Number(from) : null,
        to: (to !== null && to !== '') ? Number(to) : null,
        monthFrom: this.timelineMonthFrom || '',
        monthTo: this.timelineMonthTo || '',
        exclude: this.timelineExcludeYearRange === true,
        id: String(Date.now() + Math.random())
      });

      // Clear the staging range inputs
      this.timelineYearFrom = null;
      this.timelineYearTo = null;
      this.timelineMonthFrom = '';
      this.timelineMonthTo = '';
      this.timelineExcludeYearRange = false;
      this.saveUiState();
    },
    removeTimelineRange(id) {
      if (Array.isArray(this.timelineYearRanges)) {
        this.timelineYearRanges = this.timelineYearRanges.filter(r => r.id !== id);
      }
      this.saveUiState();
    },
    resetAddRecordForm() {
      this.addRecordType = 'timeline';
      this.addRecordDate = '';
      this.addRecordTitle = '';
      this.addRecordDescription = '';
      this.addRecordTags = [];
      this.addRecordRelationshipId = '';
      this.addRecordRelationshipLabel = '';
      this.addRecordRelationshipType = 'relationship';
      this.addRecordRelationshipStartDate = '';
      this.addRecordRelationshipSplitDate = '';
      this.addRecordRelationshipMembers = '';
      this.addRecordRelationshipChildren = '';
      this.addRecordRelationshipNotes = '';
      this.addRecordRelationshipHistoryDate = '';
      this.addRecordRelationshipHistoryEvents = '';
      this.addRecordBulkText = '';
      this.addRecordParsedCount = 0;
      this.addRecordParsedTags = [];
      this.addRecordViewMode = 'paste';
      this.addRecordParsedEntries = [];
      this.addRecordSaving = false;
      this.addRecordError = '';
      this.addRecordSuccess = '';
    },
    openAddRecordModal() {
      this.closeAllModals();
      this.resetAddRecordForm();
      this.addRecordModalOpen = true;
      this.$nextTick(() => this.refreshDatePickers());
    },
    closeAllModals() {
      this.addRecordModalOpen = false;
      this.storyExportOpen = false;
      this.chatModalOpen = false;
      this.exportModalOpen = false;
      this.dateMenuOpen = false;
      this.charsheetPromptOpen = false;
      this.notebookImportModalOpen = false;
      this.timelineTagDropdownKey = '';
      this.hoverCardOpen = false;
      this.imgPromptOpen = false;
      this.sillyTavernOpen = false;
    },
    dismissDropdowns(event) {
      if (event && event.target && event.target.closest) {
        const trigger = event.target.closest('.mr-sfx-trigger-icon');
        if (trigger) {
          const soundBubble = trigger.closest('.mr-bubble-sound');
          const content = soundBubble ? soundBubble.querySelector('.mr-sfx-content')?.textContent : '';
          if (content) {
            this.playNotebookSFX(content.trim());
          }
        }
        if (
          event.target.closest('.mr-timeline-tag-add-wrap') || 
          event.target.closest('.mr-sidebar-dropdown') ||
          event.target.closest('.mr-date-menu') ||
          event.target.closest('.mr-hover-card')
        ) {
          return;
        }
      }
      this.timelineTagDropdownKey = '';
      this.dateMenuOpen = false;
      this.sidebarExportOpen = false;
      this.hoverCardOpen = false;
    },
    playNotebookSFX(text) {
      const sfxPath = this.getNotebookSFXPath(text);
      if (!sfxPath) {
        console.warn('MR SFX: No sound path found for text:', text);
        return;
      }
      const fullUrl = `${this.backendOrigin()}/${sfxPath}`;
      console.log('MR SFX: Playing sound:', fullUrl);
      const audio = new Audio(fullUrl);
      audio.play().catch(err => console.warn('MR SFX: Playback failed:', err));
    },
    closeAddRecordModal() {
      this.addRecordModalOpen = false;
      this.addRecordSuccess = '';
    },
    nextNotebookNumber() {
      const numbers = (Array.isArray(this.notebooks) ? this.notebooks : [])
        .map((nb) => Number(nb?.number))
        .filter((value) => Number.isFinite(value));
      return numbers.length ? Math.max(...numbers) + 1 : 1;
    },
    resetNotebookImportForm() {
      const nextNumber = this.nextNotebookNumber();
      const notebookId = `nb${nextNumber}`;
      this.notebookImportId = notebookId;
      this.notebookImportNumber = String(nextNumber);
      this.notebookImportTitle = this.plainText(this.activeNotebook?.title || 'Field Notes') || 'Field Notes';
      this.notebookImportSubtitle = this.plainText(this.activeNotebook?.subtitle || '');
      this.notebookImportMetadata = this.plainText(this.activeNotebook?.metadata || '');
      this.notebookImportDate = this.plainText(this.activeNotebook?.date || '');
      this.notebookImportFilename = `nb_${notebookId}.md`;
      this.notebookImportEntryId = `${notebookId}-e1`;
      this.notebookImportEntryTitle = 'Start';
      this.notebookImportEntryDate = this.notebookImportDate;
      this.notebookImportStoryText = '';
      this.notebookImportSaving = false;
      this.notebookImportError = '';
    },
    parseNotebookImportDraft(text) {
      const raw = String(text || '').replace(/\r\n/g, '\n');
      const lines = raw.split('\n');
      const fields = {};
      let index = 0;
      let sawHeader = false;

      for (; index < lines.length; index += 1) {
        const line = String(lines[index] || '');
        if (!line.trim()) {
          index += 1;
          sawHeader = true;
          break;
        }

        const match = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
        if (!match) {
          break;
        }

        sawHeader = true;
        const key = match[1].toLowerCase();
        let value = match[2].trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        fields[key] = value;
      }

      if (!sawHeader) {
        return null;
      }

      return {
        fields,
        body: lines.slice(index).join('\n').replace(/^\n+/, '')
      };
    },
    syncNotebookImportDraftFromStoryText() {
      const parsed = this.parseNotebookImportDraft(this.notebookImportStoryText);
      if (!parsed) {
        return;
      }

      const fields = parsed.fields || {};
      if (fields.id) {
        this.notebookImportId = String(fields.id).trim();
        const numberMatch = String(fields.id).match(/(\d+)$/);
        if (numberMatch && (!String(this.notebookImportNumber || '').trim() || this.notebookImportNumber === String(this.nextNotebookNumber()))) {
          this.notebookImportNumber = String(Number(numberMatch[1]));
        }
      }
      if (fields.title) {
        this.notebookImportTitle = String(fields.title).trim();
      }
      if (fields.subtitle) {
        this.notebookImportSubtitle = String(fields.subtitle).trim();
      }
      if (fields.metadata) {
        this.notebookImportMetadata = String(fields.metadata).trim();
      }
      if (fields.date) {
        this.notebookImportDate = String(fields.date).trim();
        if (!String(this.notebookImportEntryDate || '').trim()) {
          this.notebookImportEntryDate = String(fields.date).trim();
        }
      }

      const cleanedBody = String(parsed.body || '').trimStart();
      if (cleanedBody && cleanedBody !== String(this.notebookImportStoryText || '')) {
        this.notebookImportStoryText = cleanedBody;
      }

      if (this.notebookImportId) {
        this.notebookImportFilename = `nb_${String(this.notebookImportId).replace(/[^a-zA-Z0-9_-]+/g, '-').toLowerCase()}.md`;
        this.notebookImportEntryId = `${String(this.notebookImportId).replace(/[^a-zA-Z0-9_-]+/g, '-').toLowerCase()}-e1`;
      }
      if (fields.title && !String(this.notebookImportEntryTitle || '').trim()) {
        this.notebookImportEntryTitle = 'Start';
      }
    },
    openNotebookImportModal() {
      this.closeAllModals();
      this.resetNotebookImportForm();
      this.notebookImportModalOpen = true;
    },
    closeNotebookImportModal() {
      this.notebookImportModalOpen = false;
      this.notebookImportSaving = false;
      this.notebookImportError = '';
    },
    async submitNotebookImport() {
      this.syncNotebookImportDraftFromStoryText();
      const storyText = String(this.notebookImportStoryText || '').trim();
      if (!storyText) {
        this.notebookImportError = 'Paste the story text first.';
        return;
      }

      this.notebookImportSaving = true;
      this.notebookImportError = '';
      try {
        const response = await fetch(this.apiUrl('/api/notebooks/import-story'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            notebookId: String(this.notebookImportId || '').trim(),
            number: String(this.notebookImportNumber || '').trim(),
            title: String(this.notebookImportTitle || '').trim(),
            subtitle: String(this.notebookImportSubtitle || '').trim(),
            metadata: String(this.notebookImportMetadata || '').trim(),
            date: String(this.notebookImportDate || '').trim(),
            filename: String(this.notebookImportFilename || '').trim(),
            entryId: String(this.notebookImportEntryId || '').trim(),
            entryTitle: String(this.notebookImportEntryTitle || '').trim(),
            entryDate: String(this.notebookImportEntryDate || '').trim(),
            storyText
          })
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || payload?.ok === false) {
          throw new Error(String(payload?.error || `notebook-import-${response.status}`));
        }

        await this.loadNotebooks();
        this.activeNotebookId = String(payload?.notebook?.id || this.notebookImportId || '');
        this.closeNotebookImportModal();
      } catch (error) {
        this.notebookImportError = String(error?.message || 'Failed to import notebook story.');
      } finally {
        this.notebookImportSaving = false;
      }
    },
    openDatePickerFromEvent(event) {
      if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
      }
      const trigger = event?.currentTarget;
      const scope = trigger?.closest?.('.mr-date-input-wrap') || trigger?.parentElement;
      const input = scope?.querySelector?.('input.mr-date-input');
      if (!input) {
        return;
      }

      const raw = String(input.value || '').trim();
      const parts = this.parseTimelineDateParts(raw);
      const needsExtendedPicker = !!parts && (parts.year < 1 || parts.month === 0 || parts.day === 0);

      if (input._flatpickr && !needsExtendedPicker) {
        input._flatpickr.open();
        setTimeout(() => {
          if (input._flatpickr?.isOpen) {
            return;
          }
          this.openFallbackDateMenu(trigger, input, parts);
        }, 50);
        return;
      }
      this.openFallbackDateMenu(trigger, input, parts);
    },
    openFallbackDateMenu(trigger, input, parsedParts = null, context = null) {
      const rect = trigger?.getBoundingClientRect?.() || input?.getBoundingClientRect?.();
      const fallback = parsedParts || this.parseTimelineDateParts(String(input?.value || '').trim());
      this.dateMenuYear = String((fallback?.year ?? new Date().getFullYear()));
      this.dateMenuMonth = String(fallback?.month ?? 1).padStart(2, '0');
      this.dateMenuDay = String(fallback?.day ?? 1).padStart(2, '0');
      this._dateMenuTargetInput = input || null;
      this.dateMenuContext = context || null;
      this.dateMenuError = '';

      if (rect) {
        this.dateMenuX = Math.max(12, Math.round(rect.left + window.scrollX));
        this.dateMenuY = Math.max(12, Math.round(rect.bottom + window.scrollY + 8));
      } else {
        this.dateMenuX = 24;
        this.dateMenuY = 24;
      }

      this.dateMenuOpen = true;
    },
    openDateMenuForContext(dateValue, clickEvent = null, context = null) {
      const trigger = clickEvent?.currentTarget || null;
      const parsed = this.parseTimelineDateParts(String(dateValue || '').trim());
      this.openFallbackDateMenu(trigger, null, parsed, context || null);
    },
    closeDateMenu() {
      this.dateMenuOpen = false;
      this._dateMenuTargetInput = null;
      this.dateMenuContext = null;
      this.dateMenuApplying = false;
      this.dateMenuError = '';
    },
    async applyDateMenu() {
      const yearRaw = String(this.dateMenuYear || '').trim();
      const yearNum = Number(yearRaw);
      if (!Number.isFinite(yearNum) || !yearRaw) {
        this.dateMenuError = 'Enter a valid year.';
        return;
      }

      const month = String(this.dateMenuMonth || '01').padStart(2, '0');
      const day = String(this.dateMenuDay || '01').padStart(2, '0');
      const value = `${yearRaw}-${month}-${day}`;
      this.dateMenuApplying = true;
      this.dateMenuError = '';

      try {
        const context = this.dateMenuContext;
        if (context?.kind === 'timeline') {
          await this.saveTimelineDateDirect(context.event, context.index, value);
        } else if (context?.kind === 'relationship-field') {
          await this.saveRelationshipFieldDateDirect(context.rel, context.field, value);
        } else if (context?.kind === 'relationship-history') {
          await this.saveRelationshipHistoryDateDirect(context.rel, context.historyItem, context.historyIndex, value);
        } else {
          const input = this._dateMenuTargetInput;
          if (input) {
            input.value = value;
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }
        this.closeDateMenu();
      } catch (error) {
        this.dateMenuError = String(error?.message || 'Failed to apply date.');
      } finally {
        this.dateMenuApplying = false;
      }
    },
    toggleAddRecordTag(tag) {
      const cleaned = this.plainText(tag || '');
      if (!cleaned) {
        return;
      }
      const next = Array.isArray(this.addRecordTags) ? [...this.addRecordTags] : [];
      const idx = next.findIndex((item) => this.plainText(item) === cleaned);
      if (idx >= 0) {
        next.splice(idx, 1);
      } else {
        next.push(cleaned);
      }
      this.addRecordTags = Array.from(new Set(next.map((value) => this.plainText(value)).filter(Boolean)));
    },
    addRecordTagPortraitInfo(tag) {
      const rawTag = this.plainText(tag || '');
      const resolvedId = this.getResolvedCharacterId(rawTag);
      const resolvedCore = this.getResolvedCharacterCore(rawTag) || this.characterCore?.[resolvedId] || null;
      const displayLabel = String(resolvedCore?.['full name'] || resolvedCore?.navLabel || rawTag || '').trim() || rawTag;
      const portraitSrc = rawTag ? this.getSyncPortraitSrc(rawTag, this.activeYear) : '';
      const secureSrc = (portraitSrc && typeof toSecureMediaUrl === 'function') ? toSecureMediaUrl(portraitSrc) : portraitSrc;
      const isCharacter = this.timelineTagType(rawTag) === 'character' || Boolean(resolvedCore);
      const isAlias = Boolean(rawTag && resolvedId && resolvedId !== rawTag);
      const needsPortrait = Boolean(isCharacter && !secureSrc);

      return {
        label: displayLabel,
        resolvedId,
        src: secureSrc,
        isCharacter,
        isAlias,
        needsPortrait,
        title: needsPortrait
          ? `${displayLabel} needs a portrait`
          : `${displayLabel}${isAlias ? ' (alias)' : ''}`
      };
    },
    csvToIdArray(value = '') {
      return Array.from(new Set(
        String(value || '')
          .split(',')
          .map((item) => String(item || '').toLowerCase().trim())
          .filter(Boolean)
      ));
    },
    parseBulkTimelineText(text) {
      if (!text || !text.trim()) return [];

      // Try Markdown format first
      if (text.includes('---')) {
        const parts = text.split(/<!--\s*entry-break\s*-->/);
        const events = [];
        parts.forEach((part) => {
          const trimmed = part.trim();
          if (!trimmed) return;

          const fmMatch = trimmed.match(/^---\s*[\r\n]+([\s\S]*?)[\r\n]+---\s*[\r\n]*/);
          if (fmMatch) {
            try {
              if (typeof jsyaml !== 'undefined') {
                const meta = jsyaml.load(fmMatch[1]);
                const description = trimmed.slice(fmMatch[0].length).trim();
                events.push({
                  date: String(meta?.date || '').trim(),
                  title: String(meta?.title || '').trim(),
                  tags: Array.isArray(meta?.tags) ? meta.tags : [],
                  description
                });
              }
            } catch (e) {
              console.warn('MR: Failed to parse bulk frontmatter part', e);
            }
          }
        });
        if (events.length) return events;
      }

      // Fallback to simple format: Date | Title | Description | tags
      const lines = text.split('\n').filter(l => l.trim());
      const events = lines.map(line => {
        const segments = line.split('|').map(s => s.trim());
        if (segments.length < 2) return null;
        return {
          date: segments[0],
          title: segments[1],
          description: segments[2] || '',
          tags: segments[3] ? segments[3].split(',').map(t => t.trim()).filter(Boolean) : []
        };
      }).filter(Boolean);

      return events;
    },
    async submitAddRecordModal() {
      this.addRecordError = '';

      // Basic Validation
      if (this.addRecordType === 'timeline') {
        if (!String(this.addRecordDate || '').trim()) {
          this.addRecordError = 'Date is required (YYYY-MM-DD).';
          return;
        }
        if (!String(this.addRecordTitle || '').trim()) {
          this.addRecordError = 'Title is required.';
          return;
        }
      } else if (this.addRecordType === 'bulk') {
        if (!String(this.addRecordBulkText || '').trim()) {
          this.addRecordError = 'Bulk text is empty.';
          return;
        }
      }

      this.addRecordSaving = true;
      try {
        if (this.addRecordType === 'timeline') {
          const response = await fetch(this.apiUrl('/api/timeline/add-event'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              date: String(this.addRecordDate || '').trim(),
              title: String(this.addRecordTitle || '').trim(),
              description: String(this.addRecordDescription || '').trim(),
              tags: Array.isArray(this.addRecordTags) ? this.addRecordTags : []
            })
          });
          const payload = await response.json().catch(() => null);
          if (!response.ok || payload?.ok === false) {
            const errorMsg = payload?.error || `timeline-add-${response.status}`;
            throw new Error(errorMsg);
          }
          await this.loadTimeline();
        } else if (this.addRecordType === 'bulk') {
          const events = this.parseBulkTimelineText(this.addRecordBulkText);
          const response = await fetch(this.apiUrl('/api/timeline/bulk-add'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ events })
          });
          const payload = await response.json().catch(() => null);
          if (!response.ok || payload?.ok === false) {
            throw new Error(payload?.error || `timeline-bulk-${response.status}`);
          }
          await this.loadTimeline();
        } else if (this.addRecordType === 'relationship') {
          const response = await fetch(this.apiUrl('/api/relationships/add'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: String(this.addRecordRelationshipId || '').trim(),
              label: String(this.addRecordRelationshipLabel || '').trim(),
              type: String(this.addRecordRelationshipType || 'relationship').trim(),
              startDate: String(this.addRecordRelationshipStartDate || '').trim(),
              splitDate: String(this.addRecordRelationshipSplitDate || '').trim(),
              members: this.csvToIdArray(this.addRecordRelationshipMembers),
              children: this.csvToIdArray(this.addRecordRelationshipChildren),
              notes: String(this.addRecordRelationshipNotes || '').trim(),
              history: (String(this.addRecordRelationshipHistoryDate || '').trim() && String(this.addRecordRelationshipHistoryEvents || '').trim())
                ? {
                  [String(this.addRecordRelationshipHistoryDate || '').trim()]: String(this.addRecordRelationshipHistoryEvents || '')
                    .split('|')
                    .map((item) => String(item || '').trim())
                    .filter(Boolean)
                }
                : null
            })
          });
          const payload = await response.json().catch(() => null);
          if (!response.ok || payload?.ok === false) {
            throw new Error(String(payload?.error || `relationship-add-${response.status}`));
          }
          await this.loadRelationships();
        }
        this.addRecordModalOpen = false;
      } catch (error) {
        this.addRecordError = String(error?.message || 'Failed to create record.');
      } finally {
        this.addRecordSaving = false;
      }
    },
    reformatBulkTimelineText(rawText) {
      const text = String(rawText || '');
      if (!text.trim()) return '';

      const lines = text.split(/\r?\n/);
      const entries = [];
      let currentEntry = null;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Check if this line starts a new entry (either "date/id:" or "---" followed by "date/id:")
        const isDateOrIdLine = /^(date|id)\s*:/i.test(trimmed);
        const isFmSeparator = /^---$/.test(trimmed);
        
        let startsNew = false;
        let dateValueLine = '';

        if (isDateOrIdLine) {
          startsNew = true;
          dateValueLine = line;
        } else if (isFmSeparator) {
          // Look ahead to see if the next non-empty line starts with date or id:
          let nextNonEmpty = '';
          for (let j = i + 1; j < Math.min(lines.length, i + 5); j++) {
            if (lines[j].trim()) {
              nextNonEmpty = lines[j].trim();
              break;
            }
          }
          if (/^(date|id)\s*:/i.test(nextNonEmpty)) {
            startsNew = true;
            // Skip the "---" line itself, we will generate it cleanly
            continue;
          }
        }

        if (startsNew) {
          if (currentEntry) {
            entries.push(currentEntry);
          }
          currentEntry = {
            yamlLines: [],
            bodyLines: [],
            inYaml: true
          };
          if (dateValueLine) {
            currentEntry.yamlLines.push(dateValueLine);
          }
          continue;
        }

        if (!currentEntry) {
          continue;
        }

        if (currentEntry.inYaml) {
          const isFmEnd = /^---$/.test(trimmed);
          const isYamlField = /^[a-zA-Z0-9_-]+\s*:/i.test(trimmed) || /^\s*-\s+/.test(line) || /^\s+/.test(line);

          if (isFmEnd) {
            currentEntry.inYaml = false;
            continue;
          }

          if (!trimmed) {
            currentEntry.inYaml = false;
            continue;
          }

          if (!isYamlField) {
            currentEntry.inYaml = false;
            currentEntry.bodyLines.push(line);
          } else {
            currentEntry.yamlLines.push(line);
          }
        } else {
          currentEntry.bodyLines.push(line);
        }
      }

      if (currentEntry) {
        entries.push(currentEntry);
      }

      const formattedEntries = entries.map(entry => {
        const yamlCleaned = entry.yamlLines
          .map(l => l.trimEnd())
          .filter(l => l !== '---' && l.trim());
          
        const bodyCleaned = entry.bodyLines.join('\n').trim();

        let result = '---\n';
        result += yamlCleaned.join('\n') + '\n';
        result += '---\n';
        if (bodyCleaned) {
          result += bodyCleaned + '\n';
        }
        return result;
      });

      return formattedEntries.join('\n<!-- entry-break -->\n\n');
    },
    highlightAddRecordPreview() {
      this.addRecordSuccess = '';
      const rawText = String(this.addRecordBulkText || '').trim();
      if (!rawText) {
        this.addRecordParsedCount = 0;
        this.addRecordParsedTags = [];
        return;
      }

      const text = this.reformatBulkTimelineText(rawText);
      if (!text) {
        this.addRecordParsedCount = 0;
        this.addRecordParsedTags = [];
        return;
      }

      // Count entries by looking for frontmatter blocks
      const parts = text.split(/<!--\s*entry-break\s*-->/).map(p => p.trim()).filter(Boolean);
      let count = 0;
      const allTags = new Set();

      for (const part of parts) {
        const fmMatch = part.match(/^---\s*[\r\n]+([\s\S]*?)[\r\n]+---/);
        if (fmMatch) {
          count++;
          // Extract tags from YAML frontmatter
          const fmText = fmMatch[1];
          // Match tags in array notation: tags: [tag1, tag2] or tags: ['tag1', 'tag2']
          const arrayMatch = fmText.match(/tags\s*:\s*\[([^\]]*)\]/);
          if (arrayMatch) {
            arrayMatch[1].split(',').forEach(t => {
              const tag = t.trim().replace(/^['"]|['"]$/g, '');
              if (tag) allTags.add(tag.toLowerCase());
            });
          } else {
            // Match tags in list notation:
            //   - tag1
            //   - tag2
            const listMatches = fmText.matchAll(/^\s*-\s+(.+)$/gm);
            let inTags = false;
            for (const line of fmText.split(/\r?\n/)) {
              if (/^tags\s*:/.test(line.trim())) {
                inTags = true;
                // Check for inline value: tags: something
                const inline = line.trim().replace(/^tags\s*:\s*/, '').trim();
                if (inline && !inline.startsWith('[')) {
                  inline.split(',').forEach(t => {
                    const tag = t.trim().replace(/^['"]|['"]$/g, '');
                    if (tag) allTags.add(tag.toLowerCase());
                  });
                }
                continue;
              }
              if (inTags) {
                const listItem = line.match(/^\s+-\s+(.+)/);
                if (listItem) {
                  const tag = listItem[1].trim().replace(/^['"]|['"]$/g, '');
                  if (tag) allTags.add(tag.toLowerCase());
                } else if (line.trim() && !line.match(/^\s/)) {
                  inTags = false;
                }
              }
            }
          }
        }
      }

      // If no frontmatter was found, check if the text itself is a single entry without entry-break
      if (count === 0 && text.includes('---')) {
        const fmMatch = text.match(/^---\s*[\r\n]+([\s\S]*?)[\r\n]+---/);
        if (fmMatch) count = 1;
      }

      this.addRecordParsedCount = count;
      this.addRecordParsedTags = Array.from(allTags).sort();
    },
    parseBulkTextToEntries(rawText) {
      const text = this.reformatBulkTimelineText(rawText);
      if (!text) return [];

      const parts = text.split(/<!--\s*entry-break\s*-->/).map(p => p.trim()).filter(Boolean);
      const entries = [];

      for (const part of parts) {
        const fmMatch = part.match(/^---\s*[\r\n]+([\s\S]*?)[\r\n]+---/);
        if (fmMatch) {
          const fmText = fmMatch[1];
          const description = part.slice(fmMatch[0].length).trim();
          
          let date = '';
          let title = '';
          let tags = [];
          const otherFields = {};

          for (const line of fmText.split(/\r?\n/)) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            
            if (/^date\s*:/i.test(trimmed)) {
              date = trimmed.replace(/^date\s*:\s*/i, '').trim().replace(/^['"]|['"]$/g, '');
            } else if (/^title\s*:/i.test(trimmed)) {
              title = trimmed.replace(/^title\s*:\s*/i, '').trim().replace(/^['"]|['"]$/g, '');
            } else if (/^tags\s*:/i.test(trimmed)) {
              const inlineTags = trimmed.replace(/^tags\s*:\s*/i, '').trim();
              if (inlineTags.startsWith('[')) {
                tags = inlineTags.replace(/^\[|\]$/g, '').split(',').map(t => t.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
              } else if (inlineTags) {
                tags = [inlineTags.replace(/^['"]|['"]$/g, '')];
              }
            } else if (trimmed.startsWith('-')) {
              const tag = trimmed.replace(/^-/, '').trim().replace(/^['"]|['"]$/g, '');
              if (tag) tags.push(tag);
            } else {
              const match = trimmed.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/);
              if (match) {
                const k = match[1];
                const v = match[2].trim().replace(/^['"]|['"]$/g, '');
                if (k.toLowerCase() !== 'date' && k.toLowerCase() !== 'title' && k.toLowerCase() !== 'tags') {
                  otherFields[k] = v;
                }
              }
            }
          }

          entries.push({
            date,
            title,
            tags: tags.map(t => t.toLowerCase()),
            description,
            otherFields,
            expanded: false,
            isEditing: false
          });
        }
      }

      return entries;
    },
    generateBulkTextFromEntries(entries) {
      return entries.map(entry => {
        let result = '---\n';
        result += `date: "${entry.date || ''}"\n`;
        result += `title: "${entry.title || ''}"\n`;
        
        const cleanTags = (entry.tags || []).map(t => String(t || '').trim()).filter(Boolean);
        if (cleanTags.length > 0) {
          result += `tags:\n` + cleanTags.map(t => `  - "${t}"`).join('\n') + '\n';
        }

        if (entry.otherFields) {
          for (const [k, v] of Object.entries(entry.otherFields)) {
            result += `${k}: "${v}"\n`;
          }
        }
        
        result += '---\n';
        if (entry.description) {
          result += entry.description.trim() + '\n';
        }
        return result;
      }).join('\n<!-- entry-break -->\n\n');
    },
    switchToModularMode() {
      this.addRecordError = '';
      this.addRecordSuccess = '';
      const rawText = String(this.addRecordBulkText || '').trim();
      if (!rawText) {
        this.addRecordError = 'Please paste timeline entries first.';
        return;
      }
      
      const parsed = this.parseBulkTextToEntries(rawText);
      if (parsed.length === 0) {
        this.addRecordError = 'Could not parse any valid entries. Please check formatting (need date: and title:).';
        return;
      }

      this.addRecordParsedEntries = parsed;
      this.addRecordViewMode = 'modular';
    },
    switchToPasteMode() {
      this.addRecordBulkText = this.generateBulkTextFromEntries(this.addRecordParsedEntries);
      this.addRecordViewMode = 'paste';
      this.addRecordError = '';
      this.addRecordSuccess = '';
    },
    togglePasteEventsDrawer() {
      this.pasteEventsDrawerOpen = !this.pasteEventsDrawerOpen;
      // Do NOT clear pasteEventsInputText so it saves the text on toggle open/close
      this.pasteEventsError = '';
      this.pasteEventsSuccess = '';
    },
    async submitPasteEventsInline() {
      this.pasteEventsError = '';
      this.pasteEventsSuccess = '';
      const rawText = String(this.pasteEventsInputText || '').trim();
      if (!rawText) {
        this.pasteEventsError = 'Please paste timeline entries first.';
        return;
      }

      const parsed = this.parseBulkTextToEntries(rawText);
      if (parsed.length === 0) {
        this.pasteEventsError = 'Could not parse any valid entries. Please check date: and title: formatting.';
        return;
      }

      parsed.forEach(entry => {
        if (!entry.tags) entry.tags = [];
        const lowerTags = entry.tags.map(t => String(t || '').trim().toLowerCase());
        if (!lowerTags.includes('draft')) {
          entry.tags.push('draft');
        }
      });

      const text = this.generateBulkTextFromEntries(parsed);
      this.pasteEventsSaving = true;

      try {
        const response = await fetch(this.apiUrl('/api/timeline/inject'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text })
        });
        
        const payload = await response.json().catch(() => null);
        if (!response.ok || payload?.ok === false) {
          throw new Error(String(payload?.error || `inject-${response.status}`));
        }

        await this.loadTimeline();
        this.timelineActiveTags = ['draft'];

        this.pasteEventsInputText = '';
        this.pasteEventsSuccess = 'Successfully injected draft entries!';
        
        setTimeout(() => {
          this.pasteEventsDrawerOpen = false;
          this.pasteEventsSuccess = '';
        }, 1200);

      } catch (error) {
        this.pasteEventsError = String(error?.message || 'Failed to inject draft entries.');
        this.pasteEventsSuccess = '';
      } finally {
        this.pasteEventsSaving = false;
      }
    },
    deleteReviewEntry(index) {
      this.addRecordParsedEntries.splice(index, 1);
      if (this.addRecordParsedEntries.length === 0) {
        this.addRecordViewMode = 'paste';
      }
    },
    startEditReviewEntry(index) {
      const entry = this.addRecordParsedEntries[index];
      entry._backup = {
        date: entry.date,
        title: entry.title,
        tags: [...(entry.tags || [])],
        description: entry.description
      };
      
      entry._tagsEdit = (entry.tags || []).join(', ');
      entry.isEditing = true;
    },
    saveEditReviewEntry(index) {
      const entry = this.addRecordParsedEntries[index];
      if (typeof entry._tagsEdit === 'string') {
        entry.tags = entry._tagsEdit.split(',')
          .map(t => t.trim().toLowerCase())
          .filter(Boolean);
      }
      
      delete entry._backup;
      delete entry._tagsEdit;
      entry.isEditing = false;
    },
    cancelEditReviewEntry(index) {
      const entry = this.addRecordParsedEntries[index];
      if (entry._backup) {
        entry.date = entry._backup.date;
        entry.title = entry._backup.title;
        entry.tags = entry._backup.tags;
        entry.description = entry._backup.description;
      }
      
      delete entry._backup;
      delete entry._tagsEdit;
      
      if (!entry.date && !entry.title && !entry.description) {
        this.deleteReviewEntry(index);
        return;
      }
      
      entry.isEditing = false;
    },
    addNewReviewEntry() {
      this.addRecordParsedEntries.forEach(e => {
        e.expanded = false;
        e.isEditing = false;
      });

      const newEntry = {
        date: new Date().toISOString().split('T')[0],
        title: 'New Event',
        tags: [],
        description: '',
        otherFields: {},
        expanded: true,
        isEditing: true,
        _tagsEdit: ''
      };

      this.addRecordParsedEntries.push(newEntry);
      
      this.$nextTick(() => {
        const container = document.querySelector('.mr-bulk-review-container');
        if (container) {
          container.scrollTop = container.scrollHeight;
        }
      });
    },
    toggleReviewDescription(index) {
      const entry = this.addRecordParsedEntries[index];
      entry.expanded = !entry.expanded;
    },
    async submitAddRecordInject() {
      this.addRecordError = '';
      this.addRecordSuccess = '';
      
      let text = '';
      if (this.addRecordViewMode === 'modular') {
        text = this.generateBulkTextFromEntries(this.addRecordParsedEntries);
      } else {
        const rawText = String(this.addRecordBulkText || '').trim();
        if (!rawText) {
          this.addRecordError = 'Paste timeline entries to inject.';
          return;
        }
        text = this.reformatBulkTimelineText(rawText);
      }

      if (!text.trim()) {
        this.addRecordError = 'No valid entries found to inject.';
        return;
      }

      this.addRecordSaving = true;
      try {
        const response = await fetch(this.apiUrl('/api/timeline/inject'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text })
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || payload?.ok === false) {
          throw new Error(String(payload?.error || `inject-${response.status}`));
        }
        await this.loadTimeline();
        
        this.addRecordBulkText = '';
        this.addRecordParsedEntries = [];
        this.addRecordParsedCount = 0;
        this.addRecordParsedTags = [];
        this.addRecordViewMode = 'paste';
        
        this.addRecordError = '';
        this.addRecordSuccess = 'Successfully injected entries!';
      } catch (error) {
        this.addRecordError = String(error?.message || 'Failed to inject entries.');
        this.addRecordSuccess = '';
      } finally {
        this.addRecordSaving = false;
      }
    },
    async runFormatTags() {
      this.addRecordError = '';
      this.addRecordFormatting = true;
      try {
        const response = await fetch(this.apiUrl('/api/timeline/format-tags'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || payload?.ok === false) {
          throw new Error(String(payload?.error || `format-tags-${response.status}`));
        }
        // Reload timeline to reflect any tag changes
        await this.loadTimeline();
        this.addRecordError = '';
        // Show brief success feedback via the error field (reuse it)
        const output = String(payload?.output || '').trim();
        if (output) {
          this.addRecordError = '✓ ' + output;
        } else {
          this.addRecordError = '✓ Tags formatted successfully.';
        }
      } catch (error) {
        this.addRecordError = String(error?.message || 'Failed to format tags.');
      } finally {
        this.addRecordFormatting = false;
      }
    },
    openStoryExportModal(options = {}) {
      if (!options.stackOnCharsheet) {
        this.closeAllModals();
      }
      this.initializeStoryExportSelection(false);
      this.initializeStoryExportRelationshipSelection(false);
      this.storyExportOpen = true;
      this.storyExportError = '';
    },
    closeStoryExportModal() {
      this.storyExportOpen = false;
    },
    initializeStoryExportSelection(forceReset = false) {
      const next = { ...(this.storyExportSelections || {}) };
      const known = new Set();

      // If timeline filter active, only pre-check filtered characters (explicit + expanded)
      const activeFilters = this.timelineActiveTagsExpanded || [];
      const hasActiveFilters = activeFilters.length > 0;
      const activeFilterSet = new Set(activeFilters.map(t => t.toLowerCase().trim()));

      (this.storyExportGroups || []).forEach((group) => {
        (group.characters || []).forEach((item) => {
          const charId = item.id.toLowerCase().trim();
          known.add(item.id);
          if (!Object.prototype.hasOwnProperty.call(next, item.id) || forceReset) {
            if (hasActiveFilters) {
              next[item.id] = activeFilterSet.has(charId);
            } else {
              next[item.id] = true;
            }
          }
        });
      });

      Object.keys(next).forEach((id) => {
        if (!known.has(id)) {
          delete next[id];
        }
      });
      this.storyExportSelections = next;

      const selected = this.storyExportSelectedCharacterIds;
      if (!selected.length) {
        this.storyExportProtagonistId = '';
        return;
      }

      if (!this.storyExportProtagonistId || !selected.includes(this.storyExportProtagonistId)) {
        this.storyExportProtagonistId = this.inferDefaultStoryProtagonistId() || selected[0];
      }
      this.initializeStoryExportRelationshipSelection(false);
    },
    initializeStoryExportRelationshipSelection(forceReset = false) {
      const next = { ...(this.storyExportRelationshipSelections || {}) };
      const known = new Set();
      (this.storyExportRelationshipRows || []).forEach((row) => {
        known.add(row.id);
        if (!Object.prototype.hasOwnProperty.call(next, row.id) || forceReset) {
          next[row.id] = !row.startsCurrentYear;
        }
      });

      Object.keys(next).forEach((id) => {
        if (!known.has(id)) {
          delete next[id];
        }
      });
      this.storyExportRelationshipSelections = next;
    },
    inferDefaultStoryProtagonistId() {
      const activeId = String(this.activeEntry?.id || '').toLowerCase().trim();
      if (activeId && this.storyExportSelectedCharacterIds.includes(activeId)) {
        return activeId;
      }

      const blocks = Array.isArray(this.activeEntry?.blocks) ? this.activeEntry.blocks : [];
      for (const block of blocks) {
        const members = Array.isArray(block?.members) ? block.members : [];
        for (const member of members) {
          const id = String(member || '').toLowerCase().trim();
          if (id && this.storyExportSelectedCharacterIds.includes(id)) {
            return id;
          }
        }
      }

      return this.storyExportSelectedCharacterIds[0] || '';
    },
    storyExportGroupState(group) {
      const chars = Array.isArray(group?.characters) ? group.characters : [];
      if (!chars.length) {
        return 'none';
      }
      const selectedCount = chars.filter((item) => this.storyExportSelections?.[item.id] !== false).length;
      if (selectedCount <= 0) {
        return 'none';
      }
      if (selectedCount >= chars.length) {
        return 'all';
      }
      return 'some';
    },
    toggleStoryExportGroup(group) {
      const chars = Array.isArray(group?.characters) ? group.characters : [];
      if (!chars.length) {
        return;
      }
      const makeSelected = this.storyExportGroupState(group) !== 'all';
      const next = { ...(this.storyExportSelections || {}) };
      chars.forEach((item) => {
        next[item.id] = makeSelected;
      });
      this.storyExportSelections = next;

      const selected = this.storyExportSelectedCharacterIds;
      if (selected.length && !selected.includes(this.storyExportProtagonistId)) {
        this.storyExportProtagonistId = selected[0];
      }
    },
    toggleStoryExportCharacter(characterId) {
      const id = String(characterId || '').toLowerCase().trim();
      if (!id) {
        return;
      }
      const next = { ...(this.storyExportSelections || {}) };
      next[id] = !(next[id] !== false);
      this.storyExportSelections = next;

      const selected = this.storyExportSelectedCharacterIds;
      if (selected.length && !selected.includes(this.storyExportProtagonistId)) {
        this.storyExportProtagonistId = selected[0];
        this.initializeStoryExportRelationshipSelection(false);
      }
    },
    setStoryExportProtagonist(characterId) {
      const id = String(characterId || '').toLowerCase().trim();
      if (!id) {
        return;
      }
      this.storyExportSelections = {
        ...(this.storyExportSelections || {}),
        [id]: true
      };
      this.storyExportProtagonistId = id;
      this.initializeStoryExportRelationshipSelection(false);
    },
    selectAllStoryExportCharacters() {
      const next = { ...(this.storyExportSelections || {}) };
      (this.storyExportGroups || []).forEach((group) => {
        (group.characters || []).forEach((item) => {
          next[item.id] = true;
        });
      });
      this.storyExportSelections = next;
      if (!this.storyExportProtagonistId) {
        this.storyExportProtagonistId = this.storyExportSelectedCharacterIds[0] || '';
      }
    },
    clearStoryExportCharacters() {
      const next = { ...(this.storyExportSelections || {}) };
      (this.storyExportGroups || []).forEach((group) => {
        (group.characters || []).forEach((item) => {
          next[item.id] = false;
        });
      });
      this.storyExportSelections = next;
      this.storyExportProtagonistId = '';
      this.storyExportRelationshipSelections = {};
    },
    toggleStoryExportRelationshipsPanel() {
      this.storyExportRelationshipOpen = !this.storyExportRelationshipOpen;
    },
    toggleStoryExportRelationship(relId) {
      const id = String(relId || '').trim();
      if (!id) {
        return;
      }
      this.storyExportRelationshipSelections = {
        ...(this.storyExportRelationshipSelections || {}),
        [id]: !(this.storyExportRelationshipSelections?.[id] !== false)
      };
    },
    toggleStoryExportVoiceTag(tagKey) {
      const key = String(tagKey || '').toLowerCase().trim();
      if (!key) {
        return;
      }
      this.storyExportStyleTagSelections = {
        ...(this.storyExportStyleTagSelections || {}),
        [key]: !(this.storyExportStyleTagSelections?.[key])
      };
    },
    clearStoryExportVoiceTags() {
      this.storyExportStyleTagSelections = {};
    },
    queueStoryExportPortraitLoad(characterId, year) {
      const id = String(characterId || '').toLowerCase().trim();
      const y = Number(year || 0);
      if (!id || !Number.isFinite(y)) {
        return;
      }
      const key = `${id}::${y}`;
      if (Object.prototype.hasOwnProperty.call(this.storyExportPortraitByYearChar || {}, key)) {
        return;
      }

      this.storyExportPortraitByYearChar = {
        ...(this.storyExportPortraitByYearChar || {}),
        [key]: ''
      };

      this.closestPortraitForCharacterCapped(id, y, y)
        .then((src) => {
          this.storyExportPortraitByYearChar = {
            ...(this.storyExportPortraitByYearChar || {}),
            [key]: String(src || '')
          };
        })
        .catch(() => {
          this.storyExportPortraitByYearChar = {
            ...(this.storyExportPortraitByYearChar || {}),
            [key]: ''
          };
        });
    },
    onStoryExportPortraitError(characterId, year) {
      const id = String(characterId || '').toLowerCase().trim();
      const y = Number(year || 0);
      if (!id || !Number.isFinite(y)) {
        return;
      }
      const key = `${id}::${y}`;
      this.storyExportPortraitFailedByYearChar = {
        ...(this.storyExportPortraitFailedByYearChar || {}),
        [key]: true
      };
      this.storyExportPortraitByYearChar = {
        ...(this.storyExportPortraitByYearChar || {}),
        [key]: ''
      };
    },
    onLogoImgError(event) {
      if (event && event.target) {
        event.target.style.display = 'none';
        const fallback = event.target.nextElementSibling;
        if (fallback) {
          fallback.style.display = 'inline-flex';
        }
      }
    },
    characterAgeForYear(characterId, yearValue) {
      const id = String(characterId || '').toLowerCase().trim();
      const y = Number(String(yearValue || '').trim());
      if (!id || !Number.isFinite(y)) {
        return null;
      }
      return this.characterAgeAtDate(id, `${Math.trunc(y)}-12-31`, y);
    },
    getResolvedCharacterCore(characterId) {
      const id = String(characterId || '').toLowerCase().trim();
      if (!id) return null;
      let core = this.characterCore?.[id];
      if (!core) return null;

      let visited = new Set([id]);
      while (core?.redirect) {
        const nextId = String(core.redirect).toLowerCase().trim();
        if (visited.has(nextId)) break; // Loop protection
        visited.add(nextId);
        const nextCore = this.characterCore?.[nextId];
        if (!nextCore) break;
        core = nextCore;
      }
      return core;
    },
    getResolvedCharacterId(characterId) {
      const id = String(characterId || '').toLowerCase().trim();
      if (!id) return id;
      let core = this.characterCore?.[id];
      if (!core?.redirect) return id;

      let currentId = id;
      let visited = new Set([id]);
      while (core?.redirect) {
        const nextId = String(core.redirect).toLowerCase().trim();
        if (visited.has(nextId)) break; // Loop protection
        visited.add(nextId);
        currentId = nextId;
        core = this.characterCore?.[nextId];
        if (!core) break;
      }
      return currentId;
    },
    isCharacterEntry(characterId) {
      if (!characterId) return false;
      const resolved = this.getResolvedCharacterId(characterId);
      return Boolean(this.characterCore && this.characterCore[resolved]);
    },
    characterBirthParts(characterId) {
      const core = this.getResolvedCharacterCore(characterId);
      if (!core) return null;
      const birthRaw = this.getCoreBirthRaw(core);
      const parts = this.parseTimelineDateParts(birthRaw || '');
      if (!parts || !Number.isFinite(parts.year)) {
        return null;
      }
      return parts;
    },
    characterDeathParts(characterId) {
      const core = this.getResolvedCharacterCore(characterId);
      if (!core) return null;
      const deathRaw = this.getCoreDeathRaw(core);
      const parts = this.parseTimelineDateParts(deathRaw || '');
      if (!parts || !Number.isFinite(parts.year)) {
        return null;
      }
      return parts;
    },
    characterAgeAtDate(characterId, dateValue, fallbackYear = null) {
      const id = String(characterId || '').toLowerCase().trim();
      if (!id) {
        return null;
      }

      const birthParts = this.characterBirthParts(id);
      if (!birthParts) {
        return null;
      }

      const deathParts = this.characterDeathParts(id);
      const eventParts = this.parseTimelineDateParts(dateValue || '');

      let effectiveEventParts = eventParts;
      let effectiveEventYear = eventParts?.year ?? Number(String(fallbackYear || '').trim());

      if (deathParts && Number.isFinite(deathParts.year)) {
        // If dateValue is missing, we use fallbackYear to build a pseudo-date for comparison
        const compParts = eventParts || { year: effectiveEventYear, month: 12, day: 31 };
        const isDead = this.compareTimelineDateParts(compParts, deathParts) >= 0;
        if (isDead) {
          effectiveEventParts = deathParts;
          effectiveEventYear = deathParts.year;
        }
      }

      if (!Number.isFinite(effectiveEventYear)) {
        return null;
      }

      let age = effectiveEventYear - birthParts.year;
      if (effectiveEventYear > 0 && birthParts.year < 0) {
        age -= 1;
      }
      if (
        effectiveEventParts
        && Number.isFinite(effectiveEventParts.month)
        && Number.isFinite(effectiveEventParts.day)
        && effectiveEventParts.month > 0
        && effectiveEventParts.day > 0
        && Number.isFinite(birthParts.month)
        && Number.isFinite(birthParts.day)
        && birthParts.month > 0
        && birthParts.day > 0
      ) {
        const beforeBirthday = effectiveEventParts.month < birthParts.month
          || (effectiveEventParts.month === birthParts.month && effectiveEventParts.day < birthParts.day);
        if (beforeBirthday) {
          age -= 1;
        }
      }

      return Number.isFinite(age) && age >= 0 ? age : null;
    },
    storyExportEntryById(characterId) {
      const id = String(characterId || '').toLowerCase().trim();
      if (!id) {
        return null;
      }
      const core = this.characterCore?.[id];
      if (!core) return null;
      return {
        id,
        navGroup: core.navGroup || 'Characters',
        title: core['full name'] || core.navLabel || id,
        ...core
      };
    },
    storySetPresetByKey(key) {
      const target = String(key || '').toLowerCase().trim();
      return (STORY_SET_PRESETS || []).find((item) => item.key === target) || STORY_SET_PRESETS[0];
    },
    formatRelationshipHistoryToken(token, eventDate = '') {
      const raw = String(token || '').trim();
      if (!raw) {
        return '';
      }

      if (!/^[+-]/.test(raw)) {
        return raw;
      }

      const sign = raw.charAt(0);
      const body = raw.slice(1).trim();
      const resolvedId = this.resolveRelationshipHistoryMemberToken(body);
      const displayName = resolvedId
        ? (this.relationshipDisplayNameById(resolvedId) || resolvedId)
        : body.replace(/-/g, ' ');
      const age = resolvedId ? this.characterAgeAtDate(resolvedId, eventDate || '', this.activeYear) : null;
      const ageSuffix = age == null ? '' : ` (age ${age})`;

      if (sign === '+') {
        return `${displayName} joins${ageSuffix}`;
      }
      return `${displayName} leaves${ageSuffix}`;
    },
    adaptNarrationToWriter(text, writerName) {
      const source = String(text || '');
      const name = String(writerName || '').trim();
      if (!source || !name) {
        return source;
      }

      let next = source;
      next = next.replace(/\b(I\s*['â€™]m)\b/gi, `${name} is`);
      next = next.replace(/\b(I\s*['â€™]ve)\b/gi, `${name} have`);
      next = next.replace(/\b(I\s*['â€™]d)\b/gi, `${name} would`);
      next = next.replace(/\b(I\s*['â€™]ll)\b/gi, `${name} will`);
      next = next.replace(/\bmine\b/gi, `${name}'s`);
      next = next.replace(/\bmy\b/gi, `${name}'s`);
      next = next.replace(/\bme\b/gi, name);
      next = next.replace(/\bi\b/gi, name);
      return next;
    },
    storyExportCharacterLines(characterId, detailed = false) {
      const id = String(characterId || '').toLowerCase().trim();
      const entry = this.storyExportEntryById(id);
      const core = this.characterCore[id] || {};
      const lines = [];

      lines.push(`Group: ${entry?.navGroup || core.navGroup || core.group || 'Characters'}`);

      const textSnippets = [];

      // Add structured fields from characterCore if they exist
      const preferredKeys = ['full name', 'gender', 'ethnicity', 'hair', 'eyes', 'face', 'appearance', 'build', 'birthday'];
      const excludeKeys = new Set(['icon', 'iconKey', 'color', 'voice', 'voicePitch', 'font', 'redirect', 'navGroup', 'group', 'birthDate', 'deathDate', 'isSpecial']);

      preferredKeys.forEach(k => {
        if (core[k] !== undefined && core[k] !== null && String(core[k]).trim() !== '') {
          // Format label nicely: e.g. "full name" -> "Full Name"
          const label = k.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
          textSnippets.push(`${label}: ${core[k]}`);
        }
      });

      Object.keys(core).forEach(k => {
        if (!preferredKeys.includes(k) && !excludeKeys.has(k) && core[k] !== undefined && core[k] !== null && String(core[k]).trim() !== '') {
          const label = k.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
          textSnippets.push(`${label}: ${core[k]}`);
        }
      });

      // Keep legacy core.rows check in case other stories use it
      if (Array.isArray(core.rows)) {
        core.rows.forEach((row) => {
          const l = this.plainText(row?.label || '');
          const v = this.plainText(row?.value || '');
          if (l && v) textSnippets.push(`${l}: ${v}`);
        });
      }

      const limit = detailed ? 14 : 4;
      textSnippets.slice(0, limit).forEach((line) => lines.push(line));

      return lines;
    },
    storyExportRelatedSameGroupIds(protagonistId, selectedIds) {
      const pid = String(protagonistId || '').toLowerCase().trim();
      const chosen = Array.isArray(selectedIds) ? selectedIds : [];
      if (!pid || !chosen.length) {
        return [];
      }

      const selectedSet = new Set(chosen.map((id) => String(id || '').toLowerCase().trim()).filter(Boolean));
      const protagonistGroup = String(this.storyExportEntryById(pid)?.navGroup || '').trim();
      if (!protagonistGroup) {
        return [];
      }

      const related = new Set();
      const source = Array.isArray(this.relationships) ? this.relationships : [];
      source.forEach((rel) => {
        const relationIds = [
          ...(Array.isArray(rel?.members) ? rel.members : []),
          ...(Array.isArray(rel?.children) ? rel.children : [])
        ]
          .map((id) => String(id || '').toLowerCase().trim())
          .filter(Boolean);

        const historyObj = rel?.history && typeof rel.history === 'object' ? rel.history : {};
        const historyMentionsProtagonist = Object.values(historyObj)
          .some((list) => (Array.isArray(list) ? list : [])
            .some((token) => {
              const raw = String(token || '').trim();
              const normalized = /^[+-]/.test(raw) ? raw.slice(1) : raw;
              return this.resolveRelationshipHistoryMemberToken(normalized) === pid;
            }));

        if (!relationIds.includes(pid) && !historyMentionsProtagonist) {
          return;
        }

        relationIds.forEach((id) => {
          if (id && id !== pid && selectedSet.has(id)) {
            related.add(id);
          }
        });
      });

      return chosen.filter((id) => {
        const normalized = String(id || '').toLowerCase().trim();
        if (!normalized || normalized === pid || !related.has(normalized)) {
          return false;
        }
        const group = String(this.storyExportEntryById(normalized)?.navGroup || '').trim();
        return group === protagonistGroup;
      });
    },
    storyExportRelatedSelectedCharacterIds(protagonistId, selectedIds) {
      const pid = String(protagonistId || '').toLowerCase().trim();
      const chosen = Array.isArray(selectedIds) ? selectedIds : [];
      if (!pid || !chosen.length) {
        return [];
      }

      const selectedSet = new Set(chosen.map((id) => String(id || '').toLowerCase().trim()).filter(Boolean));
      const related = new Set();
      const source = Array.isArray(this.relationships) ? this.relationships : [];

      source.forEach((rel) => {
        const relationIds = [
          ...(Array.isArray(rel?.members) ? rel.members : []),
          ...(Array.isArray(rel?.children) ? rel.children : [])
        ]
          .map((id) => String(id || '').toLowerCase().trim())
          .filter(Boolean);

        const historyObj = rel?.history && typeof rel.history === 'object' ? rel.history : {};
        const historyMentionsProtagonist = Object.values(historyObj)
          .some((list) => (Array.isArray(list) ? list : [])
            .some((token) => {
              const raw = String(token || '').trim();
              const normalized = /^[+-]/.test(raw) ? raw.slice(1) : raw;
              return this.resolveRelationshipHistoryMemberToken(normalized) === pid;
            }));

        if (!relationIds.includes(pid) && !historyMentionsProtagonist) {
          return;
        }

        relationIds.forEach((id) => {
          if (id && id !== pid && selectedSet.has(id)) {
            related.add(id);
          }
        });
      });

      return chosen.filter((id) => {
        const normalized = String(id || '').toLowerCase().trim();
        return normalized && normalized !== pid && related.has(normalized);
      });
    },
    storyExportRelationshipEventsFor(characterId, yearValue) {
      const id = String(characterId || '').toLowerCase().trim();
      const activeYear = Number(String(yearValue || '').trim());
      const allowedRelationIds = new Set(this.storyExportSelectedRelationshipIds || []);
      if (!id) {
        return [];
      }

      const timelineFromNum = Number(String(this.timelineYearFrom || '').trim());
      const timelineToNum = Number(String(this.timelineYearTo || '').trim());
      const hasYearFrom = Number.isFinite(timelineFromNum);
      const hasYearTo = Number.isFinite(timelineToNum);

      const startYear = hasYearFrom ? timelineFromNum : -Infinity;
      const endYear = hasYearTo ? timelineToNum : (Number.isFinite(activeYear) ? activeYear : Infinity);

      const events = [];
      const rows = Array.isArray(this.relationships) ? this.relationships : [];

      rows.forEach((rel) => {
        const relId = String(rel?.id || '').trim();
        if (allowedRelationIds.size && !allowedRelationIds.has(relId)) {
          return;
        }
        const label = String(rel?.label || rel?.id || 'Relationship').trim();
        const memberSet = new Set([
          ...(Array.isArray(rel?.members) ? rel.members : []),
          ...(Array.isArray(rel?.children) ? rel.children : [])
        ].map((item) => String(item || '').toLowerCase().trim()).filter(Boolean));

        const hasMember = memberSet.has(id);
        const historyObj = rel?.history && typeof rel.history === 'object' ? rel.history : {};
        const historyRows = Object.entries(historyObj)
          .map(([date, list]) => ({
            date: String(date || '').trim(),
            year: this.parseTimelineDateParts(date)?.year,
            events: Array.isArray(list) ? list.map((token) => String(token || '').trim()) : []
          }))
          .filter((item) => Number.isFinite(item.year))
          .filter((item) => item.year >= startYear && item.year <= endYear)
          .sort((a, b) => {
            if (a.year !== b.year) {
              return a.year - b.year;
            }
            return a.date.localeCompare(b.date);
          });

        const hasHistoryMention = historyRows.some((item) => item.events.some((token) => this.resolveRelationshipHistoryMemberToken(token) === id));
        if (!hasMember && !hasHistoryMention) {
          return;
        }

        const relationshipNotes = this.plainText(rel?.notes || rel?.['core-note'] || '').trim();
        if (relationshipNotes) {
          const noteYear = this.parseTimelineDateParts(rel.startDate || (historyRows[0]?.date || ''))?.year;
          if (noteYear === null || noteYear === undefined || (noteYear >= startYear && noteYear <= endYear)) {
            events.push({
              date: rel.startDate || (historyRows[0]?.date || ''),
              text: `${label} notes: ${relationshipNotes}`
            });
          }
        }

        const startParts = this.parseTimelineDateParts(rel?.startDate || '');
        if (startParts && startParts.year >= startYear && startParts.year <= endYear) {
          events.push({ date: rel.startDate, text: `${label} begins.` });
        }

        historyRows.forEach((item) => {
          const timelineNotes = item.events
            .map((token) => String(token || '').trim())
            .filter((token) => /^timeline-note\s*:/i.test(token))
            .map((token) => token.replace(/^timeline-note\s*:\s*/i, '').trim())
            .filter(Boolean);

          timelineNotes.forEach((note) => {
            events.push({ date: item.date, text: `${label} timeline-note: ${note}` });
          });

          const historyTokens = item.events
            .map((token) => String(token || '').trim())
            .filter(Boolean)
            .filter((token) => !/^timeline-note\s*:/i.test(token));

          const relevant = hasMember
            ? historyTokens
            : historyTokens.filter((token) => this.resolveRelationshipHistoryMemberToken(token) === id);

          if (!relevant.length) {
            return;
          }
          const humanized = relevant
            .map((token) => this.formatRelationshipHistoryToken(token, item.date))
            .filter(Boolean);
          if (!humanized.length) {
            return;
          }
          events.push({ date: item.date, text: `${label}: ${humanized.join(' | ')}` });
        });

        const splitParts = this.parseTimelineDateParts(rel?.splitDate || '');
        if (splitParts && (!Number.isFinite(activeYear) || splitParts.year <= activeYear)) {
          events.push({ date: rel.splitDate, text: `${label} ends.` });
        }
      });

      return events
        .sort((a, b) => {
          const pa = this.parseTimelineDateParts(a?.date || '');
          const pb = this.parseTimelineDateParts(b?.date || '');
          if (!pa && !pb) return 0;
          if (!pa) return 1;
          if (!pb) return -1;
          if (pa.year !== pb.year) return pa.year - pb.year;
          if (pa.month !== pb.month) return pa.month - pb.month;
          return pa.day - pb.day;
        })
        .slice(0, 28);
    },
    charsheetVoiceDescription() {
      const parts = [];
      const tags = global.MR_CONSTANTS?.STORY_VOICE_TAGS || [];

      const findPhrase = (val) => {
        const found = tags.find(t => t.key === val);
        return found ? found.phrase : val;
      };

      if (this.charsheetPromptTone) parts.push(findPhrase(this.charsheetPromptTone));
      if (this.charsheetPromptPrecision) parts.push(findPhrase(this.charsheetPromptPrecision));
      if (this.charsheetPromptHonesty) parts.push(findPhrase(this.charsheetPromptHonesty));

      return parts.length ? parts.join('; ') : this.storyExportVoiceDescription;
    },
    buildStoryExportText() {
      const year = String(this.storyExportReferenceYear || this.activeYear || '').trim() || 'unknown year';
      const referenceYearNum = Number(year);
      const selectedIds = this.storyExportSelectedCharacterIds;
      if (!selectedIds.length) {
        return '';
      }

      const protagonistId = selectedIds.includes(this.storyExportProtagonistId)
        ? this.storyExportProtagonistId
        : selectedIds[0];
      const protagonistName = this.characterNameById(protagonistId) || protagonistId;
      const writerId = String(this.yearWriterId || '').toLowerCase().trim();
      const writerName = writerId
        ? (this.characterNameById(writerId) || writerId)
        : protagonistName;
      const perspective = String(this.storyExportPerspective || 'first person').trim() || 'first person';
      const preset = this.storySetPresetByKey(this.storyExportSet);
      const setLabel = String(preset?.label || 'Drama');

      // VOICE PROFILE: prioritize charsheet settings if context is active
      const style = this.charsheetGeneratedPrompt
        ? this.charsheetVoiceDescription()
        : this.storyExportVoiceDescription;

      const dynamic = this.storyExportDynamicOptions || {};
      const dynamicDirectives = [];
      if (dynamic.includeEscalation) dynamicDirectives.push('use escalating stakes across scenes');
      if (dynamic.includeTwists) dynamicDirectives.push('add at least one meaningful twist that recontextualizes prior information');
      if (dynamic.includeDialogueMomentum) dynamicDirectives.push('keep dialogue active and consequential');
      if (dynamic.includeVividSetting) dynamicDirectives.push('ground each beat in vivid setting and physical detail');
      if (dynamic.includeMoralDilemmas) dynamicDirectives.push('include morally difficult decisions with tradeoffs');
      if (dynamic.includeCliffhangers) dynamicDirectives.push('end major sequence blocks on mini-cliffhangers');

      const lines = [];
      const activeRanges = [];
      if (Array.isArray(this.timelineYearRanges)) activeRanges.push(...this.timelineYearRanges);
      if ((this.timelineYearFrom !== null && this.timelineYearFrom !== '') || (this.timelineYearTo !== null && this.timelineYearTo !== '')) {
        activeRanges.push({
          from: this.timelineYearFrom,
          to: this.timelineYearTo,
          monthFrom: this.timelineMonthFrom || '',
          monthTo: this.timelineMonthTo || '',
          exclude: this.timelineExcludeYearRange === true
        });
      }
      const rangeStrings = activeRanges.map(r => {
        const fromPart = r.from || 'Start';
        const toPart = r.to || 'End';
        const mFrom = (this.timelineMonthsOpen && r.monthFrom) ? `-${r.monthFrom}` : '';
        const mTo = (this.timelineMonthsOpen && r.monthTo) ? `-${r.monthTo}` : '';
        const prefix = r.exclude ? 'Excluding ' : '';
        return `${prefix}${fromPart}${mFrom} - ${toPart}${mTo}`;
      });
      const yearRange = (this.charsheetGeneratedPrompt || activeRanges.length)
        ? (rangeStrings.length ? rangeStrings.join(', ') : 'All Time')
        : year;
      
      const includeFormat = this.storyExportIncludeStoryFormat !== false;

      if (includeFormat) {
        lines.push('Story Export Instructions (start of document only):');
        lines.push('Begin the story with a YAML frontmatter block and nothing before it:');
        lines.push('---');
        lines.push('id: "creative-slug"');
        lines.push('title: "A Character-Appropriate Notebook Title"');
        lines.push(`subtitle: "by ${writerName}, age ${this.characterAgeForYear(writerId || protagonistId, year) || '??'} - ${yearRange}"`);
        lines.push('metadata: "A quirky or funny instruction (e.g. if found please return to [Name], reward: one plain potato chip)"');
        lines.push(`date: "${year}-MM-DD"`);
        lines.push('---');
        lines.push('');

        lines.push(`Write a long, immersive story with ${protagonistName} as the protagonist, set in ${yearRange}, ${perspective}, ${setLabel.toLowerCase()} story-set.`);
        lines.push('Aim for a slow-burn narrative with deep scene detail, strong emotional reversals, and vivid physical grounding.');
        lines.push(`Narrative voice profile for ${protagonistName}: ${style}.`);
        lines.push('This is the background:');
        if (this.storyExportSelectedVoiceTags.length && !this.charsheetGeneratedPrompt) {
          lines.push(`Selected voice tags: ${this.storyExportSelectedVoiceTags.join(', ')}.`);
        }
        lines.push(`Source document writer voice anchor: ${writerName}.`);
        lines.push(`Dialogue style guidance: ${this.storyExportDialogStyleDescription}`);
        lines.push(`Internal dialogue: ${this.storyExportIncludeInternalDialogue ? 'enabled; include italic-style inner thought moments where character-true.' : 'disabled; keep thoughts externalized through action and spoken lines.'}`);
        lines.push(`Story-set guidance: ${String(preset?.guidance || '').trim()}`);
        if (dynamicDirectives.length) {
          lines.push(`Dynamic directives: ${dynamicDirectives.join('; ')}.`);
        }

        lines.push('');
        lines.push('Formatting Directives (Strict):');
        lines.push('- Use the character IDs provided in brackets strictly for dialogue labels and action actors (e.g. if the character is "naomi", use [naomi] - ... or Naomi: ...). Switch between aliases/IDs as provided to maintain context.');
        lines.push('- Use the format [Actor] - Action for all physical beats, movements, or interactions (e.g. [Ari] - nods slowly or [Clint] - punches [Ari]).');
        lines.push('- Use a ! prefix for all sound effects, music cues, or environmental noises (e.g. !Distant thunder).');
        lines.push('- Use standard dialogue for speech.');
        lines.push('');

        if (this.charsheetGeneratedPrompt) {
          lines.push('---');
          lines.push('### Narrator Voice Profile');
          lines.push('Use the following voice settings for the story narrative:');
          lines.push(`- Narrator/Writer: ${writerName} (${protagonistId})`);
          lines.push(`- Tone: ${this.charsheetPromptTone || 'sincere'}`);
          lines.push(`- Precision: ${this.charsheetPromptPrecision || 'vague'}`);
          lines.push(`- Capitalization Style: ${this.charsheetPromptCaps || 'mixed/erratic'}`);
          lines.push(`- Narrative Honesty: ${this.charsheetPromptHonesty || 'deflects with humor'}`);
          lines.push(`- Formality Level: ${this.charsheetPromptFormality || 'stream of consciousness'}`);
          lines.push('');
          lines.push('### Character Sheet Context');
        } else {
          lines.push('Character Sheet Context:');
        }
      } else {
        lines.push('### Character Sheet Context');
      }

      const relatedSameGroupIds = this.storyExportRelatedSameGroupIds(protagonistId, selectedIds);
      const relatedSelectedIds = this.storyExportRelatedSelectedCharacterIds(protagonistId, selectedIds);
      const emitted = new Set([protagonistId, ...relatedSameGroupIds].map((id) => String(id || '').toLowerCase().trim()));
      const remainingIds = selectedIds.filter((id) => !emitted.has(String(id || '').toLowerCase().trim()));

      if (this.storyExportPreferRelationshipCast && !this.charsheetGeneratedPrompt) {
        const relatedNames = relatedSelectedIds
          .map((id) => this.characterNameById(id) || id)
          .filter(Boolean);
        if (relatedNames.length) {
          lines.push(`Primary cast focus: feature characters who already have established relationships with ${protagonistName} first. Prioritize: ${relatedNames.join(', ')}.`);
        } else {
          lines.push(`Primary cast focus: prioritize characters with established relationships to ${protagonistName} when possible; keep unrelated characters in supporting roles.`);
        }
      }

      const pushCharacterSection = (id, protagonistRole = false) => {
        const name = this.characterNameById(id) || id;
        const age = this.characterAgeForYear(id, year);
        const ageLabel = age == null ? 'Unknown age' : `${age}`;
        lines.push('');
        lines.push(`${protagonistRole ? '* Protagonist' : '* Character'}: ${name} (${id})`);
        lines.push(`Estimated age in ${year}: ${ageLabel}`);

        const detailLines = this.storyExportCharacterLines(id, protagonistRole);
        detailLines.forEach((line) => {
          const adapted = this.adaptNarrationToWriter(line, writerName);
          lines.push(`- ${adapted}`);
        });
      };

      pushCharacterSection(protagonistId, true);
      relatedSameGroupIds.forEach((id) => pushCharacterSection(id, false));

      if (this.storyExportIncludeRelationships && protagonistId) {
        const relEvents = this.storyExportRelationshipEventsFor(protagonistId, year);
        if (relEvents.length) {
          lines.push('');
          lines.push(`### Relationship Events Involving ${this.characterNameById(protagonistId) || protagonistId}`);
          relEvents.forEach((evt) => {
            const adapted = this.adaptNarrationToWriter(evt.text, writerName);
            lines.push(`- ${this.formatTimelineDate(evt.date)}: ${adapted}`);
          });
        }
      }

      if (remainingIds.length) {
        lines.push('');
        lines.push('### Additional Character Sheet Context');
        remainingIds.forEach((id) => pushCharacterSection(id, false));
      }

      // Add Consolidated, Deduplicated Chronological Timeline Context Section
      const relevantTags = new Set(selectedIds.map(id => id.toLowerCase().trim()));
      if (writerId) relevantTags.add(writerId.toLowerCase().trim());

      // If sequential mode is active, include the expanded connected characters
      if (this.timelineSequentialMode) {
        (this.timelineActiveTagsExpanded || []).forEach(tag => {
          if (this.timelineTagType(tag) === 'character') {
            relevantTags.add(tag.toLowerCase().trim());
          }
        });
      }


      const matchedEvents = (this.filteredTimelineEvents || [])
        .map(item => item && (item.event ? item.event : item))
        .filter(ev => {
          if (!ev) return false;
          const evYear = this.parseTimelineDateParts(ev.date)?.year;

          // 1. Reference year ceiling check
          if (evYear !== null && evYear !== undefined && Number.isFinite(evYear)) {
            if (Number.isFinite(referenceYearNum) && evYear > referenceYearNum) {
              return false;
            }
          }

          // 2. Evaluate active ranges (stacked + staging)
          if (activeRanges.length > 0) {
            const inclusionRanges = activeRanges.filter(r => !r.exclude);
            const exclusionRanges = activeRanges.filter(r => r.exclude);

            let inRange = false;
            if (evYear !== null && evYear !== undefined && Number.isFinite(evYear)) {
              let matchesInclusion = true;
              if (inclusionRanges.length > 0) {
                matchesInclusion = inclusionRanges.some(r => {
                  const startYear = (r.from !== null && r.from !== '') ? Number(r.from) : -Infinity;
                  const endYear = (r.to !== null && r.to !== '') ? Number(r.to) : Infinity;
                  return evYear >= startYear && evYear <= endYear;
                });
              }

              let matchesExclusion = true;
              if (exclusionRanges.length > 0) {
                const insideAnyExclusion = exclusionRanges.some(r => {
                  const startYear = (r.from !== null && r.from !== '') ? Number(r.from) : -Infinity;
                  const endYear = (r.to !== null && r.to !== '') ? Number(r.to) : Infinity;
                  return evYear >= startYear && evYear <= endYear;
                });
                if (insideAnyExclusion) {
                  matchesExclusion = false;
                }
              }

              inRange = matchesInclusion && matchesExclusion;
            } else {
              inRange = (inclusionRanges.length === 0);
            }

            if (!inRange) {
              return false;
            }
          } else {
            if (evYear === null && Number.isFinite(referenceYearNum)) {
              return false;
            }
          }

          const tagsArr = Array.isArray(ev.tags) ? ev.tags : (ev.tags ? [ev.tags] : []);
          let matchesAnySelected = tagsArr.some(t => relevantTags.has(String(t || '').toLowerCase().trim()));
          
          if (!matchesAnySelected) {
            const titleText = String(ev.title || '').toLowerCase();
            const descText = String(ev.description || '').toLowerCase();
            matchesAnySelected = selectedIds.some(id => {
              const pId = id.toLowerCase();
              const pName = String(this.characterNameById(id) || id).toLowerCase().trim();
              return titleText.includes(pId) || descText.includes(pId) || (pName && (titleText.includes(pName) || descText.includes(pName)));
            });
          }
          return matchesAnySelected;
        });

      if (matchedEvents.length) {
        lines.push('');
        lines.push('### Relevant Timeline History');
        lines.push('Use these events to keep the story consistent with chronology and character history:');

        const seenEvents = new Set();
        const uniqueEvents = [];
        matchedEvents.forEach(ev => {
          const key = `${ev.date || ''}|${ev.title || ''}`;
          if (!seenEvents.has(key)) {
            seenEvents.add(key);
            uniqueEvents.push(ev);
          }
        });

        // Sort all unique events chronologically without any truncation limit
        uniqueEvents.sort((a, b) => {
          const aParts = this.parseTimelineDateParts(a.date);
          const bParts = this.parseTimelineDateParts(b.date);
          if (aParts && bParts) {
            return aParts.year - bParts.year || aParts.month - bParts.month || aParts.day - bParts.day;
          }
          return String(a.date).localeCompare(String(b.date));
        });

        const finalEvents = uniqueEvents;

        finalEvents.forEach(ev => {
          const date = this.plainText(ev.date || 'Unknown Date');
          const title = this.plainText(ev.title || 'Untitled Event');
          const desc = String(ev.description || '').trim();
          const tagsArr = Array.isArray(ev.tags) ? ev.tags : (ev.tags ? [ev.tags] : []);
          const tags = tagsArr.join(', ');

          lines.push(`- **${date}**: **${title}**`);
          if (desc) {
            // Indent description lines for clean Markdown nesting
            const indentedDesc = desc.split('\n').map(line => `  ${line}`).join('\n');
            lines.push(indentedDesc);
          }
          if (tags) {
            lines.push(`  *Tags: ${tags}*`);
          }
          lines.push('');
        });
      }

      const extra = String(this.storyExportExtraInstructions || '').trim();
      if (extra) {
        lines.push('');
        lines.push('### Extra Instructions');
        lines.push(extra);
      }

      return lines.join('\n');
    },
    async copyStoryPromptToClipboard() {
      const text = this.buildStoryExportText();
      if (!text) {
        this.storyExportError = 'Select at least one character to generate a prompt.';
        return;
      }
      try {
        await navigator.clipboard.writeText(text);
        this.storyExportError = 'Prompt copied to clipboard!';
        setTimeout(() => { if (this.storyExportError === 'Prompt copied to clipboard!') this.storyExportError = ''; }, 3000);
      } catch (err) {
        this.storyExportError = 'Failed to copy to clipboard.';
      }
    },
    exportStoryMd() {
      this.initializeStoryExportSelection(false);
      const text = this.buildStoryExportText();
      if (!text) {
        this.storyExportError = 'Select at least one character to export.';
        return;
      }

      const year = String(this.activeYear || 'year').trim() || 'year';
      const pid = String(this.storyExportProtagonistId || this.storyExportSelectedCharacterIds[0] || 'story')
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-');
      const filename = `story_export_${year}_${pid}.md`;

      const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      this.storyExportError = '';
    },
    buildTimelineExportPayload() {
      const filtered = Array.isArray(this.filteredTimelineEvents) ? this.filteredTimelineEvents : [];
      const grouped = {};
      filtered.forEach((ev) => {
        const date = String(ev?.date || '');
        const title = this.plainText(ev?.title || '');
        const desc = this.plainText(ev?.description || '');
        if (!date) return;
        if (!grouped[date]) grouped[date] = [];

        // Include title in the entry for both JSON and MD
        const entry = title ? `[${title}] ${desc}` : desc;
        if (entry.trim()) grouped[date].push(entry.trim());
      });
      return grouped;
    },
    async copyTimelineMdToClipboard() {
      const events = Array.isArray(this.filteredTimelineEvents) ? this.filteredTimelineEvents : [];
      if (!events.length) {
        alert('No timeline events to export.');
        return;
      }
      if (typeof jsyaml === 'undefined') {
        alert('YAML parser not loaded.');
        return;
      }

      let md = '';
      events.forEach((ev, idx) => {
        const meta = {};
        Object.keys(ev).forEach(k => {
          const isRuntimeProp = k.startsWith('__') || k.startsWith('_') || 
            k === 'description' || k === 'plainTitle' || k === 'plainDescription' || 
            k === 'key' || k === 'index';
          if (!isRuntimeProp && ev[k] !== undefined && ev[k] !== null) {
            meta[k] = ev[k];
          }
        });

        // Ensure key fields are ordered cleanly at the top of YAML frontmatter
        const orderedMeta = {};
        if (meta.id) orderedMeta.id = meta.id;
        if (meta.parent) orderedMeta.parent = meta.parent;
        if (meta.date) orderedMeta.date = meta.date;
        if (meta.title) orderedMeta.title = meta.title;
        if (meta.tags) orderedMeta.tags = meta.tags;

        Object.keys(meta).forEach(k => {
          if (!Object.prototype.hasOwnProperty.call(orderedMeta, k)) {
            orderedMeta[k] = meta[k];
          }
        });

        const yamlStr = jsyaml.dump(orderedMeta);
        const entryMd = `---\n${yamlStr}---\n\n${(ev.description || '').trim()}\n`;

        if (idx < events.length - 1) {
          md += entryMd + '\n<!-- entry-break -->\n\n';
        } else {
          md += entryMd;
        }
      });

      try {
        await navigator.clipboard.writeText(md);
        this.timelineBatchNotice = `Copied ${events.length} timeline entries to clipboard in Markdown format!`;
        this.timelineBatchNoticeTone = 'success';
        setTimeout(() => {
          if (this.timelineBatchNotice === `Copied ${events.length} timeline entries to clipboard in Markdown format!`) {
            this.timelineBatchNotice = '';
          }
        }, 3200);
      } catch (err) {
        console.error('Copy failed', err);
        alert('Failed to copy timeline to clipboard.');
      }
    },
    scrollToTop() {
      const mainPane = this.$refs?.mainPane;
      if (mainPane) {
        mainPane.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        const pane = document.querySelector('.mr-main');
        if (pane) {
          pane.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    exportTimelineMd() {
      const payload = this.buildTimelineExportPayload();
      const dates = Object.keys(payload).sort();
      if (!dates.length) return;

      let md = `# Timeline Export - ${this.activeYear || 'Unknown Year'}\n\n`;
      dates.forEach((date) => {
        md += `## ${date}\n`;
        payload[date].forEach((entry) => {
          md += `- ${entry}\n`;
        });
        md += `\n`;
      });

      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const year = String(this.activeYear || 'year').trim() || 'year';
      const activeCharTags = (this.timelineActiveTags || [])
        .map(t => this.plainText(t).trim().toLowerCase())
        .filter(t => this.timelineTagType(t) === 'character');
      const charSuffix = activeCharTags.length ? `_${activeCharTags.join('_')}` : '';
      const filename = `timeline_export_${year}${charSuffix}_${stamp}.md`;
      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
    exportTimelineCompactAi() {
      const events = Array.isArray(this.timelineEvents) ? this.timelineEvents : [];
      if (!events.length) {
        alert('No timeline events to export.');
        return;
      }

      const TAG_ABBREVIATIONS = {
        "history": "h",
        "key-event": "!",
        "pangea": "pg",
        "pre-flood": "pf",
        "order": "o",
        "roboter": "r",
        "fairmount": "f",
        "eden": "e",
        "watchers": "w",
        "nephilim": "nph",
        "long-war": "lw",
        "management-operation": "mo",
        "character": "c",
        "location": "l"
      };

      const compactTags = (tags) => {
        if (!Array.isArray(tags)) return [];
        return tags.map(t => TAG_ABBREVIATIONS[t] || t);
      };

      const stripRedundant = (text) => {
        if (!text) return "";
        return text
          .replace(/Addendum to .*?:/gi, '')
          .replace(/\b(the|a|an)\b /gi, '')
          .replace(/\s+/g, ' ')
          .trim();
      };

      // Filter and sort all events by date
      const sortedEvents = [...events].sort((a, b) => {
        const dA = String(a.date || '0000-00-00');
        const dB = String(b.date || '0000-00-00');
        if (dA !== dB) return dA.localeCompare(dB);
        return (a.id || '').localeCompare(b.id || '');
      });

      const lines = sortedEvents.map(e => {
        const date = e.date || "0000-00-00";
        const id = e.id || "";
        const title = this.plainText(e.title || "");
        const tags = compactTags(e.tags);
        const meta = [id, title, ...tags].filter(Boolean).join('|');
        const body = stripRedundant(this.plainText(e.description || ""));
        return `${date}[${meta}] ${body}`;
      });

      const text = lines.join('\n');
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const activeCharTags = (this.timelineActiveTags || [])
        .map(t => this.plainText(t).trim().toLowerCase())
        .filter(t => this.timelineTagType(t) === 'character');
      const charSuffix = activeCharTags.length ? `_${activeCharTags.join('_')}` : '';
      const filename = `timeline_ai_compact${charSuffix}_${stamp}.txt`;
      
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
    exportYearMd() {
      const year = String(this.activeYear || 'year').trim() || 'year';
      const groups = Array.isArray(this.groupedEntries) ? this.groupedEntries : [];
      if (!groups.length) return;

      let md = '';

      groups.forEach((group) => {
        // Skip Preamble group
        if (String(group.name || '').toLowerCase() === 'preamble') return;

        const entries = Array.isArray(group.entries) ? group.entries : [];
        entries.forEach((entry) => {
          const entryId = String(entry.id || '').toLowerCase();
          // Skip administrative/system IDs
          if (entryId === 'preamble' || entryId === 'timeline' || entryId === 'notebook-archive' || entryId === 'relationship-tree' || entryId === 'progress') {
            return;
          }

          // If we have the raw source, use it directly as it's the most accurate
          if (entry.raw) {
            md += entry.raw.trim() + '\n\n<!-- entry-break -->\n\n';
            return;
          }

          // Fallback: Reconstruct the entry source format (Frontmatter + Blocks)
          // 1. Frontmatter
          md += '---\n';
          const metaFields = ['id', 'order', 'navGroup', 'navLabel', 'eyebrow', 'title', 'authorNote', 'author', 'group', 'icon'];
          metaFields.forEach((key) => {
            const val = entry[key];
            if (val !== undefined && val !== null) {
              md += `${key}: ${JSON.stringify(val)}\n`;
            }
          });
          md += '---\n\n';

          // 2. Blocks
          const blocks = Array.isArray(entry.blocks) ? entry.blocks : [];
          blocks.forEach((block) => {
            const bType = block.type || block.kind || 'text';
            const bMeta = { ...block };
            // Remove properties used internally or for content storage
            delete bMeta.type;
            delete bMeta.kind;
            delete bMeta.body;
            delete bMeta.note;
            delete bMeta.rows;
            delete bMeta.members;

            md += `<!-- block: ${bType} ${JSON.stringify(bMeta)} -->\n`;

            if (bType === 'table') {
              (block.rows || []).forEach((row) => {
                md += `## ${row.label}\n`;
                md += (row.value || '').replace(/<BR\s*\/?>/gi, '\n') + '\n\n';
              });
            } else if (bType === 'faction' || bType === 'list') {
              if (block.body) md += block.body + '\n\n';
              (block.members || []).forEach((m) => {
                md += `- ${m.text}`;
                if (m.tier) md += ` <!-- tier: ${m.tier} -->`;
                md += '\n';
              });
              md += '\n';
            } else {
              // Note: block.body in the app might be parsed HTML; 
              // for best results use the raw markdown if available.
              md += (block.body || block.note || '') + '\n\n';
            }
          });

          md += '\n<!-- entry-break -->\n\n';
        });
      });

      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `year_export_${year}_${stamp}.md`;
      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
    notebookDisplayName(nb) {
      const isJess = CANONICAL_JESS_IDS && CANONICAL_JESS_IDS.has(nb?.id);
      const number = Number(nb?.number || 0);
      if (isJess && Number.isFinite(number) && number > 0 && number < 999) {
        return `Notebook ${number}`;
      }
      return this.plainText(nb?.title || nb?.id || 'Notebook');
    },
    notebookShortLabel(nb) {
      const isJess = CANONICAL_JESS_IDS && CANONICAL_JESS_IDS.has(nb?.id);
      const number = Number(nb?.number || 0);
      if (isJess && Number.isFinite(number) && number > 0 && number < 999) {
        return String(number);
      }
      
      const id = String(nb?.id || '').toLowerCase().trim();
      
      // Explicit distinct labels for the canonical "other" books:
      if (id === 'jester-notebook-24-supplement') return 'TLA';
      if (id === 'notebook-three-music-room') return 'MRI';
      if (id === 'the_liz_dare') return 'TLD';
      if (id === 'genzfriend-limbo-log') return 'LL';
      if (id === 'creative-slug') return 'CS';
      if (id === 'elena-solano-revelation') return 'ESR';
      if (id === 'elena-clint-leash') return 'ECL';
      if (id === 'mall-ratgirlz-hillary') return 'MRH';
      if (id === 'mall-ratgirlz-karen-clint') return 'MRK';
      if (id === 'mall-ratgirlz-phoenix') return 'MRP';
      if (id === 'mall-ratgirlz-the-drive') return 'MRD';

      // Fallback: Strip common prefix words and take initials
      let title = this.plainText(nb?.title || '').trim();
      title = title.replace(/^notebook\s+\d+:\s*/i, ''); // Strip "Notebook 19:"
      title = title.replace(/^notebook\s+three:\s*/i, '');
      title = title.replace(/^the\s+/i, ''); // Strip leading "The "
      title = title.replace(/_/g, ' '); // Support underscore separation

      const words = title.split(/[^a-z0-9]+/i).filter(Boolean);
      if (words.length >= 2) {
        const candidate = words.map(w => w[0]).join('').toUpperCase().substring(0, 3);
        if (candidate.length >= 2) return candidate;
      }

      // ID initials fallback
      const idParts = id.split(/[^a-z0-9]+/i).filter(Boolean);
      if (idParts.length >= 2) {
        return idParts.map(p => p[0]).join('').toUpperCase().substring(0, 3);
      }

      return String(nb?.id || 'NB').toUpperCase().substring(0, 3);
    },
    isCanonicalNotebook(nb) {
      return !!(nb && CANONICAL_JESS_IDS && CANONICAL_JESS_IDS.has(nb.id));
    },
    async deleteActiveNotebook() {
      const nb = this.activeNotebook;
      if (!nb) return;
      if (this.isCanonicalNotebook(nb)) {
        alert("Canonical story notebooks cannot be deleted.");
        return;
      }
      
      const displayName = this.plainText(nb.title || nb.id || 'Notebook');
      if (!confirm(`Are you sure you want to permanently delete the notebook "${displayName}"?\nThis will erase the physical Markdown file and remove it from the archive.`)) {
        return;
      }
      
      try {
        const response = await fetch(this.apiUrl('/api/notebooks/delete'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: nb.id })
        });
        
        const payload = await response.json().catch(() => null);
        if (!response.ok || payload?.ok === false) {
          throw new Error(String(payload?.error || `notebook-delete-${response.status}`));
        }
        
        await this.loadNotebooks();
        
        // Pick the first available notebook as active
        if (Array.isArray(this.notebooks) && this.notebooks.length) {
          this.activeNotebookId = String(this.notebooks[0]?.id || '');
        } else {
          this.activeNotebookId = '';
        }
        
        alert("Notebook deleted successfully.");
      } catch (error) {
        console.error("Error deleting notebook:", error);
        alert(`Failed to delete notebook: ${error.message}`);
      }
    },
    selectTimelineNotebook(id) {
      this.activeNotebookId = String(id || '');
    },
    toggleNotebookRules() {
      this.notebookRulesEnabled = !this.notebookRulesEnabled;
    },
    notebookBlockKey(notebookId, entry, entryIndex = 0, blockIndex = 0) {
      return `${this.notebookEntryKey(notebookId, entry, entryIndex)}::block:${Number(blockIndex || 0)}`;
    },
    registerNotebookBlockRef(el, notebookId, entry, entryIndex = 0, blockIndex = 0) {
      if (!this._notebookBlockRefs) {
        this._notebookBlockRefs = {};
      }
      const key = this.notebookBlockKey(notebookId, entry, entryIndex, blockIndex);
      if (!el) {
        delete this._notebookBlockRefs[key];
        return;
      }
      this._notebookBlockRefs[key] = el;
    },
    timelineNotebookLinkForEvent(event, eventIndex = 0) {
      const links = Array.isArray(this.notebookTimelineLinks) ? this.notebookTimelineLinks : [];
      if (!links.length || !event) {
        return null;
      }

      const sourceIndex = Number(event?.__sourceIndex);
      if (Number.isFinite(sourceIndex)) {
        const bySourceIndex = links.find((item) => Number(item?.timelineIndex) === sourceIndex);
        if (bySourceIndex) {
          return bySourceIndex;
        }
      }

      const title = this.normalize(this.plainText(event?.title || ''));
      const date = String(event?.date || '').trim();
      const byTitleAndDate = links.find((item) => {
        const sameDate = String(item?.timelineDate || '').trim() === date;
        const sameTitle = this.normalize(this.plainText(item?.timelineTitle || '')) === title;
        return sameDate && sameTitle;
      }) || null;
      if (byTitleAndDate) {
        return byTitleAndDate;
      }

      // Fallback for reordered/retimed timeline data where stored index/date no longer matches.
      return links.find((item) => this.normalize(this.plainText(item?.timelineTitle || '')) === title) || null;
    },
    timelineNotebookLinkTitle(event, eventIndex = 0) {
      const link = this.timelineNotebookLinkForEvent(event, eventIndex);
      if (!link) {
        return 'Open linked notebook entry';
      }
      const number = Number(link.notebookNumber || 0);
      const notebookLabel = Number.isFinite(number) && number > 0 ? `Notebook ${number}` : String(link.notebookId || 'Notebook');
      const title = this.plainText(link.entryTitle || '').trim();
      return title
        ? `Open ${notebookLabel}: ${title}`
        : `Open ${notebookLabel} linked entry`;
    },
    notebookEntryByLink(link) {
      if (!link || !link.notebookId || !link.entryId) {
        return null;
      }
      const notebook = (Array.isArray(this.notebooks) ? this.notebooks : [])
        .find((nb) => String(nb?.id || '') === String(link.notebookId));
      if (!notebook) {
        return null;
      }
      const entries = Array.isArray(notebook?.entries) ? notebook.entries : [];
      const entryIndex = entries.findIndex((entry) => String(entry?.id || '') === String(link.entryId));
      if (entryIndex < 0) {
        return null;
      }
      return {
        notebook,
        entry: entries[entryIndex],
        entryIndex
      };
    },
    bestNotebookParagraphIndex(entry, event) {
      const blocks = Array.isArray(entry?.blocks) ? entry.blocks : [];
      if (!blocks.length) {
        return 0;
      }

      const stopwords = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'then', 'than', 'have', 'has', 'had', 'are', 'was', 'were', 'will', 'would', 'could', 'should', 'about', 'after', 'before', 'during', 'they', 'them', 'their', 'there', 'here', 'your', 'you', 'our', 'out', 'over', 'under', 'again', 'what', 'when', 'where', 'which', 'while', 'just', 'still', 'very', 'also', 'only', 'more', 'most', 'some', 'same', 'real', 'really', 'thing', 'things']);

      const tokenSet = new Set(
        [this.plainText(event?.title || ''), this.plainText(event?.description || '')]
          .join(' ')
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .map((t) => t.trim())
          .filter((t) => t.length >= 3)
          .filter((t) => !stopwords.has(t))
      );

      if (!tokenSet.size) {
        return 0;
      }

      let bestIndex = 0;
      let bestScore = -1;

      blocks.forEach((block, idx) => {
        const textParts = [];
        if (block && typeof block === 'object') {
          textParts.push(this.plainText(block?.content || ''));
          const rows = Array.isArray(block?.rows) ? block.rows : [];
          rows.forEach((row) => {
            textParts.push(this.plainText(`${String(row?.spk || '')} ${String(row?.text || '')}`));
          });
        }
        const hay = textParts.join(' ').toLowerCase();
        const score = Array.from(tokenSet).reduce((acc, token) => (hay.includes(token) ? acc + 1 : acc), 0);
        if (score > bestScore) {
          bestScore = score;
          bestIndex = idx;
        }
      });

      return bestIndex;
    },
    async jumpToTimelineNotebookLink(event, eventIndex = 0) {
      const link = this.timelineNotebookLinkForEvent(event, eventIndex);
      if (!link) {
        return;
      }

      if (!Array.isArray(this.notebooks) || !this.notebooks.length) {
        await this.loadNotebooks();
      }

      const resolved = this.notebookEntryByLink(link);
      if (!resolved) {
        return;
      }

      const notebookArchiveEntry = this.entries.find((entry) => String(entry?.id || '').toLowerCase() === 'notebook-archive');
      if (notebookArchiveEntry?.id) {
        this.selectEntry(notebookArchiveEntry.id);
      }

      this.activeNotebookId = String(link.notebookId || '');

      const entryKey = this.notebookEntryKey(resolved.notebook.id, resolved.entry, resolved.entryIndex);
      const blockIndex = this.bestNotebookParagraphIndex(resolved.entry, event);
      const blockKey = this.notebookBlockKey(resolved.notebook.id, resolved.entry, resolved.entryIndex, blockIndex);

      this.notebookSearchActiveEntryKey = entryKey;
      this.notebookParagraphTargetKey = blockKey;

      const scrollRefWithRetry = (getElement, options = {}, maxAttempts = 12, delayMs = 90) => new Promise((resolve) => {
        let attempts = 0;
        const tryScroll = () => {
          attempts += 1;
          const el = getElement();
          if (el && typeof el.scrollIntoView === 'function') {
            el.scrollIntoView(options);
            resolve(true);
            return;
          }
          if (attempts >= maxAttempts) {
            resolve(false);
            return;
          }
          setTimeout(tryScroll, delayMs);
        };
        tryScroll();
      });

      await this.$nextTick();
      await scrollRefWithRetry(
        () => this._notebookEntryRefs?.[entryKey],
        { behavior: 'smooth', block: 'center', inline: 'nearest' }
      );
      await scrollRefWithRetry(
        () => this._notebookBlockRefs?.[blockKey],
        { behavior: 'smooth', block: 'center', inline: 'nearest' }
      );

      // Sync reader if active
      if (this.pageReaderUiVisible) {
        this.syncPageReaderToElement(this._notebookBlockRefs?.[blockKey]);
      }

      clearTimeout(this._notebookSearchTargetTimer);
      this._notebookSearchTargetTimer = setTimeout(() => {
        if (this.notebookSearchActiveEntryKey === entryKey) {
          this.notebookSearchActiveEntryKey = '';
        }
      }, 3200);

      clearTimeout(this._notebookParagraphTargetTimer);
      this._notebookParagraphTargetTimer = setTimeout(() => {
        if (this.notebookParagraphTargetKey === blockKey) {
          this.notebookParagraphTargetKey = '';
        }
      }, 3600);
    },
    notebookEntryKey(notebookId, entry, entryIndex = 0) {
      const nbId = String(notebookId || '').trim();
      const rawId = String(entry?.id || '').trim();
      if (rawId) {
        return `${nbId}::${rawId}`;
      }
      return `${nbId}::index:${Number(entryIndex || 0)}`;
    },
    notebookEntrySearchText(entry) {
      const blocks = Array.isArray(entry?.blocks) ? entry.blocks : [];
      const pieces = [];
      blocks.forEach((block) => {
        if (!block || typeof block !== 'object') {
          return;
        }
        const content = String(block.content || '').trim();
        if (content) {
          pieces.push(this.plainText(content));
        }
        const rows = Array.isArray(block.rows) ? block.rows : [];
        rows.forEach((row) => {
          if (!row || typeof row !== 'object') {
            return;
          }
          const text = `${String(row.spk || '')} ${String(row.text || '')}`.trim();
          if (text) {
            pieces.push(this.plainText(text));
          }
        });
      });
      return pieces.join(' ').trim();
    },
    escapeHtml(value) {
      return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    },
    escapeRegExp(value) {
      return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    },
    highlightNotebookText(value, searchTerm = '') {
      const raw = String(value || '');
      const q = String(searchTerm || '').trim();
      if (!q) {
        return raw;
      }
      // Avoid injecting <mark> into HTML tags, which can corrupt rich notebook markup.
      if (/[<>]/.test(raw)) {
        return raw;
      }
      const re = new RegExp(this.escapeRegExp(q), 'ig');
      return raw.replace(re, (match) => `<mark class="mr-note-hit">${match}</mark>`);
    },
    notebookTitleHtml(entry) {
      return this.highlightNotebookText(String(entry?.title || ''), this.notebookSearchQuery);
    },
    notebookDateHtml(entry) {
      return this.highlightNotebookText(this.plainText(entry?.date || ''), this.notebookSearchQuery);
    },
    notebookSearchSnippet(sourceText, searchTerm = '') {
      const text = this.plainText(sourceText || '');
      const q = String(searchTerm || '').trim();
      if (!text) {
        return '';
      }
      if (!q) {
        return text.slice(0, 180);
      }
      const lower = text.toLowerCase();
      const qLower = q.toLowerCase();
      const idx = lower.indexOf(qLower);
      if (idx < 0) {
        return text.slice(0, 180);
      }
      const start = Math.max(0, idx - 60);
      const end = Math.min(text.length, idx + q.length + 80);
      const prefix = start > 0 ? '... ' : '';
      const suffix = end < text.length ? ' ...' : '';
      return `${prefix}${text.slice(start, end)}${suffix}`;
    },
    notebookSnippetHtml(snippet) {
      return this.highlightNotebookText(this.escapeHtml(snippet || ''), this.notebookSearchQuery);
    },
    registerNotebookEntryRef(el, notebookId, entry, entryIndex = 0) {
      if (!this._notebookEntryRefs) {
        this._notebookEntryRefs = {};
      }
      const key = this.notebookEntryKey(notebookId, entry, entryIndex);
      if (!el) {
        delete this._notebookEntryRefs[key];
        return;
      }
      this._notebookEntryRefs[key] = el;
    },
    jumpToNotebookSearchResult(result) {
      if (!result || !result.notebookId || !result.entryKey) {
        return;
      }

      this.activeNotebookId = String(result.notebookId);
      this.notebookSearchActiveEntryKey = String(result.entryKey);

      this.$nextTick(() => {
        const el = this._notebookEntryRefs?.[String(result.entryKey)];
        if (el && typeof el.scrollIntoView === 'function') {
          el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        }
      });

      clearTimeout(this._notebookSearchTargetTimer);
      this._notebookSearchTargetTimer = setTimeout(() => {
        if (this.notebookSearchActiveEntryKey === String(result.entryKey)) {
          this.notebookSearchActiveEntryKey = '';
        }
      }, 2600);
    },
    renderNotebookBlock(block, entry) {
      const type = String(block?.type || 'p').toLowerCase();
      const speaker = String(block?.speaker || '').trim();
      const speakerAttr = speaker ? ` data-speaker="${speaker.replace(/"/g, '&quot;')}"` : '';
      let content = this.highlightNotebookText(String(block?.content || ''), this.notebookSearchQuery);

      // Render inline notebook image placeholders (<span class="img">path</span>) as <img> tags.
      try {
        content = String(content).replace(/<span\s+class=(?:"|')img(?:"|')>([^<]+)<\/span>/gi, (m, p1) => {
          const rawPath = String(p1 || '').trim().replace(/\\\\/g, '/').replace(/\\/g, '/');
          const src = (typeof toSecureMediaUrl === 'function') ? toSecureMediaUrl(rawPath) : rawPath;
          return `<img class="mr-notebook-img" src="${String(src || '').replace(/"/g, '&quot;')}" alt="notebook image" loading="lazy" />`;
        });
      } catch (e) { /* ignore */ }

      if (type === 'sticky') return `<div class="sticky"${speakerAttr}>${content}</div>`;
      if (type === 'drawing') return `<div class="drawing">${content}</div>`;
      if (type === 'obs-box') {
        const label = block?.label ? `<span class="obs-label">${String(block.label)}</span>` : '';
        return `<div class="obs-box"${speakerAttr}>${label}${content}</div>`;
      }
      if (type === 'rant-box') {
        const label = block?.label ? `<div class="rant-label">${String(block.label)}</div>` : '';
        return `<div class="rant-box"${speakerAttr}>${label}<p>${content}</p></div>`;
      }
      if (type === 'margin-note') return `<span class="margin-note"${speakerAttr}>${content}</span>`;

      if (type === 'dialogue') {
        const rows = Array.isArray(block?.rows) ? block.rows : [];
        const notebookYear = this.extractYear(this.activeNotebook?.date);
        const entryYear = this.extractYear(entry?.date);
        // Priority: Entry Date > Notebook Date > Global Active Year
        const year = entryYear || notebookYear || this.activeYear;
        const html = rows
          .map((row) => {
            const rSpk = String(row?.spk || '').trim();
            const rText = String(row?.text || '');
            return this.renderDialogueBubble(rSpk, rText, year);
          })
          .join('');
        return `<div class="dialogue">${html}</div>`;
      }

      if (type === 'lina-raid') return `<div class="obs-box" data-speaker="lina">${content}</div>`;

      // Default (p/text): detect dialogue lines
      const lines = content.split(/\n/);
      const renderedLines = lines.map(line => {
        const trimmed = line.trim();
        if (!trimmed) return '';

        // Detect Sound (!)
        if (trimmed.startsWith('!')) {
          const text = trimmed.slice(1).trim();
          const speakerIcon = this.featherSvg('speaker', 'mr-bubble-sound-icon');
          return `
            <div class="mr-bubble-sound">
              <span class="mr-sfx-trigger-icon" title="Play sound">${speakerIcon}</span>
              <span class="mr-sfx-content">${this.highlightNotebookText(text, this.notebookSearchQuery)}</span>
            </div>
          `;
        }

        // Detect Scene Divider (***)
        if (trimmed === '***') {
          return `<div class="mr-notebook-divider"></div>`;
        }

        // Detect Action ([Actor] - or *)
        const actionMatch = trimmed.match(/^\[([^\]]+)\]\s*-\s*(.*)$/);
        if (actionMatch) {
          const actor = actionMatch[1].trim();
          const actionText = actionMatch[2].trim();
          const charId = this.resolveCharacterIdByName(actor);
          const notebookYear = this.extractYear(this.activeNotebook?.date);
          const entryYear = this.extractYear(entry?.date);
          const year = entryYear || notebookYear || this.activeYear;
          const portraitSrc = charId ? this.getSyncPortraitSrc(charId, year) : '';
          const secureSrc = (portraitSrc && typeof toSecureMediaUrl === 'function') ? toSecureMediaUrl(portraitSrc) : portraitSrc;

          const iconHtml = secureSrc
            ? `<img src="${secureSrc}" class="mr-action-portrait" alt="${actor}" loading="lazy" />`
            : `<div class="mr-action-portrait is-placeholder"><span>${actor[0].toUpperCase()}</span></div>`;

          // Scan for target character mention
          const targetId = this.findMentionedCharacterId(actionText, charId);
          let targetIconHtml = '';
          if (targetId) {
            const tPortrait = this.getSyncPortraitSrc(targetId, year);
            const tSecure = (tPortrait && typeof toSecureMediaUrl === 'function') ? toSecureMediaUrl(tPortrait) : tPortrait;
            targetIconHtml = tSecure
              ? `<img src="${tSecure}" class="mr-action-portrait is-target" alt="${targetId}" loading="lazy" />`
              : `<div class="mr-action-portrait is-target is-placeholder"><span>${targetId[0].toUpperCase()}</span></div>`;
          }

          return `
            <div class="mr-bubble-action has-portrait ${targetId ? 'has-target' : ''}" data-speaker="${charId}" data-actor="${actor}">
              ${iconHtml}
              <span class="mr-action-content">${this.highlightNotebookText(actionText, this.notebookSearchQuery)}</span>
              ${targetIconHtml}
            </div>
          `;
        }
        if (trimmed.startsWith('*')) {
          const text = trimmed.slice(1).trim();
          return `<div class="mr-bubble-action">${this.highlightNotebookText(text, this.notebookSearchQuery)}</div>`;
        }

        const diag = this.parseDialogueLine(trimmed);
        if (diag) {
          const notebookYear = this.extractYear(this.activeNotebook?.date);
          const entryYear = this.extractYear(entry?.date);
          // Priority: Entry Date > Notebook Date > Global Active Year
          const year = entryYear || notebookYear || this.activeYear;
          return this.renderDialogueBubble(diag.speaker, diag.dialogue, year);
        }
        return `<p${speakerAttr}>${line}</p>`;
      }).filter(Boolean);

      return renderedLines.join('');
    },
    renderDialogueBubble(speaker, text, year) {
      const charId = this.resolveCharacterIdByName(speaker);
      const portraitSrc = charId ? this.getSyncPortraitSrc(charId, year) : '';
      const secureSrc = (portraitSrc && typeof toSecureMediaUrl === 'function') ? toSecureMediaUrl(portraitSrc) : portraitSrc;

      const icon = secureSrc
        ? `<img src="${secureSrc}" class="mr-bubble-icon" alt="${speaker}" loading="lazy" />`
        : `<div class="mr-bubble-icon is-placeholder"><span>${speaker[0].toUpperCase()}</span></div>`;

      const highlightedText = this.highlightNotebookText(text, this.notebookSearchQuery);

      const resolvedId = this.getResolvedCharacterId(charId);
      const charData = resolvedId ? (this.characterCore?.[resolvedId] || {}) : {};
      const customFont = charData.font || '';
      const bubbleStyle = customFont ? ` style="font-family: ${customFont};"` : '';

      return `
        <div class="mr-dialogue-bubble" data-speaker="${charId || speaker}">
          <div class="mr-bubble-aside">
            ${icon}
            <span class="mr-bubble-name ${charId ? 'is-known' : ''}">${speaker}</span>
          </div>
          <div class="mr-bubble-main"${bubbleStyle}>
            <div class="mr-bubble-text">${highlightedText}</div>
          </div>
        </div>
      `;
    },
    getNotebookSFXPath(text) {
      if (!text) return null;
      const lower = text.toLowerCase();
      
      // 1. Check hardcoded overrides (aliases like kick -> punch)
      for (const [key, path] of Object.entries(NOTEBOOK_SFX_MAP)) {
        if (lower.includes(key)) {
          if (Array.isArray(path)) {
            // Pick a random sound from the category
            const idx = Math.floor(Math.random() * path.length);
            return path[idx];
          }
          return path;
        }
      }
 
      // 2. Dynamic manifest matching (automatic filename-based mapping)
      if (Array.isArray(this.sfxManifest)) {
        for (const filename of this.sfxManifest) {
          const keyword = filename.split('.')[0].toLowerCase();
          if (keyword.length < 2) continue;
          if (lower.includes(keyword)) {
            return `sfx/sort/${filename}`;
          }
        }
      }
      return null;
    },
    getSyncPortraitSrc(characterId, year) {
      const aliasId = String(characterId || '').toLowerCase().trim();
      if (!aliasId || (global.MR_CONSTANTS?.SPECIAL_ENTRY_ICONS && global.MR_CONSTANTS.SPECIAL_ENTRY_ICONS[aliasId])) {
        return '';
      }

      const folderId = this.getResolvedCharacterId(aliasId);
      const prefix = aliasId;
      let targetFolderId = folderId;
      let files = this.portraitManifest?.[targetFolderId];

      if (!Array.isArray(files) || files.length === 0) {
        if (this.portraitManifest?.['misc']) {
          files = this.portraitManifest['misc'];
          targetFolderId = 'misc';
        }
      }

      if (Array.isArray(files) && files.length > 0) {
        let aliasFiles = files.filter(f => f.toLowerCase().startsWith(prefix));
        if (aliasFiles.length === 0) {
          aliasFiles = files.filter(f => f.toLowerCase().startsWith(folderId));
        }

        if (aliasFiles.length === 1) {
          return `portraits/${targetFolderId}/${aliasFiles[0]}`;
        }

        const target = Number(year || 0);
        let bestFile = '';
        let minDiff = Infinity;
        const candidates = aliasFiles.length > 0 ? aliasFiles : (targetFolderId === 'misc' ? [] : files);

        for (const filename of candidates) {
          const lower = filename.toLowerCase();
          const match = lower.match(/\d{4}/);
          const fileYear = match ? Number(match[0]) : null;

          if (fileYear === null) {
            if (!bestFile) bestFile = filename;
            continue;
          }
          const diff = Math.abs(fileYear - target);
          if (diff < minDiff) {
            minDiff = diff;
            bestFile = filename;
          }
        }
        if (bestFile) {
          return `portraits/${targetFolderId}/${bestFile}`;
        }
      }
      return '';
    },
    titleCaseAfterSpaces(value) {
      return String(value || '')
        .toLowerCase()
        .replace(/(^|\s)([a-z])/g, (match, prefix, chr) => `${prefix}${String(chr || '').toUpperCase()}`);
    },
    timelineTagType(tag) {
      let cleaned = this.plainText(tag || '').trim();
      if (cleaned.startsWith('-')) {
        cleaned = cleaned.slice(1).trim();
      }
      const lower = String(cleaned || '').toLowerCase();
      if (!lower) return 'other';

      // 1. Resolve redirect targets (e.g. clint-harris -> clint)
      const resolved = typeof this.getResolvedCharacterId === 'function' ? this.getResolvedCharacterId(lower) : lower;
      if (this.timelineCharacterTagSet && this.timelineCharacterTagSet.has(resolved)) return 'character';

      // 2. Resolve entities
      if (this.entitiesRegistry && this.entitiesRegistry[lower]) return 'entity';

      // 3. Resolve composite character/ship tags (e.g. carla-marvin -> carla + marv)
      if (lower.includes('-')) {
        const parts = lower.split('-');
        if (parts.length > 1) {
          const allAreChars = parts.every(part => {
            const resolvedPart = typeof this.getResolvedCharacterId === 'function' ? this.getResolvedCharacterId(part) : part;
            return this.timelineCharacterTagSet && this.timelineCharacterTagSet.has(resolvedPart);
          });
          if (allAreChars) return 'character';
        }
      }

      if (TIMELINE_EVENT_TAG_HINTS.has(lower) || lower.startsWith('ww') || lower.includes('event')) return 'event';
      return 'other';
    },
    detectCharacterTagsInText(text) {
      if (!text) return [];
      const lower = text.toLowerCase();
      const tags = [];
      const core = this.characterCore || {};

      Object.keys(core).forEach(id => {
        const lowerId = id.toLowerCase();
        const fullName = String(core[id]?.['full name'] || '').toLowerCase();
        const navLabel = String(core[id]?.navLabel || '').toLowerCase();

        // Simple word boundary check
        const idRegex = new RegExp(`\\b${lowerId}\\b`, 'i');
        if (idRegex.test(lower)) {
          tags.push(id);
          return;
        }

        if (fullName && fullName.length > 3) {
          const nameRegex = new RegExp(`\\b${fullName}\\b`, 'i');
          if (nameRegex.test(lower)) {
            tags.push(id);
            return;
          }
        }

        if (navLabel && navLabel.length > 2) {
          const navRegex = new RegExp(`\\b${navLabel}\\b`, 'i');
          if (navRegex.test(lower)) {
            tags.push(id);
          }
        }
      });

      return Array.from(new Set(tags));
    },
    timelineOtherGroupKey(tag) {
      const lower = String(this.plainText(tag || '') || '').toLowerCase();
      if (!lower) {
        return 'misc';
      }

      const entity = this.entitiesRegistry?.[lower];
      if (entity?._category === 'countries' || entity?._category === 'places') {
        return 'locations';
      }
      if (entity?._category === 'organizations') {
        return 'organizations';
      }
      if (entity?._category === 'topics') {
        return 'topics';
      }
      if (entity?._category === 'events') {
        return 'events';
      }
      if (entity?._category === 'items') {
        return 'items';
      }
      if (entity?._category === 'themes') {
        return 'themes';
      }

      if (/^-?\d{1,5}s?$/.test(lower)) {
        return 'years';
      }
      if (
        TIMELINE_LOCATION_TAG_HINTS.has(lower)
        || /(ashford|fairmount|canaan|harrow|north-pole|new-york|moscow|middle-east|latin-america|eurasia|argentina|iran|utah|india|africa|japan|korea|america|brazil|britain)/.test(lower)
      ) {
        return 'locations';
      }
      if (
        TIMELINE_ORG_TAG_HINTS.has(lower)
        || lower.includes('inc')
        || lower.includes('corp')
        || lower.includes('agency')
      ) {
        return 'organizations';
      }
      if (
        TIMELINE_THEME_TAG_HINTS.has(lower)
        || lower.includes('war')
        || lower.includes('history')
        || lower.includes('event')
      ) {
        return 'themes';
      }
      return 'misc';
    },
    timelineOtherGroupLabel(key) {
      const labels = {
        years: 'Years',
        locations: 'Locations',
        organizations: 'Organizations',
        topics: 'Topics',
        events: 'Events',
        items: 'Items',
        themes: 'Themes',
        misc: 'Misc'
      };
      return labels[key] || 'Other';
    },
    timelineTagToneClass(tag) {
      let cleaned = String(tag || '').trim();
      if (cleaned.startsWith('-')) {
        cleaned = cleaned.slice(1).trim();
      }
      const type = this.timelineTagType(cleaned);
      const lower = String(this.plainText(cleaned || '') || '').toLowerCase();
      if (type === 'character') {
        const paletteIndex = this.timelineTagPaletteIndex(lower, 4) + 1;
        return `is-character tone-char-${paletteIndex}`;
      }
      if (type === 'entity') {
        const entity = this.entitiesRegistry?.[lower];
        if (entity && Array.isArray(entity.tags) && entity.tags.includes('format-tag')) {
          return `is-entity is-format-tag tag-${lower}`;
        }
        const otherKey = this.timelineOtherGroupKey(lower);
        return `is-entity is-other tone-other-${otherKey}`;
      }
      if (type === 'event') {
        if (/(war|ww\d|operation|shutdown)/.test(lower)) {
          return 'is-event tone-event-conflict';
        }
        if (/(birth|wedding|romance|friendship|adoption|breakup|death)/.test(lower)) {
          return 'is-event tone-event-personal';
        }
        if (/(origin|discovery|enhanced|therapy|spiral)/.test(lower)) {
          return 'is-event tone-event-development';
        }
        return 'is-event tone-event-general';
      }
      const otherKey = this.timelineOtherGroupKey(lower);
      return `is-other tone-other-${otherKey}`;
    },
    getCharacterColor(tag) {
      let cleaned = String(tag || '').trim();
      if (cleaned.startsWith('-')) {
        cleaned = cleaned.slice(1).trim();
      }
      const lower = String(this.plainText(cleaned || '') || '').toLowerCase().trim();
      if (!lower) return null;
      const core = this.getResolvedCharacterCore(lower);
      if (core?.color) {
        return core.color;
      }
      const entity = this.entitiesRegistry?.[lower];
      if (entity?.color) {
        return entity.color;
      }
      const isChar = this.timelineCharacterTagSet.has(lower);
      const isEntity = this.entitiesRegistry && this.entitiesRegistry[lower];
      if (isChar || isEntity) {
        let sum = 0;
        for (let i = 0; i < lower.length; i += 1) {
          sum += lower.charCodeAt(i);
        }
        const hue = (sum * 137) % 360;
        return `hsl(${hue}, 70%, 50%)`;
      }
      return null;
    },
    timelineTagStyle(tag) {
      const color = this.getCharacterColor(tag);
      if (color) {
        return { '--char-color': color };
      }
      return {};
    },
    getSortedAndFilteredEventTags(tags, ignoreFiltering = false) {
      if (!Array.isArray(tags)) return [];
      let list = tags.filter(Boolean);
      list = [...list].sort((a, b) => {
        const typeA = this.timelineTagType(a) === 'character' ? 0 : 1;
        const typeB = this.timelineTagType(b) === 'character' ? 0 : 1;
        if (typeA !== typeB) {
          return typeA - typeB;
        }
        return String(a).localeCompare(String(b));
      });
      if (this.timelineCharactersOnly && !ignoreFiltering) {
        list = list.filter(tag => this.timelineTagType(tag) === 'character');
      }
      
      // Filter out canonical tags if their alias tag is also present in the list
      list = list.filter(tag => {
        const cleanLower = this.plainText(tag).toLowerCase().trim();
        const hasAliasInList = list.some(other => {
          const otherLower = this.plainText(other).toLowerCase().trim();
          if (otherLower === cleanLower) return false;
          return typeof this.timelineTagCanonicalId === 'function'
            ? this.timelineTagCanonicalId(otherLower) === cleanLower
            : false;
        });
        return !hasAliasInList;
      });

      return list;
    },
    timelineTagIcon(tag) {
      let cleaned = String(tag || '').trim();
      if (cleaned.startsWith('-')) {
        cleaned = cleaned.slice(1).trim();
      }
      const type = this.timelineTagType(cleaned);
      const lower = String(this.plainText(cleaned || '') || '').toLowerCase();

      if (type === 'character') {
        const core = this.getResolvedCharacterCore(lower);
        return core?.iconKey || core?.icon || null;
      }

      if (type === 'entity') {
        const entity = this.entitiesRegistry?.[lower];
        return entity?.iconKey || entity?.icon || null;
      }

      return null;
    },
    timelineTagPaletteIndex(value, size = 4) {
      const source = String(value || '');
      let hash = 0;
      for (let i = 0; i < source.length; i += 1) {
        hash = ((hash << 5) - hash + source.charCodeAt(i)) | 0;
      }
      const mod = Number(size) > 0 ? Number(size) : 4;
      return Math.abs(hash) % mod;
    },
    timelineSourceEventKey(event, index = 0) {
      const sourceIndex = Number(event?.__sourceIndex);
      if (Number.isInteger(sourceIndex) && sourceIndex >= 0) {
        return `source:${sourceIndex}`;
      }
      return this.timelineEventKey(event, index);
    },
    canEditTimelineText(event) {
      const sourceIndex = Number(event?.__sourceIndex);
      if (Number.isInteger(sourceIndex) && sourceIndex >= 0 && !event?.__synthetic) {
        return true;
      }
      if (event?.__relationshipSynthetic) {
        const relId = String(event?.__relationshipId || '').trim();
        const textField = String(event?.__relationshipTextField || '').trim();
        if (!relId) {
          return false;
        }
        return textField === 'notes' || textField === 'history-note';
      }
      return false;
    },
    timelineTextSourceKey(event, index = 0) {
      return `${this.timelineSourceEventKey(event, index)}::text`;
    },
    isTimelineTextEditing(event, index = 0) {
      return !!this.coreEditMode || this.timelineTextEditingKey === this.timelineTextSourceKey(event, index);
    },
    timelineTextDraftFor(event, index = 0) {
      const key = this.timelineTextSourceKey(event, index);
      const fallback = {
        title: String(event?.title || '').trim(),
        description: String(event?.description || '').trim()
      };
      const draft = this.timelineTextDraftByKey?.[key];
      if (draft && typeof draft === 'object') {
        return {
          title: String(draft.title || ''),
          description: String(draft.description || '')
        };
      }
      return fallback;
    },
    setTimelineTextDraft(event, index = 0, patch = {}) {
      const key = this.timelineTextSourceKey(event, index);
      const current = this.timelineTextDraftFor(event, index);
      this.timelineTextDraftByKey = {
        ...(this.timelineTextDraftByKey || {}),
        [key]: {
          ...current,
          ...(patch || {})
        }
      };
    },
    timelineTextErrorFor(event, index = 0) {
      const key = this.timelineTextSourceKey(event, index);
      return String(this.timelineTextErrorByKey?.[key] || '');
    },
    isTimelineTextSaving(event, index = 0) {
      const key = this.timelineTextSourceKey(event, index);
      return !!this.timelineTextSavingByKey?.[key];
    },
    openTimelineTextEditor(event, index = 0) {
      if (!this.canEditTimelineText(event)) {
        return;
      }
      const key = this.timelineTextSourceKey(event, index);
      this.timelineTextEditingKey = key;
      this.timelineTextDraftByKey = {
        ...(this.timelineTextDraftByKey || {}),
        [key]: {
          title: String(event?.title || '').trim(),
          description: String(event?.description || '').trim()
        }
      };
      this.timelineTextErrorByKey = {
        ...(this.timelineTextErrorByKey || {}),
        [key]: ''
      };
    },
    cancelTimelineTextEdit(event, index = 0) {
      this.timelineTextEditingKey = '';
      if (event) {
        const key = this.timelineTextSourceKey(event, index);
        if (this.timelineTextDraftByKey && this.timelineTextDraftByKey[key]) {
          this.timelineTextDraftByKey[key] = {
            title: String(event?.title || '').trim(),
            description: String(event?.description || '').trim()
          };
        }
      }
    },
    async saveTimelineTextEdit(event, index = 0) {
      if (!this.canEditTimelineText(event)) {
        return;
      }

      const key = this.timelineTextSourceKey(event, index);
      const draft = this.timelineTextDraftFor(event, index);
      const title = String(draft.title || '').trim();
      const description = String(draft.description || '').trim();
      const sourceIndex = event?.__sourceIndex;
      const isTimeline = event?.__isMd || (Number.isInteger(sourceIndex) && sourceIndex >= 0 && !event?.__synthetic);
      const isRelationshipSynthetic = !!event?.__relationshipSynthetic;

      if (isTimeline) {
        if (!isRelationshipSynthetic && !title) {
          this.timelineTextErrorByKey = {
            ...(this.timelineTextErrorByKey || {}),
            [key]: 'Timeline title cannot be empty.'
          };
          return;
        }
      }
      if (isRelationshipSynthetic && !description) {
        this.timelineTextErrorByKey = {
          ...(this.timelineTextErrorByKey || {}),
          [key]: 'Entry text cannot be empty.'
        };
        return;
      }

      this.timelineTextSavingByKey = {
        ...(this.timelineTextSavingByKey || {}),
        [key]: true
      };
      this.timelineTextErrorByKey = {
        ...(this.timelineTextErrorByKey || {}),
        [key]: ''
      };

      try {
        let response;
        if (isRelationshipSynthetic) {
          const relationshipId = String(event?.__relationshipId || '').trim();
          const field = String(event?.__relationshipTextField || '').trim();
          const date = String(event?.__relationshipNoteDate || '').trim();
          const oldText = String(event?.__relationshipOldText || '').trim();
          response = await fetch(this.apiUrl('/api/relationships/set-text'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ relationshipId, field, date, oldText, text: description })
          });
        } else {
          response = await fetch(this.apiUrl('/api/timeline/set-text'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: event.id,
              date: event.date,
              title: event.title,
              newTitle: title,
              newDescription: description
            })
          });
        }

        let payload = null;
        try {
          payload = await response.json();
        } catch {
          payload = null;
        }

        if (!response.ok || payload?.ok === false) {
          const scope = isRelationshipSynthetic ? 'relationship-text' : 'timeline-text';
          throw new Error(String(payload?.error || `${scope}-save-${response.status}`));
        }

        if (isRelationshipSynthetic) {
          await this.loadRelationships();
        } else {
          await this.loadTimeline();
        }
        this.timelineTextEditingKey = '';
      } catch (error) {
        this.timelineTextErrorByKey = {
          ...(this.timelineTextErrorByKey || {}),
          [key]: String(error?.message || 'Failed to save text.')
        };
      } finally {
        this.timelineTextSavingByKey = {
          ...(this.timelineTextSavingByKey || {}),
          [key]: false
        };
      }
    },
    setTimelineBatchNotice(message = '', tone = 'info') {
      this.timelineBatchNotice = String(message || '').trim();
      this.timelineBatchNoticeTone = String(tone || 'info').trim() || 'info';
      if (this._timelineBatchNoticeTimer) {
        clearTimeout(this._timelineBatchNoticeTimer);
        this._timelineBatchNoticeTimer = null;
      }
      if (this.timelineBatchNotice) {
        this._timelineBatchNoticeTimer = setTimeout(() => {
          this.timelineBatchNotice = '';
          this.timelineBatchNoticeTone = '';
          this._timelineBatchNoticeTimer = null;
        }, 3200);
      }
    },
    isTimelineSelected(event, index = 0) {
      const key = this.timelineSourceEventKey(event, index);
      return !!this.timelineSelectedKeys?.[key];
    },
    setTimelineSelected(event, index = 0, next = true) {
      const canSelect = this.canEditTimelineDate(event) || !!this.timelineMergeGroupForEvent(event);
      if (!canSelect) {
        return;
      }
      const key = this.timelineSourceEventKey(event, index);
      const selected = { ...(this.timelineSelectedKeys || {}) };
      if (next) {
        selected[key] = true;
        this.timelineSelectedKeys = selected;
        if (!this.timelineBatchAnchorKey) {
          this.timelineBatchAnchorKey = key;
        }
        return;
      }
      delete selected[key];
      this.timelineSelectedKeys = selected;
      if (this.timelineBatchAnchorKey === key) {
        const remaining = Object.keys(selected);
        this.timelineBatchAnchorKey = remaining[0] || '';
      }
    },
    clearTimelineSelection() {
      this.timelineSelectedKeys = {};
      this.timelineBatchAnchorKey = '';
      this.timelineBatchShiftYears = 0;
      this.timelineBatchShiftMonths = 0;
      this.timelineBatchShiftDays = 0;
    },
    toggleSelectAllVisibleTimelineEvents() {
      const allSelected = this.isAllVisibleTimelineEventsSelected;
      const selected = { ...(this.timelineSelectedKeys || {}) };
      const selectable = [];

      if (this.timelineSelectAllIncludesCutoff) {
        const allFiltered = Array.isArray(this.filteredTimelineEvents) ? this.filteredTimelineEvents : [];
        allFiltered.forEach((event) => {
          const canSelect = this.canEditTimelineDate(event) || !!this.timelineMergeGroupForEvent(event);
          if (canSelect) {
            selectable.push({ event, index: Number(event.__sourceIndex || 0) });
          }
        });
      } else {
        const groups = Array.isArray(this.groupedFilteredTimelineEvents) ? this.groupedFilteredTimelineEvents : [];
        groups.forEach((group) => {
          const items = Array.isArray(group?.items) ? group.items : [];
          items.forEach((item) => {
            const canSelect = this.canEditTimelineDate(item.event) || !!this.timelineMergeGroupForEvent(item.event);
            if (canSelect) {
              selectable.push(item);
            }
          });
        });
      }

      selectable.forEach((item) => {
        const key = this.timelineSourceEventKey(item.event, Number(item.index || 0));
        if (allSelected) {
          delete selected[key];
        } else {
          selected[key] = true;
        }
      });

      this.timelineSelectedKeys = selected;

      const remaining = Object.keys(selected);
      if (!allSelected && remaining.length) {
        if (!this.timelineBatchAnchorKey || !selected[this.timelineBatchAnchorKey]) {
          this.timelineBatchAnchorKey = remaining[0];
        }
      } else if (allSelected) {
        this.timelineBatchAnchorKey = '';
      }
    },
    openConfirmModal(options) {
      const opts = options || {};
      this.confirmModalTitle = String(opts.title || 'Confirm Action');
      this.confirmModalBody = String(opts.body || 'Are you sure?');
      this.confirmModalConfirmLabel = String(opts.confirmLabel || 'Confirm');
      this.confirmModalCancelLabel = String(opts.cancelLabel || 'Cancel');
      this.confirmModalAction = typeof opts.onConfirm === 'function' ? opts.onConfirm : null;
      this.confirmModalOpen = true;
    },
    deleteSelectedTimelineEvents() {
      const selected = this.groupedFilteredTimelineEvents
        .flatMap((g) => g.items)
        .filter((item) => this.isTimelineSelected(item.event, item.index));

      if (!selected.length) {
        return;
      }

      this.openConfirmModal({
        title: 'Delete Selected Entries',
        body: `Are you sure you want to permanently delete these ${selected.length} selected timeline entries? This action cannot be undone.`,
        confirmLabel: 'Delete',
        onConfirm: async () => {
          try {
            for (const item of selected) {
              const response = await fetch(this.apiUrl('/api/timeline/delete-event'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  id: item.event.id,
                  date: item.event.date,
                  title: item.event.title
                })
              });
              const payload = await response.json().catch(() => null);
              if (!response.ok || payload?.ok === false) {
                throw new Error(String(payload?.error || `timeline-delete-${response.status}`));
              }
            }
            this.clearTimelineSelection();
            await this.loadTimeline();
            this.setTimelineBatchNotice(`Deleted ${selected.length} timeline events.`, 'success');
          } catch (err) {
            console.error('Failed to delete entries:', err);
            this.setTimelineBatchNotice(`Delete failed: ${err.message}`, 'error');
          }
        }
      });
    },
    async groupSelectedTimelineEvents() {
      const selected = this.groupedFilteredTimelineEvents
        .flatMap((g) => g.items)
        .filter((item) => this.isTimelineSelected(item.event, item.index));

      if (selected.length < 2) {
        this.setTimelineBatchNotice('Please select at least 2 entries to group.', 'error');
        return;
      }

      // Sort selected entries by date and index to determine the earliest (parent)
      const sorted = [...selected].sort((a, b) => {
        const dateA = String(a.event?.date || '0000-00-00');
        const dateB = String(b.event?.date || '0000-00-00');
        return dateA.localeCompare(dateB) || (a.index - b.index);
      });

      const parentItem = sorted[0];
      const childItems = sorted.slice(1);

      this.openConfirmModal({
        title: 'Group Selected Entries',
        body: `Are you sure you want to group these ${childItems.length} entries under the parent event "${parentItem.event.title}"?`,
        confirmLabel: 'Group',
        onConfirm: async () => {
          try {
            const payload = {
              parentIdent: {
                id: parentItem.event.id,
                date: parentItem.event.date,
                title: parentItem.event.title
              },
              children: childItems.map(item => ({
                id: item.event.id,
                date: item.event.date,
                title: item.event.title
              }))
            };

            const response = await fetch(this.apiUrl('/api/timeline/group'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });

            const resData = await response.json().catch(() => null);
            if (!response.ok || resData?.ok === false) {
              throw new Error(String(resData?.error || `timeline-group-${response.status}`));
            }

            this.clearTimelineSelection();
            await this.loadTimeline();
            this.setTimelineBatchNotice(`Successfully grouped ${childItems.length} entries under "${parentItem.event.title}".`, 'success');
          } catch (err) {
            console.error('Failed to group entries:', err);
            this.setTimelineBatchNotice(`Grouping failed: ${err.message}`, 'error');
          }
        }
      });
    },
    async ungroupSelectedTimelineEvents() {
      const selected = this.groupedFilteredTimelineEvents
        .flatMap((g) => g.items)
        .filter((item) => this.isTimelineSelected(item.event, item.index));

      if (!selected.length) {
        return;
      }

      this.openConfirmModal({
        title: 'Ungroup Selected Entries',
        body: `Are you sure you want to ungroup these ${selected.length} selected entries? They will no longer be nested under a parent.`,
        confirmLabel: 'Ungroup',
        onConfirm: async () => {
          try {
            const payload = {
              events: selected.map(item => ({
                id: item.event.id,
                date: item.event.date,
                title: item.event.title
              }))
            };

            const response = await fetch(this.apiUrl('/api/timeline/ungroup'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });

            const resData = await response.json().catch(() => null);
            if (!response.ok || resData?.ok === false) {
              throw new Error(String(resData?.error || `timeline-ungroup-${response.status}`));
            }

            this.clearTimelineSelection();
            await this.loadTimeline();
            this.setTimelineBatchNotice(`Successfully ungrouped ${selected.length} entries.`, 'success');
          } catch (err) {
            console.error('Failed to ungroup entries:', err);
            this.setTimelineBatchNotice(`Ungrouping failed: ${err.message}`, 'error');
          }
        }
      });
    },
    setTimelineBatchAnchor(key = '') {
      const targetKey = String(key || '').trim();
      if (!targetKey || !this.timelineSelectedKeys?.[targetKey]) {
        return;
      }
      this.timelineBatchAnchorKey = targetKey;
    },
    loadMoreTimeline() {
      this.timelineLimit += 100;
      this.saveUiState();
      this.$nextTick(() => {
        this.observeVisibleTimelineEvents();
      });
    },
    timelineDateOperationForEvent(event, date = '') {
      const targetDate = String(date || '').trim();
      if (!this.parseTimelineDateParts(targetDate) || !this.canEditTimelineDate(event)) {
        return null;
      }
      const currentDate = String(event?.date || '').trim();
      if (event?.__birthdaySynthetic) {
        const characterId = String(event?.__characterId || '').trim();
        if (!characterId) {
          return null;
        }
        return {
          key: `birthday:${characterId}`,
          type: 'birthday',
          currentDate,
          targetDate,
          characterId
        };
      }
      if (event?.__relationshipSynthetic) {
        const relationshipId = String(event?.__relationshipId || '').trim();
        const field = String(event?.__relationshipDateField || '').trim();
        const oldDate = String(event?.__relationshipOldDate || event?.date || '').trim();
        if (!relationshipId || !field || !oldDate) {
          return null;
        }
        const opKey = field === 'history'
          ? `relationship:${relationshipId}:${field}:${oldDate}`
          : `relationship:${relationshipId}:${field}`;
        return {
          key: opKey,
          type: 'relationship',
          currentDate,
          targetDate,
          relationshipId,
          field,
          oldDate
        };
      }
      const id = event?.id;
      const eventDate = String(event?.date || '').trim();
      const title = String(event?.title || '').trim();

      const opKey = id ? `timeline:id:${id}` : `timeline:legacy:${eventDate}:${title}`;

      return {
        key: opKey,
        type: 'timeline',
        currentDate,
        targetDate,
        id,
        oldDate: eventDate,
        oldTitle: title
      };
    },
    async executeTimelineDateOperation(operation) {
      const op = operation && typeof operation === 'object' ? operation : null;
      if (!op) {
        throw new Error('Missing date operation.');
      }

      let response;
      if (op.type === 'birthday') {
        response = await fetch(this.apiUrl('/api/character-core/set-birthdate'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ characterId: op.characterId, date: op.targetDate })
        });
      } else if (op.type === 'relationship') {
        response = await fetch(this.apiUrl('/api/relationships/set-date'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ relationshipId: op.relationshipId, field: op.field, oldDate: op.oldDate, date: op.targetDate })
        });
      } else {
        response = await fetch(this.apiUrl('/api/timeline/set-date'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: op.id,
            oldDate: op.oldDate,
            oldTitle: op.oldTitle,
            newDate: op.targetDate
          })
        });
      }

      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      if (!response.ok || payload?.ok === false) {
        throw new Error(String(payload?.error || `date-op-${response.status}`));
      }
    },
    timelineMergeGroupForEvent(event) {
      const sourceIndex = event?.__sourceIndex;
      if ((event?.__isMd || (Number.isInteger(sourceIndex) && sourceIndex >= 0)) && !event?.__synthetic) {
        return 'timeline';
      }
      if (event?.__relationshipSynthetic && String(event?.__relationshipTextField || '').trim() === 'history-note') {
        const relationshipId = String(event?.__relationshipId || '').trim();
        const date = String(event?.__relationshipNoteDate || '').trim();
        if (relationshipId && date) {
          return `relationship-note:${relationshipId}:${date}`;
        }
      }
      return '';
    },
    async applyTimelineDateBatchToAnchor() {
      const anchor = this.timelineBatchAnchorItem;
      const targetDate = String(this.timelineBatchTargetDate || '').trim();
      if (!anchor?.event || !this.parseTimelineDateParts(targetDate)) {
        this.setTimelineBatchNotice('Select an anchor event with a valid date first.', 'error');
        return;
      }

      const selected = Array.isArray(this.timelineSelectedItems) ? this.timelineSelectedItems : [];
      const operations = [];
      const dedupe = new Set();
      selected.forEach((item) => {
        if (item.key === anchor.key) {
          return;
        }
        const op = this.timelineDateOperationForEvent(item.event, targetDate);
        if (!op || op.currentDate === targetDate || dedupe.has(op.key)) {
          return;
        }
        dedupe.add(op.key);
        operations.push(op);
      });

      if (!operations.length) {
        this.setTimelineBatchNotice('No selected events require a date change.', 'info');
        return;
      }

      this.timelineBatchSaving = true;
      let successCount = 0;
      let failureCount = 0;
      let touchedRelationship = false;
      let touchedBirthday = false;
      try {
        for (const op of operations) {
          try {
            await this.executeTimelineDateOperation(op);
            successCount += 1;
            touchedRelationship = touchedRelationship || op.type === 'relationship';
            touchedBirthday = touchedBirthday || op.type === 'birthday';
          } catch (error) {
            failureCount += 1;
            console.warn('MR Vue: date join failed.', op, error);
          }
        }

        if (touchedBirthday) {
          const coreResponse = await this.fetchCoreResponse();
          if (coreResponse?.ok) {
            const corePayload = await coreResponse.json().catch(() => ({}));
            this.characterCore = corePayload?.characters || {};
          }
        }

        if (touchedRelationship) {
          await this.loadRelationships();
        } else {
          await this.loadTimeline();
        }

        if (failureCount) {
          this.setTimelineBatchNotice(`Date join complete: ${successCount} updated, ${failureCount} failed.`, 'error');
        } else {
          this.setTimelineBatchNotice(`Date join complete: ${successCount} updated.`, 'success');
        }
      } finally {
        this.timelineBatchSaving = false;
        this.clearTimelineSelection();
      }
    },
    shiftTimelineDate(dateStr, shiftYears, shiftMonths, shiftDays) {
      const parts = this.parseTimelineDateParts(dateStr);
      if (!parts) return dateStr;

      let y = parts.year + shiftYears;
      let m = parts.month;
      let d = parts.day;

      const wasMonthZero = (m === 0);
      const wasDayZero = (d === 0);

      if (shiftMonths !== 0 || shiftDays !== 0) {
        if (m === 0) m = 1;
        if (d === 0) d = 1;
      }

      if (shiftMonths !== 0 || shiftDays !== 0) {
        const jsDate = new Date(y, m - 1, d);
        jsDate.setMonth(jsDate.getMonth() + shiftMonths);
        jsDate.setDate(jsDate.getDate() + shiftDays);

        y = jsDate.getFullYear();
        m = jsDate.getMonth() + 1;
        d = jsDate.getDate();
      }

      const pad = (num) => String(num).padStart(2, '0');

      const finalM = (wasMonthZero && shiftMonths === 0) ? '00' : pad(m);
      const finalD = (wasDayZero && shiftDays === 0) ? '00' : pad(d);

      return `${y}-${finalM}-${finalD}`;
    },
    async applyTimelineDateShiftBatch() {
      const shiftY = parseInt(this.timelineBatchShiftYears, 10) || 0;
      const shiftM = parseInt(this.timelineBatchShiftMonths, 10) || 0;
      const shiftD = parseInt(this.timelineBatchShiftDays, 10) || 0;

      if (shiftY === 0 && shiftM === 0 && shiftD === 0) {
        this.setTimelineBatchNotice('Enter a non-zero shift value first.', 'error');
        return;
      }

      const selected = Array.isArray(this.timelineSelectedItems) ? this.timelineSelectedItems : [];
      if (!selected.length) {
        this.setTimelineBatchNotice('No events selected.', 'error');
        return;
      }

      const operations = [];
      const dedupe = new Set();
      selected.forEach((item) => {
        const currentD = String(item.event?.date || '').trim();
        const targetDate = this.shiftTimelineDate(currentD, shiftY, shiftM, shiftD);
        if (currentD === targetDate) {
          return;
        }
        const op = this.timelineDateOperationForEvent(item.event, targetDate);
        if (!op || dedupe.has(op.key)) {
          return;
        }
        dedupe.add(op.key);
        operations.push(op);
      });

      if (!operations.length) {
        this.setTimelineBatchNotice('No selected events require a date change.', 'info');
        return;
      }

      this.timelineBatchSaving = true;
      let successCount = 0;
      let failureCount = 0;
      let touchedRelationship = false;
      let touchedBirthday = false;
      try {
        for (const op of operations) {
          try {
            await this.executeTimelineDateOperation(op);
            successCount += 1;
            touchedRelationship = touchedRelationship || op.type === 'relationship';
            touchedBirthday = touchedBirthday || op.type === 'birthday';
          } catch (error) {
            failureCount += 1;
            console.warn('MR Vue: date shift failed.', op, error);
          }
        }

        if (touchedBirthday) {
          const coreResponse = await this.fetchCoreResponse();
          if (coreResponse?.ok) {
            const corePayload = await coreResponse.json().catch(() => ({}));
            this.characterCore = corePayload?.characters || {};
          }
        }

        if (touchedRelationship) {
          await this.loadRelationships();
        } else {
          await this.loadTimeline();
        }

        if (failureCount) {
          this.setTimelineBatchNotice(`Date shift complete: ${successCount} updated, ${failureCount} failed.`, 'error');
        } else {
          this.setTimelineBatchNotice(`Date shift complete: ${successCount} updated.`, 'success');
        }
      } finally {
        this.timelineBatchSaving = false;
        this.clearTimelineSelection();
      }
    },
    async mergeSelectedTimelineEvents() {
      if (!this.timelineCanMergeSelection) {
        this.setTimelineBatchNotice(this.timelineMergeRestrictionLabel, 'error');
        return;
      }

      const selected = Array.isArray(this.timelineSelectedItems) ? this.timelineSelectedItems : [];
      const anchor = this.timelineBatchAnchorItem || selected[0] || null;
      if (!anchor?.event) {
        this.setTimelineBatchNotice('Choose an anchor event for merge.', 'error');
        return;
      }

      const family = String(this.timelineMergeGroup || '').trim();
      const others = selected.filter((item) => item.key !== anchor.key);
      this.timelineBatchSaving = true;
      try {
        if (family === 'timeline') {
          const anchorSourceIndex = Number(anchor?.event?.__sourceIndex);
          if (!Number.isInteger(anchorSourceIndex) || anchorSourceIndex < 0) {
            throw new Error('Anchor timeline source index is invalid.');
          }
          const title = String(anchor?.event?.title || '').trim() || 'Merged Timeline Event';
          const descriptionParts = [];
          const seenDescriptions = new Set();
          [anchor, ...others].forEach((item) => {
            const desc = String(item?.event?.description || '').trim();
            if (!desc) {
              return;
            }
            const key = desc.toLowerCase();
            if (seenDescriptions.has(key)) {
              return;
            }
            seenDescriptions.add(key);
            descriptionParts.push(desc);
          });
          const description = descriptionParts.join('\n\n');

          let response = await fetch(this.apiUrl('/api/timeline/set-text'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sourceIndex: anchorSourceIndex, title, description })
          });
          let payload = await response.json().catch(() => null);
          if (!response.ok || payload?.ok === false) {
            throw new Error(String(payload?.error || `timeline-merge-update-${response.status}`));
          }

          const sourceIndexes = others
            .map((item) => Number(item?.event?.__sourceIndex))
            .filter((value) => Number.isInteger(value) && value >= 0)
            .sort((a, b) => b - a);

          for (const item of others) {
            response = await fetch(this.apiUrl('/api/timeline/delete-event'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: item.event.id,
                date: item.event.date,
                title: item.event.title
              })
            });
            payload = await response.json().catch(() => null);
            if (!response.ok || payload?.ok === false) {
              throw new Error(String(payload?.error || `timeline-merge-delete-${response.status}`));
            }
          }

          await this.loadTimeline();
          this.setTimelineBatchNotice(`Merge complete: ${selected.length} timeline events -> 1.`, 'success');
        } else if (family.startsWith('relationship-note:')) {
          const relationshipId = String(anchor?.event?.__relationshipId || '').trim();
          const date = String(anchor?.event?.__relationshipNoteDate || '').trim();
          const oldText = String(anchor?.event?.__relationshipOldText || '').trim();
          if (!relationshipId || !date || !oldText) {
            throw new Error('Anchor relationship note metadata is incomplete.');
          }

          const mergedNotes = [];
          const seenNotes = new Set();
          [anchor, ...others].forEach((item) => {
            const text = String(item?.event?.description || '').trim();
            if (!text) {
              return;
            }
            const textKey = text.toLowerCase();
            if (seenNotes.has(textKey)) {
              return;
            }
            seenNotes.add(textKey);
            mergedNotes.push(text);
          });
          const mergedText = mergedNotes.join('\n\n');

          let response = await fetch(this.apiUrl('/api/relationships/set-text'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ relationshipId, field: 'history-note', date, oldText, text: mergedText })
          });
          let payload = await response.json().catch(() => null);
          if (!response.ok || payload?.ok === false) {
            throw new Error(String(payload?.error || `relationship-merge-update-${response.status}`));
          }

          for (const item of others) {
            const text = String(item?.event?.__relationshipOldText || item?.event?.description || '').trim();
            if (!text) {
              continue;
            }
            response = await fetch(this.apiUrl('/api/relationships/delete-history-note'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ relationshipId, date, text })
            });
            payload = await response.json().catch(() => null);
            if (!response.ok || payload?.ok === false) {
              throw new Error(String(payload?.error || `relationship-merge-delete-${response.status}`));
            }
          }

          await this.loadRelationships();
          this.setTimelineBatchNotice(`Merge complete: ${selected.length} relationship notes -> 1.`, 'success');
        } else {
          this.setTimelineBatchNotice(this.timelineMergeRestrictionLabel, 'error');
        }
      } catch (error) {
        this.setTimelineBatchNotice(`Merge failed: ${String(error?.message || 'unknown error')}`, 'error');
      } finally {
        this.timelineBatchSaving = false;
        this.clearTimelineSelection();
      }
    },
    canEditTimelineDate(event) {
      const sourceIndex = Number(event?.__sourceIndex);
      if (Number.isInteger(sourceIndex) && sourceIndex >= 0 && !event?.__synthetic) {
        return true;
      }
      if (event?.__birthdaySynthetic) {
        return !!String(event?.__characterId || '').trim();
      }
      if (event?.__relationshipSynthetic) {
        const relId = String(event?.__relationshipId || '').trim();
        const field = String(event?.__relationshipDateField || '').trim();
        return !!relId && (field === 'startDate' || field === 'splitDate' || field === 'history');
      }
      return false;
    },
    relationshipDateFieldKey(rel, field = 'startDate') {
      const relId = String(rel?.id || '').trim();
      const safeField = String(field || '').trim();
      return `relationship:${relId}:${safeField}`;
    },
    relationshipHistoryDateKey(rel, historyItem, historyIndex = 0) {
      const relId = String(rel?.id || '').trim();
      const dateKey = String(historyItem?.sourceDateKey || historyItem?.date || '').trim();
      return `relationship:${relId}:history:${dateKey || `index-${Number(historyIndex || 0)}`}`;
    },
    isRelationshipDateEditing(key) {
      return this.relationshipDateEditingKey === String(key || '');
    },
    relationshipDateDraftFor(key, fallback = '') {
      const editKey = String(key || '');
      return this.relationshipDateDraftByKey?.[editKey] || String(fallback || '');
    },
    setRelationshipDateDraft(key, value = '') {
      const editKey = String(key || '');
      this.relationshipDateDraftByKey = {
        ...(this.relationshipDateDraftByKey || {}),
        [editKey]: String(value || '')
      };
    },
    relationshipDateErrorFor(key) {
      const editKey = String(key || '');
      return String(this.relationshipDateErrorByKey?.[editKey] || '');
    },
    isRelationshipDateSaving(key) {
      const editKey = String(key || '');
      return !!this.relationshipDateSavingByKey?.[editKey];
    },
    openRelationshipFieldDateEditor(rel, field = 'startDate', currentDate = '', clickEvent = null) {
      this.openDateMenuForContext(currentDate, clickEvent, {
        kind: 'relationship-field',
        rel,
        field
      });
    },
    openRelationshipHistoryDateEditor(rel, historyItem, historyIndex = 0, clickEvent = null) {
      this.openDateMenuForContext(historyItem?.date || '', clickEvent, {
        kind: 'relationship-history',
        rel,
        historyItem,
        historyIndex
      });
    },
    cancelRelationshipDateEdit() {
      this.relationshipDateEditingKey = '';
    },
    async saveRelationshipFieldDateEdit(rel, field = 'startDate') {
      const relId = String(rel?.id || '').trim();
      if (!relId) {
        return;
      }
      const safeField = String(field || '').trim();
      if (safeField !== 'startDate' && safeField !== 'splitDate') {
        return;
      }

      const key = this.relationshipDateFieldKey(rel, safeField);
      const draft = String(this.relationshipDateDraftFor(key, rel?.[safeField] || '') || '').trim();
      const parsed = this.parseTimelineDateParts(draft);
      if (!parsed) {
        this.relationshipDateErrorByKey = {
          ...(this.relationshipDateErrorByKey || {}),
          [key]: 'Use YYYY-MM-DD (negative years allowed, 00 month/day allowed).'
        };
        return;
      }

      this.relationshipDateSavingByKey = {
        ...(this.relationshipDateSavingByKey || {}),
        [key]: true
      };
      this.relationshipDateErrorByKey = {
        ...(this.relationshipDateErrorByKey || {}),
        [key]: ''
      };

      try {
        const response = await fetch(this.apiUrl('/api/relationships/set-date'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ relationshipId: relId, field: safeField, date: draft })
        });

        let payload = null;
        try {
          payload = await response.json();
        } catch {
          payload = null;
        }

        if (!response.ok || payload?.ok === false) {
          throw new Error(String(payload?.error || `relationship-save-${response.status}`));
        }

        await this.loadRelationships();
        this.relationshipDateEditingKey = '';
      } catch (error) {
        this.relationshipDateErrorByKey = {
          ...(this.relationshipDateErrorByKey || {}),
          [key]: String(error?.message || 'Failed to save relationship date.')
        };
      } finally {
        this.relationshipDateSavingByKey = {
          ...(this.relationshipDateSavingByKey || {}),
          [key]: false
        };
      }
    },
    async saveRelationshipHistoryDateEdit(rel, historyItem, historyIndex = 0) {
      const relId = String(rel?.id || '').trim();
      const oldDate = String(historyItem?.sourceDateKey || historyItem?.date || '').trim();
      if (!relId || !oldDate) {
        return;
      }

      const key = this.relationshipHistoryDateKey(rel, historyItem, historyIndex);
      const draft = String(this.relationshipDateDraftFor(key, oldDate) || '').trim();
      const parsed = this.parseTimelineDateParts(draft);
      if (!parsed) {
        this.relationshipDateErrorByKey = {
          ...(this.relationshipDateErrorByKey || {}),
          [key]: 'Use YYYY-MM-DD (negative years allowed, 00 month/day allowed).'
        };
        return;
      }

      this.relationshipDateSavingByKey = {
        ...(this.relationshipDateSavingByKey || {}),
        [key]: true
      };
      this.relationshipDateErrorByKey = {
        ...(this.relationshipDateErrorByKey || {}),
        [key]: ''
      };

      try {
        const response = await fetch(this.apiUrl('/api/relationships/set-date'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ relationshipId: relId, field: 'history', oldDate, date: draft })
        });

        let payload = null;
        try {
          payload = await response.json();
        } catch {
          payload = null;
        }

        if (!response.ok || payload?.ok === false) {
          throw new Error(String(payload?.error || `relationship-history-save-${response.status}`));
        }

        await this.loadRelationships();
        this.relationshipDateEditingKey = '';
      } catch (error) {
        this.relationshipDateErrorByKey = {
          ...(this.relationshipDateErrorByKey || {}),
          [key]: String(error?.message || 'Failed to save relationship history date.')
        };
      } finally {
        this.relationshipDateSavingByKey = {
          ...(this.relationshipDateSavingByKey || {}),
          [key]: false
        };
      }
    },
    async saveRelationshipFieldDateDirect(rel, field = 'startDate', date = '') {
      const relId = String(rel?.id || '').trim();
      const safeField = String(field || '').trim();
      const draft = String(date || '').trim();
      const parsed = this.parseTimelineDateParts(draft);
      if (!relId) {
        throw new Error('Missing relationship id.');
      }
      if (safeField !== 'startDate' && safeField !== 'splitDate') {
        throw new Error('Invalid relationship date field.');
      }
      if (!parsed) {
        throw new Error('Use YYYY-MM-DD (negative years allowed, 00 month/day allowed).');
      }

      const response = await fetch(this.apiUrl('/api/relationships/set-date'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ relationshipId: relId, field: safeField, date: draft })
      });
      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      if (!response.ok || payload?.ok === false) {
        throw new Error(String(payload?.error || `relationship-save-${response.status}`));
      }
      await this.loadRelationships();
    },
    async saveRelationshipHistoryDateDirect(rel, historyItem, historyIndex = 0, date = '') {
      const relId = String(rel?.id || '').trim();
      const oldDate = String(historyItem?.sourceDateKey || historyItem?.date || '').trim();
      const draft = String(date || '').trim();
      const parsed = this.parseTimelineDateParts(draft);
      if (!relId || !oldDate) {
        throw new Error('Missing relationship history context.');
      }
      if (!parsed) {
        throw new Error('Use YYYY-MM-DD (negative years allowed, 00 month/day allowed).');
      }

      const response = await fetch(this.apiUrl('/api/relationships/set-date'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ relationshipId: relId, field: 'history', oldDate, date: draft })
      });
      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      if (!response.ok || payload?.ok === false) {
        throw new Error(String(payload?.error || `relationship-history-save-${response.status}`));
      }
      await this.loadRelationships();
    },
    isTimelineDateEditing(event, index = 0) {
      return this.timelineDateEditingKey === this.timelineSourceEventKey(event, index);
    },
    timelineDateDraftFor(event, index = 0) {
      const key = this.timelineSourceEventKey(event, index);
      return this.timelineDateDraftByKey?.[key] || String(event?.date || '');
    },
    setTimelineDateDraft(event, index = 0, value = '') {
      const key = this.timelineSourceEventKey(event, index);
      this.timelineDateDraftByKey = {
        ...(this.timelineDateDraftByKey || {}),
        [key]: String(value || '')
      };
    },
    timelineDateErrorFor(event, index = 0) {
      const key = this.timelineSourceEventKey(event, index);
      return String(this.timelineDateErrorByKey?.[key] || '');
    },
    isTimelineDateSaving(event, index = 0) {
      const key = this.timelineSourceEventKey(event, index);
      return !!this.timelineDateSavingByKey?.[key];
    },
    openTimelineDateEditor(event, index = 0, clickEvent = null) {
      this.openDateMenuForContext(event?.date || '', clickEvent, {
        kind: 'timeline',
        event,
        index
      });
    },
    cancelTimelineDateEdit() {
      this.timelineDateEditingKey = '';
    },
    apiUrl(pathname = '') {
      const cleanPath = String(pathname || '').startsWith('/')
        ? String(pathname || '')
        : `/${String(pathname || '')}`;
      const loc = window?.location;
      const currentPort = Number((loc?.port || '').trim() || 0);
      if (currentPort === 8787) {
        return cleanPath;
      }
      return `http://localhost:8787${cleanPath}`;
    },
    refreshDatePickers() {
      if (typeof window === 'undefined' || typeof window.flatpickr !== 'function') {
        this.datePickerReady = false;
        this.datePickerInitializedCount = 0;
        return;
      }
      this.datePickerReady = true;
      const root = this.$el;
      if (!root || typeof root.querySelectorAll !== 'function') {
        this.datePickerInitializedCount = 0;
        return;
      }
      const inputs = Array.from(root.querySelectorAll('.mr-date-input'));
      this.datePickerInitializedCount = inputs.length;
      inputs.forEach((input) => {
        if (!input || input._flatpickr) {
          return;
        }
        window.flatpickr(input, {
          dateFormat: 'Y-m-d',
          allowInput: true,
          clickOpens: true,
          disableMobile: true,
          appendTo: document.body,
          positionElement: input,
          onChange: (_selectedDates, dateStr) => {
            if (typeof dateStr !== 'string') {
              return;
            }
            input.value = dateStr;
            input.dispatchEvent(new Event('input', { bubbles: true }));
          },
          onOpen: () => {
            if (input._flatpickr?.calendarContainer) {
              input._flatpickr.calendarContainer.style.zIndex = '999999';
            }
          }
        });
      });
    },
    async saveTimelineDateEdit(event, index = 0) {
      if (!this.canEditTimelineDate(event)) {
        return;
      }

      const key = this.timelineSourceEventKey(event, index);
      const sourceIndex = Number(event?.__sourceIndex);
      const draft = String(this.timelineDateDraftFor(event, index) || '').trim();
      const parsed = this.parseTimelineDateParts(draft);
      const isBirthdaySynthetic = !!event?.__birthdaySynthetic;
      const isRelationshipSynthetic = !!event?.__relationshipSynthetic;

      if (!parsed) {
        this.timelineDateErrorByKey = {
          ...(this.timelineDateErrorByKey || {}),
          [key]: 'Use YYYY-MM-DD (negative years allowed, 00 month/day allowed).'
        };
        return;
      }

      this.timelineDateSavingByKey = {
        ...(this.timelineDateSavingByKey || {}),
        [key]: true
      };
      this.timelineDateErrorByKey = {
        ...(this.timelineDateErrorByKey || {}),
        [key]: ''
      };

      try {
        let response;
        if (isBirthdaySynthetic) {
          const characterId = String(event?.__characterId || '').trim();
          response = await fetch(this.apiUrl('/api/character-core/set-birthdate'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ characterId, date: draft })
          });
        } else if (isRelationshipSynthetic) {
          const relationshipId = String(event?.__relationshipId || '').trim();
          const field = String(event?.__relationshipDateField || '').trim();
          const oldDate = String(event?.__relationshipOldDate || event?.date || '').trim();
          response = await fetch(this.apiUrl('/api/relationships/set-date'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ relationshipId, field, oldDate, date: draft })
          });
        } else {
          response = await fetch(this.apiUrl('/api/timeline/set-date'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: event.id,
              oldDate: event.date,
              oldTitle: event.title,
              newDate: draft
            })
          });
        }

        let payload = null;
        try {
          payload = await response.json();
        } catch {
          payload = null;
        }

        if (!response.ok || payload?.ok === false) {
          const scope = isBirthdaySynthetic ? 'birthday' : (isRelationshipSynthetic ? 'relationship' : 'timeline');
          throw new Error(String(payload?.error || `${scope}-save-${response.status}`));
        }

        if (isBirthdaySynthetic) {
          const coreResponse = await this.fetchCoreResponse();
          if (coreResponse?.ok) {
            const corePayload = await coreResponse.json().catch(() => ({}));
            this.characterCore = corePayload?.characters || {};
            this.repartitionRelationships();
          }
          await this.loadTimeline();
        } else if (isRelationshipSynthetic) {
          await this.loadRelationships();
        } else {
          await this.loadTimeline();
        }
        this.timelineDateEditingKey = '';
      } catch (error) {
        this.timelineDateErrorByKey = {
          ...(this.timelineDateErrorByKey || {}),
          [key]: String(error?.message || 'Failed to save timeline date.')
        };
      } finally {
        this.timelineDateSavingByKey = {
          ...(this.timelineDateSavingByKey || {}),
          [key]: false
        };
      }
    },
    async saveTimelineDateDirect(event, index = 0, date = '') {
      if (!this.canEditTimelineDate(event)) {
        throw new Error('Date cannot be edited for this event.');
      }

      const draft = String(date || '').trim();
      const parsed = this.parseTimelineDateParts(draft);
      const sourceIndex = Number(event?.__sourceIndex);
      const isBirthdaySynthetic = !!event?.__birthdaySynthetic;
      const isRelationshipSynthetic = !!event?.__relationshipSynthetic;
      if (!parsed) {
        throw new Error('Use YYYY-MM-DD (negative years allowed, 00 month/day allowed).');
      }

      let response;
      if (isBirthdaySynthetic) {
        const characterId = String(event?.__characterId || '').trim();
        response = await fetch(this.apiUrl('/api/character-core/set-birthdate'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ characterId, date: draft })
        });
      } else if (isRelationshipSynthetic) {
        const relationshipId = String(event?.__relationshipId || '').trim();
        const field = String(event?.__relationshipDateField || '').trim();
        const oldDate = String(event?.__relationshipOldDate || event?.date || '').trim();
        response = await fetch(this.apiUrl('/api/relationships/set-date'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ relationshipId, field, oldDate, date: draft })
        });
      } else {
        response = await fetch(this.apiUrl('/api/timeline/set-date'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: event.id,
            oldDate: event.date,
            oldTitle: event.title,
            newDate: draft
          })
        });
      }

      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      if (!response.ok || payload?.ok === false) {
        const scope = isBirthdaySynthetic ? 'birthday' : (isRelationshipSynthetic ? 'relationship' : 'timeline');
        throw new Error(String(payload?.error || `${scope}-save-${response.status}`));
      }

      if (isBirthdaySynthetic) {
        const coreResponse = await this.fetchCoreResponse();
        if (coreResponse?.ok) {
          const corePayload = await coreResponse.json().catch(() => ({}));
          this.characterCore = corePayload?.characters || {};
          this.repartitionRelationships();
        }
        await this.loadTimeline();
      } else if (isRelationshipSynthetic) {
        await this.loadRelationships();
      } else {
        await this.loadTimeline();
      }
    },
    clearPortraitCaches() {
      this._timelinePortraitByYearChar = {};
      this._timelinePortraitPending = new Set();
      this.timelinePortraitByEvent = {};
      this.relationshipPortraitByYearChar = {};
      this.relationshipPortraitFailedByYearChar = {};
    },
    timelineEventYear(event) {
      const parts = this.parseTimelineDateParts(event?.date);
      return parts ? parts.year : null;
    },
    timelineEventKey(event, index = 0) {
      const date = this.plainText(event?.date || '');
      const title = this.plainText(event?.title || '');
      const description = this.plainText(event?.description || '');
      const tags = Array.isArray(event?.tags) ? event.tags.map((tag) => this.plainText(tag)).join('|') : '';
      return `${date}::${title}::${description}::${tags}::${index}`;
    },
    registerTimelineEventRef(el, event, index = 0) {
      const key = this.timelineEventKey(event, index);
      if (!this._timelineEventRefs) {
        this._timelineEventRefs = {};
      }
      if (!this._timelineEventMeta) {
        this._timelineEventMeta = {};
      }
      if (!el) {
        if (this._timelineObserver) {
          const oldEl = this._timelineEventRefs[key];
          if (oldEl) {
            this._timelineObserver.unobserve(oldEl);
          }
        }
        delete this._timelineEventRefs[key];
        delete this._timelineEventMeta[key];
        return;
      }
      this._timelineEventRefs[key] = el;
      this._timelineEventMeta[key] = { event, index };

      const hasCharacterTags = this.timelineCharacterTags(event).length > 0;
      if (!hasCharacterTags) {
        return;
      }

      this.ensureTimelineObserver();
      if (this._timelineObserver) {
        this._timelineObserver.observe(el);
      } else {
        this.queueTimelinePortraitLoad(key, event);
      }
    },
    openCharacterCoreModal(characterId, referenceEventOrDate = null) {
      const id = String(characterId || '').toLowerCase().trim();
      if (!id) return;

      const isSpecialPage = ['timeline', 'demographics', 'intro', 'factions', 'recovery-note', 'notebooks-app'].includes(id);
      if (isSpecialPage) {
        this.selectEntry(id);
        return;
      }

      const core = this.characterCore?.[id] || this.entitiesRegistry?.[id] || {};

      let fullName = core['full name'] || core.label || core.name || '';
      // Autofill: if missing, or just matches ID (raw or with spaces), generate title case from ID
      const isRawId = fullName.toLowerCase() === id || fullName.toLowerCase() === id.replace(/-/g, ' ');
      if (!fullName || isRawId) {
        fullName = id
          .split('-')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
      }

      // Determine the best year for context: prioritizes referenceEventOrDate, then activeEntry, then activeYear, default to 2026
      let contextYear = null;
      if (referenceEventOrDate) {
        if (typeof referenceEventOrDate === 'object' && referenceEventOrDate.date) {
          contextYear = parseInt(referenceEventOrDate.date);
        } else if (typeof referenceEventOrDate === 'string') {
          contextYear = parseInt(referenceEventOrDate);
        }
      }
      if (!contextYear || isNaN(contextYear)) {
        contextYear = this.activeEntry?.year || parseInt(this.activeEntry?.date) || parseInt(this.activeYear) || 2026;
      }

      // Store contextYear in form data so generateRandomBirthDate can also use it
      this._lastCoreModalContextYear = contextYear;

      let birthDate = core.birthDate || core.birthday || '';
      if (!birthDate) {
        const birthYear = contextYear - 20;
        const randomMonth = Math.floor(Math.random() * 12) + 1;
        const randomDay = Math.floor(Math.random() * 28) + 1;
        birthDate = `${birthYear}-${String(randomMonth).padStart(2, '0')}-${String(randomDay).padStart(2, '0')}`;
      }

      let mode = 'character';
      let entityCategory = 'organizations';
      let redirectTarget = '';
      let isSpecial = false;

      if (this.entitiesRegistry?.[id]) {
        mode = 'entity';
        entityCategory = this.entitiesRegistry[id]._category || 'organizations';
        isSpecial = Array.isArray(this.entitiesRegistry[id].tags) && this.entitiesRegistry[id].tags.includes('special');
      } else if (this.characterCore?.[id]?.redirect) {
        mode = 'redirect';
        redirectTarget = this.characterCore[id].redirect;
      }

      let defaultDeath = '';
      if (referenceEventOrDate) {
        if (typeof referenceEventOrDate === 'object' && referenceEventOrDate.date) {
          defaultDeath = referenceEventOrDate.date;
        } else if (typeof referenceEventOrDate === 'string') {
          defaultDeath = referenceEventOrDate;
        }
      }
      if (!defaultDeath) {
        defaultDeath = this.activeEntry?.date || '';
      }
      if (!defaultDeath && /^\d{4}$/.test(String(this.activeYear || '').trim())) {
        defaultDeath = `${String(this.activeYear).trim()}-01-01`;
      }
      this._defaultCoreModalDeathDate = defaultDeath;

      let groups = core.groups || [];
      if (typeof groups === 'string') {
        groups = [groups];
      }
      const groupsArray = Array.isArray(groups) ? [...groups] : [];

      let ageAtEntry = '';
      if (birthDate) {
        const bYear = parseInt(birthDate, 10);
        if (!isNaN(bYear) && contextYear) {
          ageAtEntry = String(contextYear - bYear);
        }
      }

      this.characterCoreFormData = {
        characterId: id,
        newCharacterId: id,
        mode: mode,
        entityCategory: entityCategory,
        redirectTarget: redirectTarget,
        'full name': fullName,
        birthDate: birthDate,
        ageAtEntry: ageAtEntry,
        contextYear: contextYear,
        deathDate: core.deathDate || '',
        gender: core.gender || '',
        ethnicity: core.ethnicity || '',
        nationality: core.nationality && core.nationality !== 'unknown' ? core.nationality : 'american',
        navGroup: core.navGroup && core.navGroup !== 'unknown' ? core.navGroup : 'Extended Cast',
        iconKey: core.iconKey || core.icon || 'users',
        isSpecial: isSpecial,
        groups: groupsArray,
        newGroupInput: ''
      };
      this.characterCoreSaveError = '';
      this.characterCoreSaving = false;
      this.selectedMiscPortraitFile = null;
      if (this.miscPortraitPreviewUrl) {
        URL.revokeObjectURL(this.miscPortraitPreviewUrl);
      }
      this.miscPortraitPreviewUrl = '';
      this.miscPortraitUploading = false;
      this.miscPortraitUploadSuccess = false;
      this.miscPortraitUploadError = '';
      this.activeDateTab = 'birth';
      this.deleteConfirmationOpen = false;
      this.characterCoreModalOpen = true;
    },
    addCharacterGroupTag(event) {
      if (!this.characterCoreFormData) return;
      let val = event ? String(event.target.value || '').trim() : String(this.characterCoreFormData.newGroupInput || '').trim();
      if (val.endsWith(',')) {
        val = val.slice(0, -1).trim();
      }
      if (val) {
        if (!this.characterCoreFormData.groups) {
          this.characterCoreFormData.groups = [];
        }
        if (!this.characterCoreFormData.groups.includes(val)) {
          this.characterCoreFormData.groups.push(val);
        }
        this.characterCoreFormData.newGroupInput = '';
        if (event) {
          event.target.value = '';
        }
      }
    },
    onMiscPortraitFileChange(event) {
      const file = event.target.files?.[0];
      if (this.miscPortraitPreviewUrl) {
        URL.revokeObjectURL(this.miscPortraitPreviewUrl);
      }
      if (file) {
        this.selectedMiscPortraitFile = file;
        this.miscPortraitPreviewUrl = URL.createObjectURL(file);
      } else {
        this.selectedMiscPortraitFile = null;
        this.miscPortraitPreviewUrl = '';
      }
      this.miscPortraitUploadSuccess = false;
      this.miscPortraitUploadError = '';
    },
    onCoreModalPaste(event) {
      const items = event.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            if (this.miscPortraitPreviewUrl) {
              URL.revokeObjectURL(this.miscPortraitPreviewUrl);
            }
            this.selectedMiscPortraitFile = file;
            this.miscPortraitPreviewUrl = URL.createObjectURL(file);
            this.miscPortraitUploadSuccess = false;
            this.miscPortraitUploadError = '';
            event.preventDefault();
            break;
          }
        }
      }
    },
    async uploadMiscPortrait() {
      if (!this.selectedMiscPortraitFile || !this.characterCoreFormData?.characterId) return;
      this.miscPortraitUploading = true;
      this.miscPortraitUploadError = '';
      this.miscPortraitUploadSuccess = false;

      try {
        const file = this.selectedMiscPortraitFile;
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result;
            const base64Str = result.substring(result.indexOf(',') + 1);
            resolve(base64Str);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        const response = await fetch(`${this.backendOrigin()}/api/portraits/upload-misc`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            characterId: this.characterCoreFormData.characterId,
            fileName: file.name || 'pasted_image.png',
            mimeType: file.type || 'image/png',
            dataBase64: base64
          })
        });

        const result = await response.json();
        if (!result.ok) {
          throw new Error(result.error || 'Failed to upload image');
        }

        this.miscPortraitUploadSuccess = true;
        this.selectedMiscPortraitFile = null;
        if (this.miscPortraitPreviewUrl) {
          URL.revokeObjectURL(this.miscPortraitPreviewUrl);
        }
        this.miscPortraitPreviewUrl = '';

        // Clear the file input element's value
        const fileInput = document.querySelector('input[type="file"][accept="image/*"]');
        if (fileInput) fileInput.value = '';

        if (typeof this.loadPortraitManifest === 'function') {
          await this.loadPortraitManifest();
        }
      } catch (err) {
        this.miscPortraitUploadError = err.message;
      } finally {
        this.miscPortraitUploading = false;
      }
    },
    generateRandomBirthDate() {
      const currentYear = this.characterCoreFormData.contextYear || this.activeEntry?.year || parseInt(this.activeEntry?.date) || parseInt(this.activeYear) || 2026;
      const birthYear = currentYear - 20;
      const randomMonth = Math.floor(Math.random() * 12) + 1;
      const randomDay = Math.floor(Math.random() * 28) + 1;
      this.characterCoreFormData.birthDate = `${birthYear}-${String(randomMonth).padStart(2, '0')}-${String(randomDay).padStart(2, '0')}`;
      this.characterCoreFormData.ageAtEntry = String(currentYear - birthYear);
    },
    onBirthDateInput(event) {
      const dateVal = String(event.target.value || '').trim();
      this.characterCoreFormData.birthDate = dateVal;
      
      const bYear = parseInt(dateVal, 10);
      const contextYear = this.characterCoreFormData.contextYear || parseInt(this.activeYear) || 2026;
      if (!isNaN(bYear) && contextYear) {
        this.characterCoreFormData.ageAtEntry = String(contextYear - bYear);
      } else {
        this.characterCoreFormData.ageAtEntry = '';
      }
    },
    onAgeAtEntryInput(event) {
      const ageVal = String(event.target.value || '').trim();
      if (!ageVal) {
        this.characterCoreFormData.birthDate = '';
        this.characterCoreFormData.ageAtEntry = '';
        return;
      }
      const age = parseInt(ageVal, 10);
      if (isNaN(age)) {
        this.characterCoreFormData.ageAtEntry = ageVal;
        return;
      }

      const contextYear = this.characterCoreFormData.contextYear || parseInt(this.activeYear) || 2026;
      const birthYear = contextYear - age;

      // Keep existing month/day if present (YYYY-MM-DD)
      let monthDay = '01-01';
      const currentBirth = String(this.characterCoreFormData.birthDate || '').trim();
      const match = currentBirth.match(/^\d{4}-(\d{2}-\d{2})$/);
      if (match) {
        monthDay = match[1];
      }

      this.characterCoreFormData.birthDate = `${birthYear}-${monthDay}`;
      this.characterCoreFormData.ageAtEntry = ageVal;
    },
    generateDefaultBirthDate() {
      this.characterCoreFormData.birthDate = this._defaultCoreModalDeathDate || '';
    },
    generateDefaultDeathDate() {
      this.characterCoreFormData.deathDate = this._defaultCoreModalDeathDate || '';
    },
    generateRandomDeathDate() {
      let baseYear = null;
      if (this.characterCoreFormData.birthDate) {
        const parsed = parseInt(this.characterCoreFormData.birthDate);
        if (!isNaN(parsed)) {
          baseYear = parsed;
        }
      }
      if (!baseYear) {
        const contextYear = this.characterCoreFormData.contextYear || this.activeEntry?.year || parseInt(this.activeEntry?.date) || parseInt(this.activeYear) || 2026;
        baseYear = contextYear - 20;
      }
      const lifespan = 65 + Math.floor(Math.random() * 28);
      const deathYear = baseYear + lifespan;
      const randomMonth = Math.floor(Math.random() * 12) + 1;
      const randomDay = Math.floor(Math.random() * 28) + 1;
      this.characterCoreFormData.deathDate = `${deathYear}-${String(randomMonth).padStart(2, '0')}-${String(randomDay).padStart(2, '0')}`;
    },
    closeCharacterCoreModal() {
      this.characterCoreModalOpen = false;
      this.deleteConfirmationOpen = false;
      if (this.miscPortraitPreviewUrl) {
        URL.revokeObjectURL(this.miscPortraitPreviewUrl);
        this.miscPortraitPreviewUrl = '';
      }
    },
    async saveCharacterCore() {
      this.characterCoreSaving = true;
      this.characterCoreSaveError = '';
      const oldId = this.characterCoreFormData.characterId;
      const newId = String(this.characterCoreFormData.newCharacterId || '').toLowerCase().trim();
      const mode = this.characterCoreFormData.mode;
      try {
        if (!newId) {
          throw new Error('ID (System Key) cannot be empty.');
        }
        if (!/^[a-z0-9-]+$/.test(newId)) {
          throw new Error('ID must contain only lowercase letters, numbers, and hyphens.');
        }

        // If ID changed, call the rename endpoint first
        if (newId !== oldId) {
          const renameRes = await fetch(`${this.backendOrigin()}/api/character-core/rename`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ oldId, newId })
          });
          const renameData = await renameRes.json();
          if (!renameData.ok) {
            throw new Error(renameData.error || 'Failed to rename character/entity ID.');
          }
        }

        // If a new portrait is staged, auto-upload it first
        if (this.selectedMiscPortraitFile) {
          const file = this.selectedMiscPortraitFile;
          const base64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const result = reader.result;
              const base64Str = result.substring(result.indexOf(',') + 1);
              resolve(base64Str);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });

          const uploadResponse = await fetch(`${this.backendOrigin()}/api/portraits/upload-misc`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              characterId: newId,
              fileName: file.name || 'pasted_image.png',
              mimeType: file.type || 'image/png',
              dataBase64: base64
            })
          });

          const uploadResult = await uploadResponse.json();
          if (!uploadResult.ok) {
            throw new Error(uploadResult.error || 'Failed to auto-upload staged portrait');
          }

          this.selectedMiscPortraitFile = null;
          if (this.miscPortraitPreviewUrl) {
            URL.revokeObjectURL(this.miscPortraitPreviewUrl);
          }
          this.miscPortraitPreviewUrl = '';
        }

        if (this.characterCoreFormData.newGroupInput) {
          this.addCharacterGroupTag();
        }

        const payload = {
          characterId: newId,
          mode: mode,
          updateData: {
            mode: mode,
            'full name': this.characterCoreFormData['full name'],
            birthDate: this.characterCoreFormData.birthDate,
            deathDate: this.characterCoreFormData.deathDate,
            gender: this.characterCoreFormData.gender,
            ethnicity: this.characterCoreFormData.ethnicity,
            nationality: this.characterCoreFormData.nationality,
            navGroup: this.characterCoreFormData.navGroup,
            iconKey: this.characterCoreFormData.iconKey,
            entityCategory: this.characterCoreFormData.entityCategory,
            redirectTarget: this.characterCoreFormData.redirectTarget,
            isSpecial: this.characterCoreFormData.isSpecial,
            groups: this.characterCoreFormData.groups || []
          }
        };

        const response = await fetch(`${this.backendOrigin()}/api/character-core/upsert`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (!data.ok) {
          throw new Error(data.error || 'Unknown error saving character/entity core');
        }

        // Optimistically update frontend core caches
        if (mode === 'character' || mode === 'redirect') {
          if (!this.characterCore) this.characterCore = {};
          this.characterCore[newId] = data.character;
          if (this.entitiesRegistry) {
            delete this.entitiesRegistry[newId];
          }
          if (newId !== oldId) {
            delete this.characterCore[oldId];
          }
        } else if (mode === 'entity') {
          if (!this.entitiesRegistry) this.entitiesRegistry = {};
          this.entitiesRegistry[newId] = {
            ...data.entity,
            _category: data.category
          };
          if (this.characterCore) {
            delete this.characterCore[newId];
          }
          if (newId !== oldId) {
            delete this.entitiesRegistry[oldId];
          }
        }

        // If renamed, reload the timeline data & catalog
        if (newId !== oldId) {
          if (this.activeEntryId === oldId) {
            this.activeEntryId = newId;
          }
          await this.loadTimeline();
          await this.loadCatalog(this.activeYear);
        }

        this.closeCharacterCoreModal();
      } catch (err) {
        this.characterCoreSaveError = err.message;
      } finally {
        this.characterCoreSaving = false;
      }
    },
    async confirmDeleteCharacterCore() {
      if (!this.characterCoreFormData || !this.characterCoreFormData.characterId) return;
      const id = this.characterCoreFormData.characterId;
      const label = this.characterCoreFormData['full name'] || id;

      this.characterCoreSaving = true;
      this.characterCoreSaveError = '';

      try {
        const response = await fetch(`${this.backendOrigin()}/api/character-core/delete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ characterId: id })
        });
        const data = await response.json();
        if (!data.ok) {
          throw new Error(data.error || 'Failed to delete character/entity.');
        }

        // Optimistically clean up from local caches
        if (this.characterCore) {
          delete this.characterCore[id];
        }
        if (this.entitiesRegistry) {
          delete this.entitiesRegistry[id];
        }

        this.closeCharacterCoreModal();
        
        // Notify the user or trigger refresh
        alert(`Successfully deleted "${label}" and cleaned all occurrences from timeline files.`);
        
        // Trigger timeline refresh
        await this.loadTimeline();
        await this.loadCatalog(this.activeYear);
      } catch (err) {
        this.characterCoreSaveError = err.message || 'Error deleting character/entity.';
      } finally {
        this.characterCoreSaving = false;
      }
    },
    toggleDemographicsSelection(characterId) {
      const id = String(characterId || '').toLowerCase().trim();
      const idx = this.demographicsSelectedCharacters.indexOf(id);
      if (idx > -1) {
        this.demographicsSelectedCharacters.splice(idx, 1);
      } else {
        this.demographicsSelectedCharacters.push(id);
      }
    },
    isDemographicsSelected(characterId) {
      return this.demographicsSelectedCharacters.includes(String(characterId || '').toLowerCase().trim());
    },
    openCharacterInTimeline(characterId) {
      const id = String(characterId || '').toLowerCase().trim();
      if (!id) return;
      this.selectEntry('timeline');
      this.timelineActiveTags = [id];
      this.closeCharacterCoreModal();
    },
    selectMissingDemographics(mode) {
      if (mode === 'all') {
        const visibleIds = (this.filteredIncompleteDemographics || []).map(c => c.id);
        this.demographicsSelectedCharacters = Array.from(new Set([
          ...this.demographicsSelectedCharacters,
          ...visibleIds
        ]));
      } else if (mode === 'none') {
        this.demographicsSelectedCharacters = [];
      }
    },
    openDemographicsBulkEditModal() {
      this.demographicsBulkFormData = {
        updateGender: false,
        updateEthnicity: false,
        updateNationality: false,
        updateNavGroup: false,
        updateGroups: false,
        gender: '',
        ethnicity: '',
        nationality: '',
        navGroup: '',
        groups: [],
        newGroupInput: ''
      };
      this.demographicsBulkSaveError = '';
      this.demographicsBulkSaving = false;
      this.demographicsBulkEditOpen = true;
    },
    closeDemographicsBulkEditModal() {
      this.demographicsBulkEditOpen = false;
    },
    addBulkGroupTag(event) {
      if (!this.demographicsBulkFormData) return;
      let val = event ? String(event.target.value || '').trim() : String(this.demographicsBulkFormData.newGroupInput || '').trim();
      if (val.endsWith(',')) {
        val = val.slice(0, -1).trim();
      }
      if (val) {
        if (!this.demographicsBulkFormData.groups) {
          this.demographicsBulkFormData.groups = [];
        }
        if (!this.demographicsBulkFormData.groups.includes(val)) {
          this.demographicsBulkFormData.groups.push(val);
        }
        this.demographicsBulkFormData.newGroupInput = '';
        if (event) {
          event.target.value = '';
        }
      }
    },
    async saveDemographicsBulkEdit() {
      if (!this.demographicsSelectedCharacters.length) return;
      this.demographicsBulkSaving = true;
      this.demographicsBulkSaveError = '';

      const updates = {};
      if (this.demographicsBulkFormData.updateGender) {
        updates.gender = this.demographicsBulkFormData.gender;
      }
      if (this.demographicsBulkFormData.updateEthnicity) {
        updates.ethnicity = this.demographicsBulkFormData.ethnicity;
      }
      if (this.demographicsBulkFormData.updateNationality) {
        updates.nationality = this.demographicsBulkFormData.nationality;
      }
      if (this.demographicsBulkFormData.updateNavGroup) {
        updates.navGroup = this.demographicsBulkFormData.navGroup;
      }
      if (this.demographicsBulkFormData.updateGroups) {
        updates.groups = this.demographicsBulkFormData.groups || [];
      }

      try {
        const response = await fetch(`${this.backendOrigin()}/api/character-core/bulk-upsert`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            characterIds: this.demographicsSelectedCharacters,
            updates
          })
        });

        const data = await response.json();
        if (!data.ok) {
          throw new Error(data.error || 'Failed to save bulk updates');
        }

        // Optimistically update frontend core caches
        if (data.updatedCharacters && this.characterCore) {
          const nextCore = { ...this.characterCore };
          Object.entries(data.updatedCharacters).forEach(([id, char]) => {
            nextCore[id] = char;
          });
          this.characterCore = nextCore;
        }

        this.demographicsSelectedCharacters = [];
        this.closeDemographicsBulkEditModal();
      } catch (err) {
        this.demographicsBulkSaveError = err.message;
      } finally {
        this.demographicsBulkSaving = false;
      }
    },
    deleteDemographicsSelectedCharacters() {
      console.log('deleteDemographicsSelectedCharacters called, selection:', this.demographicsSelectedCharacters);
      if (!this.demographicsSelectedCharacters.length) {
        console.warn('deleteDemographicsSelectedCharacters: no characters selected');
        return;
      }
      const count = this.demographicsSelectedCharacters.length;

      this.openConfirmModal({
        title: 'Delete Selected Characters',
        body: `Are you sure you want to permanently delete the ${count} selected characters? This will remove them from core.json and cannot be undone.`,
        confirmLabel: 'Delete',
        cancelLabel: 'Cancel',
        onConfirm: async () => {
          this.demographicsBulkSaving = true;
          this.demographicsBulkSaveError = '';

          try {
            console.log('fetch POST to /api/character-core/bulk-delete with:', this.demographicsSelectedCharacters);
            const response = await fetch(`${this.backendOrigin()}/api/character-core/bulk-delete`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                characterIds: this.demographicsSelectedCharacters
              })
            });

            const data = await response.json();
            console.log('bulk-delete response:', data);
            if (!data.ok) {
              throw new Error(data.error || 'Failed to delete selected characters');
            }

            // Optimistically remove from frontend core cache
            if (this.characterCore) {
              const nextCore = { ...this.characterCore };
              this.demographicsSelectedCharacters.forEach((id) => {
                delete nextCore[id];
              });
              this.characterCore = nextCore;
            }

            this.demographicsSelectedCharacters = [];
            this.closeDemographicsBulkEditModal();
          } catch (err) {
            this.demographicsBulkSaveError = err.message;
            console.error('deleteDemographicsSelectedCharacters error:', err);
            alert(`Error deleting characters: ${err.message}`);
          } finally {
            this.demographicsBulkSaving = false;
          }
        }
      });
    },
    toggleDemographicsChartFilter(field, value) {
      const f = String(field || '').toLowerCase().trim();
      const v = String(value || '').toLowerCase().trim();
      
      let targetArr = null;
      if (f === 'gender') targetArr = this.demographicsSelectedGenders;
      else if (f === 'ethnicity') targetArr = this.demographicsSelectedEthnicities;
      else if (f === 'nationality') targetArr = this.demographicsSelectedNationalities;
      
      if (targetArr) {
        const idx = targetArr.indexOf(v);
        if (idx > -1) {
          targetArr.splice(idx, 1);
        } else {
          targetArr.push(v);
        }
      }
    },
    isDemographicsChartFilterActive(field, value) {
      const f = String(field || '').toLowerCase().trim();
      const v = String(value || '').toLowerCase().trim();
      if (f === 'gender') return this.demographicsSelectedGenders.includes(v);
      if (f === 'ethnicity') return this.demographicsSelectedEthnicities.includes(v);
      if (f === 'nationality') return this.demographicsSelectedNationalities.includes(v);
      return false;
    },
    clearDemographicsChartFilter() {
      this.demographicsSelectedGenders = [];
      this.demographicsSelectedEthnicities = [];
      this.demographicsSelectedNationalities = [];
      this.demographicsSelectedPortraits = [];
      this.demographicsSelectedGroups = [];
    },
    getCharacterPortraitThumbnail(characterId) {
      const id = String(characterId || '').toLowerCase().trim();
      if (this.portraitManifest && this.portraitManifest[id] && this.portraitManifest[id].length > 0) {
        const prefix = this.portraitPrefix || 'portraits';
        return `${prefix}/${id}/${this.portraitManifest[id][0]}`;
      }
      return '';
    },
    async generateDemographicsSuggestions() {
      this.demographicsSuggestionsLoading = true;
      this.demographicsSuggestionsError = '';
      this.demographicsSuggestions = [];
      
      try {
        const response = await fetch(`${this.backendOrigin()}/api/character-core/suggest`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            count: this.demographicsGeneratorCount,
            equitable: this.demographicsGeneratorEquitable
          })
        });
        
        const data = await response.json();
        if (!data.ok) {
          throw new Error(data.error || 'Failed to generate suggestions');
        }
        
        this.demographicsSuggestions = data.suggestions || [];
      } catch (err) {
        this.demographicsSuggestionsError = err.message;
        console.error('generateDemographicsSuggestions error:', err);
      } finally {
        this.demographicsSuggestionsLoading = false;
      }
    },
    openThemeCustomizer() {
      this.themeCustomizerTargetYear = this.activeYear || 'default';
      this.themeCustomizerOpen = true;
      this.loadThemeCustomizerData();
    },
    loadThemeCustomizerData() {
      const year = this.themeCustomizerTargetYear;
      const theme = this.yearThemes[year] || {};
      const vars = theme.vars || {};
      const fallbackVars = this.yearThemes.default?.vars || {};

      const data = {};
      const allKeys = [...this.themeCustomizerColors, ...this.themeCustomizerFonts];
      allKeys.forEach((key) => {
        let val = vars[key] || fallbackVars[key] || '';
        if (!val) {
          val = document.documentElement.style.getPropertyValue(key) || '';
        }
        data[key] = String(val).trim();
      });
      this.themeCustomizerData = data;
      this.themeCustomizerOriginalData = { ...data };
    },
    previewThemeChange(key, value) {
      if (key && typeof value === 'string') {
        document.documentElement.style.setProperty(key, value);
      }
    },
    closeThemeCustomizer(isSaved) {
      if (!isSaved) {
        Object.keys(this.themeCustomizerOriginalData).forEach((key) => {
          const val = this.themeCustomizerOriginalData[key];
          if (val) {
            document.documentElement.style.setProperty(key, val);
          } else {
            document.documentElement.style.removeProperty(key);
          }
        });
        this.applyYearTheme(this.activeYear);
      }
      this.themeCustomizerOpen = false;
    },
    async saveThemeCustomizer() {
      const year = this.themeCustomizerTargetYear;
      const yearThemes = JSON.parse(JSON.stringify(this.yearThemes || {}));

      if (!yearThemes[year]) {
        yearThemes[year] = { styleKey: 'custom', vars: {} };
      }
      if (!yearThemes[year].vars) {
        yearThemes[year].vars = {};
      }

      Object.keys(this.themeCustomizerData).forEach((key) => {
        const val = this.themeCustomizerData[key];
        if (val) {
          yearThemes[year].vars[key] = val;
        } else {
          delete yearThemes[year].vars[key];
        }
      });

      if (Object.keys(yearThemes[year].vars).length === 0) {
        delete yearThemes[year];
      }

      try {
        const res = await fetch(`${this.backendOrigin()}/api/year-themes/update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(yearThemes)
        });
        const payload = await res.json();
        if (payload.ok) {
          this.yearThemes = yearThemes;
          this.closeThemeCustomizer(true);
          this.applyYearTheme(this.activeYear);
        } else {
          alert('Failed to save theme: ' + (payload.error || 'Unknown error'));
        }
      } catch (e) {
        alert('Error saving theme: ' + e.message);
      }
    },
    async resetThemeToDefault() {
      const year = this.themeCustomizerTargetYear;
      if (year === 'default') {
        alert('Cannot reset the default theme itself.');
        return;
      }
      if (!confirm(`Are you sure you want to reset the theme for Year ${year} to the default theme?`)) {
        return;
      }
      
      const yearThemes = JSON.parse(JSON.stringify(this.yearThemes || {}));
      delete yearThemes[year];

      try {
        const res = await fetch(`${this.backendOrigin()}/api/year-themes/update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(yearThemes)
        });
        const payload = await res.json();
        if (payload.ok) {
          this.yearThemes = yearThemes;
          this.themeCustomizerOpen = false;
          this.applyYearTheme(this.activeYear);
        } else {
          alert('Failed to reset theme: ' + (payload.error || 'Unknown error'));
        }
      } catch (e) {
        alert('Error resetting theme: ' + e.message);
      }
    }
  });
})(window);
