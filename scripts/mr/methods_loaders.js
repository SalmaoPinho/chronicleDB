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
    ICON_SYMBOLS
  } = global.MR_CONSTANTS || {};
  const MediaUtils = global.ProjectMediaUtils || {};
  const NOTEBOOK_SFX_MAP = {
    'punch': 'sfx/punch.wav',
    'kick': 'sfx/punch.wav',
    'thud': 'sfx/thud.wav',
    'bash': 'sfx/bash.wav',
    'unsheathe': 'sfx/unsheathe.ogg',
    'whoosh': 'sfx/whoosh.wav',
    'sword': 'sfx/unsheathe.ogg',
    'clash': 'sfx/bash.wav'
  };

  global.MR_METHODS = global.MR_METHODS || {};
  Object.assign(global.MR_METHODS, {
    async loadCharacterStats() {
      try {
        const res = await fetch(`${this.backendOrigin()}/story/character_stats.json?t=${Date.now()}`, { cache: 'no-store' });
        if (res.ok) {
          this.characterStats = await res.json();
        }
      } catch (e) {
        console.warn('MR: failed to load character stats', e);
      }
    },
    async loadTimeline() {
      this.timelineLoading = true;
      this.timelineError = '';
      try {
        const response = await fetch(`${this.backendOrigin()}/api/timeline?t=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`timeline ${response.status}`);
        }
        const payload = await response.json();
        const baseEvents = Array.isArray(payload)
          ? payload.map((event, idx) => ({
            ...event,
            __sourceIndex: event.__sourceIndex ?? idx,
            __synthetic: event.__synthetic ?? false
          }))
          : [];
        const merged = this.timelineEventsWithBirthdays(baseEvents);
        merged.forEach(ev => {
          ev.plainTitle = this.plainText(ev.title || 'Untitled Event');
          ev.plainDescription = this.plainText(ev.description || '');
        });
        this.timelineEvents = merged;
        this.timelinePortraitByEvent = {};
        this.$nextTick(() => this.observeVisibleTimelineEvents());
      } catch (error) {
        this.timelineEvents = [];
        this.timelineError = 'Data source is empty or unreachable. Please verify timeline Markdown files exist in the story directory.';
        console.warn('MR Vue: timeline unavailable.', error);
      } finally {
        this.timelineLoading = false;
      }
    },
    async loadNotebooks() {
      this.notebooksLoading = true;
      this.notebooksError = '';
      try {
        const response = await fetch(`${this.backendOrigin()}/story/notebooks/manifest.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`notebooks manifest ${response.status}`);
        }
        const payload = await response.json();
        const manifestNotebooks = Array.isArray(payload?.notebooks) ? payload.notebooks : [];

        // Markdown Parser Helper
        const parseMarkdownBlocks = (content) => {
          const lines = content.split('\n');
          let restOfFile = []; let i = 0;
          const yamlData = {};
          if (lines[0] && lines[0].trim() === '---') {
            i = 1;
            for (; i < lines.length; i++) {
              const line = lines[i].trim();
              if (line === '---') { i++; break; }
              const colonIdx = line.indexOf(':');
              if (colonIdx > -1) {
                const k = line.slice(0, colonIdx).trim();
                let v = line.slice(colonIdx + 1).trim();
                if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
                yamlData[k] = v;
              }
            }
          }
          for (; i < lines.length; i++) restOfFile.push(lines[i]);
          const entries = []; let currentEntry = null; let currentBlocksBuffer = [];
          const flushBlocksBuffer = () => {
            if (!currentEntry) return;
            let chunk = currentBlocksBuffer.join('\n').trim();
            currentBlocksBuffer = [];
            if (!chunk) return;
            if (chunk.startsWith(':::')) {
              const clines = chunk.split('\n');
              const firstLine = clines.shift().slice(3).trim();
              if (clines.length > 0 && clines[clines.length - 1].trim() === ':::') clines.pop();
              const innerContent = clines.join('\n').trim();
              const block = { type: 'p' };
              const attrs = firstLine.split('|').map(s => s.trim());
              attrs.forEach(attr => {
                const colonIdx = attr.indexOf(':');
                if (colonIdx > -1) block[attr.slice(0, colonIdx).trim()] = attr.slice(colonIdx + 1).trim();
              });
              if (innerContent.startsWith('ROWS:')) {
                try { block.rows = JSON.parse(innerContent.slice(5).trim()); } catch (e) { block.rows = []; }
              } else if (innerContent) {
                block.content = innerContent;
              }
              currentEntry.blocks.push(block);
            } else {
              currentEntry.blocks.push({ type: 'p', content: chunk });
            }
          };
          let inBlock = false; let blockLines = [];
          restOfFile.forEach(line => {
            const tline = line.trim();
            if (tline.startsWith('# Entry:')) {
              if (inBlock) { currentBlocksBuffer.push(blockLines.join('\n')); flushBlocksBuffer(); inBlock = false; blockLines = []; }
              else flushBlocksBuffer();
              currentEntry = { id: tline.slice(8).trim(), date: '', title: '', blocks: [] };
              entries.push(currentEntry);
            } else if (currentEntry && line.startsWith('> Date:')) {
              currentEntry.date = tline.slice('> Date:'.length).trim();
            } else if (currentEntry && line.startsWith('> Title:')) {
              currentEntry.title = tline.slice('> Title:'.length).replace(/<br>/g, '\n').trim();
            } else {
              // If no entry found yet but we have content, auto-create one from YAML
              if (!currentEntry && tline !== '') {
                currentEntry = { 
                  id: yamlData.id || 'entry-1', 
                  date: yamlData.date || '', 
                  title: yamlData.title || 'Journal', 
                  blocks: [] 
                };
                entries.push(currentEntry);
              }
              
              if (currentEntry) {
                if (tline.startsWith(':::') && !inBlock) {
                  if (blockLines.length > 0) { currentBlocksBuffer.push(blockLines.join('\n')); flushBlocksBuffer(); blockLines = []; }
                  inBlock = true; blockLines.push(line);
                } else if (tline.startsWith(':::') && inBlock) {
                  blockLines.push(line); currentBlocksBuffer.push(blockLines.join('\n')); flushBlocksBuffer(); inBlock = false; blockLines = [];
                } else if (tline === '' && !inBlock) {
                  if (blockLines.length > 0) { currentBlocksBuffer.push(blockLines.join('\n')); flushBlocksBuffer(); blockLines = []; }
                } else {
                  blockLines.push(line);
                }
              }
            }
          });
          if (blockLines.length > 0) currentBlocksBuffer.push(blockLines.join('\n'));
          flushBlocksBuffer();
          return { entries, yamlData };
        };

        // Fetch explicitly in parallel
        const nbs = await Promise.all(manifestNotebooks.map(async (nb) => {
          try {
            const filename = nb.filename || `nb_${nb.id.replace(/[^a-zA-Z0-9_-]/g, '_')}.md`;
            const res = await fetch(`${this.backendOrigin()}/story/notebooks/${filename}?t=${Date.now()}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const mdText = await res.text();
            const { entries, yamlData } = parseMarkdownBlocks(mdText);
            nb.entries = entries;
            Object.assign(nb, yamlData);
            return nb;
          } catch (err) {
            console.warn('MR Vue: failed to fetch notebook md', nb.id, err);
            nb.entries = [];
            return nb;
          }
        }));

        this.notebooks = nbs;
        if (this.notebooks.length && !this.activeNotebookId) {
          this.activeNotebookId = String(this.notebooks[0]?.id || '');
        }
        if (this.pageReaderUiVisible) {
          this.$nextTick(() => this.initPageReader());
        }
      } catch (error) {
        this.notebooks = [];
        this.notebooksError = 'Notebook archive unavailable.';
        console.warn('MR Vue: notebook archive unavailable.', error);
      } finally {
        this.notebooksLoading = false;
      }
    },
    async loadNotebookTimelineLinks() {
      // Legacy JSON notebook links removed. Links are now handled dynamically.
      this.notebookTimelineLinks = {};
    },
    async loadRelationshipTree() {
      // The Relationship Tree is now dynamically computed from the relationships array.
      this.relationshipTreeLoading = false;
      this.relationshipTree = [];
    },
    async loadRelationships() {
      this.relationshipsLoading = true;
      this.relationshipsError = '';
      try {
        const response = await fetch(`${this.backendOrigin()}/api/relationships?t=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`relationships ${response.status}`);
        }
        const rows = await response.json();

        this.relationships = rows
          .filter((row) => row && typeof row === 'object')
          .map((row, idx) => ({
            id: String(row.id || `relationship-${idx + 1}`),
            label: String(row.label || row.id || `Relationship ${idx + 1}`),
            type: String(row.type || '').trim(),
            startDate: String(row.startDate || '').trim(),
            splitDate: String(row.splitDate || '').trim(),
            tags: Array.isArray(row.tags) ? row.tags.map((t) => String(t || '').toLowerCase().trim()).filter(Boolean) : [],
            members: Array.isArray(row.members) && row.members.length ? row.members.map((id) => String(id || '').toLowerCase().trim()).filter(Boolean) : (Array.isArray(row.tags) ? row.tags.map((id) => String(id || '').toLowerCase().trim()).filter(Boolean) : []),
            children: Array.isArray(row.children) ? row.children.map((id) => String(id || '').toLowerCase().trim()).filter(Boolean) : [],
            notes: String(row.notes || row['core-note'] || '').trim(),
            history: row.history && typeof row.history === 'object' ? row.history : {},
            __source: row.__source || ''
          }));

        this.relationshipPortraitByYearChar = {};
        this.relationshipPortraitFailedByYearChar = {};
        if (this.characterCore && Object.keys(this.characterCore).length) {
          this.repartitionRelationships();
          await this.loadTimeline();
        }
      } catch (error) {
        this.relationships = [];
        this.relationshipsError = 'Relationship map unavailable.';
        console.warn('MR Vue: relationship map unavailable.', error);
      } finally {
        this.relationshipsLoading = false;
      }
    },
    repartitionRelationships() {
      if (!Array.isArray(this.relationships) || !this.relationships.length) return;
      const characters = this.characterCore || {};
      const parseBirthYear = (birthDateStr, birthdayStr) => {
        if (birthDateStr) {
          const match = String(birthDateStr).match(/^(\d{4})/);
          if (match) return parseInt(match[1], 10);
        }
        if (birthdayStr) {
          const match = String(birthdayStr).match(/\b(19\d{2}|20\d{2})\b/);
          if (match) return parseInt(match[1], 10);
        }
        return null;
      };

      this.relationships.forEach(rel => {
        const type = String(rel.type || '').toLowerCase().trim();
        const label = String(rel.label || '').trim();
        const tags = Array.isArray(rel.tags) ? rel.tags : [];

        // If members are empty but tags are present, partition them dynamically using birth dates.
        const parentsEmpty = !rel.members || !rel.members.length;
        const childrenEmpty = !rel.children || !rel.children.length;
        if (parentsEmpty && childrenEmpty && tags.length > 0) {
          if (type === 'family') {
            const labelLower = label.toLowerCase();
            const isSiblingGroup = labelLower.includes('sibling') ||
                                   labelLower.includes('sister') ||
                                   labelLower.includes('brother') ||
                                   labelLower.includes('twin') ||
                                   labelLower.includes('cousin');

            const info = tags.map(tag => {
              const char = characters[tag.toLowerCase()];
              return {
                tag,
                year: char ? parseBirthYear(char.birthDate, char.birthday) : null
              };
            });

            const known = info.filter(x => x.year !== null).sort((a, b) => a.year - b.year);
            const unknown = info.filter(x => x.year === null);

            let parents = [];
            let children = [];

            if (known.length >= 2) {
              let maxGap = 0;
              let gapIndex = -1;
              for (let i = 0; i < known.length - 1; i++) {
                const gap = known[i + 1].year - known[i].year;
                if (gap > maxGap) {
                  maxGap = gap;
                  gapIndex = i;
                }
              }

              if (maxGap >= 8 && gapIndex !== -1) {
                parents = known.slice(0, gapIndex + 1).map(x => x.tag);
                children = known.slice(gapIndex + 1).map(x => x.tag);

                unknown.forEach(x => {
                  if (isSiblingGroup) {
                    children.push(x.tag);
                  } else {
                    parents.push(x.tag);
                  }
                });
              }
            }

            if (parents.length === 0 && children.length === 0) {
              if (isSiblingGroup) {
                parents = [];
                children = [...tags];
              } else {
                parents = [...tags];
                children = [];
              }
            }

            rel.members = parents.map(id => id.toLowerCase().trim());
            rel.children = children.map(id => id.toLowerCase().trim());
          } else {
            rel.members = tags.map(id => id.toLowerCase().trim());
            rel.children = [];
          }
        }
      });
    },
    async loadEntrySourceEntries(sourcePaths, signal, baseDir = 'story/') {
      let resolvedBaseDir = baseDir;
      if (resolvedBaseDir && !resolvedBaseDir.startsWith('http://') && !resolvedBaseDir.startsWith('https://')) {
        const cleanBase = resolvedBaseDir.replace(/^\/+/, '');
        resolvedBaseDir = `${this.backendOrigin()}/${cleanBase}`;
      }
      const list = Array.isArray(sourcePaths) ? sourcePaths : [];
      const chunks = await Promise.all(list.map(async (sourcePath) => {
        const clean = String(sourcePath || '').replace(/^\/+/, '');
        if (!clean) {
          return [];
        }
        try {
          const url = `${resolvedBaseDir}${clean}`;
          const isMd = clean.toLowerCase().endsWith('.md');
          const res = await fetch(url, { cache: 'no-store', signal });
          console.debug('MR: fetched source', url, 'status', res.status, 'ok', !!res.ok, 'isMd', isMd);
          if (!res.ok) {
            return [];
          }
          const text = await res.text();
          let payload = null;
          if (isMd) {
            payload = this.parseMarkdownEntries(text);
          } else {
            try {
              payload = text ? JSON.parse(text) : null;
            } catch (e) {
              console.warn('MR: failed to parse variant source', url, e);
              return [];
            }
          }
          if (Array.isArray(payload)) {
            return payload.map((entry) => ({
              ...(entry || {}),
              __sourceFile: clean
            }));
          }
          if (Array.isArray(payload?.entries)) {
            console.debug('MR: variant payload.entries length', payload.entries.length, 'from', clean);
            return payload.entries.map((entry) => ({
              ...(entry || {}),
              __sourceFile: clean
            }));
          }
          return [];
        } catch (error) {
          if (error?.name === 'AbortError') {
            throw error;
          }
          console.warn('MR: error fetching variant', clean, error);
          return [];
        }
      }));
      return chunks.flat().filter((entry) => entry && typeof entry === 'object');
    },
    async loadYearVariants(year, signal) {
      if (this.yearVariants[year]) return;
      try {
        const res = await fetch(`${this.backendOrigin()}/api/year-variants?year=${encodeURIComponent(year)}`, { signal });
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.variants) && data.variants.length > 0) {
            this.yearVariants = { ...this.yearVariants, [year]: data.variants };
          } else {
            this.yearVariants = { ...this.yearVariants, [year]: [] };
          }
        } else {
          this.yearVariants = { ...this.yearVariants, [year]: [] };
        }
      } catch (error) {
        if (error?.name !== 'AbortError') {
          this.yearVariants = { ...this.yearVariants, [year]: [] };
        }
      }
    },
    setYearVariant(year, variantId) {
      const targetYear = String(year || '');
      const current = this.activeYearVariantKey[targetYear];
      if (current === variantId) return;
      this.activeYearVariantKey = {
        ...(this.activeYearVariantKey || {}),
        [targetYear]: variantId
      };
      try {
        window.localStorage.setItem('mr_variants_v1', JSON.stringify(this.activeYearVariantKey));
      } catch (e) {
        // Ignore storage issues
      }
      if (this.activeYear === targetYear && !this.isSwitchingYear) {
        this.setYearAsync(targetYear, this.activeEntryId);
      }
    },
    async loadYearData(year, signal) {
      try {
        const targetYear = String(year || '');
        const variants = this.yearVariants[targetYear];
        const preferred = this.activeYearVariantKey[targetYear];

        const getAbsoluteUrl = (relPath) => {
          if (!relPath) return '';
          if (relPath.startsWith('http://') || relPath.startsWith('https://')) return relPath;
          const clean = relPath.replace(/^\/+/, '');
          const separator = clean.includes('?') ? '&' : '?';
          return `${this.backendOrigin()}/${clean}${separator}t=${Date.now()}`;
        };

        let sourceUrl = `story/${targetYear}/index.json`;
        let sourceFileName = `index.json`;
        let baseDir = `story/${targetYear}/`;
        let variantUsed = false;

        // Priority 1: Selected variant from story/{year}/versions/
        if (variants && variants.length > 0 && preferred) {
          const selected = variants.find(v => v.id === preferred);
          if (selected && selected.filename) {
            sourceUrl = `story/${targetYear}/${selected.filename}`;
            sourceFileName = selected.filename;
            baseDir = `story/${targetYear}/`;
            variantUsed = true;
          }
        }

        let direct;
        if (variantUsed) {
          try {
            direct = await fetch(getAbsoluteUrl(sourceUrl), { cache: 'no-store', signal });
          } catch (e) {
            direct = { ok: false };
          }
        } else {
          // Priority 2: Standard story path
          direct = await fetch(getAbsoluteUrl(sourceUrl), { cache: 'no-store', signal }).catch(() => ({ ok: false }));

          if (!direct.ok) {
            // Priority 3: Character years fallback or first variant
            sourceUrl = `story/${targetYear}/index.json`;
            sourceFileName = `index.json`;
            baseDir = `story/${targetYear}/`;

            if (variants && variants.length > 0) {
              const selected = variants[0];
              if (selected && selected.filename) {
                sourceUrl = `story/${targetYear}/${selected.filename}`;
                sourceFileName = selected.filename;
              }
            }
            try {
              direct = await fetch(getAbsoluteUrl(sourceUrl), { cache: 'no-store', signal });
            } catch (e) {
              direct = { ok: false };
            }
          }
        }
        if (!direct.ok) {
          console.warn(`MR: loadYearData failed to find index for ${year}.${String(year) !== '2026' ? ' Falling back to 2026.' : ' Returning empty.'}`);
          if (String(year) !== '2026') {
            return this.loadYearData('2026', signal);
          }
          return { entries: [], meta: {} };
        }
        if (direct.ok) {
          this.activeYearSourceFile = sourceFileName;
          let payload;
          if (sourceFileName.endsWith('.md')) {
            const text = await direct.text();
            payload = this.parseMarkdownVersion(text);
          } else {
            payload = await direct.json();
          }

          if (payload && typeof payload === 'object') {
            const baseEntries = Array.isArray(payload?.entries)
              ? payload.entries.map((entry) => ({
                ...(entry || {}),
                __sourceFile: sourceFileName
              }))
              : [];
            console.debug('MR: loadYearData loaded', sourceFileName, 'entries', baseEntries.length);
            const sourcedEntries = await this.loadEntrySourceEntries(payload?.entrySources, signal, baseDir);
            const merged = [...baseEntries, ...sourcedEntries]
              .filter((entry) => entry && entry.id)
              .sort((a, b) => Number(a?.order || 0) - Number(b?.order || 0));

            const finalPayload = {
              ...payload,
              entries: this.mergeSyntheticEntries(merged)
            };

            return finalPayload;
          }
        }
      } catch (error) {
        if (error?.name === 'AbortError') {
          throw error;
        }
        // Fallback below.
      }
      const fallback = this.versions?.[String(year)] || { meta: {}, entries: [] };
      return {
        ...fallback,
        entries: this.mergeSyntheticEntries(Array.isArray(fallback?.entries) ? fallback.entries : [])
      };
    },
    setYear(year) {
      const targetYear = String(year || '');
      if (!targetYear) return;
      if (this.isSwitchingYear) {
        this.pendingYear = targetYear;
        return;
      }
      if (targetYear === String(this.activeYear || '') && Array.isArray(this.entries) && this.entries.length) {
        return;
      }
      this.setYearAsync(year).catch((error) => {
        console.error('Failed to switch year', error);
      });
    },
    async setYearAsync(year, preferredEntryId = '') {
      const targetYear = String(year || '');
      if (!targetYear) return;

      this.saveUiState();

      const switchToken = (this._yearSwitchToken || 0) + 1;
      this._yearSwitchToken = switchToken;
      this.isSwitchingYear = true;
      this.pendingYear = '';

      if (this._yearDataController) {
        this._yearDataController.abort();
      }
      this._yearDataController = new AbortController();

      const previousActive = this.activeEntryId;
      this.activeYear = targetYear;
      this.search = '';
      this.catalog = null;
      this.timelinePortraitByEvent = {};
      this._xrayMountQueue = [];

      try {
        await this.loadYearVariants(targetYear, this._yearDataController.signal);
        const payload = await this.loadYearData(targetYear, this._yearDataController.signal);
        if (switchToken !== this._yearSwitchToken) {
          return;
        }
        this.meta = payload?.meta || {};
        this.yearWriterId = String(payload?.writer || payload?.meta?.writer || '').toLowerCase().trim();
        const orderRaw = payload?.meta?.navGroupOrder || payload?.navGroupOrder;
        this.navGroupOrder = Array.isArray(orderRaw)
          ? orderRaw.map((item) => String(item || '').trim()).filter(Boolean)
          : [];
        this.entries = Array.isArray(payload?.entries) ? payload.entries : [];
        if (!this.entries.length && this.characterCore && Object.keys(this.characterCore).length) {
          this.entries = Object.entries(this.characterCore).map(([id, char]) => ({
            id: id,
            name: char['full name'] || id,
            navGroup: char.navGroup || 'Characters'
          }));
        }
        // Refresh feather icons now that entries (and sidebar) changed.
        this.$nextTick(() => { try { window.feather && window.feather.replace(); } catch (e) { } });
        const explicitPreferred = String(preferredEntryId || '');
        const preferredExists = explicitPreferred
          ? this.entries.some((entry) => entry.id === explicitPreferred)
          : false;
        const stillExists = this.entries.some((entry) => entry.id === previousActive);
        if (preferredExists) {
          this.activeEntryId = explicitPreferred;
        } else if (stillExists) {
          this.activeEntryId = previousActive;
        } else {
          this.activeEntryId = this.firstEntryFallback(this.entries);
        }
        this.applyYearTheme(this.activeYear);
        await this.loadCatalog(targetYear);
        this.$nextTick(() => this.observeVisibleTimelineEvents());
        this.saveUiState();
      } catch (error) {
        if (error?.name !== 'AbortError') {
          throw error;
        }
      } finally {
        if (switchToken === this._yearSwitchToken) {
          this.isSwitchingYear = false;
          const queued = String(this.pendingYear || '');
          this.pendingYear = '';
          if (queued && queued !== String(this.activeYear || '')) {
            this.setYear(queued);
          }
        }
      }
    },
    async fetchSecureConfig() {
      try {
        const res = await fetch(`${this.backendOrigin()}/api/config/media-token`);
        const data = await res.json();
        if (data.ok) {
          this.secureMediaToken = data.token;
        }
      } catch (e) {
        console.warn('Failed to fetch secure media token', e);
      }
    },
    async loadMediaYears() {
      try {
        const res = await fetch(`${this.backendOrigin()}/api/media/years`);
        const data = await res.json();
        if (data.ok) {
          this.mediaYears = data.years || [];
        }
      } catch (e) {
        console.warn('MR Vue: failed to load media years', e);
      }
    },
    async fetchCoreResponse() {
      const candidates = [
        `${this.backendOrigin()}/story/core.json`
      ];
      for (const p of candidates) {
        try {
          const res = await fetch(`${p}?t=${Date.now()}`, { cache: 'no-store' });
          if (res && res.ok) return res;
        } catch (e) {
          // try next
        }
      }
      return null;
    },
    backendOrigin() {
      const protocol = window.location.protocol === 'file:' ? 'http:' : window.location.protocol;
      const host = window.location.hostname || '127.0.0.1';
      return `${protocol}//${host}:8787`;
    },
    async loadCatalog(yearOverride) {
      const targetYear = String(yearOverride || this.activeYear || '');
      if (!targetYear) {
        this.catalog = null;
        return;
      }

      if (this._catalogController) {
        this._catalogController.abort();
      }
      this._catalogController = new AbortController();
      const requestToken = (this._catalogRequestToken || 0) + 1;
      this._catalogRequestToken = requestToken;

      try {
        const res = await fetch(
          `${this.backendOrigin()}/api/media/catalog?year=${encodeURIComponent(targetYear)}`,
          { signal: this._catalogController.signal }
        );
        if (!res.ok) throw new Error(`media catalog ${res.status}`);
        const payload = await res.json();
        if (requestToken === this._catalogRequestToken && targetYear === String(this.activeYear || '')) {
          this.catalog = payload?.catalog || null;
          console.debug('MR: loadCatalog -> catalog set', { year: targetYear, portraits: (this.catalog?.portraits || []).length, outfits: (this.catalog?.outfits || []).length });
        }
      } catch (error) {
        if (error?.name === 'AbortError') {
          return;
        }
        console.warn('MR Vue: media catalog unavailable.', error);
        if (requestToken === this._catalogRequestToken) {
          this.catalog = null;
        }
      }
    },
    parseMarkdownEntries(text) {
      if (typeof jsyaml === 'undefined' || typeof marked === 'undefined') {
        console.warn('MR: js-yaml or marked not loaded.');
        return [];
      }
      const parts = text.split(/<!--\s*entry-break\s*-->/);
      return parts.map((part, idx) => {
        const trimmedPart = part.trim();
        if (!trimmedPart) return null;

        const fmMatch = trimmedPart.match(/^---\s*[\r\n]+([\s\S]*?)[\r\n]+---\s*[\r\n]*/);
        let meta = {};
        let content = trimmedPart;
        if (fmMatch) {
          try {
            meta = jsyaml.load(fmMatch[1]);
            content = trimmedPart.slice(fmMatch[0].length);
          } catch (e) {
            console.warn(`MR Logic: Failed to parse frontmatter for entry ${idx + 1}`, e);
          }
        } else {
          console.warn(`MR Logic: No frontmatter found for entry ${idx + 1}. First 50 chars:`, trimmedPart.slice(0, 50));
        }

        // Skip stub entries (empty or only HTML comments)
        if (/^(?:<!--[\s\S]*?-->\s*)*$/.test(content.trim())) {
          return null;
        }

        const blocks = this.parseMarkdownBlocks(content);
        return { ...meta, blocks };
      }).filter(entry => entry && entry.id);
    },
    parseMarkdownVersion(text) {
      const entries = this.parseMarkdownEntries(text);
      return { entries, entrySources: [] };
    },
    async loadPortraitManifest() {
      try {
        const response = await fetch(`${this.backendOrigin()}/api/media/portraits/list`);
        if (!response.ok) throw new Error(`portraits list ${response.status}`);
        const payload = await response.json();
        if (payload?.ok) {
          this.portraitManifest = payload.portraits || {};
          this.portraitPrefix = payload.prefix || 'portraits';
          console.debug('MR: loadPortraitManifest loaded', Object.keys(this.portraitManifest).length, 'characters');
        }
      } catch (error) {
        console.warn('MR Vue: portrait manifest unavailable.', error);
      }
    },
    async loadSfxManifest() {
      try {
        const response = await fetch(`${this.backendOrigin()}/api/media/sfx/list`);
        if (!response.ok) throw new Error(`sfx list ${response.status}`);
        const payload = await response.json();
        if (payload?.ok) {
          this.sfxManifest = payload.sfx || [];
        }
      } catch (error) {
        console.warn('MR Vue: sfx manifest unavailable.', error);
      }
    },
    async loadTimelinesList() {
      try {
        const res = await fetch(this.apiUrl('/api/timelines?t=' + Date.now()), { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data.ok) {
            this.timelineList = data.list || ['earthborn'];
            this.activeTimeline = data.active || 'earthborn';
          }
        }
      } catch (e) {
        console.warn('MR: failed to load timelines list', e);
      }
    },
    async switchTimeline(name) {
      try {
        const res = await fetch(this.apiUrl('/api/timelines/select'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name })
        });
        const data = await res.json();
        if (res.ok && data.ok) {
          this.activeTimeline = data.active;
          // Reload timeline database
          await this.init();
        } else {
          alert(data.error || 'Failed to switch timeline');
        }
      } catch (err) {
        console.error(err);
        alert('Error switching timeline: ' + err.message);
      }
    },
    promptCreateTimeline() {
      this.newTimelineName = '';
      this.timelineCreatorOpen = true;
      this.$nextTick(() => {
        if (this.$refs.newTimelineInput) {
          this.$refs.newTimelineInput.focus();
        }
      });
    },
    async createTimeline() {
      const name = String(this.newTimelineName || '').trim();
      if (!name) {
        this.timelineCreatorOpen = false;
        return;
      }
      const cleanName = name.replace(/[^a-zA-Z0-9_\-]/g, "").toLowerCase();
      if (!cleanName) {
        alert("Invalid timeline name. Use only letters, numbers, hyphens, and underscores.");
        return;
      }
      
      try {
        const res = await fetch(this.apiUrl('/api/timelines/create'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: cleanName })
        });
        const data = await res.json();
        if (res.ok && data.ok) {
          this.timelineCreatorOpen = false;
          this.newTimelineName = '';
          await this.loadTimelinesList();
          await this.init();
          alert(`Timeline "${cleanName}" created and loaded successfully!`);
        } else {
          alert(data.error || 'Failed to create timeline');
        }
      } catch (err) {
        console.error(err);
        alert('Error creating timeline: ' + err.message);
      }
    },
    expandMinimalThemes(themes) {
      const expanded = {};
      for (const [key, theme] of Object.entries(themes)) {
        if (!theme || !theme.vars) {
          expanded[key] = theme;
          continue;
        }
        
        const vars = { ...theme.vars };
        const bg = vars['--bg'];
        const page = vars['--page'];
        const ink = vars['--ink'];
        const accent = vars['--accent'];

        // If core colors are defined, automatically derive the rest using color-mix
        if (bg && ink && accent) {
          const isDark = this.checkLuminanceIsDark(bg, page);
          const mixBase = isDark ? 'black' : 'white';
          const oppositeBase = isDark ? 'white' : 'black';

          const defaults = {
            '--ink2': vars['--ink2'] || `color-mix(in srgb, ${ink} 80%, ${bg})`,
            '--dim': vars['--dim'] || `color-mix(in srgb, ${ink} 65%, ${bg})`,
            '--dimmer': vars['--dimmer'] || `color-mix(in srgb, ${ink} 45%, ${bg})`,
            '--faint': vars['--faint'] || `color-mix(in srgb, ${accent} 12%, transparent)`,
            '--border': vars['--border'] || `color-mix(in srgb, ${accent} 20%, ${bg})`,
            '--border2': vars['--border2'] || `color-mix(in srgb, ${accent} 30%, ${bg})`,
            '--sidebar-bg': vars['--sidebar-bg'] || `color-mix(in srgb, ${page} 94%, ${mixBase})`,
            '--sidebar-text': vars['--sidebar-text'] || `color-mix(in srgb, ${ink} 85%, ${bg})`,
            '--sidebar-dim': vars['--sidebar-dim'] || `color-mix(in srgb, ${ink} 55%, ${bg})`,
            '--sidebar-active': vars['--sidebar-active'] || accent,
            '--sidebar-hover': vars['--sidebar-hover'] || `color-mix(in srgb, ${accent} 8%, ${bg})`,
            '--accent2': vars['--accent2'] || `color-mix(in srgb, ${accent} 80%, ${oppositeBase})`,
            '--gold': vars['--gold'] || accent,
            '--red': vars['--red'] || '#ff385c',
            '--highlight': vars['--highlight'] || `color-mix(in srgb, ${accent} 8%, transparent)`,
            '--highlight2': vars['--highlight2'] || `color-mix(in srgb, ${accent} 14%, transparent)`,
            '--note-bg': vars['--note-bg'] || `color-mix(in srgb, ${page} 92%, ${bg})`,
            '--tag-bg': vars['--tag-bg'] || `color-mix(in srgb, ${page} 88%, ${bg})`,
            '--pin-color': vars['--pin-color'] || accent,
            '--body-bg': vars['--body-bg'] || bg,
            '--sidebar-surface': vars['--sidebar-surface'] || `linear-gradient(180deg, color-mix(in srgb, ${page} 94%, ${mixBase}) 0%, ${bg} 100%)`,
            '--main-surface': vars['--main-surface'] || `linear-gradient(180deg, ${page} 0%, ${bg} 100%)`,
            '--year-switch-bg': vars['--year-switch-bg'] || `linear-gradient(180deg, color-mix(in srgb, ${page} 96%, transparent) 0%, color-mix(in srgb, ${bg} 95%, transparent) 100%)`,
            '--year-switch-border-top': vars['--year-switch-border-top'] || `color-mix(in srgb, ${accent} 20%, transparent)`,
            '--year-switch-border-bottom': vars['--year-switch-border-bottom'] || `color-mix(in srgb, ${accent} 25%, transparent)`,
            '--sidebar-edge': vars['--sidebar-edge'] || `color-mix(in srgb, ${accent} 18%, transparent)`,
            '--sidebar-scrollbar': vars['--sidebar-scrollbar'] || `color-mix(in srgb, ${accent} 75%, transparent)`,
            '--nav-active-bg': vars['--nav-active-bg'] || `linear-gradient(90deg, color-mix(in srgb, ${accent} 12%, transparent), color-mix(in srgb, ${accent} 3%, transparent))`,
            '--year-track-bg': vars['--year-track-bg'] || `linear-gradient(90deg, color-mix(in srgb, ${accent} 30%, transparent), ${accent})`,
            '--year-track-border': vars['--year-track-border'] || `color-mix(in srgb, ${accent} 40%, transparent)`,
            '--year-thumb-border': vars['--year-thumb-border'] || `color-mix(in srgb, ${accent} 90%, transparent)`,
            '--year-thumb-bg': vars['--year-thumb-bg'] || `radial-gradient(circle at 35% 35%, ${oppositeBase} 0%, ${accent} 100%)`,
            '--year-thumb-ring': vars['--year-thumb-ring'] || `0 0 0 2px ${bg}, 0 0 12px color-mix(in srgb, ${accent} 55%, transparent)`,
            '--page-title-shadow': vars['--page-title-shadow'] || `0 0 24px color-mix(in srgb, ${accent} 18%, transparent)`,
            '--notes-ink': vars['--notes-ink'] || `color-mix(in srgb, ${ink} 95%, ${bg})`,
            '--notes-label-ink': vars['--notes-label-ink'] || accent,
            '--notes-body-ink': vars['--notes-body-ink'] || `color-mix(in srgb, ${ink} 80%, ${bg})`,
            '--notes-body-shadow': vars['--notes-body-shadow'] || `0 0.3px 0 color-mix(in srgb, ${accent} 15%, transparent)`,
            '--error-ink': vars['--error-ink'] || `color-mix(in srgb, #ff385c 85%, ${bg})`
          };

          Object.assign(vars, defaults);
        }

        expanded[key] = { ...theme, vars };
      }
      return expanded;
    },
    checkLuminanceIsDark(bgHex, pageHex) {
      const parse = (hex) => {
        const cleaned = String(hex).replace('#', '');
        if (cleaned.length === 3) {
          return [
            parseInt(cleaned[0] + cleaned[0], 16),
            parseInt(cleaned[1] + cleaned[1], 16),
            parseInt(cleaned[2] + cleaned[2], 16)
          ];
        }
        return [
          parseInt(cleaned.slice(0, 2), 16),
          parseInt(cleaned.slice(2, 4), 16),
          parseInt(cleaned.slice(4, 6), 16)
        ];
      };
      
      const lum = (rgb) => 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
      
      try {
        const bgRgb = parse(bgHex || '#ffffff');
        const pageRgb = parse(pageHex || '#ffffff');
        return (lum(bgRgb) < 70 || lum(pageRgb) < 90);
      } catch (e) {
        return true;
      }
    }
  });
})(window);
