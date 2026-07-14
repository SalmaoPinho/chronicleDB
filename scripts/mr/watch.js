(function initMrWatch(global) {
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

  global.MR_WATCH = {
    filteredEntries(next) {
      const existing = { ...(this.collapsedGroups || {}) };
      this.groupedEntries.forEach((group) => {
        if (!Object.prototype.hasOwnProperty.call(existing, group.name)) {
          existing[group.name] = false;
        }
      });
      this.collapsedGroups = existing;
    },
    activeEntryId() {
      this.$nextTick(() => this.initializeXrayMounts());
      this.saveUiState();
      // Restore only the main pane scroll for the selected entry to avoid
      // jumping the sidebar scroll position when switching entries rapidly.
      try {
        const uiState = this.loadUiState();
        const byEntry = (uiState && typeof uiState.scrollByEntry === 'object' && uiState.scrollByEntry)
          ? { ...(this._scrollByEntry || {}), ...uiState.scrollByEntry }
          : { ...(this._scrollByEntry || {}) };
        const activeKey = this.scrollStateKey(this.activeYear, this.activeEntryId);
        const activeState = activeKey ? byEntry[activeKey] : null;
        const mainTop = Number(activeState?.mainScrollTop ?? uiState?.mainScrollTop ?? 0);
        if (Number.isFinite(mainTop) && this.$refs?.mainPane) {
          const applyMain = () => { this.$refs.mainPane.scrollTop = Math.max(0, Math.round(mainTop)); };
          [0, 120].forEach((ms) => setTimeout(() => { this.$nextTick(() => applyMain()); }, ms));
        }
      } catch (e) {
        // ignore
      }
      if (this._pageReader) {
        if (this._pageReader.isReading) {
          this._pageReader.stop();
        }
        this._pageReader.setContext(this.pageReaderContextKey());
      }
      this.pageReaderProgress = '0 / 0';
      this.pageReaderCurrentIndex = 0;
      this.pageReaderTotalSegments = 0;
      this.$nextTick(() => this.initPageReader());
      // Kick off nearest-year portrait resolution for the active character entry
      try {
        const id = String(this.activeEntryId || '').toLowerCase().trim();
        const year = String(this.activeYear || '').trim();
        if (id && /^\d{4}$/.test(year) && !SPECIAL_ENTRY_ICONS[id]) {
          this.queueRelationshipTreePortraitLoad(id, year);
        }
      } catch (e) {
        // ignore
      }
      this.$nextTick(() => {
        this.initRelationshipTreeCytoscape();
      });
    },
    activeYear() {
      this.saveUiState();
      this.initializeStoryExportRelationshipSelection(false);
      this.$nextTick(() => this.scrollToActiveYear());
    },
    timelineSearch() {
      this.timelineLimit = 50;
      this.clearTimelineSelection();
      this.saveUiState();
    },
    timelineSearchLocal(newVal) {
      if (this.$refs.timelineSearchInput && this.$refs.timelineSearchInput.value !== newVal) {
        this.$refs.timelineSearchInput.value = newVal;
      }
    },
    timelineActiveTags: {
      deep: true,
      handler() {
        this.timelineLimit = 50;
        this.clearTimelineSelection();
        this.saveUiState();
      }
    },
    timelineActiveWordTags: {
      deep: true,
      handler() {
        this.timelineLimit = 50;
        this.clearTimelineSelection();
        this.saveUiState();
      }
    },
    coreEditMode() {
      this.saveUiState();
    },
    pageReaderUiVisible() {
      this.saveUiState();
    },
    showLifecycleMilestones() {
      this.saveUiState();
    },
    timelineCharactersOnly() {
      this.saveUiState();
    },
    timelineAddEventOpen() {
      this.saveUiState();
    },
    xrayEnabled() {
      this.$nextTick(() => this.initializeXrayMounts());
    },
    filteredTimelineEvents() {
      if (this._timelineObserver) {
        this._timelineObserver.disconnect();
      }
      // Reset overflow measurements for the new set of events
      this.timelineOverflows = {};
      this.$nextTick(() => {
        this.observeVisibleTimelineEvents();
        // Schedule overflow measurement after portraits have rendered
        clearTimeout(this._overflowMeasureTimer);
        this._overflowMeasureTimer = setTimeout(() => {
          this.measureTimelineOverflows();
        }, 200);
      });
    },
    notebookSearch() {
      if (!String(this.notebookSearch || '').trim()) {
        this.notebookSearchActiveEntryKey = '';
      }
      this.saveUiState();
    },
    notebookRulesEnabled() {
      this.saveUiState();
    },
    activeNotebookId() {
      this.saveUiState();
      if (this.pageReaderUiVisible) {
        this.pageReaderProgress = '0 / 0';
        this.pageReaderCurrentIndex = 0;
        this.pageReaderTotalSegments = 0;
        this.$nextTick(() => this.initPageReader());
      }
    },
    notebooks() {
      if (this.pageReaderUiVisible) {
        this.$nextTick(() => this.initPageReader());
      }
    },
    heartbeatMode() {
      this.saveUiState();
    },
    heartbeatZoom() {
      this.saveUiState();
    },
    timelineFiltersCollapsed() {
      this.saveUiState();
    },
    timelineYearFrom() {
      if (!this._hydratingState) {
        this.timelineMonthFrom = '';
        this.timelineMonthTo = '';
      }
      this.saveUiState();
    },
    timelineExcludeYearRange() {
      this.saveUiState();
    },
    timelineYearRanges: {
      handler() {
        this.saveUiState();
      },
      deep: true
    },
    timelineYearTo() {
      if (!this._hydratingState) {
        this.timelineMonthFrom = '';
        this.timelineMonthTo = '';
      }
      this.saveUiState();
    },
    timelineMonthFrom() {
      this.saveUiState();
    },
    timelineMonthTo() {
      this.saveUiState();
    },
    timelineDateCreatedFilterMode() {
      this.timelineLimit = 50;
      this.saveUiState();
    },
    timelineDateCreatedCustom() {
      this.timelineLimit = 50;
      this.saveUiState();
    },
    timelineMonthsOpen() {
      this.saveUiState();
    },
    timelinePortraitsVisible() {
      this.timelineOverflows = {};
      this.saveUiState();
      this.$nextTick(() => {
        clearTimeout(this._overflowMeasureTimer);
        this._overflowMeasureTimer = setTimeout(() => {
          this.measureTimelineOverflows();
        }, 200);
      });
    },
    timelinePortraitByEvent: {
      deep: true,
      handler() {
        this.$nextTick(() => {
          clearTimeout(this._overflowMeasureTimer);
          this._overflowMeasureTimer = setTimeout(() => {
            this.measureTimelineOverflows();
          }, 150);
        });
      }
    },
    timelineReverseOrder() {
      this.saveUiState();
    },
    timelineSequentialMode() {
      this.saveUiState();
    },
    timelineTagMode() {
      this.saveUiState();
    },
    relationshipTreeGroups: {
      immediate: true,
      handler() {
        this.initRelationshipTreeCytoscape();
      }
    },
    relationshipPortraitByYearChar: {
      deep: true,
      handler() {
        // Debounce refresh to avoid multiple rapid re-inits
        clearTimeout(this._relationshipTreeRefreshTimer);
        this._relationshipTreeRefreshTimer = setTimeout(() => {
          this.initRelationshipTreeCytoscape();
        }, 300);
      }
    },
    imgPromptOrientation() { this.generateImagePrompt(); },
    imgPromptNaming() { this.generateImagePrompt(); },
    imgPromptType() { this.generateImagePrompt(); },
    imgPromptFraming() { this.generateImagePrompt(); },
    imgPromptBackground() { this.generateImagePrompt(); },
    imgPromptClothing() { this.generateImagePrompt(); },
    imgPromptCustomBackground() { this.generateImagePrompt(); },
    imgPromptCustomAction() { this.generateImagePrompt(); },
    imgPromptMood() { this.generateImagePrompt(); },
    imgPromptMoodIntensity() { this.generateImagePrompt(); },
    imgPromptLighting() { this.generateImagePrompt(); },
    imgPromptLightingIntensity() { this.generateImagePrompt(); },
    imgPromptStyle() { this.generateImagePrompt(); },
    imgPromptNewspaperHeadline() { this.generateImagePrompt(); },
    imgPromptIncludeAppearance() { this.generateImagePrompt(); },
    imgPromptIncludeContext() { this.generateImagePrompt(); },
    imgPromptContextMode() { this.generateImagePrompt(); },
    imgPromptReferenceYear() { this.generateImagePrompt(); },
    imgPromptLookingAt() { this.generateImagePrompt(); },
    imgPromptCustomLookingAt() { this.generateImagePrompt(); },
    imgPromptExtraInstructions() { this.generateImagePrompt(); },
    imgPromptAspectRatio() { this.generateImagePrompt(); },
    imgPromptAdaptAge() { this.generateImagePrompt(); },
    imgPromptMotionBlur() { this.generateImagePrompt(); },
    imgPromptCharacterPositions: {
      handler() { this.generateImagePrompt(); },
      deep: true
    },
    sillyTavernPastedJson() {
      this.finalizeSillyTavernCard();
    }
  };
}(window));
