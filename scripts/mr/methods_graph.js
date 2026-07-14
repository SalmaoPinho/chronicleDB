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
    async init() {
      this._hydratingState = true;
      await this.loadTimelinesList();
      this.loadMediaYears();
      this.loadNotebooks();
      this.loadCharacterStats();
      this.loadNotebookTimelineLinks();
      this.loadRelationshipTree();
      this.loadRelationships();
      const [coreResponse, timelineResponse, entitiesResponse, metadataResponse, themesResponse] = await Promise.all([
        this.fetchCoreResponse().catch(() => null),
        fetch(`${this.backendOrigin()}/api/timeline?t=${Date.now()}`, { cache: 'no-store' }).catch(() => null),
        fetch(`${this.backendOrigin()}/api/entities?t=${Date.now()}`, { cache: 'no-store' }).catch(() => null),
        fetch(`${this.backendOrigin()}/story/metadata.json?t=${Date.now()}`, { cache: 'no-store' }).catch(() => null),
        fetch(`${this.backendOrigin()}/story/year_themes.json?t=${Date.now()}`, { cache: 'no-store' }).catch(() => null)
      ]);

      this.versions = {};
      this.yearThemes = {};

      if (metadataResponse?.ok) {
        try {
          this.storyMetadata = await metadataResponse.json();
          if (this.storyMetadata) {
            if (this.storyMetadata.title) {
              document.title = this.storyMetadata.title;
            }
            if (this.storyMetadata.favicon) {
              const link = document.querySelector("link[rel~='icon']");
              if (link) {
                link.href = this.storyMetadata.favicon;
              }
            }
          }
        } catch (e) {
          console.warn('MR Vue: failed to parse metadata.json', e);
        }
      }

      if (themesResponse?.ok) {
        try {
          const themes = await themesResponse.json();
          this.yearThemes = this.expandMinimalThemes(themes);
        } catch (e) {
          console.warn('MR Vue: failed to parse year_themes.json', e);
          this.yearThemes = {};
        }
      } else {
        this.yearThemes = {};
      }

      if (coreResponse?.ok) {
        try {
          const text = await coreResponse.text();
          const payload = text ? JSON.parse(text) : null;
          this.characterCore = payload?.characters || {};
          this.versions = payload?.versions || {};
          this.repartitionRelationships();
        } catch (e) {
          console.warn('MR Vue: failed to parse core.json', e);
          this.characterCore = {};
        }
      } else {
        this.characterCore = {};
      }

      this.primeThemeDefaults();
      this.applyYearTheme(this.activeYear);

      // Refresh portraits once core (and redirects) are known
      if (typeof this.clearPortraitCaches === 'function') {
        this.clearPortraitCaches();
      }
      if (typeof this.updateTimelinePortraits === 'function') {
        this.updateTimelinePortraits();
      }

      if (entitiesResponse?.ok) {
        try {
          const payload = await entitiesResponse.json().catch(() => ({}));
          // Flatten nested categories (countries, places, etc.) into a single lookup map
          const flat = {};
          if (payload && typeof payload === 'object') {
            Object.entries(payload).forEach(([category, entities]) => {
              if (entities && typeof entities === 'object') {
                Object.entries(entities).forEach(([id, data]) => {
                  flat[id.toLowerCase()] = {
                    ...data,
                    _category: category
                  };
                });
              }
            });
          }
          this.entitiesRegistry = flat;
        } catch (e) {
          console.warn('MR Vue: failed to parse entities registry', e);
          this.entitiesRegistry = {};
        }
      } else {
        this.entitiesRegistry = {};
      }

      if (timelineResponse?.ok) {
        const payload = await timelineResponse.json().catch(() => []);
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
        this.timelineError = '';
        this.timelinePortraitByEvent = {};
      } else {
        this.timelineEvents = [];
        this.timelineError = '';
      }

      const uiState = this.loadUiState();
      this._scrollByEntry = (uiState && typeof uiState.scrollByEntry === 'object' && uiState.scrollByEntry)
        ? uiState.scrollByEntry
        : {};
      this.timelineSearch = String(uiState?.timelineSearch || '');
      this.timelineSearchLocal = String(uiState?.timelineSearch || '');
      this.$nextTick(() => {
        if (this.$refs.timelineSearchInput) {
          this.$refs.timelineSearchInput.value = this.timelineSearchLocal;
        }
      });
      this.timelineActiveTags = Array.isArray(uiState?.timelineActiveTags)
        ? uiState.timelineActiveTags.map((tag) => this.plainText(tag)).filter(Boolean)
        : [];
      this.notebookSearch = String(uiState?.notebookSearch || '');
      this.notebookRulesEnabled = uiState?.notebookRulesEnabled !== false;
      const savedYear = String(uiState?.year || '');
      const preferred = (savedYear && this.yearOptions && this.yearOptions.includes(savedYear))
        ? savedYear
        : (this.versions['2026'] ? '2026' : (this.yearOptions && this.yearOptions[0]) || '2026');
      if (preferred) {
        const savedEntry = savedYear === preferred ? String(uiState?.entryId || '') : '';
        await this.setYearAsync(preferred, savedEntry);
      }

      // Respect saved collapse state if it exists, otherwise auto-collapse if no active filters
      const hasFilters = this.timelineSearch || this.timelineActiveTags.length || this.timelineYearFrom || this.timelineYearTo;
      if (uiState && Object.prototype.hasOwnProperty.call(uiState, 'timelineFiltersCollapsed')) {
        this.timelineFiltersCollapsed = uiState.timelineFiltersCollapsed === true;
      } else if (!hasFilters) {
        this.timelineFiltersCollapsed = true;
      }

      if (!this.timelineEvents.length) {
        await this.loadTimeline();
      }
      this.$nextTick(() => this.observeVisibleTimelineEvents());

      if (window.matchMedia && window.matchMedia('(max-width: 900px)').matches) {
        this.mobileSidebarCollapsed = true;
      } else {
        this.mobileSidebarCollapsed = false;
      }

      this.restorePaneScroll();
      this.$nextTick(() => this.scrollToActiveYear(false));
      this.appLoading = false;
      setTimeout(() => {
        this._hydratingState = false;
        this.saveUiState(true);
      }, 900);
    },
    selectEntry(rawEntryId) {
      this.hoverCardOpen = false;
      this.search = '';
      this.saveUiState();
      const entryId = this.getResolvedCharacterId(rawEntryId);
      const entry = this.entries.find((item) => item.id === entryId);
      if (entry?.redirectUrl) {
        window.location.href = entry.redirectUrl;
        return;
      }
      this.activeEntryId = entryId;
      this.saveUiState();
      this._xrayMountQueue = [];
      if (window.matchMedia && window.matchMedia('(max-width: 900px)').matches) {
        this.mobileSidebarCollapsed = true;
      }
    },
    buildCharacterTimelineText(characterId) {
      const charId = String(characterId || '').toLowerCase().trim();
      const allEvents = Array.isArray(this.timelineEvents) ? this.timelineEvents : [];

      // Filter first
      const relevant = allEvents.filter(evt => {
        const tags = Array.isArray(evt.tags) ? evt.tags : [];
        const members = Array.isArray(evt.members) ? (evt.members || []) : [];
        return tags.some(t => this.getResolvedCharacterId(t) === charId) ||
          members.some(m => this.getResolvedCharacterId(m) === charId);
      });

      if (!relevant.length) return '';

      // Sort by date key
      relevant.sort((a, b) => {
        const keyA = String(a.date || '');
        const keyB = String(b.date || '');
        return keyA.localeCompare(keyB);
      });

      const lines = [];
      let lastDate = null;

      relevant.forEach(evt => {
        const dateRaw = String(evt.date || '');
        const dateLabel = this.formatTimelineDate(dateRaw);
        if (dateLabel !== lastDate) {
          lines.push(`\n- ${dateLabel}:`);
          lastDate = dateLabel;
        }
        const title = evt.title || evt.label || 'Event';
        const desc = this.plainText(evt.description || '');
        lines.push(`  - **${title}**: ${desc}`);
      });

      return lines.join('\n');
    },
    initYearTimelineObserver() {
      if (this._yearTimelineObserver) {
        this._yearTimelineObserver.disconnect();
      }
      const container = this.$refs.yearTimeline;
      if (!container) return;

      const options = {
        root: container,
        rootMargin: '0px -45% 0px -45%',
        threshold: 0
      };

      this._yearTimelineObserver = new IntersectionObserver((entries) => {
        if (this._yearTimelineIgnoreScroll) return;

        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const year = entry.target.getAttribute('data-year');
            if (year && year !== this.activeYear) {
              // Debounce selection to avoid jitter while scrubbing
              if (this._yearTimelineScrollTimer) clearTimeout(this._yearTimelineScrollTimer);
              this._yearTimelineScrollTimer = setTimeout(() => {
                if (!this._yearTimelineIgnoreScroll) {
                  this.setYear(year);
                }
              }, 150);
            }
          }
        });
      }, options);

      this.$nextTick(() => {
        const items = container.querySelectorAll('.mr-year-timeline-item');
        items.forEach((item) => this._yearTimelineObserver.observe(item));
      });
    },
    scrollToActiveYear(smooth = true) {
      const year = this.activeYear;
      if (!year) return;
      const el = (this.$refs['year-' + year] && this.$refs['year-' + year][0]) || null;
      const container = this.$refs.yearTimeline;
      if (el && container) {
        this._yearTimelineIgnoreScroll = true;
        el.scrollIntoView({
          behavior: smooth ? 'smooth' : 'auto',
          block: 'nearest',
          inline: 'center'
        });
        if (this._yearTimelineScrollTimer) clearTimeout(this._yearTimelineScrollTimer);
        setTimeout(() => {
          this._yearTimelineIgnoreScroll = false;
        }, 600);
      }
    },
    openChatModal() {
      this.closeAllModals();
      window.open('/chat.html', '_blank');
    },
    scoreByEntryId(path, entryId) {
      const normalizeKey = typeof MediaUtils.normalizeKey === 'function'
        ? MediaUtils.normalizeKey
        : (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const baseName = typeof MediaUtils.baseName === 'function'
        ? MediaUtils.baseName
        : (value) => String(value || '').split('/').pop().split('?')[0].replace(/\.[^.]+$/, '');

      const token = normalizeKey(entryId || '');
      if (!token) return 0;

      const name = baseName(String(path || ''));
      // Exclude files that start with a year (e.g. 2025-appearance) as requested
      if (/^\d{4}/.test(name)) return 0;

      const key = normalizeKey(name);
      if (!key) return 0;
      // Only consider exact or starts-with matches to avoid cross-character matches
      if (key === token) return 120;
      if (key.startsWith(token)) return 95;
      return 0;
    },

    // Relationship Tree Zoom/Pan System
    graphZoomStyle(index) {
      const state = this.relationshipTreeZoomStates[index] || { x: 0, y: 0, scale: 1 };
      return {
        transform: `translate(${state.x}px, ${state.y}px) scale(${state.scale})`
      };
    },
    startZoomDrag(event, index) {
      if (event.button !== 0) return; // Only left click
      event.preventDefault();
      
      const startX = event.clientX;
      const startY = event.clientY;
      const initial = this.relationshipTreeZoomStates[index] || { x: 0, y: 0, scale: 1 };
      const initialX = initial.x;
      const initialY = initial.y;

      const onMouseMove = (e) => {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        this.updateZoomState(index, {
          x: initialX + dx,
          y: initialY + dy,
          isDragging: true
        });
      };

      const onMouseUp = () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        this.updateZoomState(index, { isDragging: false });
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    handleZoomWheel(event, index) {
      event.preventDefault();
      const delta = -event.deltaY;
      const zoomFactor = 1.1;
      const state = this.relationshipTreeZoomStates[index] || { x: 0, y: 0, scale: 1 };
      
      const newScale = delta > 0 ? state.scale * zoomFactor : state.scale / zoomFactor;
      const clampedScale = Math.min(Math.max(newScale, 0.1), 5);

      // Zoom towards mouse position
      const rect = event.currentTarget.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;

      const scaleChange = clampedScale / state.scale;
      const newX = mouseX - (mouseX - state.x) * scaleChange;
      const newY = mouseY - (mouseY - state.y) * scaleChange;

      this.updateZoomState(index, {
        x: newX,
        y: newY,
        scale: clampedScale
      });
    },
    updateZoomState(index, updates) {
      const current = this.relationshipTreeZoomStates[index] || { x: 0, y: 0, scale: 1, isDragging: false };
      this.relationshipTreeZoomStates[index] = { ...current, ...updates };
    },
    resetZoom(index) {
      this.relationshipTreeZoomStates[index] = { x: 0, y: 0, scale: 1, isDragging: false };
    },

    // Cytoscape.js Family Graph System
    initRelationshipTreeCytoscape() {
      if (typeof cytoscape === 'undefined') {
        console.warn('MR: Cytoscape.js not loaded');
        return;
      }

      // Robust registration
      try {
        if (typeof cytoscapeDagre !== 'undefined' && cytoscape.use) {
          cytoscape.use(cytoscapeDagre);
        } else if (typeof window.dagre !== 'undefined' && cytoscape.use) {
          // If loaded via a different CDN pattern
          const dagreExt = window['cytoscape-dagre'] || window['cytoscapeDagre'];
          if (dagreExt) cytoscape.use(dagreExt);
        }
      } catch (e) {
        // ignore already-registered errors
      }

      // Cleanup previous instances
      if (this._cyInstances) {
        Object.values(this._cyInstances).forEach(cy => cy.destroy());
        this._cyInstances = {};
      }

      const runInit = (attempt = 1) => {
        const groups = Array.isArray(this.relationshipTreeGroups) ? this.relationshipTreeGroups : [];
        if (!groups.length) return;

        let allFound = true;
        groups.forEach((group, index) => {
          const containerId = `cy-${index}`;
          const container = document.getElementById(containerId);
          if (!container) {
            allFound = false;
            return;
          }
          if (this._cyInstances && this._cyInstances[index]) return; // Already init

          // Build elements
          const elements = [];
          const families = Array.isArray(group.generationUnits) 
            ? group.generationUnits.flatMap(gen => gen.units || [])
            : [];

          const characterIds = new Set();
          families.forEach(f => {
            (f.parents || []).forEach(id => characterIds.add(id));
            (f.children || []).forEach(id => characterIds.add(id));
          });

          // 1. Character Nodes
          characterIds.forEach(charId => {
            const portrait = this.relationshipTreePortraitForId(charId);
            const nodeData = { 
              id: `char:${charId}`, 
              label: this.relationshipDisplayNameById(charId) || charId,
              type: 'character',
              portrait: this.relationshipTreePortraitForId(charId) || ''
            };
            elements.push({ data: nodeData });
          });

          // 2. Direct Edges
          families.forEach((f) => {
            const parents = f.parents || [];
            const children = f.children || [];

            const type = String(f.type || 'family').toLowerCase().trim();
            
            // Canonical Category Coloring
            const colorMap = {
              // Personal (Warm/Primary)
              'relationship': '#3498db',       // Blue
              'romance': '#e74c3c',      // Red
              'friendship': '#2ecc71',   // Green
              'complicated': '#f39c12',  // Orange
              'devotion': '#9b59b6',     // Purple
              
              // Operational (Professional/Cool)
              'operation': '#1abc9c',    // Teal
              'organization': '#34495e', // Navy
              'partnership': '#16a085',  // Dark Teal
              
              // Historical (Muted/Contextual)
              'incident': '#7f8c8d',     // Grey
              'arc': '#95a5a6',          // Light Grey
              'historical': '#d35400',   // Dark Orange
              'note': '#bdc3c7'          // Silver
            };

            const edgeColor = colorMap[type] || '#d1d8e0';
            
            // Dashed lines for softer or less formal bonds
            const isDashed = ['romance', 'complicated', 'partnership', 'incident', 'note'].includes(type);
            const lineStyle = isDashed ? 'dashed' : 'solid';

            // Partners: Connect all parents together (usually 2)
            for (let i = 0; i < parents.length; i++) {
              for (let j = i + 1; j < parents.length; j++) {
                elements.push({ 
                  data: { 
                    id: `edge:partner:${parents[i]}:${parents[j]}`,
                    source: `char:${parents[i]}`, 
                    target: `char:${parents[j]}`, 
                    type: 'partnership',
                    relType: type,
                    color: edgeColor,
                    lineStyle: 'dashed'
                  }
                });
              }
            }

            // Parent -> Child connections (vertical)
            parents.forEach(pId => {
              children.forEach(cId => {
                elements.push({ 
                  data: { 
                    id: `edge:descent:${pId}:${cId}`,
                    source: `char:${pId}`, 
                    target: `char:${cId}`, 
                    type: 'descent',
                    relType: type,
                    color: edgeColor,
                    lineStyle: lineStyle
                  }
                });
              });
            });
          });

          // Force container height for a "Big Tree"
          container.style.height = '600px';

          // Initialize Cytoscape
          const computed = window.getComputedStyle(document.documentElement);
          const accentColor = computed.getPropertyValue('--accent').trim() || '#7a6643';
          const inkColor = computed.getPropertyValue('--ink2').trim() || '#333';
          const pageBg = computed.getPropertyValue('--page').trim() || '#fffdf8';

          if (!container || !document.body.contains(container)) return;
          const cy = cytoscape({
            container: container,
            elements: elements,
            style: [
              {
                selector: 'node',
                style: {
                  'background-color': accentColor || '#7a6643',
                  'background-image': (node) => {
                    const p = node.data('portrait');
                    return (p && typeof p === 'string') ? p : 'none';
                  },
                  'background-fit': 'cover',
                  'shape': 'round-rectangle',
                  'label': 'data(label)',
                  'width': 60,
                  'height': 85,
                  'border-width': 2,
                  'border-color': accentColor,
                  'color': inkColor,
                  'font-size': '12px',
                  'font-family': 'sans-serif',
                  'text-valign': 'bottom',
                  'text-margin-y': 6,
                  'text-wrap': 'wrap',
                  'text-max-width': 100,
                  'text-outline-width': 2,
                  'text-outline-color': pageBg
                }
              },
              {
                selector: 'node:selected',
                style: {
                  'background-color': accentColor,
                  'border-width': 3,
                  'border-color': inkColor
                }
              },
              {
                selector: 'edge',
                style: {
                  'width': 3,
                  'line-color': 'data(color)',
                  'line-style': 'data(lineStyle)',
                  'curve-style': 'taxi',
                  'taxi-direction': 'vertical',
                  'taxi-turn-min-distance': 20,
                  'target-arrow-shape': 'triangle',
                  'target-arrow-color': 'data(color)',
                  'opacity': 0.8
                }
              },
              {
                selector: 'edge[type="partnership"]',
                style: {
                  'target-arrow-shape': 'none'
                }
              }
            ],
            layout: {
              name: 'dagre',
              rankDir: 'TB',
              nodeSep: 80,
              rankSep: 120
            },
            userZoomingEnabled: true,
            userPanningEnabled: true
          });
          
          cy.on('tap', 'node[type="character"]', (evt) => {
            const charId = evt.target.id().replace('char:', '');
            this.selectedTreeCharacter = charId;
          });

          cy.on('tap', (evt) => {
            if (evt.target === cy) {
              this.selectedTreeCharacter = null;
            }
          });

          // Focus on active character if present
          try {
            if (this.activeEntryId) {
              const activeNode = cy.getElementById(`char:${this.activeEntryId}`);
              if (activeNode && activeNode.length) {
                activeNode.select();
              }
            }
          } catch (e) {}

          // Run layout with fallback
          const tryLayout = (name) => {
            try {
              const l = cy.layout({
                name: name,
                rankDir: 'TB',
                nodeSep: 60,
                rankSep: 100,
                directed: true,
                padding: 50
              });
              l.run();
            } catch (e) {
              console.warn(`MR: Layout ${name} failed`, e);
              if (name === 'dagre') tryLayout('breadthfirst');
            }
          };

          tryLayout('dagre');

          // Double check positions
          setTimeout(() => {
            const firstNode = cy.nodes()[0];
            if (firstNode && firstNode.position().x === 0 && firstNode.position().y === 0) {
              console.warn('MR: Dagre failed to position nodes, falling back');
              tryLayout('breadthfirst');
            }
          }, 100);

          // No longer auto-selecting entry on click to avoid page redirection
          // cy.on('tap', 'node', (evt) => {
          //   const charId = evt.target.data('id').replace('char:', '');
          //   this.selectEntry(charId);
          // });

          // Store instance for cleanup/reset
          this._cyInstances = this._cyInstances || {};
          this._cyInstances[index] = cy;
        });

        if (!allFound && attempt < 5) {
          setTimeout(() => runInit(attempt + 1), 200);
        }
      };

      this.$nextTick(() => {
        try {
          runInit();
        } catch (e) {
          console.error('MR: initRelationshipTreeCytoscape runInit failed', e);
        }
      });
    },
    resetRelationshipTree(index) {
      try {
        if (this._cyInstances && this._cyInstances[index]) {
          this._cyInstances[index].fit();
          this._cyInstances[index].center();
        }
      } catch (e) {}
    },
    characterRelationshipCount(characterId) {
      const id = this.getResolvedCharacterId(characterId);
      if (!id) return 0;
      const rels = Array.isArray(this.relationships) ? this.relationships : [];
      return rels.filter(rel => {
        const members = Array.isArray(rel.members) ? rel.members : (Array.isArray(rel.parents) ? rel.parents : []);
        const children = Array.isArray(rel.children) ? rel.children : [];
        const all = [...members, ...children].map(m => this.getResolvedCharacterId(m));
        return all.includes(id);
      }).length;
    },
    focusRelationshipNode(groupIndex, charId) {
      const cy = this._cyInstances?.[groupIndex];
      if (!cy) return;
      const node = cy.getElementById(`char:${charId}`);
      if (node && node.length) {
        cy.animate({
          center: { eles: node },
          zoom: 1.1,
          duration: 600,
          easing: 'cubic-bezier(0.4, 0, 0.2, 1)'
        });
        cy.elements().unselect();
        node.select();
      }
    },
    openAddRelationshipModal(optionalCharId = '') {
      this.relationshipModalIsEdit = false;
      this.relationshipModalFormData = {
        id: '',
        newId: '',
        label: '',
        type: 'romance',
        startDate: '',
        splitDate: '',
        membersRaw: optionalCharId || '',
        childrenRaw: '',
        notes: '',
        historyText: ''
      };
      this.relationshipModalError = '';
      this.relationshipModalSaving = false;
      this.relationshipModalOpen = true;
    },
    openEditRelationshipModal(rel) {
      this.relationshipModalIsEdit = true;
      
      let historyText = '';
      if (rel.history && typeof rel.history === 'object') {
        const lines = [];
        for (const [date, evs] of Object.entries(rel.history)) {
          if (Array.isArray(evs)) {
            evs.forEach(ev => lines.push(`${date}: ${ev}`));
          } else {
            lines.push(`${date}: ${evs}`);
          }
        }
        historyText = lines.join('\n');
      }

      this.relationshipModalFormData = {
        id: rel.id || '',
        newId: rel.id || '',
        label: rel.label || '',
        type: rel.type || 'relationship',
        startDate: rel.startDate || '',
        splitDate: rel.splitDate || '',
        membersRaw: Array.isArray(rel.members) ? rel.members.join(', ') : '',
        childrenRaw: Array.isArray(rel.children) ? rel.children.join(', ') : '',
        notes: rel.notes || '',
        historyText: historyText
      };
      this.relationshipModalError = '';
      this.relationshipModalSaving = false;
      this.relationshipModalOpen = true;
    },
    closeRelationshipModal() {
      this.relationshipModalOpen = false;
    },
    async saveRelationship() {
      this.relationshipModalSaving = true;
      this.relationshipModalError = '';
      
      try {
        const fData = this.relationshipModalFormData;
        if (!fData.label.trim()) throw new Error('Missing relationship label.');
        if (!fData.startDate.trim()) throw new Error('Missing start date.');

        const members = fData.membersRaw.split(',').map(m => m.trim()).filter(Boolean);
        const children = fData.childrenRaw.split(',').map(c => c.trim()).filter(Boolean);

        // Parse historyText back into history object
        const history = {};
        if (fData.historyText.trim()) {
          const lines = fData.historyText.split('\n');
          lines.forEach(line => {
            const colonIdx = line.indexOf(':');
            if (colonIdx !== -1) {
              const date = line.substring(0, colonIdx).trim();
              const text = line.substring(colonIdx + 1).trim();
              if (date && text) {
                if (!history[date]) history[date] = [];
                history[date].push(text);
              }
            }
          });
        }

        const payload = {
          id: fData.id,
          newId: fData.newId,
          label: fData.label,
          type: fData.type,
          startDate: fData.startDate,
          splitDate: fData.splitDate,
          members,
          children,
          notes: fData.notes,
          history
        };

        const endpoint = this.relationshipModalIsEdit 
          ? `${this.backendOrigin()}/api/relationships/update`
          : `${this.backendOrigin()}/api/relationships/add`;

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (!data.ok) {
          throw new Error(data.error || 'Failed to save relationship.');
        }

        // Reload data
        await this.loadRelationships();
        
        // Re-focus node if selected Tree Character
        if (this.selectedTreeCharacter) {
          const char = this.selectedTreeCharacter;
          this.selectedTreeCharacter = null;
          this.$nextTick(() => {
            this.selectedTreeCharacter = char;
          });
        }
        
        this.closeRelationshipModal();
      } catch (err) {
        this.relationshipModalError = err.message || 'Error saving relationship.';
      } finally {
        this.relationshipModalSaving = false;
      }
    },
    async deleteRelationshipConfirm(relId) {
      if (!confirm('Are you sure you want to delete this relationship completely? This cannot be undone.')) {
        return;
      }
      try {
        const response = await fetch(`${this.backendOrigin()}/api/relationships/delete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: relId })
        });
        const data = await response.json();
        if (!data.ok) {
          throw new Error(data.error || 'Failed to delete relationship.');
        }

        // Reload data
        await this.loadRelationships();

        // Refresh selectedTreeCharacter relations
        if (this.selectedTreeCharacter) {
          const char = this.selectedTreeCharacter;
          this.selectedTreeCharacter = null;
          this.$nextTick(() => {
            this.selectedTreeCharacter = char;
          });
        }
      } catch (err) {
        alert('Error: ' + err.message);
      }
    }
  });
}(window));
