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
    SPECIAL_PORTRAIT_TAGS
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

    ensureTimelineObserver() {
      if (this._timelineObserver || typeof IntersectionObserver === 'undefined') {
        return;
      }

      const root = this.$refs?.mainPane || null;
      this._timelineObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry?.isIntersecting) {
            return;
          }

          const key = Object.keys(this._timelineEventRefs || {}).find((candidate) => this._timelineEventRefs[candidate] === entry.target);
          if (!key) {
            return;
          }
          const meta = this._timelineEventMeta?.[key];
          if (!meta?.event) {
            return;
          }
          this.queueTimelinePortraitLoad(key, meta.event);
        });
      }, {
        root,
        rootMargin: '320px 0px',
        threshold: 0.01
      });
    },
    observeVisibleTimelineEvents() {
      this.ensureTimelineObserver();
      const refs = Object.entries(this._timelineEventRefs || {});
      refs.forEach(([key, el]) => {
        const meta = this._timelineEventMeta?.[key];
        if (!el || !meta?.event) {
          return;
        }
        if (!this.timelineCharacterTags(meta.event).length) {
          return;
        }
        if (this._timelineObserver) {
          this._timelineObserver.observe(el);
        } else {
          this.queueTimelinePortraitLoad(key, meta.event);
        }
      });
    },
    queueTimelinePortraitLoad(key, event) {
      if (!key || !event) {
        return;
      }
      if (Object.prototype.hasOwnProperty.call(this.timelinePortraitByEvent || {}, key)) {
        return;
      }
      if (!this.timelineCharacterTags(event).length) {
        return;
      }
      if (!this._timelinePortraitPending) {
        this._timelinePortraitPending = new Set();
      }
      if (!this._timelinePortraitQueue) {
        this._timelinePortraitQueue = [];
      }
      if (this._timelinePortraitPending.has(key)) {
        return;
      }

      // Throttle excessive queue growth to avoid flooding image requests.
      this._timelinePortraitPending.add(key);
      if (this._timelinePortraitQueue.length >= MAX_TIMELINE_PORTRAIT_QUEUE) {
        // drop additional loads when queue is huge
        console.warn('MR: timeline portrait queue full â€” skipping:', key);
        return;
      }
      this._timelinePortraitQueue.push({ key, event });
      this.processTimelinePortraitQueue();
    },
    async processTimelinePortraitQueue() {
      if (this._timelinePortraitQueueBusy) {
        return;
      }
      this._timelinePortraitQueueBusy = true;

      try {
        while (Array.isArray(this._timelinePortraitQueue) && this._timelinePortraitQueue.length) {
          const batch = this._timelinePortraitQueue.splice(0, 1);
          const resolved = await Promise.all(batch.map(async (item) => {
            const portraits = await this.resolveTimelinePortraits(item.event);
            return { key: item.key, portraits };
          }));

          const next = { ...(this.timelinePortraitByEvent || {}) };
          resolved.forEach((item) => {
            next[item.key] = item.portraits;
            this._timelinePortraitPending?.delete(item.key);
          });
          this.timelinePortraitByEvent = next;
        }
      } finally {
        this._timelinePortraitQueueBusy = false;
      }
    },
    timelineEventYear(event) {
      const date = String(event?.date || '').trim();
      const match = date.match(/^(-?\d+)/); // Support ancient/negative years
      if (match) {
        return Number(match[1]);
      }
      const active = Number(this.activeYear || 0);
      return Number.isFinite(active) && active > 0 ? active : null;
    },
    async applyMassTag(mode = 'tag') {
      console.log('applyMassTag triggered. Mode:', mode, 'Input:', this.massTagInput);
      const positiveWordTags = Array.isArray(this.timelineActiveWordTags)
        ? this.timelineActiveWordTags.filter(w => !w.startsWith('-'))
        : [];
      const hasWordTags = positiveWordTags.length > 0;

      if (mode === 'remove-word') {
        const searchWord = String(this.massTagInput || '').trim();
        if (!searchWord) {
          alert('Please enter a word/text to remove in the input field.');
          return;
        }
        const events = Array.isArray(this.filteredTimelineEvents) ? this.filteredTimelineEvents : [];
        const eventsToUpdate = events.map(e => ({ id: e.id, date: e.date, title: e.title }));
        if (!eventsToUpdate.length) {
          alert('No entries found to remove text from.');
          return;
        }

        this.openConfirmModal({
          title: 'Remove Word',
          body: `Are you sure you want to remove all occurrences of the word "${searchWord}" (case-preserving, perfect word match) from the title and body of all ${eventsToUpdate.length} filtered entries?`,
          confirmLabel: 'Remove Word',
          onConfirm: async () => {
            this.timelineBatchSaving = true;
            this.timelineBatchNotice = `Removing word "${searchWord}"...`;
            this.timelineBatchNoticeTone = 'info';
            try {
              const res = await fetch(this.apiUrl('/api/timeline/mass-text-action'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  events: eventsToUpdate,
                  searchWords: [searchWord],
                  replacement: '',
                  mode: 'remove'
                })
              });
              const data = await res.json();
              if (!res.ok || data.ok === false) throw new Error(data.error || 'Failed to remove word');

              // Clear input
              this.massTagInput = '';

              this.timelineBatchNotice = 'Successfully removed word. Reloading timeline...';
              this.timelineBatchNoticeTone = 'success';
              
              await this.loadTimeline();
              if (this.activeYear) {
                await this.loadCatalog(this.activeYear);
              }

              setTimeout(() => { if (this.timelineBatchNoticeTone === 'success') this.timelineBatchNotice = ''; }, 3000);
            } catch (e) {
              console.error('Remove word failed:', e);
              this.timelineBatchNotice = `Error: ${e.message}`;
              this.timelineBatchNoticeTone = 'error';
            } finally {
              this.timelineBatchSaving = false;
            }
          }
        });
        return;
      }

      if (mode === 'replace') {
        const inputVal = String(this.massTagInput || '').trim();
        if (!inputVal.includes('->')) {
          alert('Please use the format "oldWord -> newWord" to replace words.');
          return;
        }
        const parts = inputVal.split('->');
        if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) {
          alert('Please use the format "oldWord -> newWord" with non-empty words.');
          return;
        }
        const searchWord = parts[0].trim();
        const replacement = parts[1].trim();

        const events = Array.isArray(this.filteredTimelineEvents) ? this.filteredTimelineEvents : [];
        const eventsToUpdate = events.map(e => ({ id: e.id, date: e.date, title: e.title }));
        if (!eventsToUpdate.length) {
          alert('No entries found to replace words in.');
          return;
        }

        this.openConfirmModal({
          title: 'Replace Words',
          body: `Are you sure you want to replace all occurrences of "${searchWord}" with "${replacement}" (case-preserving, perfect word match) in the title and body of all ${eventsToUpdate.length} filtered entries?`,
          confirmLabel: 'Replace',
          onConfirm: async () => {
            this.timelineBatchSaving = true;
            this.timelineBatchNotice = `Replacing "${searchWord}" with "${replacement}"...`;
            this.timelineBatchNoticeTone = 'info';
            try {
              const res = await fetch(this.apiUrl('/api/timeline/mass-text-action'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  events: eventsToUpdate,
                  searchWords: [searchWord],
                  replacement: replacement,
                  mode: 'replace'
                })
              });
              const data = await res.json();
              if (!res.ok || data.ok === false) throw new Error(data.error || 'Failed to replace words');

              // Clear input
              this.massTagInput = '';

              this.timelineBatchNotice = 'Successfully replaced words. Reloading timeline...';
              this.timelineBatchNoticeTone = 'success';
              
              await this.loadTimeline();
              if (this.activeYear) {
                await this.loadCatalog(this.activeYear);
              }

              setTimeout(() => { if (this.timelineBatchNoticeTone === 'success') this.timelineBatchNotice = ''; }, 3000);
            } catch (e) {
              console.error('Replace words failed:', e);
              this.timelineBatchNotice = `Error: ${e.message}`;
              this.timelineBatchNoticeTone = 'error';
            } finally {
              this.timelineBatchSaving = false;
            }
          }
        });
        return;
      }

      if (mode === 'swap' && hasWordTags) {
        const tag = String(this.massTagInput || '').trim();
        if (!tag) {
          alert('Please enter a replacement text in the input field.');
          return;
        }
        const events = Array.isArray(this.filteredTimelineEvents) ? this.filteredTimelineEvents : [];
        const eventsToUpdate = events.map(e => ({ id: e.id, date: e.date, title: e.title }));
        if (!eventsToUpdate.length) {
          alert('No entries found to swap text in.');
          return;
        }

        this.openConfirmModal({
          title: 'Swap Text',
          body: `Are you sure you want to swap all occurrences of the search words [${positiveWordTags.join(', ')}] with "${tag}" (case-preserving) in the title and body of all ${eventsToUpdate.length} filtered entries?`,
          confirmLabel: 'Swap Text',
          onConfirm: async () => {
            this.timelineBatchSaving = true;
            this.timelineBatchNotice = `Swapping search words with "${tag}"...`;
            this.timelineBatchNoticeTone = 'info';
            try {
              const res = await fetch(this.apiUrl('/api/timeline/mass-text-action'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  events: eventsToUpdate,
                  searchWords: positiveWordTags,
                  replacement: tag,
                  mode: 'swap'
                })
              });
              const data = await res.json();
              if (!res.ok || data.ok === false) throw new Error(data.error || 'Failed to swap text');

              // Clear input & selected search word tags
              this.massTagInput = '';
              this.timelineActiveWordTags = [];

              this.timelineBatchNotice = 'Successfully swapped text. Reloading timeline...';
              this.timelineBatchNoticeTone = 'success';
              
              await this.loadTimeline();
              if (this.activeYear) {
                await this.loadCatalog(this.activeYear);
              }

              setTimeout(() => { if (this.timelineBatchNoticeTone === 'success') this.timelineBatchNotice = ''; }, 3000);
            } catch (e) {
              console.error('Swap text failed:', e);
              this.timelineBatchNotice = `Error: ${e.message}`;
              this.timelineBatchNoticeTone = 'error';
            } finally {
              this.timelineBatchSaving = false;
            }
          }
        });
        return;
      }

      const tag = String(this.massTagInput || '').trim();
      console.log('applyMassTag tag parsed:', tag);
      if (!tag) {
        console.warn('applyMassTag aborted: tag input is empty');
        return;
      }

      if (mode === 'swap') {
        if (!Array.isArray(this.timelineActiveTags) || !this.timelineActiveTags.length) {
          alert('No active tag filters (aliases) selected/marked for swapping.');
          return;
        }

        const aliases = [...this.timelineActiveTags];
        this.openConfirmModal({
          title: 'Swap Tags',
          body: `Are you sure you want to swap all occurrences of the active tags [${aliases.join(', ')}] with the canonical tag "${tag}"?\n\nThis will add them to format_tags.js equivalencies table, rewrite all files and reload.`,
          confirmLabel: 'Swap Tags',
          onConfirm: async () => {
            this.timelineBatchSaving = true;
            this.timelineBatchNotice = `Swapping tags [${aliases.join(', ')}] with "${tag}"...`;
            this.timelineBatchNoticeTone = 'info';
            try {
              const res = await fetch(this.apiUrl('/api/timeline/swap'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ canonical: tag, aliases })
              });
              const data = await res.json();
              if (!res.ok || data.ok === false) throw new Error(data.error || 'Failed to swap tags');

              console.log('Swap completed successfully:', data.output);

              // Clear input & selected tags
              this.massTagInput = '';
              this.timelineActiveTags = [];

              // Reload timeline data
              this.timelineBatchNotice = 'Successfully swapped tags. Reloading timeline...';
              this.timelineBatchNoticeTone = 'success';
              
              await this.loadTimeline();
              if (this.activeYear) {
                await this.loadCatalog(this.activeYear);
              }
              
              setTimeout(() => { if (this.timelineBatchNoticeTone === 'success') this.timelineBatchNotice = ''; }, 3000);
            } catch (e) {
              console.error('Swap failed:', e);
              this.timelineBatchNotice = `Error: ${e.message}`;
              this.timelineBatchNoticeTone = 'error';
            } finally {
              this.timelineBatchSaving = false;
            }
          }
        });
        return;
      }

      const eventsToTag = [];
      const events = Array.isArray(this.filteredTimelineEvents) ? this.filteredTimelineEvents : [];
      
      events.forEach(event => {
        const currentTags = Array.isArray(event.tags) ? event.tags.map(t => String(t).toLowerCase().trim()) : [];
        console.log(`Event "${event.title}": currentTags =`, currentTags);
        
        let needsUpdate = false;
        if (mode === 'remove-tag') {
          if (currentTags.includes(tag.toLowerCase())) {
            needsUpdate = true;
          }
        } else if (mode === 'merge') {
          // In merge mode, we update if there are any related tags to remove, OR if the target tag is missing
          const hasRelated = currentTags.some(t => 
            t.startsWith(tag.toLowerCase() + '-') || 
            t.endsWith('-' + tag.toLowerCase()) || 
            t === tag.toLowerCase()
          );
          if (hasRelated || !currentTags.includes(tag.toLowerCase())) {
            needsUpdate = true;
          }
        } else {
          // Normal tag mode
          if (!currentTags.includes(tag.toLowerCase())) {
            needsUpdate = true;
          }
        }

        if (needsUpdate) {
          eventsToTag.push({
            id: event.id,
            date: event.date,
            title: event.title
          });
        }
      });

      console.log('applyMassTag: events to tag count:', eventsToTag.length, 'Total filtered events:', events.length);
      if (!eventsToTag.length) {
        console.log('applyMassTag aborted: no entries need update');
        if (mode === 'tag' && events.length > 0) {
          alert(`All ${events.length} currently filtered entries already possess the tag "${tag}".`);
        } else {
          alert(`No entries found that ${mode === 'remove-tag' ? 'possess' : 'need'} the tag "${tag}" among currently filtered items.`);
        }
        return;
      }

      const actionLabel = mode === 'merge' ? 'Merge and Apply' : (mode === 'remove-tag' ? 'Remove' : 'Apply');
      this.openConfirmModal({
        title: `${actionLabel} Tag`,
        body: `${actionLabel} tag "${tag}" ${mode === 'remove-tag' ? 'from' : 'to'} ${eventsToTag.length} entries?`,
        confirmLabel: actionLabel,
        onConfirm: async () => {
          this.timelineBatchSaving = true;
          this.timelineBatchNotice = `${mode === 'merge' ? 'Merging' : (mode === 'remove-tag' ? 'Removing' : 'Applying')} tag "${tag}" ${mode === 'remove-tag' ? 'from' : 'to'} ${eventsToTag.length} entries...`;
          this.timelineBatchNoticeTone = 'info';
          try {
            const res = await fetch(this.apiUrl('/api/timeline/mass-tag'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ events: eventsToTag, tag, mode })
            });
            const data = await res.json();
            if (!res.ok || data.ok === false) throw new Error(data.error || 'Failed to mass tag');

            // Optimistic update
            events.forEach(event => {
              const match = eventsToTag.find(et => et.title === event.title && et.date === event.date);
              if (match) {
                let currentTagsRaw = Array.isArray(event.tags) ? [...event.tags] : [];
                
                if (mode === 'remove-tag') {
                  currentTagsRaw = currentTagsRaw.filter(t => String(t).toLowerCase().trim() !== tag.toLowerCase().trim());
                } else if (mode === 'merge') {
                  // Remove related tags
                  currentTagsRaw = currentTagsRaw.filter(t => {
                    const nt = String(t).toLowerCase().trim();
                    return !(nt.startsWith(tag.toLowerCase() + '-') || nt.endsWith('-' + tag.toLowerCase()) || nt === tag.toLowerCase());
                  });
                }

                if (mode !== 'remove-tag') {
                  const normalized = currentTagsRaw.map(t => String(t).toLowerCase().trim());
                  if (!normalized.includes(tag.toLowerCase())) {
                    currentTagsRaw.push(tag);
                  }
                }
                event.tags = currentTagsRaw;
              }
            });

            this.massTagInput = '';
            console.log(`Mass ${mode === 'remove-tag' ? 'removed' : 'tagged'} (${mode}) ${eventsToTag.length} entries with "${tag}".`);
            this.timelineBatchNotice = `Successfully ${mode === 'remove-tag' ? 'removed' : 'tagged'} ${eventsToTag.length} entries.`;
            this.timelineBatchNoticeTone = 'success';
            setTimeout(() => { if (this.timelineBatchNoticeTone === 'success') this.timelineBatchNotice = ''; }, 3000);
          } catch (e) {
            console.error('Mass tagging failed:', e);
            this.timelineBatchNotice = `Error: ${e.message}`;
            this.timelineBatchNoticeTone = 'error';
          } finally {
            this.timelineBatchSaving = false;
          }
        }
      });
    },
    async applyMassDraftAction(action = 'tag') {
      const tag = String(this.massDraftTagInput || '').trim();
      
      const events = [];
      const allEvents = Array.isArray(this.filteredTimelineEvents) ? this.filteredTimelineEvents : [];
      
      allEvents.forEach(event => {
        const currentTags = Array.isArray(event.tags) ? event.tags.map(t => String(t).toLowerCase().trim()) : [];
        if (currentTags.includes('draft')) {
          events.push({
            id: event.id,
            date: event.date,
            title: event.title,
            tags: currentTags,
            eventRef: event
          });
        }
      });

      if (!events.length) {
        alert('No draft entries found in the currently filtered items.');
        return;
      }

      if (action === 'tag') {
        if (!tag) {
          alert('Please enter a tag to apply to all drafts.');
          return;
        }
        
        const targets = events.filter(e => !e.tags.includes(tag.toLowerCase()));
        if (!targets.length) {
          alert(`All draft entries already possess the tag "${tag}".`);
          return;
        }

        this.openConfirmModal({
          title: 'Tag All Drafts',
          body: `Apply tag "${tag}" to all ${targets.length} currently filtered draft entries?`,
          confirmLabel: 'Apply Tag',
          onConfirm: async () => {
            this.timelineBatchSaving = true;
            this.setTimelineBatchNotice(`Applying tag "${tag}" to ${targets.length} drafts...`, 'info');
            try {
              const res = await fetch(this.apiUrl('/api/timeline/mass-tag'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ events: targets.map(t => ({ id: t.id, date: t.date, title: t.title })), tag, mode: 'tag' })
              });
              const data = await res.json();
              if (!res.ok || data.ok === false) throw new Error(data.error || 'Failed to mass tag drafts');

              targets.forEach(t => {
                const current = Array.isArray(t.eventRef.tags) ? [...t.eventRef.tags] : [];
                if (!current.map(x => String(x).toLowerCase().trim()).includes(tag.toLowerCase())) {
                  current.push(tag);
                }
                t.eventRef.tags = current;
              });

              this.massDraftTagInput = '';
              this.setTimelineBatchNotice(`Successfully tagged ${targets.length} drafts with "${tag}".`, 'success');
            } catch (e) {
              console.error('Mass tagging drafts failed:', e);
              this.setTimelineBatchNotice(`Error: ${e.message}`, 'error');
            } finally {
              this.timelineBatchSaving = false;
            }
          }
        });

      } else if (action === 'remove-tag') {
        if (!tag) {
          alert('Please enter a tag to remove from all drafts.');
          return;
        }

        const targets = events.filter(e => e.tags.includes(tag.toLowerCase()));
        if (!targets.length) {
          alert(`No draft entries possess the tag "${tag}".`);
          return;
        }

        this.openConfirmModal({
          title: 'Remove Tag from Drafts',
          body: `Remove tag "${tag}" from all ${targets.length} currently filtered draft entries?`,
          confirmLabel: 'Remove Tag',
          onConfirm: async () => {
            this.timelineBatchSaving = true;
            this.setTimelineBatchNotice(`Removing tag "${tag}" from ${targets.length} drafts...`, 'info');
            try {
              const res = await fetch(this.apiUrl('/api/timeline/mass-tag'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ events: targets.map(t => ({ id: t.id, date: t.date, title: t.title })), tag, mode: 'remove' })
              });
              const data = await res.json();
              if (!res.ok || data.ok === false) throw new Error(data.error || 'Failed to mass untag drafts');

              targets.forEach(t => {
                let current = Array.isArray(t.eventRef.tags) ? [...t.eventRef.tags] : [];
                current = current.filter(x => String(x).toLowerCase().trim() !== tag.toLowerCase());
                t.eventRef.tags = current;
              });

              this.massDraftTagInput = '';
              this.setTimelineBatchNotice(`Successfully removed tag "${tag}" from ${targets.length} drafts.`, 'success');
            } catch (e) {
              console.error('Mass untagging drafts failed:', e);
              this.setTimelineBatchNotice(`Error: ${e.message}`, 'error');
            } finally {
              this.timelineBatchSaving = false;
            }
          }
        });

      } else if (action === 'finalize') {
        this.openConfirmModal({
          title: 'Finalize All Drafts',
          body: `Are you sure you want to finalize all ${events.length} currently filtered draft entries? This will remove the "draft" tag and make them permanent.`,
          confirmLabel: 'Finalize All',
          onConfirm: async () => {
            this.timelineBatchSaving = true;
            this.setTimelineBatchNotice(`Finalizing ${events.length} drafts...`, 'info');
            try {
              const res = await fetch(this.apiUrl('/api/timeline/mass-tag'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ events: events.map(t => ({ id: t.id, date: t.date, title: t.title })), tag: 'draft', mode: 'remove' })
              });
              const data = await res.json();
              if (!res.ok || data.ok === false) throw new Error(data.error || 'Failed to finalize drafts');

              this.timelineActiveTags = this.timelineActiveTags.filter(t => t !== 'draft');
              await this.loadTimeline();
              if (this.activeYear) {
                await this.loadCatalog(this.activeYear);
              }
              
              this.setTimelineBatchNotice(`Successfully finalized ${events.length} draft entries.`, 'success');
            } catch (e) {
              console.error('Finalizing drafts failed:', e);
              this.setTimelineBatchNotice(`Error: ${e.message}`, 'error');
            } finally {
              this.timelineBatchSaving = false;
            }
          }
        });

      } else if (action === 'delete') {
        this.openConfirmModal({
          title: 'Delete All Drafts',
          body: `Are you sure you want to permanently delete all ${events.length} currently filtered draft entries? This action cannot be undone.`,
          confirmLabel: 'Delete All',
          onConfirm: async () => {
            this.timelineBatchSaving = true;
            this.setTimelineBatchNotice(`Deleting ${events.length} draft entries...`, 'info');
            try {
              for (const item of events) {
                const response = await fetch(this.apiUrl('/api/timeline/delete-event'), {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    id: item.id,
                    date: item.date,
                    title: item.title
                  })
                });
                const payload = await response.json().catch(() => null);
                if (!response.ok || payload?.ok === false) {
                  throw new Error(String(payload?.error || `timeline-delete-${response.status}`));
                }
              }

              this.timelineActiveTags = this.timelineActiveTags.filter(t => t !== 'draft');
              await this.loadTimeline();
              if (this.activeYear) {
                await this.loadCatalog(this.activeYear);
              }

              this.setTimelineBatchNotice(`Permanently deleted ${events.length} draft entries.`, 'success');
            } catch (err) {
              console.error('Failed to delete drafts:', err);
              this.setTimelineBatchNotice(`Delete failed: ${err.message}`, 'error');
            } finally {
              this.timelineBatchSaving = false;
            }
          }
        });
      }
    },
    async autotagYearCharacters() {
      const yearChars = this.entries || [];
      if (!yearChars.length) {
        alert("No character buttons found for the active year.");
        return;
      }
      
      const charInfos = yearChars.map(e => {
        const id = String(e.id || '').toLowerCase();
        const fullName = String(this.coreRowValue(id, 'full name') || '').trim();
        const firstName = String(this.coreRowValue(id, 'first name') || '').trim();
        const names = [id];
        if (fullName) names.push(fullName.toLowerCase());
        if (firstName) names.push(firstName.toLowerCase());
        
        return {
          id: id,
          names: Array.from(new Set(names)).filter(n => n.length > 2).sort((a,b) => b.length - a.length)
        };
      });

      const events = Array.isArray(this.filteredTimelineEvents) ? this.filteredTimelineEvents : [];
      const eventsToUpdate = [];

      events.forEach(event => {
        const bodyText = String(event.body || '');
        const titleText = String(event.title || '');
        const fullText = (titleText + ' ' + bodyText).toLowerCase();
        
        let currentTagsRaw = Array.isArray(event.tags) ? [...event.tags] : [];
        const currentTagsLower = currentTagsRaw.map(t => String(t).toLowerCase().trim());
        
        let changed = false;
        
        charInfos.forEach(char => {
          if (currentTagsLower.includes(char.id)) return;
          for (const name of char.names) {
            const safeName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp('\\b' + safeName + '\\b', 'i');
            if (regex.test(fullText)) {
              currentTagsRaw.push(char.id);
              currentTagsLower.push(char.id);
              changed = true;
              break;
            }
          }
        });
        
        if (changed) {
          eventsToUpdate.push({
            event: event,
            id: event.id,
            date: event.date,
            title: event.title,
            tags: currentTagsRaw
          });
        }
      });

      if (!eventsToUpdate.length) {
        alert("No timeline events needed auto-tagging for the current year's characters.");
        return;
      }

      this.openConfirmModal({
        title: `Auto-Tag Characters`,
        body: `Found ${eventsToUpdate.length} events missing character tags. Apply?`,
        confirmLabel: 'Apply Auto-Tags',
        onConfirm: async () => {
          this.timelineBatchSaving = true;
          this.timelineBatchNotice = `Auto-tagging ${eventsToUpdate.length} events...`;
          this.timelineBatchNoticeTone = 'info';
          let successCount = 0;
          try {
            for (const evt of eventsToUpdate) {
              const res = await fetch(this.apiUrl('/api/timeline/set-tags'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: evt.id, date: evt.date, title: evt.title, tags: evt.tags })
              });
              if (res.ok) {
                evt.event.tags = evt.tags;
                successCount++;
              }
            }
            this.timelineBatchNotice = `Successfully auto-tagged ${successCount} events.`;
            this.timelineBatchNoticeTone = 'success';
            setTimeout(() => { if (this.timelineBatchNoticeTone === 'success') this.timelineBatchNotice = ''; }, 3000);
          } catch (e) {
            console.error('Auto-tagging failed:', e);
            this.timelineBatchNotice = `Error: ${e.message}`;
            this.timelineBatchNoticeTone = 'error';
          } finally {
            this.timelineBatchSaving = false;
          }
        }
      });
    },
    isHeartbeatYearInRange(year) {
      if (this.heartbeatDragging) {
        const from = this.heartbeatDragSelection.from;
        const to = this.heartbeatDragSelection.to;
        if (from === null || to === null) return false;
        return year >= Math.min(from, to) && year <= Math.max(from, to);
      }
      // Collect all active ranges (both stacked and staging)
      const activeRanges = [];
      if (Array.isArray(this.timelineYearRanges)) activeRanges.push(...this.timelineYearRanges);
      const hasStaging = (this.timelineYearFrom !== null && this.timelineYearFrom !== '') || 
                         (this.timelineYearTo !== null && this.timelineYearTo !== '');
      if (hasStaging) {
        activeRanges.push({
          from: this.timelineYearFrom,
          to: this.timelineYearTo,
          exclude: this.timelineExcludeYearRange === true
        });
      }

      if (activeRanges.length === 0) return false;

      // Evaluate inclusion and exclusion logic
      const inclusionRanges = activeRanges.filter(r => !r.exclude);
      const exclusionRanges = activeRanges.filter(r => r.exclude);

      // Check if matches inclusion:
      let matchesInclusion = true;
      if (inclusionRanges.length > 0) {
        matchesInclusion = inclusionRanges.some(r => {
          const from = r.from;
          const to = r.to;
          const hasFrom = from !== null && from !== '' && Number.isFinite(Number(from));
          const hasTo = to !== null && to !== '' && Number.isFinite(Number(to));
          if (hasFrom && hasTo) return year >= from && year <= to;
          if (hasFrom) return year >= from;
          if (hasTo) return year <= to;
          return true;
        });
      }

      // Check if matches exclusion:
      let matchesExclusion = true;
      if (exclusionRanges.length > 0) {
        const insideAnyExclusion = exclusionRanges.some(r => {
          const from = r.from;
          const to = r.to;
          const hasFrom = from !== null && from !== '' && Number.isFinite(Number(from));
          const hasTo = to !== null && to !== '' && Number.isFinite(Number(to));
          if (hasFrom && hasTo) return year >= from && year <= to;
          if (hasFrom) return year >= from;
          if (hasTo) return year <= to;
          return false;
        });
        if (insideAnyExclusion) {
          matchesExclusion = false;
        }
      }

      return matchesInclusion && matchesExclusion;
    },
    onHeartbeatMousedown(event, bar) {
      if (event.button !== 0) return; // Only left click
      this.heartbeatDragging = true;
      this.heartbeatDragSelection.from = bar.year;
      this.heartbeatDragSelection.to = bar.year;

      const onMousemove = (moveEvent) => {
        if (!this.heartbeatDragging) return;
        // Find the bar under the mouse
        const el = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
        const barEl = el?.closest('.mr-heartbeat-bar');
        if (barEl) {
          // This is a bit hacky but we need the year from the bar element
          // We can store it in a data attribute
          const year = Number(barEl.getAttribute('data-year'));
          if (Number.isFinite(year)) {
            this.heartbeatDragSelection.to = year;
          }
        }
      };

      const onMouseup = () => {
        if (this.heartbeatDragging) {
          const from = Math.min(this.heartbeatDragSelection.from, this.heartbeatDragSelection.to);
          const to = Math.max(this.heartbeatDragSelection.from, this.heartbeatDragSelection.to);
          this.timelineYearFrom = from;
          this.timelineYearTo = to;
          this.heartbeatDragging = false;

          const el = document.querySelector('.mr-timeline-list');
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }
        window.removeEventListener('mousemove', onMousemove);
        window.removeEventListener('mouseup', onMouseup);
      };

      window.addEventListener('mousemove', onMousemove);
      window.addEventListener('mouseup', onMouseup);
    },
    selectHeartbeatBackgroundPeriod(period) {
      if (!period || period.startYear == null || period.endYear == null) return;
      this.timelineYearFrom = period.startYear;
      this.timelineYearTo = period.endYear;
      
      const el = document.querySelector('.mr-timeline-list');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    },
    timelineCharacterTags(event) {
      const tags = Array.isArray(event?.tags) ? event.tags : [];
      const coreSize = Object.keys(this.characterCore || {}).length;
      if (!this._timelineKnownCharacterIds || this._timelineKnownCharacterSeed !== coreSize) {
        this._timelineKnownCharacterIds = new Set(Object.keys(this.characterCore || {}).map((id) => String(id || '').toLowerCase()));
        this._timelineKnownCharacterSeed = coreSize;
      }
      const known = this._timelineKnownCharacterIds;
      const normalizeLooseId = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

      if (!this._timelineKnownCharacterLooseMap || this._timelineKnownCharacterLooseSeed !== known.size) {
        const looseMap = new Map();
        known.forEach((id) => {
          const loose = normalizeLooseId(id);
          if (loose && !looseMap.has(loose)) {
            looseMap.set(loose, id);
          }
        });
        this._timelineKnownCharacterLooseMap = looseMap;
        this._timelineKnownCharacterLooseSeed = known.size;
      }

      const coreKeys = Object.keys(this.characterCore || {});
      const cacheSeed = coreKeys.length;
      if (!this._timelineSecretIdentityMap || this._timelineSecretIdentitySeed !== cacheSeed) {
        const fullNameById = new Map();
        coreKeys.forEach((rawId) => {
          const id = String(rawId || '').toLowerCase().trim();
          if (!id) {
            return;
          }
          const fullName = String(this.coreRowValue(id, 'full name') || '').toLowerCase().trim();
          if (fullName) {
            fullNameById.set(id, fullName);
          }
        });

        const secretByFullName = new Map();
        coreKeys.forEach((rawId) => {
          const id = String(rawId || '').toLowerCase().trim();
          if (!id) {
            return;
          }
          const core = this.characterCore?.[id] || {};
          if (!core?.['secret-identity']) {
            return;
          }
          const fullName = fullNameById.get(id);
          if (!fullName || secretByFullName.has(fullName)) {
            return;
          }
          secretByFullName.set(fullName, id);
        });

        const secretMap = new Map();
        coreKeys.forEach((rawId) => {
          const id = String(rawId || '').toLowerCase().trim();
          if (!id) {
            return;
          }
          const fullName = fullNameById.get(id);
          const secretId = fullName ? (secretByFullName.get(fullName) || '') : '';
          secretMap.set(id, secretId);
        });

        this._timelineSecretIdentityMap = secretMap;
        this._timelineSecretIdentitySeed = cacheSeed;
      }

      const resolved = tags
        .map((tag) => String(tag || '').toLowerCase().trim())
        .map((tag) => {
          if (!tag) {
            return '';
          }
          if (known.has(tag) && !SPECIAL_ENTRY_ICONS[tag]) {
            return tag;
          }
          const loose = normalizeLooseId(tag);
          const looseId = this._timelineKnownCharacterLooseMap?.get(loose);
          if (looseId && !SPECIAL_ENTRY_ICONS[looseId]) {
            return looseId;
          }
          return '';
        })
        .filter(Boolean);

      const canonical = resolved.map((id) => this.getResolvedCharacterId(id));
      return Array.from(new Set(canonical));
    },
    queueJourneyPortraitLoad(characterId, year) {
      const id = String(characterId || '').toLowerCase().trim();
      const y = Number(year);
      if (!id || !Number.isFinite(y)) {
        return;
      }
      const key = `${id}::${y}`;
      if (Object.prototype.hasOwnProperty.call(this.journeyPortraitByYearChar || {}, key)) {
        return;
      }

      this.journeyPortraitByYearChar = {
        ...(this.journeyPortraitByYearChar || {}),
        [key]: ''
      };

      const capYear = Number.isFinite(this.journeyReferenceYear) ? this.journeyReferenceYear : y;
      this.closestPortraitForCharacterCapped(id, y, capYear)
        .then((src) => {
          this.journeyPortraitByYearChar = {
            ...(this.journeyPortraitByYearChar || {}),
            [key]: String(src || '')
          };
        })
        .catch(() => {
          this.journeyPortraitByYearChar = {
            ...(this.journeyPortraitByYearChar || {}),
            [key]: ''
          };
        });
    },
    journeyPortraitForGroup(group) {
      if (!this.portraitsAvailable) return '';
      const id = String(this.journeyCharacterId || '').toLowerCase().trim();
      const y = Number(group?.bucketYear);
      if (!id || !Number.isFinite(y)) {
        return '';
      }
      const key = `${id}::${y}`;
      if (this.journeyPortraitFailedByYearChar?.[key]) {
        return '';
      }
      const cached = this.journeyPortraitByYearChar?.[key];
      if (typeof cached === 'string' && cached) {
        return cached;
      }
      this.queueJourneyPortraitLoad(id, y);
      return '';
    },
    onJourneyPortraitError(group) {
      const id = String(this.journeyCharacterId || '').toLowerCase().trim();
      const y = Number(group?.bucketYear);
      if (!id || !Number.isFinite(y)) {
        return;
      }
      const key = `${id}::${y}`;
      this.journeyPortraitFailedByYearChar = {
        ...(this.journeyPortraitFailedByYearChar || {}),
        [key]: true
      };
      this.journeyPortraitByYearChar = {
        ...(this.journeyPortraitByYearChar || {}),
        [key]: ''
      };
    },
    async closestPortraitForCharacterCapped(characterId, targetYear, capYear) {
      const charId = String(characterId || '').toLowerCase().trim();
      const target = Number(targetYear || 0);
      const cap = Number(capYear || 0);
      if (!charId) {
        return '';
      }

      if (!Number.isFinite(cap) || cap <= 0) {
        return this.closestPortraitForCharacter(charId, target);
      }

      const boundedTarget = Number.isFinite(target) && target > 0
        ? Math.min(target, cap)
        : cap;

      for (let radius = 0; radius <= 14; radius += 1) {
        const year = boundedTarget - radius;
        if (year < 0) {
          break;
        }
        const direct = await this.probeDirectPortraitForYear(year, charId);
        if (direct) {
          return direct;
        }
      }

      const eligibleYears = (this.timelinePortraitYearOptions || [])
        .map((year) => Number(year))
        .filter((year) => Number.isFinite(year) && year <= cap)
        .sort((a, b) => {
          const da = Math.abs(a - boundedTarget);
          const db = Math.abs(b - boundedTarget);
          if (da !== db) {
            return da - db;
          }
          return b - a;
        });

      if (!this._timelinePortraitByYearChar) {
        this._timelinePortraitByYearChar = {};
      }

      for (const year of eligibleYears) {
        const cacheKey = `${year}::${charId}`;
        if (Object.prototype.hasOwnProperty.call(this._timelinePortraitByYearChar, cacheKey)) {
          const cached = this._timelinePortraitByYearChar[cacheKey];
          if (cached) {
            return cached;
          }
          continue;
        }

        const catalog = await this.ensureTimelineCatalog(String(year));
        const portrait = this.bestPortraitFromCatalog(catalog, charId);
        this._timelinePortraitByYearChar[cacheKey] = portrait || '';
        if (portrait) {
          return portrait;
        }
      }

      for (let radius = 0; radius <= 20; radius += 1) {
        const checkYears = radius === 0 ? [boundedTarget] : [boundedTarget - radius, boundedTarget + radius];
        for (const year of checkYears) {
          if (year < 0 || year > 9999) continue;
          const direct = await this.probeDirectPortraitForYear(year, charId);
          if (direct) return direct;
        }
      }

      return '';
    },
    journeyGroupLabel(group) {
      const year = Number(group?.bucketYear);
      if (!Number.isFinite(year)) {
        return 'Unknown Era';
      }
      return `Portrait Era: ${year}`;
    },
    queueRelationshipPortraitLoad(characterId, year) {
      const id = String(characterId || '').toLowerCase().trim();
      const y = Number(year);
      if (!id || !Number.isFinite(y)) {
        return;
      }
      const key = `${id}::${y}`;
      if (Object.prototype.hasOwnProperty.call(this.relationshipPortraitByYearChar || {}, key)) {
        return;
      }

      this.relationshipPortraitByYearChar = {
        ...(this.relationshipPortraitByYearChar || {}),
        [key]: ''
      };

      const capYear = Number.isFinite(this.relationshipReferenceYear) ? this.relationshipReferenceYear : y;
      this.closestPortraitForCharacterCapped(id, y, capYear)
        .then((src) => {
          this.relationshipPortraitByYearChar = {
            ...(this.relationshipPortraitByYearChar || {}),
            [key]: String(src || '')
          };
        })
        .catch(() => {
          this.relationshipPortraitByYearChar = {
            ...(this.relationshipPortraitByYearChar || {}),
            [key]: ''
          };
        });
    },
    relationshipPortraitForMember(memberId, year) {
      if (!this.portraitsAvailable) return '';
      const id = String(memberId || '').toLowerCase().trim();
      const y = Number(year);
      if (!id || !Number.isFinite(y)) {
        return '';
      }
      const key = `${id}::${y}`;
      if (this.relationshipPortraitFailedByYearChar?.[key]) {
        return '';
      }
      const cached = this.relationshipPortraitByYearChar?.[key];
      if (typeof cached === 'string' && cached) {
        return cached;
      }
      this.queueRelationshipPortraitLoad(id, y);
      return '';
    },
    onRelationshipPortraitError(memberId, year) {
      const id = String(memberId || '').toLowerCase().trim();
      const y = Number(year);
      if (!id || !Number.isFinite(y)) {
        return;
      }
      const key = `${id}::${y}`;
      this.relationshipPortraitFailedByYearChar = {
        ...(this.relationshipPortraitFailedByYearChar || {}),
        [key]: true
      };
      this.relationshipPortraitByYearChar = {
        ...(this.relationshipPortraitByYearChar || {}),
        [key]: ''
      };
    },
    relationshipTypeLabel(value) {
      const raw = String(value || '').trim();
      if (!raw) {
        return 'unknown';
      }
      return raw
        .split(/[-_\s]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
    },
    relationshipDateRangeLabel(item) {
      const start = String(item?.startDate || '').trim();
      const end = String(item?.splitDate || '').trim();
      if (start && end) {
        return `${this.formatTimelineDate(start)} to ${this.formatTimelineDate(end)}`;
      }
      if (start) {
        return `${this.formatTimelineDate(start)} onward`;
      }
      if (end) {
        return `Until ${this.formatTimelineDate(end)}`;
      }
      return 'Date unknown';
    },
    async ensureTimelineCatalog(year) {
      const y = String(year || '').trim();
      if (!y) {
        return null;
      }

      if (!this._timelineCatalogByYear) {
        this._timelineCatalogByYear = {};
      }
      if (Object.prototype.hasOwnProperty.call(this._timelineCatalogByYear, y)) {
        return this._timelineCatalogByYear[y];
      }

      try {
        const res = await fetch(`${this.backendOrigin()}/api/media/catalog?year=${encodeURIComponent(y)}`);
        if (!res.ok) {
          this._timelineCatalogByYear[y] = null;
          return null;
        }
        const payload = await res.json();
        this._timelineCatalogByYear[y] = payload?.catalog || null;
        return this._timelineCatalogByYear[y];
      } catch {
        this._timelineCatalogByYear[y] = null;
        return null;
      }
    },
    bestPortraitFromCatalog(catalog, characterId) {
      const list = Array.isArray(catalog?.portraits) ? catalog.portraits : [];
      if (!list.length) {
        return '';
      }

      let best = { src: '', score: 0 };
      list.forEach((path) => {
        const score = this.scoreByEntryId(path, characterId);
        if (score > best.score) {
          best = { src: String(path || ''), score };
        }
      });
      return best.score > 0 ? best.src : '';
    },
    closestPortraitSync(characterId, targetYear) {
      if (!this.portraitsAvailable) return '';
      const aliasId = String(characterId || '').toLowerCase().trim();
      if (!aliasId || SPECIAL_ENTRY_ICONS[aliasId]) {
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
        const aliasFiles = files.filter(f => f.toLowerCase().startsWith(prefix));

        if (aliasFiles.length === 1) {
          const finalFolder = this.portraitFolderMap?.[targetFolderId] || targetFolderId;
          return `${this.backendOrigin()}/portraits/${finalFolder}/${aliasFiles[0]}`;
        }

        const target = Number(targetYear || 0);
        let bestFile = '';
        let minDiff = Infinity;

        const candidates = (aliasFiles.length > 0) ? aliasFiles : (targetFolderId === 'misc' ? [] : files);

        for (const filename of candidates) {
          const lower = filename.toLowerCase();
          let fileYear = null;
          const bcMatch = lower.match(/(\d+)\s*bc/i);
          if (bcMatch) {
            fileYear = -Number(bcMatch[1]);
          } else {
            const yearMatch = lower.match(/(\d{4})/);
            if (yearMatch) {
              const matchedVal = yearMatch[0];
              if (lower.includes('--' + matchedVal) || lower.includes('-' + matchedVal)) {
                fileYear = -Number(matchedVal);
              } else {
                fileYear = Number(matchedVal);
              }
            }
          }

          if (fileYear === null) {
            if (!bestFile) bestFile = filename;
            continue;
          }

          const yStr = String(fileYear);
          const isPureYear = lower === `${yStr}.jpg` || lower === `${yStr}.png` || lower === `${yStr}.webp` || lower === `${yStr}.jpeg` || lower === `${yStr}.avif`;
          if (lower.startsWith(yStr) && !isPureYear) continue;

          if (lower.includes('-')) {
            const layerRegex = new RegExp(`^${prefix}\\d{4}-\\d+\\.(jpe?g|png|webp|avif)$`, 'i');
            if (layerRegex.test(lower)) continue;
          }

          const diff = Math.abs(fileYear - target);
          if (diff < minDiff) {
            minDiff = diff;
            bestFile = filename;
          }
        }

        if (bestFile) {
          const finalFolder = this.portraitFolderMap?.[targetFolderId] || targetFolderId;
          return `${this.backendOrigin()}/portraits/${finalFolder}/${bestFile}`;
        }
      }
      return '';
    },
    async closestPortraitForCharacter(characterId, targetYear, manifestOnly = false) {
      if (!this.portraitsAvailable) return '';
      const aliasId = String(characterId || '').toLowerCase().trim();
      if (!aliasId || SPECIAL_ENTRY_ICONS[aliasId]) {
        return '';
      }

      const core = this.characterCore?.[aliasId];
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

      // 1. Instant Resolution via Portrait Manifest (No Network Probes)
      if (Array.isArray(files) && files.length > 0) {
        const aliasFiles = files.filter(f => f.toLowerCase().startsWith(prefix));

        // High-priority: if only one portrait exists for this alias, use it universally
        if (aliasFiles.length === 1) {
          const finalFolder = this.portraitFolderMap?.[targetFolderId] || targetFolderId;
          return `${this.backendOrigin()}/portraits/${finalFolder}/${aliasFiles[0]}`;
        }

        const target = Number(targetYear || 0);
        let bestFile = '';
        let minDiff = Infinity;

        const candidates = (aliasFiles.length > 0) ? aliasFiles : (targetFolderId === 'misc' ? [] : files);
        
        // If we found alias-specific files, we MUST use one of them.
        // We will not fall back to the base identity's civilian portraits anymore.

        for (const filename of candidates) {
          const lower = filename.toLowerCase();
          // Detect year in filename (support BC/negative years)
          let fileYear = null;
          const bcMatch = lower.match(/(\d+)\s*bc/i);
          if (bcMatch) {
            fileYear = -Number(bcMatch[1]);
          } else {
            const yearMatch = lower.match(/(?<!\d)(\d{4})(?!\d)/);
            if (yearMatch) {
              const matchedVal = yearMatch[0];
              // If it's explicitly negative (preceded by '--' or '-', e.g. roboter-2500.jpg, sarah-2000.jpg)
              if (lower.includes('--' + matchedVal) || lower.includes('-' + matchedVal)) {
                fileYear = -Number(matchedVal);
              } else {
                fileYear = Number(matchedVal);
              }
            }
          }

          if (fileYear === null) {
            if (!bestFile) bestFile = filename;
            continue;
          }

          const yStr = String(fileYear);
          const isPureYear = lower === `${yStr}.jpg` || lower === `${yStr}.png` || lower === `${yStr}.webp` || lower === `${yStr}.jpeg` || lower === `${yStr}.avif`;

          if (lower.startsWith(yStr) && !isPureYear) continue;

          if (lower.includes('-')) {
            const layerRegex = new RegExp(`^${prefix}\\d{4}-\\d+\\.(jpe?g|png|webp|avif)$`, 'i');
            if (layerRegex.test(lower)) continue;
          }

          const diff = Math.abs(fileYear - target);
          if (diff < minDiff) {
            minDiff = diff;
            bestFile = filename;
          }
        }

        if (bestFile) {
          const finalFolder = this.portraitFolderMap?.[targetFolderId] || targetFolderId;
          return `${this.backendOrigin()}/portraits/${finalFolder}/${bestFile}`;
        }
      }

      if (manifestOnly) {
        return '';
      }

      // 2. Fallback to Legacy Catalog system if manifest doesn't yield a result
      const target = Number(targetYear || 0);
      const years = (this.timelinePortraitYearOptions || [])
        .map((year) => Number(year))
        .filter((year) => Number.isFinite(year));

      const sortedYears = years
        .slice()
        .sort((a, b) => {
          const da = Number.isFinite(target) && target > 0 ? Math.abs(a - target) : 0;
          const db = Number.isFinite(target) && target > 0 ? Math.abs(b - target) : 0;
          if (da !== db) return da - db;
          return a - b;
        });

      if (!this._timelinePortraitByYearChar) {
        this._timelinePortraitByYearChar = {};
      }

      for (const year of sortedYears) {
        const cacheKey = `${year}::${aliasId}`;
        if (Object.prototype.hasOwnProperty.call(this._timelinePortraitByYearChar, cacheKey)) {
          const cached = this._timelinePortraitByYearChar[cacheKey];
          if (cached) return cached;
          continue;
        }

        const catalog = await this.ensureTimelineCatalog(String(year));
        const portrait = this.bestPortraitFromCatalog(catalog, aliasId);
        this._timelinePortraitByYearChar[cacheKey] = portrait || '';
        if (portrait) {
          return portrait;
        }

      }
      return '';
    },
    resolveLayeredPortrait(characterId, year, month) {
      if (!this.portraitsAvailable) return null;
      const id = String(characterId || '').toLowerCase().trim();
      const core = this.characterCore?.[id];
      const folderId = this.getResolvedCharacterId(id);
      const prefix = id;
      const targetFolderId = folderId;

      const files = this.portraitManifest?.[targetFolderId];

      if (!Array.isArray(files) || files.length === 0) return null;

      const y = String(year).trim();
      const m = Number(month || 0);

      // Find all files for this year, identifying the base and any layers
      let baseFile = '';
      const layers = [];
      let maxN = -1;

      for (const f of files) {
        const lower = f.toLowerCase();
        // Base: {prefix}{y}.ext
        if (lower.startsWith(`${prefix}${y}.`)) {
          const extMatch = lower.match(/\.(jpe?g|png|webp|avif)$/i);
          if (extMatch && lower === `${prefix}${y}${extMatch[0]}`) {
            baseFile = f;
          }
        }
        // Layer: {prefix}{y}-{N}.ext
        const layerMatch = lower.match(new RegExp(`^${prefix}${y}-(\\d+)\\.(jpe?g|png|webp|avif)$`, 'i'));
        if (layerMatch) {
          const n = parseInt(layerMatch[1], 10);
          layers[n] = f;
          if (n > maxN) maxN = n;
        }
      }

      if (maxN === -1) {
        // No layers found for this specific year
        return null;
      }

      // Total slices: Base + (maxN + 1) layers
      const totalSlices = maxN + 2;
      const sliceSize = 12 / totalSlices;

      // Base is the first slice (Jan - ...)
      // Month 0 means unknown, use base as default
      if (m <= 0) {
        return baseFile ? `portraits/${targetFolderId}/${baseFile}` : null;
      }

      const sliceIndex = Math.min(Math.floor((m - 1) / sliceSize), totalSlices - 1);

      if (sliceIndex === 0) {
        return baseFile ? `portraits/${targetFolderId}/${baseFile}` : null;
      } else {
        const layerFile = layers[sliceIndex - 1];
        return layerFile ? `portraits/${targetFolderId}/${layerFile}` : (baseFile ? `portraits/${targetFolderId}/${baseFile}` : null);
      }
    },
    async resolveTimelinePortraits(event) {
      const year = this.timelineEventYear(event);
      const dateParts = this.parseTimelineDateParts(event?.date || '');
      const month = dateParts ? dateParts.month : 0;
      const allTags = this.timelineCharacterTags(event);
      if (!allTags.length) {
        return [];
      }

      // timelineCharacterTags returns canonical IDs (redirect aliases are resolved,
      // e.g. "azure-knight" becomes "clint"). For portrait purposes we want to
      // prefer the alias portrait (azure-knight2028.jpg) when the alias tag appears
      // in the raw event tags. Build a mapping: canonical → best alias from raw tags.
      const rawTags = Array.isArray(event?.tags) ? event.tags : [];
      const aliasForCanonical = new Map();
      for (const raw of rawTags) {
        const rawId = String(raw || '').toLowerCase().trim();
        if (!rawId) continue;
        const core = this.characterCore?.[rawId];
        if (!core?.redirect) continue;
        const canonical = this.getResolvedCharacterId(rawId);
        if (!canonical || canonical === rawId) continue;
        // Check if this alias has portrait files (either in its own folder
        // or as prefixed files in the redirect target's folder)
        const ownFolder = this.portraitManifest?.[rawId];
        const targetFiles = this.portraitManifest?.[canonical] || [];
        const hasOwnFiles = Array.isArray(ownFolder) && ownFolder.length > 0;
        const hasPrefixed = targetFiles.some(f => f.toLowerCase().startsWith(rawId));
        if (hasOwnFiles || hasPrefixed) {
          aliasForCanonical.set(canonical, rawId);
        }
      }

      // Use the alias-aware tag list for portrait resolution.
      // When an alias is present, replace the canonical tag with the alias
      // so portrait lookup finds alias-specific files (e.g. azure-knight2028.jpg).
      const effectiveTags = allTags.map(t => {
        const tid = t.toLowerCase().trim();
        return aliasForCanonical.get(tid) || tid;
      });

      // Filter tags: if an alias (redirect) and its target are both present, hide the target.
      const effectiveSet = new Set(effectiveTags);
      const toHide = new Set();
      for (const t of effectiveTags) {
        const core = this.characterCore?.[t];
        if (core?.redirect) {
          const target = String(core.redirect).toLowerCase().trim();
          if (effectiveSet.has(target)) {
            toHide.add(target);
          }
        }
      }
      const tags = effectiveTags.filter(t => !toHide.has(t));

      const portraits = [];
      for (const charId of tags) {
        // 0. Try special portrait tags first (e.g. clint/gala.jpg)
        let src = null;
        const specialTag = rawTags.find(t => {
          const nt = this.normalize(t);
          if (SPECIAL_PORTRAIT_TAGS.has(nt)) return true;
          const entity = this.entitiesRegistry?.[nt];
          return Array.isArray(entity?.tags) && entity.tags.includes('special');
        });

        if (specialTag) {
          const s = this.normalize(specialTag);
          const canonicalId = this.getResolvedCharacterId(charId);
          const manifest = this.portraitManifest?.[canonicalId] || [];
          const specialFile = manifest.find(f => {
            const lower = f.toLowerCase();
            return lower.includes(s) && (lower.endsWith('.jpg') || lower.endsWith('.png') || lower.endsWith('.webp'));
          });
          if (specialFile) {
            const finalFolder = this.portraitFolderMap?.[canonicalId] || canonicalId;
            src = `${this.backendOrigin()}/portraits/${finalFolder}/${specialFile}`;
          }
        }

        // 1. Try layered portrait second (e.g. jess2026-0.jpg)
        if (!src) {
          src = this.resolveLayeredPortrait(charId, year, month);
        }

        // 2. Fall back to standard lookup
        if (!src) {
          src = await this.closestPortraitForCharacter(charId, year, true);
        }

        portraits.push({ characterId: charId, src: String(src || '') });
      }
      return portraits;
    },
    async closestTimelinePortraitFromCatalog(characterId, targetYear) {
      const charId = String(characterId || '').toLowerCase().trim();
      if (!charId) {
        return '';
      }

      const target = Number(targetYear || 0);
      const years = (this.timelinePortraitYearOptions || [])
        .map((year) => Number(year))
        .filter((year) => Number.isFinite(year));
      const sortedYears = years
        .slice()
        .sort((a, b) => {
          const da = Number.isFinite(target) && target > 0 ? Math.abs(a - target) : 0;
          const db = Number.isFinite(target) && target > 0 ? Math.abs(b - target) : 0;
          if (da !== db) {
            return da - db;
          }
          return a - b;
        });

      if (!this._timelinePortraitByYearChar) {
        this._timelinePortraitByYearChar = {};
      }

      for (const year of sortedYears) {
        const cacheKey = `${year}::${charId}`;
        if (Object.prototype.hasOwnProperty.call(this._timelinePortraitByYearChar, cacheKey)) {
          const cached = this._timelinePortraitByYearChar[cacheKey];
          if (cached) {
            return cached;
          }
          continue;
        }

        const catalog = await this.ensureTimelineCatalog(String(year));
        const portrait = this.bestPortraitFromCatalog(catalog, charId);
        this._timelinePortraitByYearChar[cacheKey] = portrait || '';
        if (portrait) {
          return portrait;
        }
      }

      return '';
    },
    timelinePortraitsForEvent(event, index = 0) {
      const key = this.timelineEventKey(event, index);
      const value = this.timelinePortraitByEvent?.[key];
      if (Array.isArray(value)) {
        return value;
      }
      return this.timelineCharacterTags(event).map((characterId) => ({ characterId, src: '' }));
    },
    timelineTagPortrait(event, tag, index = 0) {
      const charId = this.getResolvedCharacterId(this.plainText(tag));
      if (!charId) return '';
      const portraits = this.timelinePortraitsForEvent(event, index) || [];
      const match = portraits.find(p => p.characterId === charId);
      return match ? match.src : '';
    },
    timelineEntityPortraitsForEvent(event) {
      if (!event || !Array.isArray(event.tags)) return [];
      const portraits = [];
      const year = this.timelineEventYear(event);
      
      event.tags.forEach(tag => {
        const cleaned = this.plainText(tag).toLowerCase().trim();
        if (this.timelineTagType(tag) === 'entity') {
          const files = this.portraitManifest?.[cleaned];
          if (Array.isArray(files) && files.length > 0) {
            // Find year-specific portrait or fallback to the first file
            const yStr = String(year);
            const matchFile = files.find(f => f.includes(yStr)) || files[0];
            portraits.push({
              tag: cleaned,
              src: `portraits/${cleaned}/${matchFile}`
            });
          }
        }
      });
      return portraits;
    },
    timelineTagCanonicalId(tag) {
      const cleanLower = String(tag || '').toLowerCase().trim();
      const resolvedId = this.getResolvedCharacterId(cleanLower);
      if (resolvedId && resolvedId !== cleanLower) {
        return resolvedId;
      }
      const aliases = TIMELINE_TAG_ALIASES || {};
      for (const [canonical, list] of Object.entries(aliases)) {
        if (Array.isArray(list) && list.map(a => String(a).toLowerCase().trim()).includes(cleanLower)) {
          return canonical.toLowerCase().trim();
        }
      }
      return cleanLower;
    },
    timelineTagDisplayText(event, tag) {
      const rawTag = this.plainText(tag);
      const cleanLower = rawTag.toLowerCase().trim();
      const canonical = this.timelineTagCanonicalId(cleanLower);
      
      if (canonical && canonical !== cleanLower) {
        const eventTags = Array.isArray(event?.tags)
          ? event.tags.map(t => this.plainText(t).toLowerCase().trim())
          : [];
        if (eventTags.includes(canonical)) {
          return `${canonical}/${rawTag}`;
        }
      }
      return rawTag;
    },
    isCompactTimelineEvent(event) {
      return !!event?.__compactTimeline;
    },
    timelineMembershipChanges(event) {
      if (!Array.isArray(event?.__membershipChanges)) {
        return [];
      }
      return event.__membershipChanges.filter((item) => item && item.characterId);
    },
    isCharacterDeceasedByYear(characterId, year) {
      const id = String(characterId || '').toLowerCase().trim();
      if (!id) {
        return false;
      }
      const deathParts = this.characterDeathParts(id);
      if (!deathParts) {
        return false;
      }

      const active = Number(String(year || '').trim());
      if (!Number.isFinite(active)) {
        return true;
      }
      return deathParts.year <= active;
    },
    queueRelationshipTreePortraitLoad(characterId, year) {
      const id = String(characterId || '').toLowerCase().trim();
      const y = String(year || '').trim();
      if (!id || !/^\d{4}$/.test(y)) {
        return;
      }
      const key = `${y}::${id}`;
      if (Object.prototype.hasOwnProperty.call(this.relationshipPortraitByYearChar || {}, key)) {
        return;
      }
      this.relationshipPortraitByYearChar = {
        ...(this.relationshipPortraitByYearChar || {}),
        [key]: ''
      };

      console.debug('MR: queueRelationshipTreePortraitLoad -> queued', { key, id, year: y });

      this.resolveRelationshipTreePortraitForYear(id, y)
        .then((src) => {
          console.debug('MR: queueRelationshipTreePortraitLoad -> resolved', { key, src });
          this.relationshipPortraitByYearChar = {
            ...(this.relationshipPortraitByYearChar || {}),
            [key]: String(src || '')
          };
        })
        .catch((err) => {
          console.debug('MR: queueRelationshipTreePortraitLoad -> error', { key, error: String(err || '') });
          this.relationshipPortraitByYearChar = {
            ...(this.relationshipPortraitByYearChar || {}),
            [key]: ''
          };
        });
    },
    async resolveRelationshipTreePortraitForYear(characterId, year) {
      const id = String(characterId || '').toLowerCase().trim();
      const y = String(year || '').trim();
      if (!id || !/^\d{4}$/.test(y)) {
        return '';
      }

      // Prefer exact-year direct filenames first for relationship tree icons.
      const direct = await this.probeDirectPortraitForYear(y, id);
      console.debug('MR: resolveRelationshipTreePortraitForYear -> direct probe', { id, year: y, direct });
      if (direct) {
        return direct;
      }

      // Fall back to nearest indexed year portrait.
      return this.closestPortraitForCharacter(id, y);
    },
    async probeDirectPortraitForYear(year, characterId) {
      if (!this.portraitsAvailable) return '';
      const y = String(year || '').trim();
      const id = String(characterId || '').trim().toLowerCase();
      if (!y || !id) return '';

      // Probes the portraitManifest (which covers portraits/<charId>/ directory)
      // for a file that matches the pattern <year><id> or <id><year> or just <year>
      let targetFolderId = id;
      let files = this.portraitManifest?.[targetFolderId];

      // If the alias has no own folder, resolve via redirect to find the target folder
      // (e.g. azure-knight → clint, so we look in portraits/clint/ for azure-knight*.jpg)
      if (!Array.isArray(files) || files.length === 0) {
        const resolvedId = this.getResolvedCharacterId(id);
        if (resolvedId && resolvedId !== id && this.portraitManifest?.[resolvedId]) {
          files = this.portraitManifest[resolvedId];
          targetFolderId = resolvedId;
        }
      }

      if (!Array.isArray(files) || files.length === 0) {
        if (this.portraitManifest?.['misc']) {
          files = this.portraitManifest['misc'];
          targetFolderId = 'misc';
        }
      }

      if (Array.isArray(files) && files.length > 0) {
        const yearMatch = files.find(f => {
          const lower = f.toLowerCase();
          const isPureYear = lower === `${y}.jpg` || lower === `${y}.png` || lower === `${y}.webp` || lower === `${y}.jpeg` || lower === `${y}.avif`;
          const absY = Math.abs(y);
          const isBC = y < 0;
          const bcSuffix = isBC ? `${absY}bc` : '';
          const bcDashes = isBC ? `-${absY}` : '';
          
          // Exclude if it starts with the year (e.g. 2025-appearance) unless it's exactly the year
          if (lower.startsWith(y) && !isPureYear) return false;

          if (targetFolderId === 'misc') {
            // In the misc folder, files MUST include the character's id in their name
            return (lower.includes(y) || (bcSuffix && lower.includes(bcSuffix)) || (bcDashes && lower.includes(bcDashes))) && lower.includes(id);
          }
          return (lower.includes(y) || (bcSuffix && lower.includes(bcSuffix)) || (bcDashes && lower.includes(bcDashes))) && (lower.includes(id) || isPureYear);
        });
        if (yearMatch) {
          return `portraits/${targetFolderId}/${yearMatch}`;
        }
      }

      return '';
    },
    relationshipTreePortraitForId(characterId) {
      if (!this.portraitsAvailable) return '';
      const id = this.getResolvedCharacterId(String(characterId || '').toLowerCase().trim());
      const year = String(this.activeYear || '').trim();
      if (!id || !/^\d{4}$/.test(year)) {
        return '';
      }
      const key = `${year}::${id}`;
      if (this.relationshipPortraitFailedByYearChar?.[key]) {
        return '';
      }
      const cached = this.relationshipPortraitByYearChar?.[key];
      if (typeof cached === 'string' && cached) {
        return cached;
      }
      this.queueRelationshipTreePortraitLoad(id, year);
      return '';
    },
    onRelationshipTreePortraitError(characterId) {
      const id = String(characterId || '').toLowerCase().trim();
      const year = String(this.activeYear || '').trim();
      if (!id || !/^\d{4}$/.test(year)) {
        return;
      }
      const key = `${year}::${id}`;
      this.relationshipPortraitFailedByYearChar = {
        ...(this.relationshipPortraitFailedByYearChar || {}),
        [key]: true
      };
      this.relationshipPortraitByYearChar = {
        ...(this.relationshipPortraitByYearChar || {}),
        [key]: ''
      };
    },
    resolveMediaUrl(path) {
      if (!path) return '';
      const normalized = String(path).replace(/\\/g, '/');
      if (normalized.toLowerCase().endsWith('.enc')) {
        const params = new URLSearchParams({ path: normalized });
        if (this.secureMediaToken) {
          params.set('token', this.secureMediaToken);
        }
        return `${this.backendOrigin()}/api/secure-media?${params.toString()}`;
      }
      return path;
    },
    toMediaObject(path, score = 0) {
      const rawPath = String(path || '');
      const src = this.resolveMediaUrl(rawPath);
      const isVideo = /\.mp4$/i.test(rawPath);
      const normalized = rawPath.replace(/\\/g, '/').toLowerCase();
      const filename = normalized.split('/').pop() || '';
      const isWideByName = /(field|movie|theater|cinema|landscape|panorama|wide)/i.test(filename);
      return {
        src,
        score,
        type: isVideo ? 'video' : 'image',
        mimeType: isVideo ? 'video/mp4' : '',
        isWide: isVideo || isWideByName
      };
    },
    factionTokens(block) {
      const nameTokens = [
        this.normalize(block?.name || ''),
        this.normalize(block?.label || '')
      ]
        .filter(Boolean)
        .flatMap((value) => String(value).split(/\s+/));

      return Array.from(new Set(nameTokens.filter((t) => t && t.length >= 3)));
    },
    is2026FactionsEntry() {
      const year = String(this.activeYear || '').trim();
      const entryId = String(this.activeEntry?.id || '').toLowerCase().trim();
      return year === '2026' && entryId === 'factions';
    },
    relationshipGroupForFaction(block) {
      if (!this.is2026FactionsEntry()) {
        return null;
      }
      const source = Array.isArray(this.relationships) ? this.relationships : [];
      if (!source.length) {
        return null;
      }

      const name = this.normalize(block?.name || block?.label || '');
      if (!name) {
        return null;
      }

      const groupType = (type) => /group|organization|crew|unit|community/.test(String(type || '').toLowerCase());
      return source.find((row) => {
        if (!groupType(row?.type)) {
          return false;
        }
        const label = this.normalize(row?.label || '');
        const id = this.normalize(row?.id || '');
        const internalName = this.normalize(row?.['internal-name'] || '');
        return (label && label === name) || (id && id === name) || (internalName && internalName === name);
      }) || null;
    },
    resolveRelationshipHistoryMemberToken(token) {
      const raw = String(token || '').trim().toLowerCase();
      if (!raw) {
        return '';
      }

      let candidate = raw.replace(/^[+-]/, '').trim();
      candidate = candidate.replace(/^timeline-note\s*:\s*/i, '').trim();
      if (!candidate) {
        return '';
      }

      const coreKeys = Object.keys(this.characterCore || {});
      if (!coreKeys.length) {
        return '';
      }
      if (this.characterCore?.[candidate]) {
        return candidate;
      }

      const normalized = this.normalize(candidate);
      const normalizedCompact = normalized.replace(/\s+/g, '');
      const normalizedMatches = coreKeys.filter((id) => {
        const idNorm = this.normalize(id);
        return idNorm === normalized || idNorm.replace(/\s+/g, '') === normalizedCompact;
      });
      if (normalizedMatches.length === 1) {
        return normalizedMatches[0];
      }

      const slug = candidate
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      const slugParts = slug.split('-').filter(Boolean);
      for (let end = slugParts.length - 1; end >= 1; end -= 1) {
        const probe = slugParts.slice(0, end).join('-');
        if (this.characterCore?.[probe]) {
          return probe;
        }
        const probeNorm = this.normalize(probe);
        const probeMatches = coreKeys.filter((id) => {
          const idNorm = this.normalize(id);
          return idNorm === probeNorm
            || id.startsWith(`${probe}-`)
            || idNorm.startsWith(`${probeNorm} `);
        });
        if (probeMatches.length === 1) {
          return probeMatches[0];
        }
      }

      const matches = coreKeys.filter((id) => {
        const idNorm = this.normalize(id);
        return candidate === id
          || candidate.startsWith(`${id}-`)
          || id.startsWith(`${candidate}-`)
          || normalized === idNorm
          || normalized.startsWith(`${idNorm} `)
          || idNorm.startsWith(`${normalized} `);
      });
      if (matches.length === 1) {
        return matches[0];
      }

      return '';
    },
    relationshipMembersForFaction(block) {
      const row = this.relationshipGroupForFaction(block);
      if (!row) {
        return [];
      }

      const activeYear = Number(String(this.activeYear || '').trim());
      const hasYear = Number.isFinite(activeYear);
      const memberIds = new Set((Array.isArray(row?.members) ? row.members : [])
        .map((id) => this.normalize(id || ''))
        .filter(Boolean));

      const historyObj = row?.history && typeof row.history === 'object' ? row.history : {};
      Object.entries(historyObj)
        .map(([date, events]) => ({
          date: String(date || ''),
          year: this.parseTimelineDateParts(date || '')?.year,
          events: Array.isArray(events) ? events.map((value) => String(value || '')) : []
        }))
        .filter((item) => Number.isFinite(item.year))
        .filter((item) => !hasYear || item.year <= activeYear)
        .sort((a, b) => {
          if (a.year !== b.year) {
            return a.year - b.year;
          }
          return a.date.localeCompare(b.date);
        })
        .forEach((item) => {
          item.events.forEach((eventToken) => {
            const token = String(eventToken || '').trim();
            if (!token || !/^[+-]/.test(token)) {
              return;
            }
            const sign = token.charAt(0);
            const resolvedId = this.resolveRelationshipHistoryMemberToken(token.slice(1));
            if (!resolvedId) {
              return;
            }
            if (sign === '+') {
              memberIds.add(resolvedId);
            } else if (sign === '-') {
              memberIds.delete(resolvedId);
            }
          });
        });

      return Array.from(memberIds)
        .map((id) => ({
          id,
          text: this.relationshipDisplayNameById(id)
        }))
        .filter((member) => this.normalize(member?.text || ''));
    },
    factionMembers(block) {
      const derived = this.relationshipMembersForFaction(block);
      if (derived.length) {
        return derived;
      }
      return Array.isArray(block?.members) ? block.members : [];
    },
    parsedFactionMembers(block) {
      const list = this.factionMembers(block);
      if (!Array.isArray(list)) return [];
      return list.map(member => {
        const rawText = member.text || (typeof member === 'string' ? member : '');
        const tier = member.tier || 'member';
        
        // Members are written as: name · comment
        const dotIndex = rawText.indexOf('·');
        let name = rawText.trim();
        let comment = '';
        
        if (dotIndex > -1) {
          name = rawText.slice(0, dotIndex).trim();
          comment = rawText.slice(dotIndex + 1).trim();
        }
        
        const resolvedId = this.getResolvedCharacterId(name.toLowerCase().trim().replace(/[^a-z0-9]/g, ''));
        const displayName = this.characterNameById(resolvedId) || name;
        
        return {
          id: resolvedId,
          name: displayName,
          comment: comment,
          tier: tier.toLowerCase().trim()
        };
      });
    },
    getInitials(name) {
      if (!name) return '??';
      const parts = name.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
      }
      return name.slice(0, 2).toUpperCase();
    },
    factionMemberTokens(block) {
      const rawMembers = this.factionMembers(block);
      return Array.from(new Set(rawMembers
        .map((member) => this.normalize(typeof member === 'string' ? member : member?.text || ''))
        .filter(Boolean)
        .flatMap((value) => String(value).split(/\s+/))
        .filter((token) => token && token.length >= 3)));
    },
    matchFactionMedia(candidates, tokens, minScore = 8) {
      if (!tokens.length) {
        return [];
      }
      const seen = new Set();
      return candidates
        .filter((src) => {
          const path = String(src || '').replace(/\\/g, '/');
          const key = path.toLowerCase();
          if (!path || seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .map((src) => {
          const media = this.toMediaObject(src, 0);
          const name = this.normalize(String(src).split('/').pop());
          const compact = name.replace(/[^a-z0-9]+/g, '');
          const score = tokens.reduce((acc, token) => {
            const t = String(token || '').toLowerCase();
            const tc = t.replace(/[^a-z0-9]+/g, '');
            if (!t) return acc;
            if (name === t) return acc + 14;
            if (name.includes(` ${t} `) || name.startsWith(`${t} `) || name.endsWith(` ${t}`)) return acc + 10;
            if (name.includes(t)) return acc + 6;
            if (tc && compact.includes(tc)) return acc + 4;
            return acc;
          }, 0);
          return this.enrichMediaWithXray({ ...media, score });
        })
        .filter((media) => media.score >= minScore)
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return String(a.src || '').localeCompare(String(b.src || ''));
        });
    },
    factionMediaSections(block) {
      if (!this.catalog || !block) {
        return { group: [], member: [] };
      }

      const groupTokens = this.factionTokens(block);
      const memberTokens = this.factionMemberTokens(block);

      const groupMedia = this.matchFactionMedia([
        ...(this.catalog.groups || []),
        ...(this.catalog.fieldMedia || [])
      ], groupTokens, 8);

      const usedGroup = new Set(groupMedia.map((media) => String(media.src || '').toLowerCase()));

      const memberMedia = this.matchFactionMedia([
        ...(this.catalog.portraits || []),
        ...(this.catalog.outfits || []),
        ...(this.catalog.fieldMedia || [])
      ], memberTokens, 8)
        .filter((media) => !usedGroup.has(String(media.src || '').toLowerCase()));

      return { group: groupMedia, member: memberMedia };
    },
    factionGallery(block, kind = 'all') {
      const sections = this.factionMediaSections(block);
      if (kind === 'group') {
        return sections.group;
      }
      if (kind === 'member') {
        return sections.member;
      }
      const seen = new Set();
      return [...sections.group, ...sections.member].filter((media) => {
        const key = String(media?.src || '').toLowerCase();
        if (!key || seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });
    },
    slugify(text) {
      if (!text) return '';
      return String(text).toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    },
    rowMedia(row) {
      let raw = String(row?.img || row?.image || '').trim();

      // Automatic Resolution if path is missing but label exists
      if (!raw && row?.label && this.activeEntry?.id && this.activeYear) {
        const slug = this.slugify(row.label);
        raw = `portraits/${this.activeEntry.id}/${this.activeYear}-${slug}.jpg`;
      }

      if (!raw) return null;
      const normalized = raw.replace(/\\/g, '/').replace(/^\/+/, '');
      const baseMedia = this.toMediaObject(normalized, 200);

      const rowUnmasked = String(row?.unmasked || '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
      const rowExposed = String(row?.exposed || '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
      if (rowUnmasked || rowExposed) {
        return {
          ...baseMedia,
          hasXray: Boolean(rowUnmasked || rowExposed),
          xrayRevealSrc: rowUnmasked,
          xrayExposedSrc: rowExposed
        };
      }

      return this.enrichMediaWithXray(baseMedia);
    },
    toggleTimelineTagAliasDropdown(event, index) {
      const key = this.timelineEventKey(event, index);
      if (this.timelineTagDropdownKey === key) {
        this.timelineTagDropdownKey = '';
      } else {
        this.timelineTagDropdownKey = key;
      }
    },
    timelineTagAliasSuggestions(event) {
      const tags = Array.isArray(event.tags) ? event.tags : [];
      const normalizedTags = tags.map(t => this.normalize(t));
      const suggestions = new Set();
      
      const aliases = TIMELINE_TAG_ALIASES || {};
      
      // For each tag on the event, find its aliases
      tags.forEach(tag => {
        const t = this.normalize(tag);
        // Direct match in keys
        if (aliases[t]) {
          aliases[t].forEach(a => {
            if (!normalizedTags.includes(this.normalize(a))) {
              suggestions.add(a);
            }
          });
        }
        // Match in values (reverse lookup)
        for (const [key, list] of Object.entries(aliases)) {
          if (list.includes(t)) {
            if (!normalizedTags.includes(this.normalize(key))) {
              suggestions.add(key);
            }
            list.forEach(a => {
              if (!normalizedTags.includes(this.normalize(a))) {
                suggestions.add(a);
              }
            });
          }
        }
      });
      
      return Array.from(suggestions).sort();
    },
    async addTimelineTag(event, index, tag) {
      this.timelineTagDropdownKey = '';
      const currentTags = Array.isArray(event.tags) ? [...event.tags] : [];
      if (currentTags.includes(tag)) {
        return;
      }
      
      const newTags = [...currentTags, tag];
      
      try {
        const response = await fetch(this.apiUrl('/api/timeline/set-tags'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: event.id,
            date: event.date,
            title: event.title,
            tags: newTags
          })
        });
        
        const payload = await response.json();
        if (!response.ok || payload.ok === false) {
          throw new Error(payload.error || 'Failed to add tag');
        }
        
        // Optimistic update
        event.tags = newTags;
        const key = this.timelineEventKey(event, index);
        const next = { ...(this.timelinePortraitByEvent || {}) };
        delete next[key];
        this.timelinePortraitByEvent = next;
        this.queueTimelinePortraitLoad(key, event);
      } catch (e) {
        console.error('Failed to add tag:', e);
      }
    },
    async removeTimelineTag(event, index, tag) {
      const currentTags = Array.isArray(event.tags) ? [...event.tags] : [];
      const newTags = currentTags.filter(t => t !== tag);
      
      if (newTags.length === currentTags.length) {
        return;
      }

      try {
        const response = await fetch(this.apiUrl('/api/timeline/set-tags'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: event.id,
            date: event.date,
            title: event.title,
            tags: newTags
          })
        });
        
        const payload = await response.json();
        if (!response.ok || payload.ok === false) {
          throw new Error(payload.error || 'Failed to remove tag');
        }
        
        // Optimistic update
        event.tags = newTags;
        const key = this.timelineEventKey(event, index);
        const next = { ...(this.timelinePortraitByEvent || {}) };
        delete next[key];
        this.timelinePortraitByEvent = next;
        this.queueTimelinePortraitLoad(key, event);
      } catch (e) {
        console.error('Failed to remove tag:', e);
      }
    },
    onTagMouseEnter(event, tag, dateContext = null) {
      if (this.coreEditMode) return;
      const pt = String(tag || '').toLowerCase().trim();
      if (!pt) return;
      const type = this.timelineTagType(pt);
      if (type !== 'character' && type !== 'entity') return;

      const rect = event.currentTarget.getBoundingClientRect();
      this.hoverCardPos = {
        x: rect.left + (rect.width / 2),
        y: rect.top
      };

      const core = this.characterCore?.[pt];
      if (core) {
        this.hoverCardData = {
          id: pt,
          name: core['full name'] || pt,
          description: core.appearance || core.bio || '',
          icon: core.icon || core.iconKey || 'user',
          type: 'character',
          meta: core,
          portrait: '',
          date: dateContext // Store date for era-aware CSS if needed
        };
        // Fetch a portrait for the card using the specific date if available
        const fetchYear = dateContext ? dateContext.split('-')[0] : (this.activeYear || 2026);
        this.closestPortraitForCharacter(pt, fetchYear).then(src => {
          if (this.hoverCardData && this.hoverCardData.id === pt) {
            this.hoverCardData.portrait = src;
          }
        });
      } else {
        const entity = this.entitiesRegistry?.[pt];
        if (entity) {
          this.hoverCardData = {
            id: pt,
            name: entity.name || pt,
            description: entity.description || '',
            icon: entity.iconKey || 'map-pin',
            type: 'entity',
            meta: entity,
            portrait: ''
          };
        }
      }

      if (this.hoverCardData) {
        this.hoverCardOpen = true;
      }
    },
    onTagMouseLeave() {
      this.hoverCardOpen = false;
    },
    playSceneRP(event, index) {
      if (!event) return;

      // 1. Resolve characters tagged in the current event
      const targetTags = this.timelineCharacterTags(event).map(id => id.toLowerCase().trim());
      const targetTagsSet = new Set(targetTags);

      // 2. Export context centers around the event's year (without altering the active UI filter)
      const eventYearNum = this.parseTimelineDateParts(event.date)?.year;
      const targetYear = (eventYearNum && Number.isFinite(eventYearNum)) ? String(eventYearNum) : String(this.activeYear || '');

      // 3. Populate storyExportExtraInstructions to play out the scene
      const dateStr = this.formatTimelineDate(event.date);
      const title = this.plainText(event.title || 'Untitled Scene');
      
      const charMetadata = targetTags.map(tag => {
        const core = this.characterCore?.[tag] || {};
        const name = core['full name'] || tag;
        const age = this.characterAgeAtDate(tag, event.date);
        const ageLabel = (age !== null && Number.isFinite(age) && age >= 0) ? `${age}yo` : 'age unknown';
        return `${name} (${tag}, ${ageLabel})`;
      }).join(', ');

      this.storyExportExtraInstructions = `Play out/write a detailed, in-character scene play-out for the timeline event: "${title}" (${dateStr}).\nInvolved cast: ${charMetadata}\n\nRefer to the description of this event in the "Relevant Timeline History" section below for the context and synopsis of what happens. Write the scene in real-time, focusing on the character interactions, dialogue, and inner monologues.`;

      // 4. Open the Story Export Modal with forced selections and limited character list
      this.openStoryExportModal({ 
        stackOnCharsheet: true, 
        forceCharacters: targetTagsSet,
        limitToSelected: true
      });
    },
    async submitTimelineDraftEntries() {
      const rawText = String(this.timelineAddEventInput || '').trim();
      if (!rawText) {
        this.timelineAddEventError = 'Please paste some timeline entries.';
        return;
      }

      this.timelineAddEventSaving = true;
      this.timelineAddEventError = '';
      this.timelineAddEventSuccess = '';

      // Helper: parse YAML-like front matter
      const parseFrontMatter = (fmText) => {
        const lines = fmText.split(/\r?\n/);
        const data = { tags: [] };
        
        let currentKey = null;
        let currentValueLines = [];
        
        const flushCurrentKey = () => {
          if (!currentKey) return;
          const valText = currentValueLines.join('\n').trim();
          
          if (currentKey === 'tags') {
            const cleanVal = valText.trim();
            if (cleanVal.startsWith('[') && cleanVal.endsWith(']')) {
              try {
                const parsed = JSON.parse(cleanVal.replace(/'/g, '"'));
                if (Array.isArray(parsed)) {
                  data.tags = data.tags.concat(parsed.map(t => String(t).trim()));
                }
              } catch (e) {
                const inner = cleanVal.slice(1, -1);
                const items = inner.split(',').map(s => s.trim().replace(/^['"]|['"]$/g, ''));
                data.tags = data.tags.concat(items.filter(Boolean));
              }
            } else {
              const bulletLines = valText.split(/\r?\n/);
              let hasBullets = false;
              bulletLines.forEach(l => {
                const lt = l.trim();
                if (lt.startsWith('-')) {
                  hasBullets = true;
                  const val = lt.slice(1).trim().replace(/^['"]|['"]$/g, '');
                  if (val) data.tags.push(val);
                }
              });
              
              if (!hasBullets) {
                const clean = cleanVal.replace(/^['"]|['"]$/g, '').trim();
                if (clean) {
                  const items = clean.split(/[\s,]+/).map(s => s.trim().replace(/^['"]|['"]$/g, ''));
                  data.tags = data.tags.concat(items.filter(Boolean));
                }
              }
            }
          } else {
            data[currentKey] = valText.replace(/^['"]|['"]$/g, '').trim();
          }
          
          currentKey = null;
          currentValueLines = [];
        };
        
        lines.forEach((line) => {
          const keyMatch = line.match(/^([a-zA-Z0-9_\-]+)\s*:\s*(.*)$/);
          if (keyMatch) {
            flushCurrentKey();
            currentKey = keyMatch[1].toLowerCase();
            const valPart = keyMatch[2];
            if (valPart.trim()) {
              currentValueLines.push(valPart);
            }
          } else {
            if (currentKey) {
              currentValueLines.push(line);
            }
          }
        });
        
        flushCurrentKey();
        
        data.tags = Array.from(new Set(data.tags.map(t => String(t).trim())))
          .filter(t => {
            const nt = String(t).toLowerCase().trim();
            return nt && nt !== "--" && nt !== "-" && nt.length > 1 && !/^-?\d{4}s?$/.test(nt) && !/^-?\d{4}-\d{4}$/.test(nt);
          });
        return data;
      };

      // Helper: serialize YAML-like front matter
      const serializeFrontMatter = (data) => {
        const lines = ['---'];
        if (data.date) lines.push(`date: "${data.date}"`);
        if (data.title) lines.push(`title: "${data.title.replace(/"/g, '\\"')}"`);
        if (data.tags && data.tags.length) {
          lines.push('tags:');
          data.tags.forEach((tag) => {
            lines.push(`  - "${tag}"`);
          });
        }
        if (data.datecreated) {
          lines.push(`datecreated: "${data.datecreated}"`);
        }
        Object.keys(data).forEach((key) => {
          if (key !== 'date' && key !== 'title' && key !== 'tags' && key !== 'datecreated') {
            lines.push(`${key}: "${data[key]}"`);
          }
        });
        lines.push('---');
        return lines.join('\n');
      };

      try {
        const chunks = rawText.split(/<!--\s*entry-break\s*-->/i);
        const processedChunks = [];
        const currentDateCreated = this.timelineAddEventDateCreated || (() => {
          const d = new Date();
          const offset = d.getTimezoneOffset();
          const localDate = new Date(d.getTime() - (offset * 60 * 1000));
          return localDate.toISOString().split('T')[0];
        })();

        chunks.forEach((chunk) => {
          const trimmed = chunk.trim();
          if (!trimmed) return;

          let fmData = { tags: [] };
          let bodyText = trimmed;

          const fmMatch = trimmed.match(/(?:^|\r?\n)(---\r?\n[\s\S]*?\r?\n---)/);
          if (fmMatch) {
            const fmContent = fmMatch[1].slice(3, -3).trim();
            fmData = parseFrontMatter(fmContent);
            bodyText = trimmed.slice(fmMatch.index + fmMatch[0].length).trim();
          } else {
            const dateMatch = trimmed.match(/\b(\d{4}-\d{2}-\d{2})\b/);
            fmData.date = dateMatch ? dateMatch[1] : `${this.activeYear || new Date().getFullYear()}-01-01`;
            
            const linesArr = trimmed.split(/\r?\n/);
            const firstLine = linesArr[0] || '';
            if (firstLine.length > 0 && firstLine.length < 100 && !firstLine.includes(':')) {
              fmData.title = firstLine.replace(/^#+\s*/, '').trim();
              bodyText = linesArr.slice(1).join('\n').trim();
            } else {
              fmData.title = 'Draft Event';
            }
          }

          if (!fmData.tags.map(t => String(t).toLowerCase().trim()).includes('draft')) {
            fmData.tags.push('draft');
          }

          if (!fmData.datecreated) {
            fmData.datecreated = currentDateCreated;
          }

          const newFm = serializeFrontMatter(fmData);
          processedChunks.push(`${newFm}\n\n${bodyText}`);
        });

        if (!processedChunks.length) {
          throw new Error('No valid timeline entries could be parsed from input.');
        }

        const payloadText = processedChunks.join('\n\n<!-- entry-break -->\n\n');

        // Post to backend
        const appendRes = await fetch(this.apiUrl('/api/timeline/append-newtimeline'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entry: payloadText })
        });
        const appendData = await appendRes.json().catch(() => null);
        if (!appendRes.ok || appendData?.ok === false) {
          throw new Error(appendData?.error || 'Failed to append to newtimeline.md');
        }

        this.timelineAddEventSuccess = 'Draft entries appended successfully. Running pipeline...';

        // Trigger run-pipeline
        const pipelineRes = await fetch(this.apiUrl('/api/timeline/run-pipeline'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        const pipelineData = await pipelineRes.json().catch(() => null);
        if (pipelineRes.ok && pipelineData?.ok) {
          this.timelineAddEventSuccess = 'Success! Entries added & timeline pipeline executed.';
          this.timelineAddEventInput = '';
          await this.loadTimeline();
          if (this.activeYear) {
            await this.loadCatalog(this.activeYear);
          }
        } else {
          this.timelineAddEventError = `Entries appended, but sorting pipeline failed: ${pipelineData?.error || 'Pipeline timed out'}`;
        }
      } catch (err) {
        console.error('Error adding timeline draft events:', err);
        this.timelineAddEventError = err.message || 'An unexpected error occurred.';
      } finally {
        this.timelineAddEventSaving = false;
      }
    },
    async submitTimelineDraftFromClipboard() {
      this.timelineAddEventError = '';
      this.timelineAddEventSuccess = '';
      try {
        const rawText = await navigator.clipboard.readText();
        const text = String(rawText || '').trim();
        if (!text) {
          throw new DOMException('Clipboard is empty', 'NotFoundError');
        }
        this.timelineAddEventInput = text;
        await this.submitTimelineDraftEntries();
        // If there was an error in submission, expand the panel so they can inspect it
        if (this.timelineAddEventError) {
          this.timelineAddEventOpen = true;
        }
      } catch (err) {
        console.warn('Failed to read from clipboard using readText API, triggering focus-paste fallback:', err);
        // Robust Fallback: Expand panel, focus textarea, and guide the user to paste directly (Ctrl+V)
        this.timelineAddEventError = 'Clipboard blocked. Please paste (Ctrl+V) directly into the textarea below!';
        this.timelineAddEventOpen = true;
        this.$nextTick(() => {
          if (this.$refs.timelineDraftTextarea) {
            this.$refs.timelineDraftTextarea.focus();
            this.$refs.timelineDraftTextarea.select();
          }
        });
      }
    },
    onDraftInputPaste(event) {
      const pastedText = event.clipboardData?.getData('text');
      if (pastedText && pastedText.trim()) {
        this.timelineAddEventInput = pastedText.trim();
        // Prevent default paste behavior so it doesn't double-paste in the textarea
        event.preventDefault();
        // Immediately submit!
        this.submitTimelineDraftEntries();
      }
    },
  });
})(window);
