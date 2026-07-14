const { createApp } = Vue;

createApp({
  data: window.MR_DATA,
  computed: window.MR_COMPUTED,
  watch: window.MR_WATCH,
  methods: window.MR_METHODS,
  mounted() {
    this.demographicsSidebarOpen = window.innerWidth > 768;
    this.fetchSecureConfig();
    this.loadNotebooks();
    this.$nextTick(() => {
      this.initYearTimelineObserver();
    });
    this._xrayMountQueue = [];
    this._xrayBusy = false;
    this._yearSwitchToken = 0;
    this._catalogRequestToken = 0;
    this._yearDataController = null;
    this._catalogController = null;
    this._mainScrollTop = 0;
    this._sidebarScrollTop = 0;
    this._windowScrollTop = 0;
    this._scrollByEntry = {};
    this._timelineEventRefs = {};
    this._notebookEntryRefs = {};
    this._timelineEventMeta = {};
    this._timelineObserver = null;
    this._overflowMeasureTimer = null;
    this._timelinePortraitQueue = [];
    this._timelinePortraitQueueBusy = false;
    this._pageReaderControlsKey = '';
    this._uiSaveTimer = null;
    this._notebookSearchTargetTimer = null;
    this._notebookBlockRefs = {};
    this._notebookParagraphTargetTimer = null;
    this._dateMenuTargetInput = null;
    this._hydratingState = false;
    this._onWindowDragGuard = (event) => {
      if (!event?.dataTransfer) return;
      const types = Array.from(event.dataTransfer.types || []);
      if (!types.includes('Files')) return;
      event.preventDefault();
    };
    this._onWindowDropGuard = (event) => {
      if (!event?.dataTransfer) return;
      const types = Array.from(event.dataTransfer.types || []);
      if (!types.includes('Files')) return;
      event.preventDefault();
    };
    this._onBeforeUnloadSave = () => {
      this.saveUiState(true);
    };
    this._onPageHideSave = () => {
      this.saveUiState(true);
    };
    this._onVisibilitySave = () => {
      if (document.visibilityState === 'hidden') {
        this.saveUiState(true);
      }
    };
    this._onWindowScrollSave = () => {
      this._windowScrollTop = Number(window.scrollY || window.pageYOffset || 0);
      
      // Dismiss character hover card on scroll
      this.hoverCardOpen = false;

      clearTimeout(this._uiSaveTimer);
      this._uiSaveTimer = setTimeout(() => this.saveUiState(), 120);
    };
    this._onWindowResizeMeasure = () => {
      clearTimeout(this._overflowMeasureTimer);
      this._overflowMeasureTimer = setTimeout(() => {
        this.measureTimelineOverflows();
      }, 150);
    };
    window.addEventListener('resize', this._onWindowResizeMeasure);
    window.addEventListener('dragover', this._onWindowDragGuard);
    window.addEventListener('drop', this._onWindowDropGuard);
    window.addEventListener('beforeunload', this._onBeforeUnloadSave);
    window.addEventListener('pagehide', this._onPageHideSave);
    document.addEventListener('visibilitychange', this._onVisibilitySave);
    window.addEventListener('scroll', this._onWindowScrollSave, { passive: true });
    document.addEventListener('click', this.dismissDropdowns);
    this.$nextTick(() => {
      this.initPageReader();
      this.refreshDatePickers();
    });
    this._onEscDisableXray = (event) => {
      if (event.key === 'Escape' && this.xrayEnabled) {
        this.xrayEnabled = false;
      }
    };
    window.addEventListener('keydown', this._onEscDisableXray);
    this.init().catch((error) => {
      console.error('MR Vue failed to initialize', error);
    });
    this.loadPortraitManifest();
    this.loadSfxManifest();
  },
  updated() {
    // Ensure feather SVGs and date pickers are refreshed when the DOM updates
    try { window.feather && window.feather.replace(); } catch (e) { }
    this.refreshDatePickers();
  },
  beforeUnmount() {
    clearTimeout(this._uiSaveTimer);
    clearTimeout(this._overflowMeasureTimer);
    this.saveUiState(true);
    if (this._timelineObserver) {
      this._timelineObserver.disconnect();
      this._timelineObserver = null;
    }
    if (this._yearDataController) {
      this._yearDataController.abort();
    }
    if (this._catalogController) {
      this._catalogController.abort();
    }
    if (this._onEscDisableXray) {
      window.removeEventListener('keydown', this._onEscDisableXray);
    }
    if (this._onWindowDragGuard) {
      window.removeEventListener('dragover', this._onWindowDragGuard);
    }
    if (this._onWindowDropGuard) {
      window.removeEventListener('drop', this._onWindowDropGuard);
    }
    if (this._onBeforeUnloadSave) {
      window.removeEventListener('beforeunload', this._onBeforeUnloadSave);
    }
    if (this._onPageHideSave) {
      window.removeEventListener('pagehide', this._onPageHideSave);
    }
    if (this._onVisibilitySave) {
      document.removeEventListener('visibilitychange', this._onVisibilitySave);
    }
    if (this._onWindowScrollSave) {
      window.removeEventListener('scroll', this._onWindowScrollSave);
    }
    if (this._onWindowResizeMeasure) {
      window.removeEventListener('resize', this._onWindowResizeMeasure);
    }
    document.removeEventListener('click', this.dismissDropdowns);
    if (this._pageReader) {
      this._pageReader.destroy();
      this._pageReader = null;
    }
    this._dateMenuTargetInput = null;
    if (this.$el && typeof this.$el.querySelectorAll === 'function') {
      const inputs = Array.from(this.$el.querySelectorAll('.mr-date-input'));
      inputs.forEach((input) => {
        if (input && input._flatpickr) {
          input._flatpickr.destroy();
        }
      });
    }
  }
}).mount('#mr-app');
