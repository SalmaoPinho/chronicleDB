(function initMrComputed(global) {
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

  global.MR_COMPUTED = {
    portraitsAvailable() {
      const hasManifestPortraits = Object.keys(this.portraitManifest || {}).length > 0;
      const hasCatalogPortraits = Array.isArray(this.catalog?.portraits) && this.catalog.portraits.length > 0;
      return hasManifestPortraits || hasCatalogPortraits;
    },
    yearOptions() {
      const keys = new Set(Object.keys(this.versions || {}));
      return Array.from(keys)
        .filter((k) => /^\d{4}$/.test(String(k)))
        .sort((a, b) => Number(a) - Number(b));
    },
    currentEra() {
      const yearStr = String(this.activeYear || '').trim().replace(/s$/, '');
      const year = Number(yearStr);
      if (!year || isNaN(year)) return 'modern';
      if (year < 1900) return 'ancient';
      if (year < 1960) return 'mid-century';
      if (year < 1990) return 'retro';
      if (year < 2020) return 'digital';
      if (year < 2040) return 'modern';
      return 'future';
    },
    timelinePortraitYearOptions() {
      const keys = new Set([
        ...(this.yearOptions || []),
        ...((this.mediaYears || []).map((year) => String(year || '').trim()))
      ]);
      return Array.from(keys)
        .filter((k) => /^\d{4}$/.test(String(k)))
        .sort((a, b) => Number(a) - Number(b));
    },
    lifecycleEvents() {
      if (!this.showLifecycleMilestones) return [];
      const core = this.characterCore || {};
      const baseEvents = Array.isArray(this.timelineEvents) ? this.timelineEvents : [];
      const events = [];
      Object.keys(core).forEach((charId) => {
        const char = core[charId];
        if (!char || char.redirect) return;
        const charTag = charId.toLowerCase();
        const fullName = char['full name'] || char.navLabel || charId;

        const birthDate = this.getCoreBirthRaw(char);
        if (birthDate) {
          const alreadyHasBirth = baseEvents.some(evt => {
            const title = String(evt.title || '').toLowerCase();
            const tags = Array.isArray(evt.tags) ? evt.tags.map(t => String(t).toLowerCase()) : [];
            return (title.includes('born') || title.includes('birth') || tags.includes('birth')) &&
              (tags.includes(charTag) || title.includes(charTag));
          });
          if (!alreadyHasBirth) {
            events.push({
              date: birthDate,
              title: `${fullName} is Born`,
              description: `The beginning of the documented path for ${fullName}.`,
              tags: [charId, 'vitals', 'birth'],
              __vitals: true,
              __birthdaySynthetic: true,
              __characterId: charId,
              id: `vitals-${charId}-birth`
            });
          }
        }

        const deathDate = this.getCoreDeathRaw(char);
        if (deathDate) {
          const alreadyHasDeath = baseEvents.some(evt => {
            const title = String(evt.title || '').toLowerCase();
            const tags = Array.isArray(evt.tags) ? evt.tags.map(t => String(t).toLowerCase()) : [];
            return (title.includes('dies') || title.includes('death') || title.includes('passes away') || tags.includes('death')) &&
              (tags.includes(charTag) || title.includes(charTag));
          });
          if (!alreadyHasDeath) {
            events.push({
              date: deathDate,
              title: `${fullName} Passes Away`,
              description: `The conclusion of the documented path for ${fullName}.`,
              tags: [charId, 'vitals', 'death'],
              __vitals: true,
              __deathSynthetic: true,
              __characterId: charId,
              id: `vitals-${charId}-death`
            });
          }
        }
      });
      return events;
    },
    injectedTimelineEvents() {
      let base = Array.isArray(this.timelineEvents) ? this.timelineEvents : [];
      if (!this.showLifecycleMilestones) {
        base = base.filter((evt) => !evt.tags || !evt.tags.some(t => String(t).toLowerCase() === 'vitals'));
      }
      const v = this.lifecycleEvents;
      if (!v.length) return base;
      return [...base, ...v];
    },
    filteredEntries() {
      const rawSearch = (this.search || '').trim();
      const list = Array.isArray(this.entries) ? [...this.entries] : [];
      list.sort((a, b) => this.compareEntries(a, b));
      if (!rawSearch) return list;
      return list.filter((entry) => {
        const hay = [entry.id, entry.title, entry.navLabel, entry.navGroup]
          .map((value) => this.normalize(value))
          .join(' ');
        return this.matchSearchQuery(rawSearch, hay);
      });
    },
    preambleEntries() {
      const list = Array.isArray(this.entries) ? [...this.entries] : [];
      return list
        .filter((entry) => String(entry?.navGroup || '').trim().toLowerCase() === 'preamble')
        .sort((a, b) => this.compareEntries(a, b));
    },
    groupedEntries() {
      const map = new Map();
      this.filteredEntries.forEach((entry) => {
        const groupName = String(entry?.navGroup || 'Other').trim() || 'Other';
        if (groupName.toLowerCase() === 'preamble') return;
        if (!map.has(groupName)) {
          map.set(groupName, []);
        }
        map.get(groupName).push(entry);
      });

      return Array.from(map.entries())
        .map(([name, entries]) => ({ name, entries }))
        .sort((a, b) => this.groupRank({ navGroup: a.name }) - this.groupRank({ navGroup: b.name }));
    },
    activeEntry() {
      const id = this.getResolvedCharacterId(this.activeEntryId);
      return this.entries.find((entry) => entry.id === id) || this.filteredEntries[0] || null;
    },
    isTimelineEntryActive() {
      return this.normalizeId(this.activeEntry?.id) === 'timeline';
    },
    normalizedBlocks() {
      const blocks = Array.isArray(this.activeEntry?.blocks) ? this.activeEntry.blocks : [];
      if (!blocks.length && this.activeEntry?.redirectUrl) {
        return [{
          kind: 'rich',
          label: 'Redirect',
          body: `This entry opens an external page. <a href="${this.activeEntry.redirectUrl}">Open ${this.activeEntry.redirectUrl}</a>`
        }];
      }
      return blocks
        .map((block, index) => {
          if (!block || typeof block !== 'object') return null;
          const body = String(block.body || block.note || '').replace(/<BR\s*\/?>/gi, '<br>');
          if (String(block.type || '').toLowerCase() === 'section-break') {
            return { kind: 'break', label: block.label || block.type };
          }
          if (String(block.type || '').toLowerCase() === 'auto-summary-table') {
            return {
              kind: 'table',
              label: block.label || 'Summary',
              sourceBlockIndex: index,
              isEditable: false,
              rows: this.buildAutoSummaryRows()
            };
          }
          if (Array.isArray(block.rows)) {
            return {
              kind: 'table',
              label: block.label || block.type || 'Table',
              sourceBlockIndex: index,
              isEditable: true,
              rows: block.rows
            };
          }
          if (Array.isArray(block.members) && body) {
            return {
              kind: 'faction',
              label: block.label || block.name || block.type || 'Group',
              body,
              members: block.members
            };
          }
          if (Array.isArray(block.members)) {
            return { kind: 'list', label: block.label || block.name || 'Members', members: block.members };
          }
          if (String(block.type || '').toLowerCase() === 'timeline-sheet') {
            return {
              kind: 'timeline',
              label: block.label || 'Timeline',
              title: block.title || 'Historical Timeline',
              note: block.note || 'Key events and milestones documented in project history.'
            };
          }
          const type = String(block.type || '').toLowerCase();
          const isArchiveTrigger = type === 'notebook-sheet';

          if (isArchiveTrigger) {
            return {
              kind: 'notebook-viewer',
              label: block.label || 'Field Notes',
              title: block.title || 'Field Notes Archive',
              note: block.note || 'Jess notebooks and records.'
            };
          }
          if (type === 'notes-app') {
            return { kind: 'notes-app', label: block.label || 'Notes App', body };
          }
          if (type === 'field-note') {
            return { kind: 'field-note', label: block.label || 'Field Note', body };
          }
          if (String(block.type || '').toLowerCase() === 'relationship-tree-sheet') {
            return {
              kind: 'relationship-tree',
              label: block.label || 'Relationship Tree',
              title: block.title || 'Relationship Tree',
              note: block.note || 'Bonds and connections by ID.'
            };
          }
          if (String(block.type || '').toLowerCase() === 'progress-sheet') {
            return {
              kind: 'progress',
              label: block.label || 'Progress',
              title: block.title || 'Project Progress',
              note: block.note || 'Portrait and birthday data coverage for current character entries.'
            };
          }
          if (String(block.type || '').toLowerCase() === 'demographics-sheet') {
            return {
              kind: 'demographics',
              label: block.label || 'Demographics',
              title: block.title || 'Demographics & Diversity',
              note: block.note || 'Breakdown of gender, ethnicity, and nationality across the character database.'
            };
          }
          if (body) {
            return { kind: 'rich', label: block.label || block.type || '', body };
          }
          return { kind: 'unknown', label: block.label || '', type: String(block.type || 'unknown') };
        })
        .filter(Boolean);
    },
    sortedNotebooks() {
      const list = Array.isArray(this.notebooks) ? [...this.notebooks] : [];
      return list.sort((a, b) => Number(a?.number || 9999) - Number(b?.number || 9999));
    },
    notebookShelfGroups() {
      const groups = [
        { key: 'jess', label: 'Jess notebooks', notebookClass: 'is-jess', notebooks: [] },
        { key: 'other', label: 'Other books', notebookClass: 'is-other', notebooks: [] }
      ];
      (this.sortedNotebooks || []).forEach((nb) => {
        const isJessNotebook = CANONICAL_JESS_IDS && CANONICAL_JESS_IDS.has(nb?.id);
        groups[isJessNotebook ? 0 : 1].notebooks.push(nb);
      });
      return groups.filter((group) => Array.isArray(group.notebooks) && group.notebooks.length);
    },
    activeNotebook() {
      const current = this.sortedNotebooks.find((nb) => String(nb?.id || '') === String(this.activeNotebookId || ''));
      return current || this.sortedNotebooks[0] || null;
    },
    notebookSearchQuery() {
      return String(this.notebookSearch || '').trim();
    },
    notebookSearchResults() {
      const rawSearch = this.notebookSearchQuery;
      if (!rawSearch) {
        return [];
      }

      const results = [];
      (this.sortedNotebooks || []).forEach((nb) => {
        const notebookId = String(nb?.id || '');
        const notebookName = this.notebookDisplayName(nb);
        const entries = Array.isArray(nb?.entries) ? nb.entries : [];
        entries.forEach((entry, entryIndex) => {
          const title = this.plainText(entry?.title || '');
          const date = this.plainText(entry?.date || '');
          const body = this.notebookEntrySearchText(entry);
          const haystack = [title, date, body]
            .map((value) => this.normalize(value))
            .join(' ');
          if (!this.matchSearchQuery(rawSearch, haystack)) {
            return;
          }
          results.push({
            notebookId,
            notebookName,
            entryIndex,
            entryKey: this.notebookEntryKey(notebookId, entry, entryIndex),
            title: title || `Entry ${entryIndex + 1}`,
            date,
            snippet: this.notebookSearchSnippet([title, date, body].filter(Boolean).join(' '), this.notebookSearchQuery)
          });
        });
      });

      return results.slice(0, 200);
    },
    storyExportGroups() {
      // If we are in Charsheet Mode, we only show the characters involved in the charsheet
      if (this.charsheetGeneratedPrompt) {
        const subjects = Object.keys(this.charsheetPromptSubjects || {}).filter(id => this.charsheetPromptSubjects[id]);
        if (this.charsheetPromptWriter) {
          subjects.push(this.charsheetPromptWriter);
        }
        const uniqueIds = Array.from(new Set(subjects.map(id => id.toLowerCase().trim())));

        const subjectItems = uniqueIds.map(id => {
          const core = this.characterCore[id] || {};
          return {
            id,
            group: 'Charsheet Subjects',
            title: core['full name'] || core.navLabel || id,
            entry: { id, navGroup: core.navGroup || 'Characters' }
          };
        });

        if (subjectItems.length) {
          return [{
            name: 'Charsheet Subjects',
            characters: subjectItems.sort((a, b) => a.title.localeCompare(b.title))
          }];
        }
      }

      const limitToSelected = this.storyExportLimitToSelected;

      const chars = Object.entries(this.characterCore || {})
        .filter(([id, char]) => {
          if (!id || char.redirect) {
            return false;
          }
          const navGroup = String(char.navGroup || '').trim().toLowerCase();
          if (navGroup === 'preamble') return false;

          if (limitToSelected) {
            const charId = id.toLowerCase().trim();
            return this.storyExportSelections?.[charId] === true;
          }
          return true;
        })
        .map(([id, char]) => ({
          id: id.toLowerCase().trim(),
          group: String(char.navGroup || 'Other').trim() || 'Other',
          title: char['full name'] || char.navLabel || id,
          entry: { id, navGroup: char.navGroup || 'Characters' }
        }));

      const map = new Map();
      chars.forEach((item) => {
        if (!map.has(item.group)) {
          map.set(item.group, []);
        }
        map.get(item.group).push(item);
      });

      return Array.from(map.entries())
        .map(([name, characters]) => ({
          name,
          characters: characters.sort((a, b) => a.title.localeCompare(b.title))
        }))
        .sort((a, b) => this.groupRank({ navGroup: a.name }) - this.groupRank({ navGroup: b.name }));
    },
    storyExportSelectedCharacterIds() {
      const selected = [];
      (this.storyExportGroups || []).forEach((group) => {
        (group.characters || []).forEach((item) => {
          if (this.storyExportSelections?.[item.id] !== false) {
            selected.push(item.id);
          }
        });
      });
      return selected;
    },
    storyExportReferenceYear() {
      const timelineTo = Number(String(this.timelineYearTo || '').trim());
      if (Number.isFinite(timelineTo)) {
        return timelineTo;
      }
      
      const year = Number(String(this.activeYear || '').trim());
      if (Number.isFinite(year)) {
        return year;
      }

      // Fallback: get max year from filteredTimelineEvents
      const events = Array.isArray(this.filteredTimelineEvents) ? this.filteredTimelineEvents : [];
      let maxYear = null;
      for (const item of events) {
        const evYear = this.parseTimelineDateParts(item.event?.date)?.year;
        if (Number.isFinite(evYear)) {
          if (maxYear === null || evYear > maxYear) {
            maxYear = evYear;
          }
        }
      }
      return maxYear;
    },
    storyExportRelationshipRows() {
      const protagonistId = String(this.storyExportProtagonistId || '').toLowerCase().trim();
      const referenceYear = this.storyExportReferenceYear;
      const source = Array.isArray(this.relationships) ? this.relationships : [];
      if (!protagonistId || !source.length) {
        return [];
      }

      return source
        .map((rel) => {
          const relId = String(rel?.id || '').trim();
          if (!relId) {
            return null;
          }

          const members = [
            ...(Array.isArray(rel?.members) ? rel.members : []),
            ...(Array.isArray(rel?.children) ? rel.children : [])
          ]
            .map((item) => String(item || '').toLowerCase().trim())
            .filter(Boolean);

          const startParts = this.parseTimelineDateParts(rel?.startDate || '');
          if (Number.isFinite(referenceYear) && Number.isFinite(startParts?.year) && startParts.year > referenceYear) {
            return null;
          }

          const historyObj = rel?.history && typeof rel.history === 'object' ? rel.history : {};
          const hasHistoryMention = Object.entries(historyObj)
            .some(([date, events]) => {
              const historyYear = this.parseTimelineDateParts(date)?.year;
              if (Number.isFinite(referenceYear) && Number.isFinite(historyYear) && historyYear > referenceYear) {
                return false;
              }
              return (Array.isArray(events) ? events : [])
                .some((token) => this.resolveRelationshipHistoryMemberToken(token) === protagonistId);
            });

          if (!members.includes(protagonistId) && !hasHistoryMention) {
            return null;
          }

          const startYear = Number.isFinite(startParts?.year) ? startParts.year : null;
          const startsCurrentYear = Number.isFinite(startYear) && Number.isFinite(referenceYear) && startYear === referenceYear;
          return {
            id: relId,
            label: String(rel?.label || relId),
            type: String(rel?.type || '').trim(),
            startDate: String(rel?.startDate || '').trim(),
            startsCurrentYear
          };
        })
        .filter(Boolean)
        .sort((a, b) => {
          const ay = this.parseTimelineDateParts(a.startDate || '')?.year ?? -999999;
          const by = this.parseTimelineDateParts(b.startDate || '')?.year ?? -999999;
          if (ay !== by) {
            return ay - by;
          }
          return String(a.label || '').localeCompare(String(b.label || ''));
        });
    },
    storyExportSelectedRelationshipIds() {
      return (this.storyExportRelationshipRows || [])
        .filter((row) => this.storyExportRelationshipSelections?.[row.id] !== false)
        .map((row) => row.id);
    },
    storyExportProtagonistPortraitSrc() {
      const id = String(this.storyExportProtagonistId || '').toLowerCase().trim();
      const year = this.storyExportReferenceYear;
      if (!id || !Number.isFinite(year)) {
        return '';
      }
      const key = `${id}::${year}`;
      if (this.storyExportPortraitFailedByYearChar?.[key]) {
        return '';
      }
      const cached = this.storyExportPortraitByYearChar?.[key];
      if (typeof cached === 'string' && cached) {
        return cached;
      }
      this.queueStoryExportPortraitLoad(id, year);
      return '';
    },
    storyExportSetOptions() {
      return STORY_SET_PRESETS;
    },
    storyExportDialogStyleOptions() {
      return [
        {
          key: 'character_colon_quote',
          label: 'Character: "Dialog"',
          guidance: 'Format spoken lines as Character: "Dialog".'
        },
        {
          key: 'quote_said_character',
          label: '"Dialog," said Character',
          guidance: 'Prefer attributions after the line, e.g. "Dialog," said Character.'
        },
        {
          key: 'quote_character_said',
          label: '"Dialog," Character said',
          guidance: 'Use the classic form: "Dialog," Character said.'
        },
        {
          key: 'action_beat',
          label: 'Action beats with dialogue',
          guidance: 'Blend dialogue with action beats instead of frequent said-tags.'
        },
        {
          key: 'minimalist_quotes',
          label: 'Minimalist quote-forward',
          guidance: 'Use short quote blocks with minimal attributions where clarity permits.'
        }
      ];
    },
    storyExportDialogStyleDescription() {
      const selectedKey = String(this.storyExportDialogStyle || '').trim();
      const row = (this.storyExportDialogStyleOptions || []).find((option) => option.key === selectedKey);
      return String(row?.guidance || 'Use a clear, readable dialogue style.').trim();
    },
    storyExportVoiceTagOptions() {
      return STORY_VOICE_TAGS;
    },
    storyExportSelectedVoiceTags() {
      return (this.storyExportVoiceTagOptions || [])
        .filter((tag) => this.storyExportStyleTagSelections?.[tag.key])
        .map((tag) => tag.key);
    },
    storyExportVoiceDescription() {
      const selected = (this.storyExportVoiceTagOptions || [])
        .filter((tag) => this.storyExportStyleTagSelections?.[tag.key]);
      if (!selected.length) {
        return 'grounded, observant, and emotionally precise';
      }
      return selected.map((tag) => tag.phrase).join('; ');
    },
    storyExportPreviewText() {
      return this.buildStoryExportText();
    },
    storyExportTimelineCandidates() {
      const year = String(this.storyExportReferenceYear || this.activeYear || '').trim() || 'unknown year';
      const referenceYearNum = Number(year);
      const selectedIds = this.storyExportSelectedCharacterIds || [];
      if (!selectedIds.length) {
        return [];
      }

      const protagonistId = selectedIds.includes(this.storyExportProtagonistId)
        ? this.storyExportProtagonistId
        : selectedIds[0];
      const writerId = String(this.yearWriterId || '').toLowerCase().trim();
      const relevantTags = new Set(selectedIds.map(id => id.toLowerCase().trim()));
      if (writerId) relevantTags.add(writerId.toLowerCase().trim());

      if (this.timelineSequentialMode) {
        (this.timelineActiveTagsExpanded || []).forEach(tag => {
          if (this.timelineTagType(tag) === 'character') {
            relevantTags.add(tag.toLowerCase().trim());
          }
        });
      }

      const activeRanges = [];
      if (Array.isArray(this.timelineYearRanges)) activeRanges.push(...this.timelineYearRanges);
      if ((this.timelineYearFrom !== null && this.timelineYearFrom !== '') || (this.timelineYearTo !== null && this.timelineYearTo !== '')) {
        activeRanges.push({
          from: this.timelineYearFrom,
          to: this.timelineYearTo,
          exclude: this.timelineExcludeYearRange === true
        });
      }

      const matchedEvents = (this.injectedTimelineEvents || [])
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

      const seenEvents = new Set();
      const uniqueEvents = [];
      matchedEvents.forEach(ev => {
        const key = `${ev.date || ''}|${ev.title || ''}`;
        if (!seenEvents.has(key)) {
          seenEvents.add(key);
          uniqueEvents.push(ev);
        }
      });

      uniqueEvents.sort((a, b) => {
        const aParts = this.parseTimelineDateParts(a.date);
        const bParts = this.parseTimelineDateParts(b.date);
        if (aParts && bParts) {
          return aParts.year - bParts.year || aParts.month - bParts.month || aParts.day - bParts.day;
        }
        return String(a.date).localeCompare(String(b.date));
      });

      return uniqueEvents.map(ev => {
        const key = `${ev.date || ''}|${ev.title || ''}`;
        
        const date = ev.date || 'Unknown Date';
        const title = ev.title || 'Untitled Event';
        const desc = String(ev.description || '').trim();
        const tagsArr = Array.isArray(ev.tags) ? ev.tags : (ev.tags ? [ev.tags] : []);
        
        let textLen = date.length + title.length + 10;
        if (desc) {
          textLen += desc.length + 4;
        }
        if (tagsArr.length) {
          textLen += tagsArr.join(', ').length + 10;
        }
        
        return {
          key,
          date,
          title,
          description: desc,
          tags: tagsArr,
          tokens: Math.round(textLen / 4) || 1
        };
      });
    },
    relationshipTreeGroups() {
      try {
        const filter = String(this.relationshipFilter || 'all').toLowerCase();

        const allRels = (Array.isArray(this.relationships) ? this.relationships : [])
          .filter(rel => {
            // 1. Filter by category if needed
            if (filter !== 'all') {
              const source = String(rel.__source || '').toLowerCase();
              if (!source.includes(filter)) return false;
            }

            // 2. Filter by presence of members
            const members = Array.isArray(rel.members) ? rel.members : [];
            const children = Array.isArray(rel.children) ? rel.children : [];
            if (members.length + children.length < 2) return false;

            const type = String(rel?.type || '').toLowerCase();
            const allowedTypes = ['family', 'romance', 'personal', 'friendship', 'partnership', 'organization', 'operation', 'devotion', 'complicated', 'arc', 'incident', 'event'];
            return allowedTypes.includes(type);
          });

        const relationshipMap = new Map();
        allRels.forEach((rel) => {
          const type = String(rel?.type || '').toLowerCase();
          const allowedTypes = ['family', 'romance', 'personal', 'friendship', 'partnership', 'organization', 'operation', 'devotion', 'complicated', 'arc'];
          if (!allowedTypes.includes(type)) return;

          // Normalize IDs from both 'members' and 'parents' fields
          const rawParents = Array.isArray(rel.members) ? rel.members : (Array.isArray(rel.parents) ? rel.parents : []);
          const parents = rawParents.map(id => this.getResolvedCharacterId(id)).filter(Boolean).sort();
          const children = (Array.isArray(rel.children) ? rel.children : []).map(id => this.getResolvedCharacterId(id)).filter(Boolean);

          if (parents.length === 0 && children.length === 0) return;
          if (parents.length < 2 && children.length === 0 && type !== 'family') return;

          const key = parents.join('|') || `orphan-${rel.id}`;
          if (!relationshipMap.has(key)) {
            relationshipMap.set(key, {
              id: rel.id || `fam-${key}`,
              label: rel.label || (parents.length > 1 ? 'Family' : 'Unit'),
              parents: parents,
              children: new Set(),
              startDate: rel.startDate || '',
              splitDate: rel.splitDate || '',
              relationshipLabel: rel.label || '',
              type: type
            });
          }
          const entry = relationshipMap.get(key);
          children.forEach(c => entry.children.add(c));

          // Upgrade type if we find a more specific bond for these parents
          const typePriority = {
            'devotion': 10,
            'romance': 9,
            'complicated': 8,
            'arc': 7,
            'family': 6,
            'partnership': 5,
            'operation': 4,
            'organization': 3,
            'friendship': 2,
            'personal': 1
          };
          const currentPriority = typePriority[entry.type] || 0;
          const newPriority = typePriority[type] || 0;

          if (newPriority > currentPriority) {
            entry.type = type;
          }

          if (rel.startDate && (!entry.startDate || rel.startDate < entry.startDate)) entry.startDate = rel.startDate;
          if (rel.splitDate && (!entry.splitDate || rel.splitDate > entry.splitDate)) entry.splitDate = rel.splitDate;
        });

        const relationshipFamilies = Array.from(relationshipMap.values()).map(f => ({
          ...f,
          children: Array.from(f.children)
        }));

        const source = relationshipFamilies;

        const activeYear = Number(String(this.activeYear || '').trim());
        const hasYear = Number.isFinite(activeYear);

        const isBornByReferenceYear = (characterId) => {
          const id = String(characterId || '').toLowerCase().trim();
          if (!id) {
            return false;
          }
          if (!hasYear) {
            return true;
          }
          const core = this.characterCore?.[id];
          const birthRaw = this.getCoreBirthRaw(core);
          const birthParts = this.parseTimelineDateParts(birthRaw || '');
          if (!birthParts) {
            return true; // Permissive: Show character if birth date is unknown
          }
          return birthParts.year <= activeYear;
        };

        const isStartedByReferenceYear = (group) => {
          if (!hasYear) {
            return true;
          }
          const startParts = this.parseTimelineDateParts(group?.startDate || '');
          if (!startParts) {
            return true;
          }
          return startParts.year <= activeYear;
        };

        const splitByReferenceYear = (group) => {
          if (!hasYear) {
            return false;
          }
          const splitParts = this.parseTimelineDateParts(group?.splitDate || '');
          if (!splitParts) {
            return false;
          }
          return splitParts.year <= activeYear;
        };

        const activeFamilies = source
          .map((group) => {
            const parents = (Array.isArray(group.parents) ? group.parents : []);
            const children = (Array.isArray(group.children) ? group.children : []);
            return {
              ...group,
              parents,
              children,
              isSplitByYear: splitByReferenceYear(group)
            };
          })
          .filter((group) => group.parents.length || group.children.length);

        if (!activeFamilies.length) {
          return [];
        }

        const relationshipMembers = activeFamilies.map((group) => {
          const set = new Set();
          (group.parents || []).forEach((id) => set.add(id));
          (group.children || []).forEach((id) => set.add(id));
          return set;
        });

        const adjacency = activeFamilies.map(() => new Set());
        for (let i = 0; i < activeFamilies.length; i += 1) {
          for (let j = i + 1; j < activeFamilies.length; j += 1) {
            const overlap = Array.from(relationshipMembers[i]).some((id) => relationshipMembers[j].has(id));
            if (overlap) {
              adjacency[i].add(j);
              adjacency[j].add(i);
            }
          }
        }

        // Group ALL active families into a single global component
        const components = activeFamilies.length ? [activeFamilies.map((_, i) => i)] : [];

        const finalGroups = components.map((idxs, componentIndex) => {
          const families = idxs.map((idx) => activeFamilies[idx]);
          const allParents = [];
          const allChildren = [];
          families.forEach((group) => {
            (group.parents || []).forEach((id) => allParents.push(id));
            (group.children || []).forEach((id) => allChildren.push(id));
          });

          const parentSet = new Set(allParents);
          const childSet = new Set(allChildren);
          const rootParents = Array.from(parentSet).filter((id) => !childSet.has(id));
          const descendants = Array.from(new Set([...allChildren, ...allParents.filter((id) => !rootParents.includes(id))]));

          const orderedCharacters = Array.from(new Set([...allParents, ...allChildren]));
          const orderIndex = new Map();
          orderedCharacters.forEach((id, index) => orderIndex.set(id, index));
          const allNodeSet = new Set(orderedCharacters);

          const childrenByParent = new Map();
          const indegree = new Map();
          Array.from(allNodeSet).forEach((id) => indegree.set(id, 0));

          families.forEach((group) => {
            const localParents = Array.isArray(group.parents) ? group.parents : [];
            const localChildren = Array.isArray(group.children) ? group.children : [];
            localParents.forEach((parentId) => {
              if (!childrenByParent.has(parentId)) {
                childrenByParent.set(parentId, new Set());
              }
              localChildren.forEach((childId) => {
                if (!allNodeSet.has(childId)) {
                  return;
                }
                if (!childrenByParent.get(parentId).has(childId)) {
                  childrenByParent.get(parentId).add(childId);
                  indegree.set(childId, (indegree.get(childId) || 0) + 1);
                }
              });
            });
          });

          const roots = Array.from(allNodeSet)
            .filter((id) => (indegree.get(id) || 0) === 0)
            .sort((a, b) => (orderIndex.get(a) || 0) - (orderIndex.get(b) || 0));

          const generationById = new Map();
          const queue = [];
          (roots.length ? roots : Array.from(allNodeSet)).forEach((id) => {
            generationById.set(id, 0);
            queue.push(id);
          });

          while (queue.length) {
            const currentId = queue.shift();
            const currentGeneration = Number(generationById.get(currentId) || 0);
            const children = Array.from(childrenByParent.get(currentId) || []);
            children.forEach((childId) => {
              const nextGeneration = currentGeneration + 1;
              if (!generationById.has(childId) || nextGeneration > generationById.get(childId)) {
                generationById.set(childId, nextGeneration);
                queue.push(childId);
              }
            });
          }

          Array.from(allNodeSet).forEach((id) => {
            if (!generationById.has(id)) {
              generationById.set(id, 1);
            }
          });

          const maxGeneration = Math.max(0, ...Array.from(generationById.values()));
          const generations = [];
          for (let generationIndex = 0; generationIndex <= maxGeneration; generationIndex += 1) {
            const ids = Array.from(allNodeSet)
              .filter((id) => generationById.get(id) === generationIndex)
              .sort((a, b) => (orderIndex.get(a) || 0) - (orderIndex.get(b) || 0));
            if (ids.length) {
              generations.push(ids);
            }
          }

          const units = families
            .map((rel, relIndex) => {
              const parents = (Array.isArray(rel.parents) ? rel.parents : [])
                .filter((id) => allNodeSet.has(id));
              const children = (Array.isArray(rel.children) ? rel.children : [])
                .filter((id) => allNodeSet.has(id));
              const relGeneration = parents.length
                ? Math.min(...parents.map((id) => Number(generationById.get(id) || 0)))
                : 0;
              const orderHint = parents.length
                ? Math.min(...parents.map((id) => Number(orderIndex.get(id) || 0)))
                : relIndex;
              return {
                id: String(rel.id || `unit-${relIndex + 1}`),
                parents,
                children,
                generation: relGeneration,
                orderHint,
                type: rel.type || 'family',
                isSplitByYear: !!rel.isSplitByYear,
                relationshipLabel: String(rel.relationshipLabel || '').trim() || (rel.isSplitByYear ? 'Split' : 'Married')
              };
            })
            .filter((unit) => unit.parents.length || unit.children.length)
            .sort((a, b) => {
              if (a.generation !== b.generation) {
                return a.generation - b.generation;
              }
              return a.orderHint - b.orderHint;
            });

          const unitGenerationMap = new Map();
          units.forEach((unit) => {
            const key = Number(unit.generation || 0);
            if (!unitGenerationMap.has(key)) {
              unitGenerationMap.set(key, []);
            }
            unitGenerationMap.get(key).push(unit);
          });

          const partnerPairs = [];
          units.forEach((unit) => {
            const parents = Array.isArray(unit.parents) ? unit.parents : [];
            if (parents.length < 2) {
              return;
            }
            for (let i = 0; i < parents.length; i += 1) {
              for (let j = i + 1; j < parents.length; j += 1) {
                partnerPairs.push([parents[i], parents[j]]);
              }
            }
          });

          const moveToStart = (arr, value) => {
            const list = Array.isArray(arr) ? [...arr] : [];
            const idx = list.indexOf(value);
            if (idx > 0) {
              const [item] = list.splice(idx, 1);
              list.unshift(item);
            }
            return list;
          };

          const moveToEnd = (arr, value) => {
            const list = Array.isArray(arr) ? [...arr] : [];
            const idx = list.indexOf(value);
            if (idx >= 0 && idx < list.length - 1) {
              const [item] = list.splice(idx, 1);
              list.push(item);
            }
            return list;
          };

          const generationUnits = Array.from(unitGenerationMap.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([generation, list]) => {
              const adjusted = (Array.isArray(list) ? list : []).map((unit) => ({
                ...unit,
                children: Array.isArray(unit.children) ? [...unit.children] : []
              }));
              const childOwner = new Map();
              adjusted.forEach((unit, unitIndex) => {
                (unit.children || []).forEach((childId) => {
                  if (!childOwner.has(childId)) {
                    childOwner.set(childId, unitIndex);
                  }
                });
              });

              partnerPairs.forEach(([leftPartner, rightPartner]) => {
                const leftUnitIndex = childOwner.get(leftPartner);
                const rightUnitIndex = childOwner.get(rightPartner);
                if (!Number.isInteger(leftUnitIndex) || !Number.isInteger(rightUnitIndex)) {
                  return;
                }
                if (leftUnitIndex === rightUnitIndex) {
                  return;
                }

                if (leftUnitIndex < rightUnitIndex) {
                  adjusted[leftUnitIndex].children = moveToEnd(adjusted[leftUnitIndex].children, leftPartner);
                  adjusted[rightUnitIndex].children = moveToStart(adjusted[rightUnitIndex].children, rightPartner);
                } else {
                  adjusted[rightUnitIndex].children = moveToEnd(adjusted[rightUnitIndex].children, rightPartner);
                  adjusted[leftUnitIndex].children = moveToStart(adjusted[leftUnitIndex].children, leftPartner);
                }
              });

              return { generation, units: adjusted };
            });

          for (let genIndex = 1; genIndex < generationUnits.length; genIndex += 1) {
            const prevBlock = generationUnits[genIndex - 1];
            const currBlock = generationUnits[genIndex];
            const prevChildren = new Set();
            (Array.isArray(prevBlock?.units) ? prevBlock.units : []).forEach((unit) => {
              (Array.isArray(unit?.children) ? unit.children : []).forEach((id) => prevChildren.add(id));
            });
            currBlock.units = (Array.isArray(currBlock?.units) ? currBlock.units : []).map((unit) => {
              const parents = Array.isArray(unit?.parents) ? unit.parents : [];
              const compactIntoPreviousGeneration = parents.length > 0 && parents.every((id) => prevChildren.has(id));
              return {
                ...unit,
                compactIntoPreviousGeneration
              };
            });
          }

          const dedupedGenerationUnits = generationUnits
            .map((block) => {
              const units = (Array.isArray(block?.units) ? block.units : [])
                .map((unit) => {
                  return {
                    ...unit,
                    parents: Array.isArray(unit?.parents) ? unit.parents : [],
                    children: Array.isArray(unit?.children) ? unit.children : []
                  };
                });
              return {
                generation: block.generation,
                units
              };
            })
            .filter((block) => Array.isArray(block.units) && block.units.length);

          const labels = Array.from(new Set(families.map((group) => String(group.label || '').trim()).filter(Boolean)));
          const mergedLabel = labels.length > 1 ? `${labels[0]} + ${labels.slice(1).join(' + ')}` : (labels[0] || `Relationship Group ${componentIndex + 1}`);
          const isSplitByYear = families.some((group) => group.isSplitByYear && (group.parents || []).length > 1);
          const relationshipLabel = isSplitByYear ? 'Split' : 'Married';

          return {
            id: families.map((group) => group.id).filter(Boolean).join('+') || `relationship-${componentIndex + 1}`,
            label: mergedLabel,
            parents: rootParents,
            children: descendants,
            generations,
            generationUnits: dedupedGenerationUnits,
            key: 'relationships',
            data: relationshipFamilies
          };
        });

        return finalGroups;
      } catch (e) {
        console.error('MR: relationshipTreeGroups failed', e);
        return [];
      }
    },
    selectedCharacterRelationships() {
      const charId = this.selectedTreeCharacter;
      if (!charId) return [];

      const resolvedId = this.getResolvedCharacterId(charId);
      const allRels = Array.isArray(this.relationships) ? this.relationships : [];

      return allRels.filter(rel => {
        const members = Array.isArray(rel.members) ? rel.members : [];
        const children = Array.isArray(rel.children) ? rel.children : [];
        const allInvolved = [...members, ...children].map(m => this.getResolvedCharacterId(m));
        return allInvolved.includes(resolvedId);
      }).map(rel => {
        const members = Array.isArray(rel.members) ? rel.members : [];
        const children = Array.isArray(rel.children) ? rel.children : [];

        // Find others
        const others = [...members, ...children]
          .map(m => String(m).toLowerCase().trim())
          .filter(m => this.getResolvedCharacterId(m) !== resolvedId);

        return {
          id: rel.id,
          label: rel.label || 'Untitled',
          type: rel.type || 'unknown',
          others: others.map(id => ({
            id,
            name: this.relationshipDisplayNameById(id) || id
          })),
          notes: rel.notes || '',
          source: String(rel.__source || '').split('/').pop() || 'Unknown'
        };
      });
    },
    relationshipTreeGraphGroups() {
      const groups = Array.isArray(this.relationshipTreeGroups) ? this.relationshipTreeGroups : [];
      const CARD_W = 150;
      const CARD_H = 214;
      const NODE_GAP = 60;
      const ROW_GAP = 120;
      const PAD_X = 50;
      const PAD_Y = 50;

      return groups.map((group, groupIndex) => {
        // Initialize Dagre graph
        const g = new global.dagre.graphlib.Graph();
        g.setGraph({
          rankdir: 'TB',
          nodesep: NODE_GAP,
          ranksep: ROW_GAP,
          marginx: PAD_X,
          marginy: PAD_Y
        });
        g.setDefaultEdgeLabel(() => ({}));

        const families = Array.isArray(group.generationUnits)
          ? group.generationUnits.flatMap(gen => gen.units || [])
          : [];

        const allCharacterIds = new Set();
        families.forEach(f => {
          (f.parents || []).forEach(id => allCharacterIds.add(id));
          (f.children || []).forEach(id => allCharacterIds.add(id));
        });

        // 1. Add character nodes
        allCharacterIds.forEach(charId => {
          g.setNode(`char:${charId}`, { width: CARD_W, height: CARD_H });
        });

        // 2. Add family "Union" nodes (virtual nodes for marriage lines)
        families.forEach((f, fIdx) => {
          const unionId = `union:${f.id || fIdx}`;
          g.setNode(unionId, {
            width: 80,
            height: 30,
            label: f.relationshipLabel || (f.isSplitByYear ? 'Split' : 'Family'),
            isSplit: f.isSplitByYear
          });

          // Edges: Parents -> Union
          (f.parents || []).forEach(parentId => {
            g.setEdge(`char:${parentId}`, unionId);
          });

          // Edges: Union -> Children
          (f.children || []).forEach(childId => {
            g.setEdge(unionId, `char:${childId}`);
          });
        });

        // Run layout
        global.dagre.layout(g);

        // Extract results
        const nodes = [];
        const labels = [];
        const edges = [];

        g.nodes().forEach(v => {
          const nodeData = g.node(v);
          if (v.startsWith('char:')) {
            const charId = v.replace('char:', '');
            nodes.push({
              key: `node:${groupIndex}:${v}`,
              charId,
              x: nodeData.x - (CARD_W / 2),
              y: nodeData.y - (CARD_H / 2),
              width: CARD_W,
              height: CARD_H,
              deceased: this.isCharacterDeceasedByYear(charId, this.activeYear)
            });
          } else if (v.startsWith('union:')) {
            labels.push({
              key: `label:${groupIndex}:${v}`,
              text: nodeData.label,
              x: nodeData.x,
              y: nodeData.y,
              split: nodeData.isSplit
            });
          }
        });

        g.edges().forEach(e => {
          const edgeData = g.edge(e);
          const points = edgeData.points || [];
          if (points.length < 2) return;

          // Create a smooth curve path using D3 curve basis if available, 
          // or a simple cubic bezier for family feel
          let d = `M ${points[0].x} ${points[0].y}`;
          if (points.length === 3) {
            d += ` Q ${points[1].x} ${points[1].y} ${points[2].x} ${points[2].y}`;
          } else if (points.length > 3) {
            // Poly-line curve
            for (let i = 1; i < points.length; i++) {
              d += ` L ${points[i].x} ${points[i].y}`;
            }
          } else {
            d += ` L ${points[1].x} ${points[1].y}`;
          }

          edges.push({
            key: `edge:${groupIndex}:${e.v}:${e.w}`,
            type: e.w.startsWith('union:') ? 'trunk' : 'branch',
            path: d
          });
        });

        const graphInfo = g.graph();
        return {
          id: group.id || `graph-${groupIndex}`,
          label: group.label,
          width: Math.max(graphInfo.width || 800, 860),
          height: Math.max(graphInfo.height || 600, 320),
          nodes,
          labels,
          edges
        };
      });
    },
    timelineCharacterTagSet() {
      return new Set(
        Object.keys(this.characterCore || {}).map((id) => String(id || '').toLowerCase())
      );
    },
    timelineTagGroups() {
      // Build character-to-group map from master entries
      const charGroupMap = new Map();
      (this.entries || []).forEach(entry => {
        const id = String(entry.id || '').toLowerCase().trim();
        if (id && entry.navGroup) {
          charGroupMap.set(id, entry.navGroup);
        }
      });

      const counts = new Map();
      (this.injectedTimelineEvents || []).forEach((event) => {
        const tags = Array.isArray(event?.tags) ? event.tags : [];
        tags
          .map((tag) => this.plainText(tag))
          .filter(Boolean)
          .forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1));
      });

      const ordered = Array.from(counts.entries())
        .sort((a, b) => {
          if (b[1] !== a[1]) {
            return b[1] - a[1];
          }
          return a[0].localeCompare(b[0]);
        });

      const groups = { characters: [], characterGroups: [], events: [], other: [], otherGroups: [], tagCounts: Object.fromEntries(counts) };
      const otherBuckets = {
        years: [],
        locations: [],
        organizations: [],
        topics: [],
        events: [],
        items: [],
        themes: [],
        misc: []
      };

      const charBuckets = {}; // groupName -> [tags]

      ordered.forEach(([tag]) => {
        const type = this.timelineTagType(tag);
        if (type === 'character') {
          groups.characters.push(tag);

          const lower = tag.toLowerCase().trim();

          // Only source: core.json navGroup (or group)
          const core = this.characterCore?.[lower];
          let groupName = core?.navGroup || core?.group;

          if (!groupName) {
            groupName = 'Characters';
          }

          if (!charBuckets[groupName]) charBuckets[groupName] = [];
          charBuckets[groupName].push(tag);
          return;
        }
        if (type === 'event') {
          groups.events.push(tag);
          return;
        }
        groups.other.push(tag);
        const otherKey = this.timelineOtherGroupKey(tag);
        if (otherBuckets[otherKey]) {
          otherBuckets[otherKey].push(tag);
        } else {
          otherBuckets.misc.push(tag);
        }
      });

      // Collapse small groups (<= 2 members) into "Other Characters"
      const finalCharGroups = [];
      const otherCharsGroup = { name: 'Other Characters', tags: [] };

      Object.entries(charBuckets).forEach(([name, tags]) => {
        if (tags.length <= 2 && name !== 'Characters') {
          otherCharsGroup.tags.push(...tags);
        } else {
          finalCharGroups.push({ name, tags });
        }
      });

      if (otherCharsGroup.tags.length > 0) {
        finalCharGroups.push(otherCharsGroup);
      }

      // Sort character groups by volume (total entries in group)
      groups.characterGroups = finalCharGroups.sort((a, b) => {
        const sumA = a.tags.reduce((s, t) => s + (counts.get(t) || 0), 0);
        const sumB = b.tags.reduce((s, t) => s + (counts.get(t) || 0), 0);
        if (sumB !== sumA) return sumB - sumA;
        return a.name.localeCompare(b.name);
      });

      groups.otherGroups = ['locations', 'organizations', 'topics', 'events', 'items', 'themes', 'misc']
        .map((key) => {
          let tags = otherBuckets[key] || [];
          if (key === 'misc') {
            tags = [...tags].sort((a, b) => a.localeCompare(b));
          }
          return {
            key,
            label: this.timelineOtherGroupLabel(key),
            tags
          };
        })
        .filter((group) => Array.isArray(group.tags) && group.tags.length);

      return groups;
    },
    charsheetPromptSubjectList() {
      // 1. Get characters from active tags (include expanded ones if in sequential mode)
      const baseTags = this.timelineSequentialMode ? this.timelineActiveTagsExpanded : this.timelineActiveTagsNormalized;
      const activeCharTags = baseTags.filter(tag => this.timelineTagType(tag) === 'character');

      if (activeCharTags.length > 0) {
        return activeCharTags.sort((a, b) => a.localeCompare(b));
      }

      // 2. If no active character tags, get all unique characters from current filtered events
      const allEvents = Array.isArray(this.filteredTimelineEvents) ? this.filteredTimelineEvents : [];
      const charSet = new Set();

      allEvents.forEach(ev => {
        const tags = Array.isArray(ev?.tags) ? ev.tags : [];
        tags.forEach(tag => {
          const pt = this.plainText(tag);
          if (pt && this.timelineTagType(pt) === 'character') {
            charSet.add(pt);
          }
        });
      });

      return Array.from(charSet).sort((a, b) => a.localeCompare(b));
    },
    charsheetWriterOptions() {
      const allIds = Object.keys(this.characterCore || {});
      return allIds
        .filter(id => this.characterCore[id]?.['full name'])
        .sort((a, b) => a.localeCompare(b));
    },
    timelineActiveTagsNormalized() {
      const raw = Array.isArray(this.timelineActiveTags) ? this.timelineActiveTags : [];
      return Array.from(
        new Set(
          raw
            .map((tag) => {
              const clean = String(tag || '').trim();
              const isNeg = clean.startsWith('-');
              const base = isNeg ? clean.slice(1).trim() : clean;
              const resolved = this.getResolvedCharacterId(this.plainText(base));
              return resolved ? (isNeg ? `-${resolved}` : resolved) : '';
            })
            .filter(Boolean)
        )
      );
    },
    timelineActiveTagsExpanded() {
      const base = this.timelineActiveTagsNormalized;
      const positiveBase = base.filter(tag => !tag.startsWith('-'));
      const negativeBase = base.filter(tag => tag.startsWith('-'));

      if (!this.timelineSequentialMode) {
        return base;
      }

      // Sequential tag expansion (1-hop co-occurrence)
      const activeChars = positiveBase.filter(tag => this.timelineTagType(tag) === 'character');
      if (activeChars.length === 0) {
        return base;
      }

      const reached = new Set(activeChars);

      // Pre-process all events and their character tags to build a fast co-occurrence list
      const events = Array.isArray(this.injectedTimelineEvents) ? this.injectedTimelineEvents : [];
      
      const yearFrom = this.timelineYearFrom;
      const yearTo = this.timelineYearTo;
      const hasYearFrom = yearFrom !== null && yearFrom !== '' && Number.isFinite(Number(yearFrom));
      const hasYearTo = yearTo !== null && yearTo !== '' && Number.isFinite(Number(yearTo));
      const monthFrom = this.timelineMonthFrom;
      const monthTo = this.timelineMonthTo;
      const hasMonthFrom = this.timelineMonthsOpen && monthFrom && monthFrom !== '00';
      const hasMonthTo = this.timelineMonthsOpen && monthTo && monthTo !== '00';

      for (const event of events) {
        // Date range filtering (Year and Month) for sequential expansion!
        const eventYear = this.timelineEventYear(event);
        const parsed = this.parseTimelineDateParts(event?.date);
        const eventMonth = parsed ? parsed.month : 0;

        if (eventYear !== null) {
          const startYear = hasYearFrom ? Number(yearFrom) : -Infinity;
          const startMonth = hasMonthFrom ? Number(monthFrom) : 1;
          const endYear = hasYearTo ? Number(yearTo) : Infinity;
          const endMonth = hasMonthTo ? Number(monthTo) : 12;

          if (eventYear < startYear || eventYear > endYear) continue;

          if (eventMonth > 0) {
            const eventVal = eventYear * 100 + eventMonth;
            const startVal = startYear * 100 + startMonth;
            const endVal = endYear * 100 + endMonth;

            if (eventVal < startVal) continue;
            if (eventVal > endVal) continue;
          }
        } else if (hasYearFrom || hasYearTo || hasMonthFrom || hasMonthTo) {
          continue;
        }

        const tags = Array.isArray(event?.tags) ? event.tags.map(t => this.plainText(t)).filter(Boolean) : [];
        const charsInEvent = tags
          .map(t => this.getResolvedCharacterId(t))
          .filter(t => this.timelineTagType(t) === 'character');
        
        // If the event features any of our active characters, add all other characters in that event
        const featuresActiveChar = charsInEvent.some(char => activeChars.includes(char));
        if (featuresActiveChar) {
          charsInEvent.forEach(char => reached.add(char));
        }
      }

      // Combine non-character base tags with the reached connected characters
      const nonChars = positiveBase.filter(tag => this.timelineTagType(tag) !== 'character');
      const excluded = this.timelineSequentialExcludedTags || [];
      const reachedFiltered = Array.from(reached).filter(tag => !excluded.includes(tag));
      return Array.from(new Set([...nonChars, ...reachedFiltered, ...negativeBase]));
    },
    timelineActiveTagsOnlyExpanded() {
      const base = this.timelineActiveTagsNormalized;
      const expanded = this.timelineActiveTagsExpanded;
      if (!this.timelineSequentialMode) return [];
      const excluded = this.timelineSequentialExcludedTags || [];
      return expanded.filter(tag => !base.includes(tag) && !excluded.includes(tag));
    },
    timelineTagSuggestions() {
      const search = (this.timelineSearchLocal || '').trim();
      const isSlash = search.startsWith('/');
      const isDash = search.startsWith('-');
      if ((!isSlash && !isDash) || search.length < 1) return [];
      const q = search.slice(1).toLowerCase();

      const results = [];
      const seen = new Set();

      // 1. Characters
      Object.entries(this.characterCore || {}).forEach(([id, core]) => {
        const lowerId = id.toLowerCase();
        const fullName = String(core['full name'] || '').toLowerCase();
        const navLabel = String(core.navLabel || '').toLowerCase();

        if (lowerId.includes(q) || fullName.includes(q) || navLabel.includes(q)) {
          if (!seen.has(lowerId)) {
            results.push({
              id: lowerId,
              label: id,
              sub: 'Character',
              type: 'character',
              icon: core.icon || 'user'
            });
            seen.add(lowerId);
          }
        }
      });

      // 2. Entities
      Object.entries(this.entitiesRegistry || {}).forEach(([id, data]) => {
        const lowerId = id.toLowerCase();
        const name = String(data.name || '').toLowerCase();

        if (lowerId.includes(q) || name.includes(q)) {
          if (!seen.has(lowerId)) {
            results.push({
              id: lowerId,
              label: id,
              sub: data._category || 'Entity',
              type: 'entity',
              icon: data.iconKey || 'map-pin'
            });
            seen.add(lowerId);
          }
        }
      });

      // 3. Other/General Timeline tags (Themes, Events, Custom Tags from timeline)
      const tagCounts = (this.timelineTagGroups && this.timelineTagGroups.tagCounts) ? this.timelineTagGroups.tagCounts : {};
      Object.keys(tagCounts).forEach(tag => {
        const lowerTag = tag.toLowerCase();
        if (lowerTag.includes(q)) {
          if (!seen.has(lowerTag)) {
            const type = this.timelineTagType(tag);
            let sub = 'Tag';
            let icon = 'tag';

            if (type === 'character') {
              sub = 'Character';
              icon = 'user';
            } else if (type === 'entity') {
              sub = 'Entity';
              icon = 'map-pin';
            } else if (type === 'event') {
              sub = 'Event';
              icon = 'calendar';
            } else {
              if (TIMELINE_THEME_TAG_HINTS && TIMELINE_THEME_TAG_HINTS.has(lowerTag)) {
                sub = 'Theme';
                icon = 'feather';
              } else if (TIMELINE_LOCATION_TAG_HINTS && TIMELINE_LOCATION_TAG_HINTS.has(lowerTag)) {
                sub = 'Location';
                icon = 'map-pin';
              } else if (TIMELINE_ORG_TAG_HINTS && TIMELINE_ORG_TAG_HINTS.has(lowerTag)) {
                sub = 'Organization';
                icon = 'briefcase';
              }
            }

            const resolvedIcon = this.timelineTagIcon(tag);

            results.push({
              id: lowerTag,
              label: tag,
              sub: sub,
              type: type,
              icon: resolvedIcon || icon
            });
            seen.add(lowerTag);
          }
        }
      });

      return results.slice(0, 50);
    },
    timelineActiveTagSet() {
      const tags = (this.timelineActiveTagsExpanded || [])
        .filter(tag => !tag.startsWith('-'));
      return new Set(tags);
    },
    timelineNegativeTagSet() {
      const tags = (this.timelineActiveTagsNormalized || [])
        .filter(tag => tag.startsWith('-'))
        .map(tag => tag.slice(1).trim());
      return new Set(tags);
    },
    addRecordTagCandidates() {
      const text = (this.addRecordDescription || '') + ' ' + (this.addRecordTitle || '') + ' ' + (this.addRecordBulkText || '');
      const detected = this.detectCharacterTagsInText(text);

      const grouped = this.timelineTagGroups || { characters: [], events: [], otherGroups: [] };

      // Only include tags that have been used in the story (timelineEvents)
      const storyCharacters = (grouped.characters || []).map(t => this.plainText(t)).filter(Boolean);
      const storyEvents = (grouped.events || []).map(t => this.plainText(t)).filter(Boolean);

      // Combine: Detected first, then story characters, then story events
      const all = [...detected, ...storyCharacters, ...storyEvents];

      // Limit to a reasonable number if it's too big
      return Array.from(new Set(all)).slice(0, 40);
    },
    addRecordRelationshipTypeOptions() {
      const fromData = Array.from(new Set(
        (Array.isArray(this.relationships) ? this.relationships : [])
          .map((row) => String(row?.type || '').trim())
          .filter(Boolean)
      ));
      const defaults = ['relationship', 'family', 'friendship', 'adoption', 'social-group', 'organization'];
      return Array.from(new Set([...fromData, ...defaults]));
    },
    datePickerStatusLabel() {
      if (!this.datePickerReady) {
        return 'Date picker unavailable';
      }
      const count = Number(this.datePickerInitializedCount || 0);
      return count > 0 ? `Date picker ready (${count})` : 'Date picker ready';
    },
    filteredTimelineEvents() {
      const rawSearch = (this.timelineSearch || '').trim();
      let searchQ = '';
      let tagQ = '';

      if (rawSearch.startsWith('/') || rawSearch.startsWith('-')) {
        tagQ = rawSearch.slice(1).toLowerCase().trim();
      } else {
        searchQ = this.normalize(rawSearch);
      }

      const yearFrom = this.timelineYearFrom;
      const yearTo = this.timelineYearTo;
      const hasYearFrom = yearFrom !== null && yearFrom !== '' && Number.isFinite(Number(yearFrom));
      const hasYearTo = yearTo !== null && yearTo !== '' && Number.isFinite(Number(yearTo));
      const monthFrom = this.timelineMonthFrom;
      const monthTo = this.timelineMonthTo;
      const hasMonthFrom = this.timelineMonthsOpen && monthFrom && monthFrom !== '00';
      const hasMonthTo = this.timelineMonthsOpen && monthTo && monthTo !== '00';
      const activeTagSet = this.timelineActiveTagSet;
      const negativeTagSet = this.timelineNegativeTagSet;
      const hasActiveTags = activeTagSet.size > 0;
      const hasNegativeTags = negativeTagSet.size > 0;
      const hasAnyFilters = hasActiveTags || hasNegativeTags;
      const hasDateCreatedFilter = this.timelineDateCreatedFilterMode && this.timelineDateCreatedFilterMode !== 'all';
      const hasWordTags = Array.isArray(this.timelineActiveWordTags) && this.timelineActiveWordTags.length > 0;
      const hasStackedRanges = Array.isArray(this.timelineYearRanges) && this.timelineYearRanges.length > 0;

      // Fast-path for no filters: return the full list directly without any allocations
      const fullList = this.injectedTimelineEvents || [];
      if (!tagQ && !searchQ && !hasAnyFilters && !hasYearFrom && !hasYearTo && !hasMonthFrom && !hasMonthTo && !hasDateCreatedFilter && !hasWordTags && !hasStackedRanges) {
        if (this.timelineReverseOrder) {
          return [...fullList].reverse();
        }
        return fullList;
      }

      // Stage 1: Fast filter on raw event properties (Year, Month, DateCreated)
      let todayStr = '';
      let yesterdayStr = '';
      let sevenDaysAgoStr = '';
      let thirtyDaysAgoStr = '';
      if (hasDateCreatedFilter) {
        const getLocalDateStr = (d) => {
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          return `${yyyy}-${mm}-${dd}`;
        };
        const today = new Date();
        todayStr = getLocalDateStr(today);
        yesterdayStr = getLocalDateStr(new Date(today.getTime() - 24 * 60 * 60 * 1000));
        sevenDaysAgoStr = getLocalDateStr(new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000));
        thirtyDaysAgoStr = getLocalDateStr(new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000));
      }

      const selectedCharacterTags = (this.timelineActiveTagsNormalized || [])
        .filter(tag => !tag.startsWith('-'))
        .filter((tag) => {
          const type = this.timelineTagType(tag);
          return type === 'character' || type === 'entity';
        });
      const selectedCharacterTagSet = new Set(selectedCharacterTags);

      const activeRanges = [];
      if (Array.isArray(this.timelineYearRanges)) activeRanges.push(...this.timelineYearRanges);
      if (hasYearFrom || hasYearTo || hasMonthFrom || hasMonthTo) {
        activeRanges.push({
          from: hasYearFrom ? Number(yearFrom) : null,
          to: hasYearTo ? Number(yearTo) : null,
          monthFrom: hasMonthFrom ? monthFrom : '',
          monthTo: hasMonthTo ? monthTo : '',
          exclude: this.timelineExcludeYearRange === true
        });
      }

      const stage1Parsed = [];
      for (let i = 0; i < fullList.length; i++) {
        const event = fullList[i];
        
        // 1. Filter by Year and Month
        const eventYear = this.timelineEventYear(event);
        const dateStr = String(event?.date || '').trim();
        const monthMatch = dateStr.match(/^[^-]+-(\d{1,2})/);
        const eventMonth = monthMatch ? Number(monthMatch[1]) : 0;

        if (activeRanges.length > 0) {
          const inclusionRanges = activeRanges.filter(r => !r.exclude);
          const exclusionRanges = activeRanges.filter(r => r.exclude);

          let inRange = false;
          if (eventYear !== null) {
            // Check if matches inclusion:
            let matchesInclusion = true;
            if (inclusionRanges.length > 0) {
              matchesInclusion = inclusionRanges.some(r => {
                const startYear = (r.from !== null && r.from !== '') ? Number(r.from) : -Infinity;
                const startMonth = (this.timelineMonthsOpen && r.monthFrom && r.monthFrom !== '00') ? Number(r.monthFrom) : 1;
                const endYear = (r.to !== null && r.to !== '') ? Number(r.to) : Infinity;
                const endMonth = (this.timelineMonthsOpen && r.monthTo && r.monthTo !== '00') ? Number(r.monthTo) : 12;

                if (eventYear < startYear || eventYear > endYear) return false;
                if (eventMonth > 0) {
                  const eventVal = eventYear * 100 + eventMonth;
                  const startVal = startYear * 100 + startMonth;
                  const endVal = endYear * 100 + endMonth;
                  if (eventVal < startVal || eventVal > endVal) return false;
                }
                return true;
              });
            }

            // Check if matches exclusion:
            let matchesExclusion = true;
            if (exclusionRanges.length > 0) {
              const insideAnyExclusion = exclusionRanges.some(r => {
                const startYear = (r.from !== null && r.from !== '') ? Number(r.from) : -Infinity;
                const startMonth = (this.timelineMonthsOpen && r.monthFrom && r.monthFrom !== '00') ? Number(r.monthFrom) : 1;
                const endYear = (r.to !== null && r.to !== '') ? Number(r.to) : Infinity;
                const endMonth = (this.timelineMonthsOpen && r.monthTo && r.monthTo !== '00') ? Number(r.monthTo) : 12;

                if (eventYear < startYear || eventYear > endYear) return false;
                if (eventMonth > 0) {
                  const eventVal = eventYear * 100 + eventMonth;
                  const startVal = startYear * 100 + startMonth;
                  const endVal = endYear * 100 + endMonth;
                  if (eventVal < startVal || eventVal > endVal) return false;
                }
                return true;
              });
              if (insideAnyExclusion) {
                matchesExclusion = false;
              }
            }

            inRange = matchesInclusion && matchesExclusion;
          } else {
            inRange = (inclusionRanges.length === 0);
          }

          if (!inRange) continue;
        }

        // 2. Filter by Date Created
        if (hasDateCreatedFilter) {
          const dc = String(event?.datecreated || '').trim();
          if (!dc) continue;

          if (this.timelineDateCreatedFilterMode === 'today') {
            if (dc !== todayStr) continue;
          } else if (this.timelineDateCreatedFilterMode === 'yesterday') {
            if (dc !== yesterdayStr) continue;
          } else if (this.timelineDateCreatedFilterMode === 'week') {
            if (dc < sevenDaysAgoStr || dc > todayStr) continue;
          } else if (this.timelineDateCreatedFilterMode === 'month') {
            if (dc < thirtyDaysAgoStr || dc > todayStr) continue;
          } else if (this.timelineDateCreatedFilterMode === 'custom') {
            const customTarget = String(this.timelineDateCreatedCustom || '').trim();
            if (customTarget && dc !== customTarget) continue;
          }
        }

        stage1Parsed.push({ event, sourceIndex: i, eventYear });
      }

      // Stage 2: Perform tag parsing and tag/search filters only on surviving events
      const stage2Filtered = [];
      for (const item of stage1Parsed) {
        const event = item.event;
        const tags = Array.isArray(event?.tags) ? event.tags.map((tag) => this.plainText(tag)).filter(Boolean) : [];
        const resolvedTags = tags.map(t => this.getResolvedCharacterId(t));

        // Negative tag exclusion check (fail-fast)
        const negativeMatchCount = hasNegativeTags
          ? resolvedTags.reduce((count, tag) => count + (negativeTagSet.has(tag) ? 1 : 0), 0)
          : 0;
        if (hasNegativeTags && negativeMatchCount > 0) continue;

        // Build single haystack for searches and word checks
        const haystack = [
          this.plainText(event?.date || ''),
          this.plainText(event?.title || ''),
          this.plainText(event?.description || ''),
          ...tags
        ]
          .map((value) => this.normalize(value))
          .join(' ');

        const wordTags = Array.isArray(this.timelineActiveWordTags) ? this.timelineActiveWordTags : [];
        const positiveWordTags = wordTags.filter(w => !w.startsWith('-'));
        const negativeWordTags = wordTags.filter(w => w.startsWith('-')).map(w => w.slice(1).trim());

        // Negative word exclusions (fail-fast)
        if (negativeWordTags.length > 0) {
          const passesNegativeWords = negativeWordTags.every(term => {
            const normTerm = this.normalize(term);
            if (!normTerm) return true;
            const escaped = normTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp('\\b' + escaped + '\\b', 'i');
            return !regex.test(haystack);
          });
          if (!passesNegativeWords) continue;
        }

        // Active tag & Positive word filtering check
        const eventYearStr = item.eventYear != null ? String(item.eventYear) : null;
        const matchesActiveYear = eventYearStr && activeTagSet.has(eventYearStr);
        const matchCount = hasActiveTags
          ? resolvedTags.reduce((count, tag) => count + (activeTagSet.has(tag) ? 1 : 0), 0)
          : 0;

        if (this.timelineTagMode === 'and') {
          // AND Mode: must match ALL active tags AND ALL positive word tags
          let passesActiveTags = true;
          const userActivePositiveTags = (this.timelineActiveTagsNormalized || [])
            .filter(tag => !tag.startsWith('-'));
          if (userActivePositiveTags.length > 0) {
            passesActiveTags = userActivePositiveTags.every(tag => {
              return resolvedTags.includes(tag) || (eventYearStr === tag);
            });
          }

          let passesPositiveWords = true;
          if (positiveWordTags.length > 0) {
            passesPositiveWords = positiveWordTags.every(term => {
              const normTerm = this.normalize(term);
              if (!normTerm) return true;
              const escaped = normTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const regex = new RegExp('\\b' + escaped + '\\b', 'i');
              return regex.test(haystack);
            });
          }

          if (!passesActiveTags || !passesPositiveWords) continue;
        } else if (this.timelineTagMode === 'excl') {
          // EXCL Mode: must match at least one active tag, but the event's character tags must exclusively be in the active character tags set.
          let passesExcl = true;
          if (hasActiveTags) {
            const matchesAnyActive = (matchCount > 0) || matchesActiveYear;
            if (!matchesAnyActive) {
              passesExcl = false;
            } else {
              const evCharTags = this.timelineCharacterTags(event);
              const hasOtherChar = evCharTags.some((charId) => !selectedCharacterTagSet.has(charId));
              if (hasOtherChar) {
                passesExcl = false;
              }
            }
          }

          let passesPositiveWords = true;
          if (positiveWordTags.length > 0) {
            passesPositiveWords = positiveWordTags.every(term => {
              const normTerm = this.normalize(term);
              if (!normTerm) return true;
              const escaped = normTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const regex = new RegExp('\\b' + escaped + '\\b', 'i');
              return regex.test(haystack);
            });
          }

          if (!passesExcl || !passesPositiveWords) continue;
        } else {
          // OR Mode: must match ANY active tag OR ANY positive word tag
          if (hasActiveTags || positiveWordTags.length > 0) {
            let matchesAnyActiveTag = false;
            if (hasActiveTags) {
              matchesAnyActiveTag = (matchCount > 0) || matchesActiveYear;
            }

            let matchesAnyPositiveWord = false;
            if (positiveWordTags.length > 0) {
              matchesAnyPositiveWord = positiveWordTags.some(term => {
                const normTerm = this.normalize(term);
                if (!normTerm) return false;
                const escaped = normTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp('\\b' + escaped + '\\b', 'i');
                return regex.test(haystack);
              });
            }

            if (!matchesAnyActiveTag && !matchesAnyPositiveWord) continue;
          }
        }

        // Passes search filter check
        let passesSearch = true;
        if (tagQ) {
          passesSearch = tags.some((t) => {
            const tagId = String(t || '').toLowerCase().trim();
            const resolvedTagId = this.getResolvedCharacterId(tagId);
            if (tagId.includes(tagQ) || resolvedTagId.includes(tagQ)) return true;

            const core = this.characterCore?.[tagId] || this.characterCore?.[resolvedTagId];
            if (core) {
              const fullName = String(core['full name'] || '').toLowerCase();
              const navLabel = String(core.navLabel || '').toLowerCase();
              if (fullName.includes(tagQ) || navLabel.includes(tagQ)) return true;
            }
            return false;
          });
          if (!passesSearch) continue;
        } else if (rawSearch) {
          passesSearch = this.matchSearchQuery(rawSearch, haystack);
          if (!passesSearch) continue;
        }

        const characterMatchCount = selectedCharacterTagSet.size > 0
          ? resolvedTags.reduce((count, tag) => count + (selectedCharacterTagSet.has(tag) ? 1 : 0), 0)
          : 0;

        stage2Filtered.push({
          event,
          sourceIndex: item.sourceIndex,
          tags,
          resolvedTags,
          matchCount,
          negativeMatchCount,
          characterMatchCount
        });
      }

      // Stage 3: Deduplication, sorting, and extraction
      let list = stage2Filtered;
      if (selectedCharacterTagSet.size >= 2) {
        const deduped = new Map();
        stage2Filtered.forEach((item) => {
          const ev = item?.event || {};
          const kind = ev?.__relationshipSynthetic
            ? `relationship:${String(ev?.__relationshipId || '').trim()}:${String(ev?.__relationshipDateField || '').trim()}`
            : (ev?.__birthdaySynthetic
              ? `birthday:${String(ev?.__characterId || '').trim()}`
              : 'timeline');
          const signature = [
            kind,
            this.normalize(this.plainText(ev?.date || '')),
            this.normalize(this.plainText(ev?.title || '')),
            this.normalize(this.plainText(ev?.description || ''))
          ].join('::');

          const current = deduped.get(signature);
          if (!current) {
            deduped.set(signature, item);
            return;
          }

          if (item.characterMatchCount > current.characterMatchCount) {
            deduped.set(signature, item);
            return;
          }
          if (item.characterMatchCount === current.characterMatchCount && item.matchCount > current.matchCount) {
            deduped.set(signature, item);
            return;
          }
          if (item.characterMatchCount === current.characterMatchCount && item.matchCount === current.matchCount && item.sourceIndex < current.sourceIndex) {
            deduped.set(signature, item);
          }
        });
        list = Array.from(deduped.values());
      }

      list.sort((a, b) => {
        const pa = this.parseTimelineDateParts(a?.event?.date || '');
        const pb = this.parseTimelineDateParts(b?.event?.date || '');

        let diff = 0;
        if (!pa && !pb) {
          diff = a.sourceIndex - b.sourceIndex;
        } else if (!pa) {
          diff = 1;
        } else if (!pb) {
          diff = -1;
        } else if (pa.year !== pb.year) {
          diff = pa.year - pb.year;
        } else if (pa.month !== pb.month) {
          diff = pa.month - pb.month;
        } else if (pa.day !== pb.day) {
          diff = pa.day - pb.day;
        } else {
          // Same day tie-breaker: Birth < Regular < Death
          const getPriority = (item) => {
            if (item.event?.__birthdaySynthetic) return -1;
            if (item.event?.__deathSynthetic) return 1;
            return 0;
          };
          const pA = getPriority(a);
          const pB = getPriority(b);
          if (pA !== pB) {
            diff = pA - pB;
          } else {
            // Same day parent-first topological sort tie-breaker
            const rootIdA = a.event?.__rootId;
            const rootIdB = b.event?.__rootId;

            if (rootIdA && rootIdB && rootIdA !== rootIdB) {
              const getRootSourceIndex = (item, rootId) => {
                const rootEvent = (this.injectedTimelineEvents || []).find(e => e.id === rootId);
                if (rootEvent) {
                  const idx = (this.injectedTimelineEvents || []).indexOf(rootEvent);
                  if (idx !== -1) return idx;
                }
                return item.sourceIndex;
              };
              diff = getRootSourceIndex(a, rootIdA) - getRootSourceIndex(b, rootIdB);
            } else if (rootIdA && rootIdB) {
              const depthA = a.event?.__depth || 0;
              const depthB = b.event?.__depth || 0;
              if (depthA !== depthB) {
                diff = depthA - depthB;
              } else {
                diff = a.sourceIndex - b.sourceIndex;
              }
            } else {
              const aIdx = typeof a.sourceIndex === 'number' ? a.sourceIndex : 999999;
              const bIdx = typeof b.sourceIndex === 'number' ? b.sourceIndex : 999999;
              diff = aIdx - bIdx;
            }
          }
        }

      return this.timelineReverseOrder ? -diff : diff;
    });

    return list.map((item) => item.event);
  },
    groupedFilteredTimelineEvents() {
      const allEvents = Array.isArray(this.filteredTimelineEvents) ? this.filteredTimelineEvents : [];
      const events = allEvents.slice(0, this.timelineLimit);
      const groups = [];
      const byDate = new Map();

      events.forEach((event, index) => {
        const dateRaw = String(event?.date || '').trim();
        const dateLabel = dateRaw ? this.formatTimelineDate(dateRaw) : 'Unknown Date';
        const parsed = this.parseTimelineDateParts(dateRaw);
        const dateKey = parsed
          ? `${String(parsed.year).padStart(5, '0')}-${String(parsed.month).padStart(2, '0')}-${String(parsed.day).padStart(2, '0')}`
          : `unknown:${dateRaw || index}`;

        if (!byDate.has(dateKey)) {
          const bucket = {
            key: dateKey,
            rawDate: dateRaw,
            label: dateLabel,
            items: []
          };
          byDate.set(dateKey, bucket);
          groups.push(bucket);
        }

        byDate.get(dateKey).items.push({ event, index });
      });

      return groups;
    },
    timelineHasMore() {
      return (this.filteredTimelineEvents || []).length > this.timelineLimit;
    },
    timelineHeartbeatData() {
      let eventsToProcess = Array.isArray(this.injectedTimelineEvents) ? this.injectedTimelineEvents : [];

      if (this.heartbeatMode === 'dynamic') {
        const rawSearch = (this.timelineSearch || '').trim();
        const activeTagSet = this.timelineActiveTagSet;
        const hasActiveTags = activeTagSet.size > 0;

        eventsToProcess = eventsToProcess.filter(event => {
          const tags = Array.isArray(event?.tags) ? event.tags.map((tag) => this.plainText(tag)).filter(Boolean) : [];

          if (rawSearch) {
            const haystack = [
              this.plainText(event?.date || ''),
              this.plainText(event?.title || ''),
              this.plainText(event?.description || ''),
              ...tags
            ].map((value) => this.normalize(value)).join(' ');
            if (!this.matchSearchQuery(rawSearch, haystack)) return false;
          }

          if (hasActiveTags) {
            const eventYear = this.timelineEventYear(event);
            const eventYearStr = eventYear != null ? String(eventYear) : null;
            const matchesActiveYear = eventYearStr && activeTagSet.has(eventYearStr);

            const hasTagMatch = tags.some(t => activeTagSet.has(t));
            if (!hasTagMatch && !matchesActiveYear) return false;
          }

          // Month range filtering
          const monthFrom = this.timelineMonthFrom;
          const monthTo = this.timelineMonthTo;
          const hasMonthFrom = this.timelineMonthsOpen && monthFrom && monthFrom !== '00';
          const hasMonthTo = this.timelineMonthsOpen && monthTo && monthTo !== '00';

          if (hasMonthFrom || hasMonthTo) {
            const dateStr = String(event?.date || '').trim();
            const monthMatch = dateStr.match(/^[^-]+-(\d{1,2})/);
            const eventMonth = monthMatch ? Number(monthMatch[1]) : 0;
            if (eventMonth > 0) {
              const startMonth = hasMonthFrom ? Number(monthFrom) : 1;
              const endMonth = hasMonthTo ? Number(monthTo) : 12;
              if (eventMonth < startMonth || eventMonth > endMonth) return false;
            }
          }

          return true;
        });
      }

      const countsByYear = {};

      eventsToProcess.forEach((event) => {
        const year = this.timelineEventYear(event);
        if (year !== null && Number.isFinite(year)) {
          countsByYear[year] = (countsByYear[year] || 0) + 1;
        }
      });

      const years = Object.keys(countsByYear).map(Number).sort((a, b) => a - b);
      if (!years.length) return [];

      // Windowed Zoom Logic for Full Mode
      let visibleYears = years;
      if (this.heartbeatMode === 'full' && this.heartbeatZoom > 0) {
        const rawFrom = this.timelineYearFrom;
        const rawTo = this.timelineYearTo;
        const yearFrom = (rawFrom !== null && rawFrom !== '') ? Number(rawFrom) : NaN;
        const yearTo = (rawTo !== null && rawTo !== '') ? Number(rawTo) : NaN;
        const active = (this.activeYear !== null && this.activeYear !== '') ? Number(this.activeYear) : NaN;

        if (Number.isFinite(yearFrom) && Number.isFinite(yearTo)) {
          centerYear = Math.round((yearFrom + yearTo) / 2);
        } else if (Number.isFinite(yearFrom)) {
          centerYear = yearFrom;
        } else if (Number.isFinite(active)) {
          centerYear = active;
        } else {
          centerYear = years[Math.floor(years.length / 2)] || 0;
        }

        const radius = Math.max(5, 110 - (this.heartbeatZoom * 3.5));
        const minYear = centerYear - radius;
        const maxYear = centerYear + radius;
        visibleYears = years.filter(y => y >= minYear && y <= maxYear);
      }

      const result = visibleYears.map((year) => {
        const count = countsByYear[year];
        const barHeight = Math.max(4, Math.round(Math.log2(count + 1) * 12));
        return { year, count, barHeight };
      });

      // Post-process to decide which years get labels dynamically
      let lastLabelIndex = -100;
      const totalBars = result.length;
      result.forEach((bar, idx) => {
        const dist = idx - lastLabelIndex;
        let shouldLabel = false;

        if (totalBars <= 20) {
          shouldLabel = true;
        } else if (totalBars <= 50) {
          shouldLabel = (bar.year % 5 === 0) && dist >= 3;
        } else {
          const isDecade = bar.year % 10 === 0;
          const isCentury = bar.year % 100 === 0;
          if (isDecade && (dist >= 6 || (isCentury && dist >= 4))) {
            shouldLabel = true;
          }
        }

        if (shouldLabel) {
          bar.showLabel = true;
          bar.label = bar.year < 0 ? `${Math.abs(bar.year)} BC` : `${bar.year}`;
          lastLabelIndex = idx;
        } else {
          bar.showLabel = false;
        }
      });

      return result;
    },
    heartbeatAxisLabels() {
      const data = this.timelineHeartbeatData;
      if (!data.length) return [];

      const years = data.map((d) => d.year);
      const minYear = years[0];
      const maxYear = years[years.length - 1];

      const labels = [];
      let current = Math.ceil(minYear / 10) * 10;
      // Don't overwhelm with labels if the range is huge
      const step = (maxYear - minYear) > 500 ? 50 : ((maxYear - minYear) > 200 ? 20 : 10);

      while (current <= maxYear) {
        labels.push(current);
        current += step;
      }
      return labels;
    },
    timelineHeartbeatBackgroundPeriods() {
      const activeTags = this.timelineActiveTagsNormalized || [];
      const activeChars = activeTags.filter(tag => this.timelineTagType(tag) === 'character');
      if (activeChars.length === 0) return [];

      const heartbeatData = this.timelineHeartbeatData || [];
      const N = heartbeatData.length;
      if (N === 0) return [];

      // 1. Partition the timeline into eras where all active characters' portraits remain constant
      const segments = [];
      let currentSegment = null;

      heartbeatData.forEach((bar, idx) => {
        const portraits = activeChars.map(charId => this.closestPortraitSync(charId, bar.year) || null);
        let changed = false;

        if (!currentSegment) {
          changed = true;
        } else {
          for (let c = 0; c < activeChars.length; c++) {
            if (portraits[c] !== currentSegment.portraits[c]) {
              changed = true;
              break;
            }
          }
        }

        if (changed) {
          if (currentSegment) {
            segments.push(currentSegment);
          }
          currentSegment = {
            startIdx: idx,
            endIdx: idx,
            portraits: portraits
          };
        } else {
          currentSegment.endIdx = idx;
        }
      });
      if (currentSegment) {
        segments.push(currentSegment);
      }

      // 2. Alternate/stagger who gets chosen for each segment, falling back if the preferred character has no portrait
      const periods = [];
      segments.forEach((seg, segIdx) => {
        let chosenImg = null;
        for (let offset = 0; offset < activeChars.length; offset++) {
          const charIdx = (segIdx + offset) % activeChars.length;
          const img = seg.portraits[charIdx];
          if (img) {
            chosenImg = img;
            break;
          }
        }
        if (chosenImg) {
          periods.push({
            imgUrl: chosenImg,
            startIdx: seg.startIdx,
            endIdx: seg.endIdx
          });
        }
      });

      // 3. Merge contiguous periods that ended up choosing the same portrait
      const mergedPeriods = [];
      periods.forEach(p => {
        const last = mergedPeriods[mergedPeriods.length - 1];
        if (last && last.imgUrl === p.imgUrl) {
          last.endIdx = p.endIdx;
        } else {
          mergedPeriods.push({
            imgUrl: p.imgUrl,
            startIdx: p.startIdx,
            endIdx: p.endIdx
          });
        }
      });

      // 4. Map to position percentages and style options
      return mergedPeriods.map(p => {
        const leftPercent = (p.startIdx / N) * 100;
        const widthPercent = ((p.endIdx - p.startIdx + 1) / N) * 100;
        const startYear = heartbeatData[p.startIdx]?.year;
        const endYear = heartbeatData[p.endIdx]?.year;
        return {
          imgUrl: p.imgUrl,
          startYear,
          endYear,
          style: {
            left: leftPercent + '%',
            width: widthPercent + '%',
            backgroundImage: `url('${p.imgUrl}')`
          }
        };
      });
    },
    portraitYearsSorted() {
      const referenceYear = this.journeyReferenceYear;
      return (this.timelinePortraitYearOptions || [])
        .map((year) => Number(year))
        .filter((year) => Number.isFinite(year) && (referenceYear == null || year <= referenceYear))
        .sort((a, b) => a - b);
    },
    timelineSelectedItems() {
      const selected = [];
      const addedKeys = new Set();
      
      // 1. Scan master database events
      const allEvents = Array.isArray(this.injectedTimelineEvents) ? this.injectedTimelineEvents : [];
      allEvents.forEach((event, idx) => {
        const key = this.timelineSourceEventKey(event, idx);
        if (this.timelineSelectedKeys?.[key]) {
          selected.push({
            key,
            event,
            index: idx,
            groupLabel: ''
          });
          addedKeys.add(key);
        }
      });
      
      // 2. Scan rendered items (which includes synthetic vitals/relationships)
      const groups = Array.isArray(this.groupedFilteredTimelineEvents) ? this.groupedFilteredTimelineEvents : [];
      groups.forEach((group) => {
        const items = Array.isArray(group?.items) ? group.items : [];
        items.forEach((item) => {
          const key = this.timelineSourceEventKey(item?.event, Number(item?.index || 0));
          if (this.timelineSelectedKeys?.[key] && !addedKeys.has(key)) {
            selected.push({
              key,
              event: item.event,
              index: Number(item.index || 0),
              groupLabel: String(group?.label || '').trim()
            });
            addedKeys.add(key);
          }
        });
      });
      
      return selected;
    },
    timelineSelectedCount() {
      return Array.isArray(this.timelineSelectedItems) ? this.timelineSelectedItems.length : 0;
    },
    isAllVisibleTimelineEventsSelected() {
      const selectable = [];
      
      if (this.timelineSelectAllIncludesCutoff) {
        // Scan ALL filtered events (including cut off ones)
        const allFiltered = Array.isArray(this.filteredTimelineEvents) ? this.filteredTimelineEvents : [];
        allFiltered.forEach((event) => {
          const canSelect = this.canEditTimelineDate(event) || !!this.timelineMergeGroupForEvent(event);
          if (canSelect) {
            selectable.push({ event, index: Number(event.__sourceIndex || 0) });
          }
        });
      } else {
        // Scan only currently rendered/visible events
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
      
      if (!selectable.length) return false;
      return selectable.every((item) => {
        const key = this.timelineSourceEventKey(item.event, Number(item.index || 0));
        return !!this.timelineSelectedKeys?.[key];
      });
    },
    timelineBatchAnchorItem() {
      const key = String(this.timelineBatchAnchorKey || '').trim();
      const selected = Array.isArray(this.timelineSelectedItems) ? this.timelineSelectedItems : [];
      if (!selected.length) {
        return null;
      }
      if (key) {
        const found = selected.find((item) => item.key === key);
        if (found) {
          return found;
        }
      }
      return selected[0] || null;
    },
    timelineBatchTargetDate() {
      return String(this.timelineBatchAnchorItem?.event?.date || '').trim();
    },
    timelineMergeGroup() {
      const selected = Array.isArray(this.timelineSelectedItems) ? this.timelineSelectedItems : [];
      if (selected.length < 2) {
        return '';
      }
      let group = '';
      for (const item of selected) {
        const current = this.timelineMergeGroupForEvent(item?.event);
        if (!current) {
          return '';
        }
        if (!group) {
          group = current;
        } else if (group !== current) {
          return 'mixed';
        }
      }
      return group;
    },
    timelineCanMergeSelection() {
      const group = String(this.timelineMergeGroup || '').trim();
      return this.timelineSelectedCount >= 2 && !!group && group !== 'mixed';
    },
    timelineMergeRestrictionLabel() {
      const group = String(this.timelineMergeGroup || '').trim();
      if (!this.timelineSelectedCount || this.timelineSelectedCount < 2) {
        return 'Select at least two events to merge.';
      }
      if (group === 'mixed') {
        return 'Merge blocked: select only one event group at a time.';
      }
      if (!group) {
        return 'Merge blocked: selected events are not merge-compatible.';
      }
      if (group === 'timeline') {
        return 'Merge ready: timeline events.';
      }
      if (group.startsWith('relationship-note:')) {
        return 'Merge ready: relationship timeline notes on the same relationship date.';
      }
      return 'Merge blocked for this selection.';
    },
    journeyCharacterId() {
      const id = String(this.activeEntry?.id || '').toLowerCase().trim();
      if (!id) {
        return '';
      }
      const resolved = this.getResolvedCharacterId(id);
      // Only return if it's a known character
      return this.characterCore?.[resolved] ? resolved : '';
    },
    journeyReferenceYear() {
      const year = Number(String(this.activeYear || '').trim());
      return Number.isFinite(year) ? year : null;
    },
    journeyEvents() {
      const characterId = this.journeyCharacterId;
      if (!characterId) {
        return [];
      }

      const referenceYear = this.journeyReferenceYear;
      const source = Array.isArray(this.injectedTimelineEvents) ? this.injectedTimelineEvents : [];
      const rows = source
        .map((event, sourceIndex) => {
          if (event?.__relationshipSynthetic) {
            return null;
          }
          const tags = this.timelineCharacterTags(event);
          if (!tags.includes(characterId)) {
            return null;
          }

          const parts = this.parseTimelineDateParts(event?.date || '');
          const year = parts?.year;
          if (referenceYear != null && Number.isFinite(year) && year > referenceYear) {
            return null;
          }

          return {
            event,
            sourceIndex,
            year: Number.isFinite(year) ? year : null,
            month: Number.isFinite(parts?.month) ? parts.month : 0,
            day: Number.isFinite(parts?.day) ? parts.day : 0
          };
        })
        .filter(Boolean);

      rows.sort((a, b) => {
        if (a.year == null && b.year == null) {
          return a.sourceIndex - b.sourceIndex;
        }
        if (a.year == null) {
          return 1;
        }
        if (b.year == null) {
          return -1;
        }
        if (a.year !== b.year) {
          return a.year - b.year;
        }
        if (a.month !== b.month) {
          return a.month - b.month;
        }
        if (a.day !== b.day) {
          return a.day - b.day;
        }
        return a.sourceIndex - b.sourceIndex;
      });

      return rows;
    },
    journeyEventGroups() {
      const events = Array.isArray(this.journeyEvents) ? this.journeyEvents : [];
      if (!events.length) {
        return [];
      }

      const referenceYear = this.journeyReferenceYear;
      const portraitYears = (this.timelinePortraitYearOptions || [])
        .map((year) => Number(year))
        .filter((year) => Number.isFinite(year) && (referenceYear == null || year <= referenceYear));

      const chooseBucketYear = (eventYear) => {
        if (!Number.isFinite(eventYear)) {
          return null;
        }
        const sortedPortraitYears = this.portraitYearsSorted;
        if (!sortedPortraitYears.length) {
          return eventYear;
        }

        // Binary search or just find closest in pre-sorted array
        let best = sortedPortraitYears[0];
        let minDiff = Math.abs(best - eventYear);
        for (const year of sortedPortraitYears) {
          const diff = Math.abs(year - eventYear);
          if (diff < minDiff) { minDiff = diff; best = year; }
          else if (diff === minDiff && year <= eventYear) { best = year; } // Prefer past
          else if (diff > minDiff && year > eventYear) break; // Optimization
        }
        return best;
      };

      const groups = [];
      const byKey = new Map();

      events.forEach((item) => {
        const bucketYear = chooseBucketYear(item.year);
        const key = Number.isFinite(bucketYear) ? `year:${bucketYear}` : 'year:unknown';
        if (!byKey.has(key)) {
          const next = {
            key,
            bucketYear: Number.isFinite(bucketYear) ? bucketYear : null,
            events: []
          };
          byKey.set(key, next);
          groups.push(next);
        }
        byKey.get(key).events.push(item);
      });

      return groups
        .sort((a, b) => {
          if (a.bucketYear == null && b.bucketYear == null) {
            return 0;
          }
          if (a.bucketYear == null) {
            return 1;
          }
          if (b.bucketYear == null) {
            return -1;
          }
          return a.bucketYear - b.bucketYear;
        });
    },
    relationshipCharacterId() {
      const id = String(this.activeEntry?.id || '').toLowerCase().trim();
      if (!id) {
        return '';
      }
      const resolved = this.getResolvedCharacterId(id);
      // Only return if it's a known character
      return this.characterCore?.[resolved] ? resolved : '';
    },
    relationshipReferenceYear() {
      const year = Number(String(this.activeYear || '').trim());
      return Number.isFinite(year) ? year : null;
    },
    relationshipGroupsForCharacter() {
      const characterId = this.relationshipCharacterId;
      const referenceYear = this.relationshipReferenceYear;
      const source = Array.isArray(this.relationships) ? this.relationships : [];
      if (!characterId || !source.length) {
        return [];
      }

      const yearFromDate = (value) => {
        const parts = this.parseTimelineDateParts(value || '');
        return Number.isFinite(parts?.year) ? parts.year : null;
      };

      const normalizeToken = (value) => {
        const rawId = String(value || '').replace(/^[+-]/, '').toLowerCase().trim();
        const resolvedId = this.getResolvedCharacterId(rawId);
        return this.normalize(resolvedId);
      };
      const charToken = normalizeToken(characterId);
      const isHistoryTokenForCharacter = (token) => {
        const normalized = normalizeToken(token);
        return !!normalized && (normalized === charToken || normalized.includes(charToken) || charToken.includes(normalized));
      };

      const involved = source
        .map((row) => {
          const members = Array.isArray(row?.members) ? row.members : [];
          const children = Array.isArray(row?.children) ? row.children : [];
          const historyObj = row?.history && typeof row.history === 'object' ? row.history : {};
          const historyRows = Object.entries(historyObj)
            .map(([date, events]) => ({
              date: String(date || ''),
              sourceDateKey: String(date || ''),
              year: yearFromDate(date),
              events: Array.isArray(events) ? events.map((item) => String(item || '')) : []
            }))
            .filter((item) => item.year != null)
            .filter((item) => referenceYear == null || item.year <= referenceYear)
            .sort((a, b) => {
              if (a.year !== b.year) {
                return a.year - b.year;
              }
              return String(a.date).localeCompare(String(b.date));
            });

          const directMember = members.map((item) => String(item || '').toLowerCase().trim()).includes(characterId);
          const directChild = children.map((item) => String(item || '').toLowerCase().trim()).includes(characterId);
          const historyMention = historyRows.some((item) => item.events.some((evt) => isHistoryTokenForCharacter(evt)));
          const startYear = yearFromDate(row?.startDate || '');
          if (referenceYear != null && startYear != null && startYear > referenceYear) {
            return null;
          }
          if (!directMember && !directChild && !historyMention) {
            return null;
          }

          const splitYear = yearFromDate(row?.splitDate || '');
          const isEndedByReferenceYear = splitYear != null && (referenceYear == null || splitYear <= referenceYear);
          const relationType = String(row?.type || '').trim().toLowerCase();
          const isGroupType = /group|organization|crew|unit|community/.test(relationType);

          const relatedSet = new Set();
          members.forEach((id) => relatedSet.add(String(id || '').toLowerCase().trim()));
          children.forEach((id) => relatedSet.add(String(id || '').toLowerCase().trim()));
          relatedSet.delete('');
          const relatedMembers = Array.from(relatedSet);
          if (!relatedMembers.includes(characterId)) {
            relatedMembers.unshift(characterId);
          }

          const latestHistoryYear = historyRows.length
            ? historyRows[historyRows.length - 1].year
            : null;
          const anchorYear = isEndedByReferenceYear
            ? splitYear
            : (latestHistoryYear ?? startYear ?? referenceYear);

          return {
            id: String(row?.id || ''),
            label: String(row?.label || row?.id || 'Relationship'),
            type: String(row?.type || 'unknown'),
            isGroupType,
            startDate: String(row?.startDate || ''),
            splitDate: String(row?.splitDate || ''),
            statusLabel: isEndedByReferenceYear ? 'Ended' : 'Active',
            notes: String(row?.notes || row?.['core-note'] || ''),
            members: relatedMembers,
            history: historyRows,
            anchorYear: Number.isFinite(anchorYear) ? anchorYear : referenceYear
          };
        })
        .filter(Boolean)
        .sort((a, b) => {
          const aStart = yearFromDate(a.startDate || '') ?? -999999;
          const bStart = yearFromDate(b.startDate || '') ?? -999999;
          if (aStart !== bStart) {
            return aStart - bStart;
          }
          return String(a.label || '').localeCompare(String(b.label || ''));
        });

      const grouped = [
        {
          key: 'groups',
          title: 'Group Adherences',
          items: involved.filter((item) => item.isGroupType)
        },
        {
          key: 'relationships',
          title: 'Relationship Adherences',
          items: involved.filter((item) => !item.isGroupType)
        }
      ].filter((bucket) => bucket.items.length);

      return grouped;
    },
    filteredIconPickerList() {
      const q = String(this.iconPickerQuery || '').toLowerCase().trim();
      if (!q) return this.iconPickerList.slice();
      return this.iconPickerList.filter((k) => String(k || '').toLowerCase().includes(q));
    },
    activeGallery() {
      if (!this.catalog || !this.activeEntry) return [];

      const charId = this.getResolvedCharacterId(this.activeEntry.id);
      const mediaCandidates = [];

      // 1. Gather from the root portraits directory (portraitManifest) - HIGHEST PRIORITY
      if (charId && this.portraitManifest?.[charId]) {
        const files = Array.isArray(this.portraitManifest[charId]) ? this.portraitManifest[charId] : [];
        const activeYearNum = Number(this.activeYear || 0);

        const yearMatches = files.filter(f => {
          const m = f.match(/\d{4}/);
          return m && Number(m[0]) === activeYearNum;
        });

        if (yearMatches.length > 0) {
          yearMatches.forEach(f => mediaCandidates.push(`portraits/${charId}/${f}`));
        } else if (files.length > 0) {
          let best = '';
          let minDiff = Infinity;
          files.forEach(f => {
            const m = f.match(/\d{4}/);
            const y = m ? Number(m[0]) : null;
            if (y === null) {
              if (minDiff === Infinity) best = f;
              return;
            }
            const diff = Math.abs(y - activeYearNum);
            if (diff < minDiff) { minDiff = diff; best = f; }
          });
          if (best) mediaCandidates.push(`portraits/${charId}/${best}`);
        }
      }

      // 2. Gather filtered categories from the yearly catalog
      if (this.catalog) {
        Object.entries(this.catalog).forEach(([key, list]) => {
          if (key === 'groups' || key === 'fieldMedia') return;
          if (Array.isArray(list)) {
            mediaCandidates.push(...list);
          }
        });
      }

      const seen = new Set();
      const uniqueCandidates = mediaCandidates.filter((value) => {
        const key = String(value || '').toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      const entryId = String(this.activeEntry?.id || '');

      if (String(this.activeEntry?.id || '').toLowerCase() === 'intro') {
        const fieldCandidates = [
          ...(this.catalog?.fieldMedia || [])
        ];
        const seenField = new Set();
        const fieldMatches = fieldCandidates
          .filter((value) => {
            const key = String(value || '').toLowerCase();
            if (!key || seenField.has(key)) return false;
            seenField.add(key);
            return true;
          })
          .filter((path) => /(^|\/)field\.(png|jpe?g|webp|gif|avif|mp4)$/i.test(String(path || '').replace(/\\/g, '/')))
          .slice(0, 8)
          .map((path) => this.toMediaObject(path, 500));
        if (fieldMatches.length) {
          return fieldMatches;
        }
      }

      const scored = uniqueCandidates
        .map((path) => {
          const score = this.scoreByEntryId(path, entryId);
          return this.enrichMediaWithXray(this.toMediaObject(path, score));
        })
        .filter((item) => item.score >= 70)
        .sort((a, b) => {
          if (b.score !== a.score) {
            return b.score - a.score;
          }
          return String(a.src || '').localeCompare(String(b.src || ''));
        })
        .slice(0, 18);

      // Pin the primary solo portrait to index 0
      const primaryIdx = scored.findIndex(item => {
        const src = String(item.src || '').toLowerCase();
        return src.startsWith(`portraits/${charId}/`) && src.includes(this.activeYear);
      });
      if (primaryIdx > 0) {
        const [primary] = scored.splice(primaryIdx, 1);
        scored.unshift(primary);
      }

      console.debug('MR: activeGallery', { entryId, uniqueCount: uniqueCandidates.length, scoredCount: scored.length });

      if (scored.length) return scored;

      // If no strong matches found in the active year's catalog, attempt
      // to use the nearest-year portrait for character entries. This uses
      // the existing relationship portrait queue/cache so the lookup is async and
      // will update the UI once resolved.
      const fallbackCharId = this.getResolvedCharacterId(this.activeEntry?.id);
      const yearVal = String(this.activeYear || '').trim();
      const key = `${yearVal}::${fallbackCharId}`;
      const cached = this.relationshipPortraitByYearChar?.[key];
      console.debug('MR: activeGallery -> fallback check', { charId: fallbackCharId, year: yearVal, cached: typeof cached === 'string' ? cached : (cached === undefined ? 'undefined' : String(cached)) });
      if (typeof cached === 'string' && cached) {
        return [this.toMediaObject(cached, 500)];
      }
      // Kick off async resolve; UI will update when cache is filled.
      if (fallbackCharId && /^\d{4}$/.test(yearVal)) {
        this.queueRelationshipPortraitLoad(fallbackCharId, yearVal);
      }
      return [];
    },

    uniqueNavGroups() {
      if (!this.characterCore) return [];
      const groups = new Set();
      Object.values(this.characterCore).forEach(c => {
        if (c && c.navGroup) groups.add(c.navGroup);
      });
      return Array.from(groups).sort();
    },
    uniqueOrganizations() {
      if (!this.entitiesRegistry) return [];
      const orgs = new Set();
      Object.entries(this.entitiesRegistry).forEach(([id, data]) => {
        if (data && data._category === 'organizations') {
          orgs.add(data.name || id);
        }
      });
      return Array.from(orgs).sort();
    },

    uniqueIconKeys() {
      if (!this.characterCore) return [];
      const keys = new Set();
      Object.values(this.characterCore).forEach(c => {
        if (c && c.iconKey) keys.add(c.iconKey);
      });
      return Array.from(keys).sort();
    },

    isDarkYear() {
      const year = String(this.activeYear || '').trim().replace(/s$/, '');
      const theme = this.yearThemes?.[year]?.vars || this.yearThemes?.[year + 's']?.vars || this.yearThemes?.default?.vars || {};
      const bg = theme['--bg'] || '';
      if (bg) {
        if (bg.startsWith('#')) {
          const hex = bg.slice(1);
          if (hex.length === 3) {
            const r = parseInt(hex[0], 16);
            return r < 8;
          } else if (hex.length === 6) {
            const r = parseInt(hex.slice(0, 2), 16);
            return r < 128;
          }
        }
        if (bg.includes('rgba(0,0,0') || bg.includes('#0') || bg.includes('#1') || bg.includes('#2')) return true;
      }
      const darkYears = ['2021', '2022', '2024', '2025', '2027', '2028', '2029', '2030', '2047', '1997', '1990'];
      return darkYears.includes(year);
    },

    sillyTavernPreviewText() {
      if (!this.sillyTavernFinalizedJson) return '';
      try {
        const parsed = JSON.parse(this.sillyTavernFinalizedJson);
        const truncateB64 = (val) => {
          if (typeof val === 'string' && val.startsWith('data:image/')) {
            return `${val.substring(0, 30)}... [${val.length} characters of base64 portrait data]`;
          }
          return val;
        };
        if (parsed.avatar) parsed.avatar = truncateB64(parsed.avatar);
        if (parsed.data && parsed.data.avatar) parsed.data.avatar = truncateB64(parsed.data.avatar);
        return JSON.stringify(parsed, null, 4);
      } catch (err) {
        return this.sillyTavernFinalizedJson;
      }
    },
    uniqueGenders() {
      if (!this.characterCore) return [];
      const items = new Set();
      Object.values(this.characterCore).forEach(c => {
        if (c && c.gender) {
          const val = String(c.gender).toLowerCase().trim();
          if (val && val !== 'unknown') {
            items.add(val);
          }
        }
      });
      return Array.from(items).sort();
    },
    uniqueEthnicities() {
      if (!this.characterCore) return [];
      const items = new Set();
      Object.values(this.characterCore).forEach(c => {
        if (c && c.ethnicity) {
          const val = String(c.ethnicity).toLowerCase().trim();
          if (val && val !== 'unknown') {
            items.add(val);
          }
        }
      });
      return Array.from(items).sort();
    },
    uniqueNationalities() {
      if (!this.characterCore) return [];
      const nationalities = new Set();
      Object.values(this.characterCore).forEach(c => {
        if (c && c.nationality) {
          const nat = String(c.nationality).toLowerCase().trim();
          if (nat && nat !== 'unknown') {
            nationalities.add(nat);
          }
        }
      });
      return Array.from(nationalities).sort();
    },
    uniqueGroups() {
      if (!this.characterCore) return [];
      const groupsSet = new Set();
      Object.values(this.characterCore).forEach(c => {
        if (!c || c.redirect) return;
        if (Array.isArray(c.groups)) {
          c.groups.forEach(g => {
            if (g && g.trim()) {
              groupsSet.add(g.trim());
            }
          });
        } else if (typeof c.groups === 'string' && c.groups.trim()) {
          groupsSet.add(c.groups.trim());
        } else if (c.navGroup && c.navGroup.trim()) {
          groupsSet.add(c.navGroup.trim());
        }
      });
      return Array.from(groupsSet).sort((a, b) => a.localeCompare(b));
    },
    demographicsStats() {
      if (!this.characterCore) return { gender: {}, ethnicity: {}, nationality: {}, portrait: { has: 0, no: 0 }, group: {}, incomplete: [] };
      const genderCounts = {};
      const ethnicityCounts = {};
      const nationalityCounts = {};
      const groupCounts = {};
      let hasPortraitCount = 0;
      let noPortraitCount = 0;
      const incomplete = [];

      Object.entries(this.characterCore).forEach(([id, char]) => {
        if (!char || char.redirect) return;

        const gender = String(char.gender || 'unknown').toLowerCase().trim();
        const ethnicity = String(char.ethnicity || 'unknown').toLowerCase().trim();
        const nationality = String(char.nationality || 'unknown').toLowerCase().trim();
        const hasPortrait = !!(
          (this.portraitManifest?.[id] && this.portraitManifest[id].length > 0) ||
          (this.portraitManifest?.['misc'] && this.portraitManifest['misc'].some(f => f.toLowerCase().includes(id)))
        );

        genderCounts[gender] = (genderCounts[gender] || 0) + 1;
        ethnicityCounts[ethnicity] = (ethnicityCounts[ethnicity] || 0) + 1;
        nationalityCounts[nationality] = (nationalityCounts[nationality] || 0) + 1;
        
        if (hasPortrait) {
          hasPortraitCount++;
        } else {
          noPortraitCount++;
        }

        if (Array.isArray(char.groups)) {
          char.groups.forEach(g => {
            if (g && g.trim()) {
              const gt = g.trim();
              groupCounts[gt] = (groupCounts[gt] || 0) + 1;
            }
          });
        } else if (typeof char.groups === 'string' && char.groups.trim()) {
          const gt = char.groups.trim();
          groupCounts[gt] = (groupCounts[gt] || 0) + 1;
        } else if (char.navGroup && char.navGroup.trim()) {
          const gt = char.navGroup.trim();
          groupCounts[gt] = (groupCounts[gt] || 0) + 1;
        }

        if (
          gender === 'unknown' || gender === '' ||
          ethnicity === 'unknown' || ethnicity === '' ||
          nationality === 'unknown' || nationality === '' ||
          !hasPortrait
        ) {
          incomplete.push({
            id,
            name: char['full name'] || char['short name'] || id,
            missing: [
              (gender === 'unknown' || gender === '') ? 'gender' : null,
              (ethnicity === 'unknown' || ethnicity === '') ? 'ethnicity' : null,
              (nationality === 'unknown' || nationality === '') ? 'nationality' : null,
              (!hasPortrait) ? 'portrait' : null
            ].filter(Boolean)
          });
        }
      });

      return {
        gender: genderCounts,
        ethnicity: ethnicityCounts,
        nationality: nationalityCounts,
        portrait: {
          has: hasPortraitCount,
          no: noPortraitCount
        },
        group: groupCounts,
        incomplete: incomplete
      };
    },
    filteredIncompleteDemographics() {
      if (!this.characterCore) return [];
      const tagCounts = (this.timelineTagGroups && this.timelineTagGroups.tagCounts) ? this.timelineTagGroups.tagCounts : {};
      
      const selGenders = Array.isArray(this.demographicsSelectedGenders) ? this.demographicsSelectedGenders : [];
      const selEthnicities = Array.isArray(this.demographicsSelectedEthnicities) ? this.demographicsSelectedEthnicities : [];
      const selNationalities = Array.isArray(this.demographicsSelectedNationalities) ? this.demographicsSelectedNationalities : [];
      const selPortraits = Array.isArray(this.demographicsSelectedPortraits) ? this.demographicsSelectedPortraits : [];
      const selGroups = Array.isArray(this.demographicsSelectedGroups) ? this.demographicsSelectedGroups : [];
      const incompleteOnly = this.demographicsFilterIncompleteOnly === true;
      const query = String(this.demographicsSearchQuery || '').toLowerCase().trim();

      const list = [];

      Object.entries(this.characterCore).forEach(([id, char]) => {
        if (!char || char.redirect) return;

        const gender = String(char.gender || 'unknown').toLowerCase().trim();
        const ethnicity = String(char.ethnicity || 'unknown').toLowerCase().trim();
        const nationality = String(char.nationality || 'unknown').toLowerCase().trim();
        const hasPortrait = !!(
          (this.portraitManifest?.[id] && this.portraitManifest[id].length > 0) ||
          (this.portraitManifest?.['misc'] && this.portraitManifest['misc'].some(f => f.toLowerCase().includes(id)))
        );

        // 1. Gender Filter (OR within category)
        if (selGenders.length > 0 && !selGenders.includes(gender)) return;

        // 2. Ethnicity Filter (OR within category)
        if (selEthnicities.length > 0 && !selEthnicities.includes(ethnicity)) return;

        // 3. Nationality Filter (OR within category)
        if (selNationalities.length > 0 && !selNationalities.includes(nationality)) return;

        // 4. Portrait Filter (OR within category)
        if (selPortraits.length > 0) {
          const matchesHas = selPortraits.includes('has-portrait') && hasPortrait;
          const matchesNo = selPortraits.includes('no-portrait') && !hasPortrait;
          if (!matchesHas && !matchesNo) return;
        }

        // 5. Group Filter (OR within category)
        if (selGroups.length > 0) {
          const charGroups = [];
          if (Array.isArray(char.groups)) {
            char.groups.forEach(g => { if (g) charGroups.push(g.trim()); });
          } else if (typeof char.groups === 'string' && char.groups.trim()) {
            charGroups.push(char.groups.trim());
          } else if (char.navGroup && char.navGroup.trim()) {
            charGroups.push(char.navGroup.trim());
          }
          const hasMatchingGroup = charGroups.some(cg => selGroups.includes(cg));
          if (!hasMatchingGroup) return;
        }

        const missing = [
          (!char.gender || char.gender === 'unknown' || char.gender === '') ? 'gender' : null,
          (!char.ethnicity || char.ethnicity === 'unknown' || char.ethnicity === '') ? 'ethnicity' : null,
          (!char.nationality || char.nationality === 'unknown' || char.nationality === '') ? 'nationality' : null,
          (!hasPortrait) ? 'portrait' : null
        ].filter(Boolean);

        // 5. Incompleteness Filter
        if (incompleteOnly && missing.length === 0) return;

        // 6. Text Search Filter
        const name = char['full name'] || char['short name'] || id;
        if (query && !name.toLowerCase().includes(query) && !id.toLowerCase().includes(query)) return;

        list.push({
          id,
          name,
          missing,
          gender,
          ethnicity,
          nationality,
          hasPortrait,
          entryCount: tagCounts[id] || 0
        });
      });

      // Sort: entries count desc, then name asc
      list.sort((a, b) => {
        if (b.entryCount !== a.entryCount) {
          return b.entryCount - a.entryCount;
        }
        return a.name.localeCompare(b.name);
      });

      return list;
    }
  };
}(window));
