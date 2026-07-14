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
    rowHasBase(row) {
      return Boolean(String(row?.img || row?.image || '').trim());
    },
    rowHasUnmasked(row) {
      return Boolean(String(row?.unmasked || '').trim());
    },
    rowHasExposed(row) {
      return Boolean(String(row?.exposed || '').trim());
    },
    async clearRowVariant(blockIndex, rowIndex, variant) {
      const targetVariant = ['unmasked', 'exposed'].includes(String(variant || '').toLowerCase())
        ? String(variant).toLowerCase()
        : '';
      if (!targetVariant || !this.activeEntry) {
        return;
      }

      this.setRowDropState(blockIndex, rowIndex, {
        saving: true,
        error: false,
        message: ''
      });

      try {
        const payload = {
          year: this.activeYear,
          sourcePath: this.normalizeSourcePathForPayload(String(this.activeEntry?.__sourceFile || `${this.activeYear}.json`)),
          entryId: this.activeEntry?.id,
          blockIndex: Number(blockIndex),
          rowIndex: Number(rowIndex),
          variant: targetVariant,
          imagePath: ''
        };
        const response = await fetch(`${this.backendOrigin()}/api/rows/set-image`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result?.ok) {
          throw new Error(String(result?.error || `Clear failed (${response.status})`));
        }
        this.setRowDropState(blockIndex, rowIndex, {
          saving: false,
          error: false,
          message: `Cleared ${targetVariant}. Switch page to refresh.`
        });
      } catch (error) {
        this.setRowDropState(blockIndex, rowIndex, {
          saving: false,
          error: true,
          message: String(error?.message || 'Clear failed.')
        });
      }
    },
    rowDropKey(blockIndex, rowIndex) {
      return `${Number(blockIndex)}:${Number(rowIndex)}`;
    },
    normalizeSourcePathForPayload(sourcePath) {
      const year = String(this.activeYear || '').trim();
      let candidate = String(sourcePath || '').trim();
      if (!candidate) return `${year}.json`;
      // Avoid persisting into synthetic source files generated at runtime
      if (candidate.startsWith('_synthetic') || candidate.startsWith('/_synthetic')) {
        return `${year}.json`;
      }
      // strip any leading story/ prefix
      candidate = candidate.replace(/^\/*data\/characters\/years\//i, '');
      candidate = candidate.replace(/^\/*story\/[^\/]+\//i, '');
      // strip any leading slashes
      candidate = candidate.replace(/^\/*/, '');
      return candidate || `${year}.json`;
    },
    rowDropInfo(blockIndex, rowIndex) {
      return this.rowDropState?.[this.rowDropKey(blockIndex, rowIndex)] || {};
    },
    rowImageFailedKey(blockIndex, rowIndex) {
      return `${Number(blockIndex)}:${Number(rowIndex)}`;
    },
    rowImageFailed(blockIndex, rowIndex) {
      const key = this.rowImageFailedKey(blockIndex, rowIndex);
      return Boolean(this.rowImageFailedByKey?.[key]);
    },
    onRowImageError(blockIndex, rowIndex, row) {
      const key = this.rowImageFailedKey(blockIndex, rowIndex);
      if (!row) return;

      if (!this._rowImageRetriedKeys) this._rowImageRetriedKeys = new Set();
      const src = String(row.img || row.image || '');

      // 1. If we haven't retried this row yet, or it's a legacy pictures/ path failing, try automated portrait path
      if (!this._rowImageRetriedKeys.has(key)) {
        this._rowImageRetriedKeys.add(key);

        const slug = this.slugify(row.label || '');
        const autoJpg = `portraits/${this.activeEntry?.id}/${this.activeYear}-${slug}.jpg`;
        const autoPng = `portraits/${this.activeEntry?.id}/${this.activeYear}-${slug}.png`;

        // If current src is NOT the automated JPG, try it first (this fixes broken pictures/ paths)
        if (src !== autoJpg) {
          row.img = autoJpg;
          return;
        }

        // If we WERE trying automated JPG, try PNG
        if (src.toLowerCase().endsWith('.jpg')) {
          console.debug('MR: onRowImageError trying PNG fallback:', autoPng);
          row.img = autoPng;
          return;
        }
      } else {
        // We've already retried once. 
        // If we just tried JPG and it failed, try PNG as a secondary fallback
        const slug = this.slugify(row.label || '');
        const autoJpg = `portraits/${this.activeEntry?.id}/${this.activeYear}-${slug}.jpg`;
        const autoPng = `portraits/${this.activeEntry?.id}/${this.activeYear}-${slug}.png`;

        if (src === autoJpg) {
          console.debug('MR: onRowImageError trying PNG fallback (2nd step):', autoPng);
          row.img = autoPng;
          return;
        }
      }

      this.rowImageFailedByKey = { ...(this.rowImageFailedByKey || {}), [key]: true };
      console.debug('MR: onRowImageError giving up', { key, src });
      // expose a friendly drop hint so users can replace broken images
      this.setRowDropState(blockIndex, rowIndex, { active: false, saving: false, error: false, message: 'Image missing (404). Drop or click to replace.' });
    },
    onRowMediaError(blockIndex, rowIndex, row) {
      const key = this.rowImageFailedKey(blockIndex, rowIndex);
      this.rowImageFailedByKey = { ...(this.rowImageFailedByKey || {}), [key]: true };
      const src = String(row?.imagePath || row?.src || row?.path || '');
      console.debug('MR: onRowMediaError', { key, blockIndex, rowIndex, src });
      this.setRowDropState(blockIndex, rowIndex, { active: false, saving: false, error: false, message: 'Media missing or failed to load. Drop or click to replace.' });
    },
    onRowMediaLoaded(event, blockIndex, rowIndex) {
      try {
        const key = this.rowImageFailedKey(blockIndex, rowIndex);
        console.debug('MR: onRowMediaLoaded', { key, blockIndex, rowIndex });
        const copy = { ...(this.rowImageFailedByKey || {}) };
        if (Object.prototype.hasOwnProperty.call(copy, key)) delete copy[key];
        this.rowImageFailedByKey = copy;
      } catch (e) {
        // ignore
      }
    },
    isRowDropActive(blockIndex, rowIndex) {
      return Boolean(this.rowDropInfo(blockIndex, rowIndex).active);
    },
    isRowDropSaving(blockIndex, rowIndex) {
      return Boolean(this.rowDropInfo(blockIndex, rowIndex).saving);
    },
    isRowDropError(blockIndex, rowIndex) {
      return Boolean(this.rowDropInfo(blockIndex, rowIndex).error);
    },
    rowDropLabel(blockIndex, rowIndex, hasMedia) {
      const info = this.rowDropInfo(blockIndex, rowIndex);
      if (info.saving) return 'Saving image path...';
      if (info.error) return String(info.message || 'Drop failed. Try again.');
      if (info.message) return String(info.message);
      return hasMedia ? 'Image saved.' : 'Drop image here or click to choose file';
    },
    setRowDropState(blockIndex, rowIndex, patch) {
      const key = this.rowDropKey(blockIndex, rowIndex);
      const next = {
        ...(this.rowDropState?.[key] || {}),
        ...(patch || {})
      };
      this.rowDropState = {
        ...(this.rowDropState || {}),
        [key]: next
      };
    },
    rowSubtitleKey(blockIndex, rowIndex) {
      return `${Number(blockIndex)}:${Number(rowIndex)}`;
    },
    rowSubtitleValue(blockIndex, rowIndex, row) {
      const key = this.rowSubtitleKey(blockIndex, rowIndex);
      if (Object.prototype.hasOwnProperty.call(this.rowSubtitleDrafts || {}, key)) {
        return String(this.rowSubtitleDrafts[key] || '');
      }
      return String(row?.imgnotes || '');
    },
    onRowSubtitleInput(blockIndex, rowIndex, value) {
      const key = this.rowSubtitleKey(blockIndex, rowIndex);
      this.rowSubtitleDrafts = {
        ...(this.rowSubtitleDrafts || {}),
        [key]: String(value || '')
      };
    },
    isRowSubtitleSaving(blockIndex, rowIndex) {
      const key = this.rowSubtitleKey(blockIndex, rowIndex);
      return Boolean(this.rowSubtitleSaving?.[key]);
    },
    async saveRowSubtitle(blockIndex, rowIndex) {
      if (!this.activeEntry) {
        return;
      }
      const key = this.rowSubtitleKey(blockIndex, rowIndex);
      const subtitle = String(this.rowSubtitleDrafts?.[key] || '');
      this.rowSubtitleSaving = {
        ...(this.rowSubtitleSaving || {}),
        [key]: true
      };

      try {
        const payload = {
          year: this.activeYear,
          sourcePath: this.normalizeSourcePathForPayload(String(this.activeEntry?.__sourceFile || `${this.activeYear}.json`)),
          entryId: this.activeEntry?.id,
          blockIndex: Number(blockIndex),
          rowIndex: Number(rowIndex),
          subtitle
        };

        const response = await fetch(`${this.backendOrigin()}/api/rows/set-subtitle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result?.ok) {
          throw new Error(String(result?.error || `Save failed (${response.status})`));
        }

        this.setRowDropState(blockIndex, rowIndex, {
          error: false,
          message: 'Subtitle saved. It will appear after switching pages.'
        });
      } catch (error) {
        this.setRowDropState(blockIndex, rowIndex, {
          error: true,
          message: String(error?.message || 'Subtitle save failed.')
        });
      } finally {
        this.rowSubtitleSaving = {
          ...(this.rowSubtitleSaving || {}),
          [key]: false
        };
      }
    },
    onRowDragOver(event, row) {
      if (!row || typeof row !== 'object') return;
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy';
      }
    },
    onRowDragEnter(event, blockIndex, rowIndex) {
      event.preventDefault();
      this.setRowDropState(blockIndex, rowIndex, {
        active: true,
        error: false,
        message: ''
      });
    },
    onRowDragLeave(event, blockIndex, rowIndex) {
      event.preventDefault();
      this.setRowDropState(blockIndex, rowIndex, { active: false });
    },
    openRowFilePicker(blockIndex, rowIndex, row, variant = 'base') {
      if (!this.activeEntry || !row || typeof row !== 'object') {
        return;
      }
      this.pendingRowPick = {
        blockIndex: Number(blockIndex),
        rowIndex: Number(rowIndex),
        row,
        variant: String(variant || 'base').toLowerCase()
      };
      const picker = this.$refs?.rowFileInput;
      if (!picker) {
        return;
      }
      picker.value = '';
      picker.click();
    },
    async fileToBase64(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const text = String(reader.result || '');
          const idx = text.indexOf(',');
          resolve(idx >= 0 ? text.slice(idx + 1) : text);
        };
        reader.onerror = () => reject(new Error('Failed to read selected file.'));
        reader.readAsDataURL(file);
      });
    },
    async onRowFilePicked(event) {
      const file = event?.target?.files?.[0] || null;
      const target = this.pendingRowPick;
      this.pendingRowPick = null;
      if (!file || !target) {
        return;
      }

      const { blockIndex, rowIndex } = target;
      const variant = ['base', 'unmasked', 'exposed'].includes(String(target?.variant || ''))
        ? String(target.variant)
        : 'base';
      this.setRowDropState(blockIndex, rowIndex, {
        active: false,
        saving: true,
        error: false,
        message: ''
      });

      try {
        if (Number(file.size || 0) > MAX_ROW_UPLOAD_BYTES) {
          throw new Error('Selected file is too large. Max size is 25MB.');
        }
        const base64 = await this.fileToBase64(file);
        const payload = {
          year: this.activeYear,
          sourcePath: this.normalizeSourcePathForPayload(String(this.activeEntry?.__sourceFile || `${this.activeYear}.json`)),
          entryId: this.activeEntry?.id,
          blockIndex,
          rowIndex,
          variant,
          fileName: String(file.name || ''),
          mimeType: String(file.type || ''),
          dataBase64: base64
        };

        const response = await fetch(`${this.backendOrigin()}/api/rows/upload-image`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result?.ok) {
          throw new Error(String(result?.error || `Upload failed (${response.status})`));
        }

        const savedVariant = String(result?.variant || 'base').toLowerCase();
        if (variant !== 'base' && savedVariant !== variant) {
          throw new Error('Variant save mismatch. Restart backend and try again.');
        }

        const savedPath = String(result?.imagePath || '');
        if (!savedPath) {
          throw new Error('Upload did not return image path.');
        }

        this.setRowDropState(blockIndex, rowIndex, {
          saving: false,
          error: false,
          message: `Saved ${variant}. Switch page to refresh (${savedPath})`
        });
        // clear any previously-marked failed image state so UI hides broken image
        try {
          const key = this.rowImageFailedKey(blockIndex, rowIndex);
          const copy = { ...(this.rowImageFailedByKey || {}) };
          if (Object.prototype.hasOwnProperty.call(copy, key)) delete copy[key];
          this.rowImageFailedByKey = copy;
        } catch (e) {
          // ignore
        }
      } catch (error) {
        this.setRowDropState(blockIndex, rowIndex, {
          saving: false,
          error: true,
          message: String(error?.message || 'Upload failed.')
        });
      } finally {
        if (event?.target) {
          event.target.value = '';
        }
      }
    },
    decodeDroppedUri(value) {
      try {
        return decodeURIComponent(String(value || ''));
      } catch {
        return String(value || '');
      }
    },
    normalizeDroppedPath(rawValue) {
      const value = String(rawValue || '').trim();
      if (!value) return '';

      let candidate = value;
      if (/^file:\/\//i.test(candidate)) {
        candidate = this.decodeDroppedUri(candidate.replace(/^file:\/\//i, ''));
        candidate = candidate.replace(/^\/+/, '');
      }

      candidate = candidate.replace(/\\/g, '/');
      const marker = '/character-manager/';
      const markerIndex = candidate.toLowerCase().indexOf(marker);
      if (markerIndex >= 0) {
        candidate = candidate.slice(markerIndex + marker.length);
      }

      const picturesIndex = candidate.toLowerCase().indexOf('pictures/');
      if (picturesIndex >= 0) {
        return candidate.slice(picturesIndex).replace(/^\/+/, '');
      }

      if (/^pictures\//i.test(candidate)) {
        return candidate.replace(/^\/+/, '');
      }

      return '';
    },
    droppedCandidates(event) {
      const dt = event?.dataTransfer;
      if (!dt) return [];

      const candidates = [];
      const pushIf = (value) => {
        const normalized = this.normalizeDroppedPath(value);
        if (normalized) {
          candidates.push(normalized);
        }
      };

      const uriList = String(dt.getData('text/uri-list') || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'));
      uriList.forEach(pushIf);

      const plain = String(dt.getData('text/plain') || '').trim();
      if (plain) {
        plain.split(/\r?\n/).forEach(pushIf);
      }

      const files = Array.from(dt.files || []);
      files.forEach((file) => {
        const directPath = this.normalizeDroppedPath(file?.path || '');
        if (directPath) {
          candidates.push(directPath);
          return;
        }

        const fileName = String(file?.name || '').trim();
        if (!fileName) return;
        const allCatalog = [
          ...(this.catalog?.portraits || []),
          ...(this.catalog?.outfits || []),
          ...(this.catalog?.groups || []),
          ...(this.catalog?.fieldMedia || []),
          ...(this.catalog?.unmasked || []),
          ...(this.catalog?.exposed || [])
        ];
        const fileNameLower = fileName.toLowerCase();
        const byName = allCatalog.filter((item) => String(item || '').split('/').pop().toLowerCase() === fileNameLower);
        byName.forEach((item) => candidates.push(String(item || '').replace(/\\/g, '/').replace(/^\/+/, '')));
      });

      return Array.from(new Set(candidates));
    },
    pickBestDroppedPath(candidates) {
      const list = Array.isArray(candidates) ? candidates : [];
      if (!list.length) return '';

      const entryId = String(this.activeEntry?.id || '');
      const scored = list
        .map((path) => ({ path, score: this.scoreByEntryId(path, entryId) }))
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return String(a.path).localeCompare(String(b.path));
        });

      return String(scored[0]?.path || '');
    },
    async onRowDrop(event, blockIndex, rowIndex, row) {
      event.preventDefault();
      this.setRowDropState(blockIndex, rowIndex, {
        active: false,
        saving: true,
        error: false,
        message: ''
      });

      try {
        if (!this.activeEntry || !row || typeof row !== 'object') {
          throw new Error('No active row to update.');
        }

        const candidates = this.droppedCandidates(event);
        const pickedPath = this.pickBestDroppedPath(candidates);
        if (!pickedPath) {
          throw new Error('Could not resolve dropped file to a pictures path.');
        }

        const sourcePath = String(this.activeEntry?.__sourceFile || `${this.activeYear}.json`);
        const payload = {
          year: this.activeYear,
          sourcePath: this.normalizeSourcePathForPayload(sourcePath),
          entryId: this.activeEntry.id,
          blockIndex: Number(blockIndex),
          rowIndex: Number(rowIndex),
          imagePath: pickedPath
        };

        const response = await fetch(`${this.backendOrigin()}/api/rows/set-image`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result?.ok) {
          throw new Error(String(result?.error || `Save failed (${response.status})`));
        }

        this.setRowDropState(blockIndex, rowIndex, {
          saving: false,
          error: false,
          message: `Saved. Switch page to refresh (${pickedPath})`
        });
        // clear any previously-marked failed image state so UI hides broken image
        try {
          const key = this.rowImageFailedKey(blockIndex, rowIndex);
          const copy = { ...(this.rowImageFailedByKey || {}) };
          if (Object.prototype.hasOwnProperty.call(copy, key)) delete copy[key];
          this.rowImageFailedByKey = copy;
        } catch (e) {
          // ignore
        }
      } catch (error) {
        this.setRowDropState(blockIndex, rowIndex, {
          saving: false,
          error: true,
          message: String(error?.message || 'Drop failed.')
        });
      }
    },
    displayMediaSrc(media) {
      if (!media || media.type !== 'image') {
        return media?.src || '';
      }
      if (!this.xrayEnabled) {
        return media.src;
      }
      return media.xrayExposedSrc || media.xrayRevealSrc || media.src;
    },
    enrichMediaWithXray(media) {
      if (!media || media.type !== 'image' || typeof MediaUtils.findXrayLayers !== 'function') {
        return media;
      }

      const src = String(media.src || '').replace(/\\/g, '/');
      const yearNeedle = String(this.activeYear || '');
      const legacyPortraitPrefix = `pictures/${yearNeedle}/portraits/`;
      const newPortraitPrefix = `portraits/`;
      const isPortrait = yearNeedle && (
        src.toLowerCase().startsWith(legacyPortraitPrefix.toLowerCase()) ||
        src.toLowerCase().startsWith(newPortraitPrefix.toLowerCase())
      );
      if (!yearNeedle || !isPortrait) {
        return {
          ...media,
          hasXray: false,
          xrayRevealSrc: '',
          xrayExposedSrc: ''
        };
      }

      const available = [
        ...(this.catalog?.portraits || []),
        ...(this.catalog?.outfits || []),
        ...(this.catalog?.unmasked || []),
        ...(this.catalog?.exposed || [])
      ].map((value) => String(value || '').replace(/\\/g, '/'));

      const availableSet = new Set(available.map((value) => value.toLowerCase()));
      const hasCatalogPath = (candidate) => {
        const normalized = String(candidate || '').replace(/\\/g, '/').toLowerCase();
        return Boolean(normalized) && availableSet.has(normalized);
      };
      const normalizeKey = typeof MediaUtils.normalizeKey === 'function'
        ? MediaUtils.normalizeKey
        : (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const baseName = typeof MediaUtils.baseName === 'function'
        ? MediaUtils.baseName
        : (value) => String(value || '').split('/').pop().split('?')[0].replace(/\.[^.]+$/, '');

      const sourceStem = normalizeKey(baseName(src));
      const findByStem = (list) => {
        const items = Array.isArray(list) ? list : [];
        const exact = items.find((item) => normalizeKey(baseName(item)) === sourceStem);
        return exact ? String(exact).replace(/\\/g, '/') : '';
      };

      const layers = MediaUtils.findXrayLayers(media.src, {
        availablePaths: available,
        pathExists: hasCatalogPath
      }) || {};

      const reveal = String(layers.revealSrc || '').replace(/\\/g, '/');
      const exposed = String(layers.exposedSrc || '').replace(/\\/g, '/');
      const revealCandidateFromPortrait = src.replace('/portraits/', '/unmasked/');
      const exposedCandidateFromPortrait = src.replace('/portraits/', '/exposed/');
      const revealVerified = hasCatalogPath(reveal)
        ? reveal
        : (hasCatalogPath(revealCandidateFromPortrait)
          ? revealCandidateFromPortrait
          : findByStem(this.catalog?.unmasked));
      const exposedVerified = hasCatalogPath(exposed)
        ? exposed
        : (hasCatalogPath(exposedCandidateFromPortrait)
          ? exposedCandidateFromPortrait
          : findByStem(this.catalog?.exposed));
      const hasXray = Boolean(revealVerified || exposedVerified);

      return {
        ...media,
        hasXray,
        xrayRevealSrc: this.resolveMediaUrl(revealVerified),
        xrayExposedSrc: this.resolveMediaUrl(exposedVerified)
      };
    },
    registerXrayMount(el, media) {
      if (!el || !media || !this.xrayEnabled) {
        return;
      }
      if (!Array.isArray(this._xrayMountQueue)) {
        this._xrayMountQueue = [];
      }

      const signature = `${String(media?.src || '')}|${String(media?.xrayRevealSrc || '')}|${String(media?.xrayExposedSrc || '')}`;
      const exists = this._xrayMountQueue.some((item) => item?.signature === signature && item?.el === el);
      if (!exists) {
        this._xrayMountQueue.push({ el, media, signature });
      }

      if (!this.xrayInitScheduled) {
        this.xrayInitScheduled = true;
        this.$nextTick(() => this.initializeXrayMounts());
      }
    },
    loadImageForXray(src) {
      return new Promise((resolve, reject) => {
        const image = new Image();
        image.decoding = 'async';
        image.crossOrigin = 'anonymous';
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = src;
      });
    },
    async initializeXrayMounts() {
      if (!this.xrayEnabled || typeof window.XRayReveal !== 'function') {
        return;
      }
      if (this._xrayBusy) {
        return;
      }
      this._xrayBusy = true;
      this.xrayInitScheduled = false;

      const mounts = Array.isArray(this._xrayMountQueue) ? [...this._xrayMountQueue] : [];
      this._xrayMountQueue = [];

      try {
        for (const mount of mounts) {
          const el = mount?.el;
          const media = mount?.media;
          if (!el || !media || media.type !== 'image') {
            continue;
          }
          const topSrc = String(media.src || '');
          const revealSrc = String(media.xrayRevealSrc || '');
          const exposedSrc = String(media.xrayExposedSrc || '');
          if (!topSrc || !revealSrc) {
            continue;
          }

          const signature = `${topSrc}|${revealSrc}|${exposedSrc}`;
          if (el.dataset.xraySignature === signature) {
            continue;
          }

          try {
            const [topImg, revealImg, exposedImg] = await Promise.all([
              this.loadImageForXray(topSrc),
              this.loadImageForXray(revealSrc),
              exposedSrc ? this.loadImageForXray(exposedSrc).catch(() => null) : Promise.resolve(null)
            ]);
            window.XRayReveal(el, revealImg, topImg, {
              exposedImage: exposedImg || null,
              hintText: '',
              captureWheel: true,
              toggleOnClick: true,
              showLayerButton: true,
              hasExposedLayer: Boolean(exposedSrc)
            });
            el.dataset.xraySignature = signature;
          } catch {
            el.innerHTML = `<img src="${topSrc}" alt="character media" style="width:100%;height:100%;object-fit:cover;display:block;">`;
          }
        }
      } finally {
        this._xrayBusy = false;
      }
    },
    isWideMedia(media) {
      const src = String(media?.src || '');
      if (!src) return false;
      return Boolean(media?.isWide || this.wideMediaBySrc[src]);
    },
    onImageLoaded(event, media) {
      const src = String(media?.src || '');
      const img = event?.target;
      if (!src || !img) return;
      const ratio = Number(img.naturalWidth || 0) / Math.max(1, Number(img.naturalHeight || 1));
      if (ratio >= 1.3 && !this.wideMediaBySrc[src]) {
        this.wideMediaBySrc = { ...this.wideMediaBySrc, [src]: true };
      }
      // Re-measure overflows when portrait images load (their height changes)
      clearTimeout(this._overflowMeasureTimer);
      this._overflowMeasureTimer = setTimeout(() => {
        this.measureTimelineOverflows();
      }, 120);
    },
    onVideoLoaded(event, media) {
      const src = String(media?.src || '');
      const video = event?.target;
      if (!src || !video) return;
      const ratio = Number(video.videoWidth || 0) / Math.max(1, Number(video.videoHeight || 1));
      if (ratio >= 1.3 && !this.wideMediaBySrc[src]) {
        this.wideMediaBySrc = { ...this.wideMediaBySrc, [src]: true };
      }
    },
    iconForEntry(entry) {
      const id = this.normalizeId(entry?.id);
      const core = this.getResolvedCharacterCore(id);
      const raw = (
        SPECIAL_ENTRY_ICONS[id]
        || core?.iconKey
        || core?.icon
        || this.entitiesRegistry?.[id]?.iconKey
        || this.entitiesRegistry?.[id]?.icon
        || ''
      ).toString();
      const key = this.iconKeyToFeather(raw) || '';
      if (key) return key;
      return 'circle';
    },
    applyYearTheme(year) {
      const root = document.documentElement;
      const activeYear = String(year || '').trim();
      const fallback = this.yearThemes?.default?.vars || {};
      const scoped = this.yearThemes?.[activeYear]?.vars || {};
      const vars = { ...fallback, ...scoped };

      const parseColor = (value) => {
        const raw = String(value || '').trim();
        if (!raw) {
          return null;
        }

        const hexMatch = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
        if (hexMatch) {
          const hex = hexMatch[1];
          if (hex.length === 3) {
            return {
              r: parseInt(hex[0] + hex[0], 16),
              g: parseInt(hex[1] + hex[1], 16),
              b: parseInt(hex[2] + hex[2], 16)
            };
          }
          return {
            r: parseInt(hex.slice(0, 2), 16),
            g: parseInt(hex.slice(2, 4), 16),
            b: parseInt(hex.slice(4, 6), 16)
          };
        }

        const rgbMatch = raw.match(/^rgba?\(([^)]+)\)$/i);
        if (rgbMatch) {
          const parts = rgbMatch[1]
            .split(',')
            .map((part) => Number(String(part || '').trim()))
            .filter((num) => Number.isFinite(num));
          if (parts.length >= 3) {
            return {
              r: Math.max(0, Math.min(255, parts[0])),
              g: Math.max(0, Math.min(255, parts[1])),
              b: Math.max(0, Math.min(255, parts[2]))
            };
          }
        }

        return null;
      };

      const luminance = (rgb) => {
        if (!rgb) {
          return 1;
        }
        const toLinear = (channel) => {
          const c = Number(channel || 0) / 255;
          return c <= 0.03928 ? (c / 12.92) : (((c + 0.055) / 1.055) ** 2.4);
        };
        const r = toLinear(rgb.r);
        const g = toLinear(rgb.g);
        const b = toLinear(rgb.b);
        return (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
      };

      const computed = window.getComputedStyle(root);
      const bgColor = computed.getPropertyValue('--bg').trim() || String(vars['--bg'] || '');
      const pageColor = computed.getPropertyValue('--page').trim() || String(vars['--page'] || '');
      const darkByLuminance = luminance(parseColor(bgColor)) < 0.26 || luminance(parseColor(pageColor)) < 0.34;
      const isDarkThemeYear = darkByLuminance && activeYear !== '2026';

      // Set all variables from current theme directly
      Object.keys(vars).forEach((key) => {
        if (key.startsWith('--')) {
          root.style.setProperty(key, String(vars[key]));
        }
      });
      // Reset or remove variables that are NOT in current theme but were in base theme
      (this.themeVarKeys || []).forEach((key) => {
        if (!Object.prototype.hasOwnProperty.call(vars, key)) {
          const base = this.baseThemeVars?.[key];
          if (typeof base === 'string' && base.length) {
            root.style.setProperty(key, base);
          } else {
            root.style.removeProperty(key);
          }
        }
      });

      if (activeYear === '2024' || activeYear === '1955') {
        root.style.setProperty('--title-ink', String(vars['--sidebar-active'] || vars['--accent'] || 'var(--accent)'));
      } else {
        root.style.setProperty('--title-ink', String(vars['--ink'] || vars['--ink2'] || 'var(--ink2)'));
      }

      if (!vars['--sidebar-surface']) root.style.removeProperty('--sidebar-surface');
      if (!vars['--sidebar-text']) root.style.removeProperty('--sidebar-text');
      if (!vars['--sidebar-dim']) root.style.removeProperty('--sidebar-dim');
      if (!vars['--sidebar-active']) root.style.removeProperty('--sidebar-active');
      if (!vars['--sidebar-search-bg']) root.style.removeProperty('--sidebar-search-bg');
      if (!vars['--sidebar-group-border']) root.style.removeProperty('--sidebar-group-border');
      if (!vars['--sidebar-group-bg']) root.style.removeProperty('--sidebar-group-bg');
      if (!vars['--sidebar-group-head-bg']) root.style.removeProperty('--sidebar-group-head-bg');
      if (!vars['--sidebar-move-btn-bg']) root.style.removeProperty('--sidebar-move-btn-bg');
      if (!vars['--sidebar-nav-hover-bg']) root.style.removeProperty('--sidebar-nav-hover-bg');
      if (!vars['--sidebar-nav-active-bg']) root.style.removeProperty('--sidebar-nav-active-bg');
      if (!vars['--sidebar-tool-active-bg']) root.style.removeProperty('--sidebar-tool-active-bg');
      if (!vars['--sidebar-pill-active-bg']) root.style.removeProperty('--sidebar-pill-active-bg');


      const thumbA = String(vars['--sidebar-active'] || vars['--accent'] || '#d6b576');
      const thumbB = String(vars['--accent'] || vars['--edge'] || '#a8844d');
      const hoverA = String(vars['--ink'] || vars['--sidebar-active'] || '#e0c185');
      const hoverB = String(vars['--accent'] || vars['--edge'] || '#b49059');
      const track = String(vars['--sidebar-bg'] || vars['--bg'] || '#1d1b15');
      root.style.setProperty('--scrollbar-thumb-a', thumbA);
      root.style.setProperty('--scrollbar-thumb-b', thumbB);
      root.style.setProperty('--scrollbar-thumb-hover-a', hoverA);
      root.style.setProperty('--scrollbar-thumb-hover-b', hoverB);
      root.style.setProperty('--scrollbar-track', track);

      // Map notebook-specific variables from theme notes variables
      if (isDarkThemeYear) {
        root.style.setProperty('--notebook-ink', vars['--notes-ink'] || vars['--ink'] || 'var(--ink)');
        root.style.setProperty('--notebook-ink-strong', vars['--notes-ink'] || vars['--ink'] || 'var(--ink)');
        root.style.setProperty('--notebook-header-ink', vars['--notes-title-ink'] || vars['--accent'] || vars['--ink'] || 'var(--accent)');
      } else {
        root.style.setProperty('--notebook-ink', vars['--notes-ink-dark'] || vars['--ink2'] || 'var(--ink2)');
        root.style.setProperty('--notebook-ink-strong', vars['--notes-ink-dark'] || vars['--ink2'] || 'var(--ink2)');
        root.style.setProperty('--notebook-header-ink', vars['--notes-header-ink-dark'] || vars['--title-ink'] || '#120e08');
      }
      root.style.setProperty('--notebook-date-ink', vars['--notes-label-ink'] || vars['--dim'] || 'var(--dim)');
      root.style.setProperty('--notebook-divider-ink', vars['--notes-label-ink'] || vars['--edge'] || 'var(--edge)');
      root.style.setProperty('--notebook-margin-note', vars['--notes-body-ink'] || vars['--dim'] || 'var(--dim)');
      root.style.setProperty('--notebook-box-accent', vars['--notes-label-ink'] || vars['--accent'] || 'var(--accent)');
      root.style.setProperty('--notebook-sticky-border', vars['--notes-label-ink'] || vars['--edge'] || 'var(--edge)');
      root.style.setProperty('--notebook-box-border', vars['--notes-label-ink'] || vars['--edge'] || 'var(--edge)');
      root.style.setProperty('--notebook-nav-border', vars['--notes-label-ink'] || vars['--edge'] || 'var(--edge)');
      root.style.setProperty('--notebook-active-border', vars['--accent'] || 'var(--accent)');

      root.setAttribute('data-dark-year-theme', isDarkThemeYear ? '1' : '0');
      root.setAttribute('data-active-year', activeYear);
    },
    primeThemeDefaults() {
      const root = document.documentElement;
      const keys = new Set(this.themeVarKeys || []);
      Object.values(this.yearThemes || {}).forEach((theme) => {
        const vars = theme?.vars || {};
        Object.keys(vars).forEach((key) => {
          if (String(key).startsWith('--')) {
            keys.add(key);
          }
        });
      });
      const newKeys = Array.from(keys);

      const computed = window.getComputedStyle(root);
      const base = this.baseThemeVars || {};
      newKeys.forEach((key) => {
        if (!(key in base)) {
          base[key] = computed.getPropertyValue(key).trim();
        }
      });
      this.themeVarKeys = newKeys;
      this.baseThemeVars = base;
    },
    buildAutoSummaryRows() {
      const items = Array.isArray(this.entries) ? this.entries : [];
      const groups = new Map();
      items.forEach((entry) => {
        const g = String(entry?.navGroup || 'other');
        groups.set(g, (groups.get(g) || 0) + 1);
      });
      const rows = Array.from(groups.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([group, count]) => ({ label: group, value: `${count} entries` }));
      rows.push({ label: 'total', value: `${items.length} entries` });
      return rows;
    },
    progressCharacterIds() {
      const preambleIds = new Set(['timeline', 'notebook-archive', 'relationship-tree', 'progress']);
      const byEntry = (Array.isArray(this.entries) ? this.entries : [])
        .filter((entry) => this.normalize(String(entry?.navGroup || '')) !== 'preamble')
        .map((entry) => String(entry?.id || '').toLowerCase().trim())
        .filter(Boolean)
        .filter((id) => !preambleIds.has(id))
        .filter((id) => !!this.characterCore?.[id]);

      const ids = Array.from(new Set(byEntry));
      return ids.sort((a, b) => {
        const aName = String(this.characterNameById(a) || a);
        const bName = String(this.characterNameById(b) || b);
        return aName.localeCompare(bName);
      });
    },
    progressHasPortraitCatalog() {
      return Array.isArray(this.catalog?.portraits) && this.portraitsAvailable;
    },
    progressMissingPortraitCharacters() {
      if (!this.progressHasPortraitCatalog()) {
        return [];
      }
      const catalog = { portraits: this.catalog?.portraits || [] };
      return this.progressCharacterIds()
        .filter((id) => !this.bestPortraitFromCatalog(catalog, id))
        .map((id) => ({ id, name: this.characterNameById(id) || id }));
    },
    progressMissingBirthdayCharacters() {
      return this.progressCharacterIds()
        .filter((id) => {
          const core = this.characterCore?.[id];
          const birthRaw = this.getCoreBirthRaw(core);
          return !String(birthRaw || '').trim();
        })
        .map((id) => ({ id, name: this.characterNameById(id) || id }));
    },
    progressPortraitSummaryLabel() {
      const total = this.progressCharacterIds().length;
      if (!this.portraitsAvailable) {
        return `${total} characters tracked. Portraits disabled (no portraits folder found).`;
      }
      if (!this.progressHasPortraitCatalog()) {
        return `${total} characters tracked. Portrait scan unavailable (media catalog offline).`;
      }
      const missing = this.progressMissingPortraitCharacters().length;
      const have = Math.max(0, total - missing);
      return `${have} with portraits, ${missing} needing portraits (${total} total).`;
    },
    progressBirthdaySummaryLabel() {
      const total = this.progressCharacterIds().length;
      const missing = this.progressMissingBirthdayCharacters().length;
      const have = Math.max(0, total - missing);
      return `${have} with birthdays, ${missing} missing birthdays (${total} total).`;
    },
    syntheticTimelineEntry() {
      return {
        id: 'timeline',
        order: 3,
        navGroup: 'Preamble',
        navLabel: 'Timeline',
        navTag: 'history',
        eyebrow: 'Preamble',
        title: 'Timeline',
        __sourceFile: '_synthetic/timeline.json',
        blocks: [
          {
            type: 'timeline-sheet',
            label: 'Timeline',
            title: 'Historical Timeline',
            note: 'Key events and milestones documented in the project history.'
          }
        ]
      };
    },
    syntheticNotebookEntry() {
      return {
        id: 'notebook-archive',
        order: 4,
        navGroup: 'Preamble',
        navLabel: 'Field Notes Archive',
        navTag: 'notebooks',
        eyebrow: 'Preamble',
        title: 'Field Notes Archive',
        __sourceFile: '_synthetic/notebooks.json',
        blocks: [
          {
            type: 'notebook-sheet',
            label: 'Field Notes',
            title: 'Field Notes Archive',
            note: 'Jess notebooks, logs, and narrative records.'
          }
        ]
      };
    },
    syntheticRelationshipTreeEntry() {
      return {
        id: 'relationship-tree',
        order: 5,
        navGroup: 'Preamble',
        navLabel: 'Relationship Tree',
        navTag: 'connections',
        eyebrow: 'Preamble',
        title: 'Relationship Tree',
        blocks: [
          {
            type: 'relationship-tree-sheet',
            label: 'Relationship Tree',
            title: 'Relationship Tree',
            note: 'Live-map of bonds and active operations.'
          }
        ]
      };
    },
    syntheticProgressEntry() {
      return {
        id: 'progress',
        order: 6,
        navGroup: 'Preamble',
        navLabel: 'Progress',
        navTag: 'audit',
        eyebrow: 'Preamble',
        title: 'Progress',
        __sourceFile: '_synthetic/progress.json',
        blocks: [
          {
            type: 'progress-sheet',
            label: 'Progress',
            title: 'Character Data Progress',
            note: 'Coverage report for portraits and birthdays in the active year roster.'
          }
        ]
      };
    },
    syntheticDemographicsEntry() {
      return {
        id: 'demographics',
        order: 7,
        navGroup: 'Preamble',
        navLabel: 'Demographics',
        navTag: 'diversity',
        eyebrow: 'Preamble',
        title: 'Demographics & Diversity',
        blocks: [
          {
            type: 'demographics-sheet',
            label: 'Demographics',
            title: 'Demographics & Diversity',
            note: 'Breakdown of gender, ethnicity, and nationality across the character database.'
          }
        ]
      };
    },
    mergeSyntheticEntries(baseEntries) {
      const entries = Array.isArray(baseEntries) ? [...baseEntries] : [];
      const hasTimeline = entries.some((entry) => this.normalizeId(entry?.id) === 'timeline');
      if (!hasTimeline) {
        entries.unshift(this.syntheticTimelineEntry());
      }
      const hasNotebooks = entries.some((entry) => this.normalizeId(entry?.id) === 'notebook-archive');
      if (!hasNotebooks) {
        entries.unshift(this.syntheticNotebookEntry());
      }
      const hasRelationshipTree = entries.some((entry) => this.normalizeId(entry?.id) === 'relationship-tree');
      if (!hasRelationshipTree) {
        entries.unshift(this.syntheticRelationshipTreeEntry());
      }
      const hasProgress = entries.some((entry) => this.normalizeId(entry?.id) === 'progress');
      if (!hasProgress) {
        entries.unshift(this.syntheticProgressEntry());
      }
      const hasDemographics = entries.some((entry) => this.normalizeId(entry?.id) === 'demographics');
      if (!hasDemographics) {
        entries.unshift(this.syntheticDemographicsEntry());
      }
      return entries;
    },
    firstEntryFallback(entriesList) {
      const entries = Array.isArray(entriesList) ? entriesList : [];
      const nonPreamble = entries.filter((entry) => {
        const id = this.normalizeId(entry?.id);
        return id !== 'timeline' && id !== 'intro' && id !== 'factions' && id !== 'recovery-note';
      });
      if (nonPreamble[0]?.id) {
        return String(nonPreamble[0].id);
      }
      return String(entries[0]?.id || '');
    },
    escapeRegex(value) {
      return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    },
    cleanTextPreservingNewlines(value) {
      return String(value || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]*>/g, '')
        .replace(/[ \t]+/g, ' ')
        .split('\n').map(line => line.trim()).join('\n')
        .trim();
    },
    isTimelineEventLong(event, index) {
      const desc = event?.description || '';
      const rows = index !== undefined ? this.timelinePortraitsRows(event, index) : 0;
      // When portraits are present, estimate based on length/lines to reduce early layout flashes,
      // actual overflow is refined by measureTimelineOverflows() after render.
      if (rows > 0) {
        // 1 row has ~140px available (fits ~6 lines / 400 chars)
        // 2+ rows has ~300px available (fits ~12 lines / 800 chars)
        const limit = rows > 1 ? 800 : 400;
        const lineLimit = rows > 1 ? 12 : 6;
        return desc.length > limit || desc.split('\n').length > lineLimit;
      }
      return desc.length > 260 || desc.split('\n').length > 4;
    },
    timelinePortraitsRows(event, index) {
      if (!this.portraitsAvailable || !this.timelinePortraitsVisible) return 0;
      const tags = this.timelineCharacterTags(event);
      if (!tags.length || this.isCompactTimelineEvent(event)) return 0;
      
      const portraits = this.timelinePortraitsForEvent(event, index) || [];
      const num = portraits.length;
      if (!num) return 0;
      
      const isMany = num > 4;
      const perRow = isMany ? 4 : 2;
      const computedRows = Math.ceil(num / perRow);
      return Math.min(2, computedRows);
    },
    toggleTimelineEventExpanded(event, index) {
      const key = this.timelineEventKey(event, index);
      this.timelineExpandedKeys = {
        ...(this.timelineExpandedKeys || {}),
        [key]: !this.timelineExpandedKeys?.[key]
      };
    },
    /**
     * Measures all rendered portrait-bearing timeline cards to:
     * 1. Set --portrait-height CSS variable to the actual media container height
     * 2. Detect whether the description actually overflows that height
     * Results are stored in this.timelineOverflows keyed by event key.
     */
    measureTimelineOverflows() {
      const root = this.$el;
      if (!root || typeof root.querySelectorAll !== 'function') return;
      const articles = root.querySelectorAll('.mr-timeline-item.has-portraits');
      if (!articles || !articles.length) return;
      const refs = this._timelineEventRefs || {};
      const updates = {};
      // Build a reverse lookup: element → key
      const elToKey = new Map();
      for (const [key, el] of Object.entries(refs)) {
        if (el) elToKey.set(el, key);
      }
      articles.forEach(article => {
        const key = elToKey.get(article);
        if (!key) return;
        const media = article.querySelector('.mr-timeline-item-media');
        const desc = article.querySelector('.mr-timeline-desc');
        if (!media || !desc) return;
        
        // Reset scroll position to prevent Blink/WebKit display:contents scroll offset bugs
        desc.scrollTop = 0;
        
        const mediaH = media.offsetHeight;
        if (mediaH > 0) {
          // Account for title, date shell, and bottom area above the description
          const dateShell = article.querySelector('.mr-timeline-date-shell');
          const titleEl = article.querySelector('.mr-timeline-item-title');
          const dateH = dateShell ? dateShell.offsetHeight : 0;
          const titleH = titleEl ? titleEl.offsetHeight : 0;
          const overhead = dateH + titleH + 8; // 8px for small margins
          const availableH = Math.max(mediaH - overhead, 140);
          article.style.setProperty('--portrait-height', availableH + 'px');
        }
        
        // Only calculate overflow if the item is not expanded.
        // If it is expanded, clientHeight equals scrollHeight, so we should preserve
        // the existing overflow state.
        const isExpanded = !!this.timelineExpandedKeys[key];
        if (!isExpanded) {
          updates[key] = desc.scrollHeight > desc.clientHeight + 4;
        } else {
          updates[key] = this.timelineOverflows.hasOwnProperty(key) ? this.timelineOverflows[key] : true;
        }
      });
      if (Object.keys(updates).length) {
        this.timelineOverflows = { ...this.timelineOverflows, ...updates };
      }
    },
    timelineEventDescriptionParts(event, index) {
      const blocks = this.timelineDescriptionBlocks(event?.description || '', event);
      const key = this.timelineEventKey(event, index);
      const hasPortraits = this.timelinePortraitsRows(event, index) > 0;
      let isLong;
      if (hasPortraits && this.timelineOverflows.hasOwnProperty(key)) {
        // Use the measured overflow result
        isLong = this.timelineOverflows[key];
      } else {
        isLong = this.isTimelineEventLong(event, index);
      }
      const isExpanded = !!this.timelineExpandedKeys[key];
      const showDialogue = this.timelineDialogueBubbles !== false && (isExpanded || !isLong);
      return { blocks, isLong, isExpanded, showDialogue };
    },
    resolvePronoun(pronoun, activeSubjectId, event) {
      const lower = pronoun.toLowerCase();
      if (activeSubjectId) {
        return activeSubjectId;
      }
      const tags = Array.isArray(event?.tags) ? event.tags : [];
      for (const tag of tags) {
        const charId = this.resolveCharacterIdByName(tag);
        if (charId) {
          const char = this.getResolvedCharacterCore(charId);
          const gender = String(char?.gender || '').toLowerCase();
          if (lower === 'she' && (gender === 'female' || gender === 'f')) {
            return charId;
          }
          if (lower === 'he' && (gender === 'male' || gender === 'm')) {
            return charId;
          }
        }
      }
      for (const tag of tags) {
        const charId = this.resolveCharacterIdByName(tag);
        if (charId) return charId;
      }
      return this.getResolvedCharacterId(this.activeEntryId) || null;
    },
    timelineDescriptionBlocks(descriptionText, event) {
      const text = String(descriptionText || '');
      if (!text) return [];

      const lines = text.split(/\r?\n/);
      const blocks = [];
      let activeSubjectId = null;

      const verbSet = new Set(['says', 'say', 'asks', 'replies', 'responds', 'said', 'asked', 'replied', 'responded', 'whispers', 'whispered', 'shouts', 'shouted', 'mumbles', 'mumbled']);
      const pronounSet = new Set(['she', 'he', 'they', 'i', 'you', 'we']);
      const sentenceBoundaryRegex = /[\.\?!\*]\s*$/;

      // Helper: push a paragraph block and track active subject
      const pushParagraph = (str) => {
        const parts = this.timelineTextParts(str);
        for (const part of parts) {
          if (part.type === 'entry' && part.entryId) {
            activeSubjectId = part.entryId;
          }
        }
        blocks.push({ type: 'paragraph', parts });
      };

      // Helper: create a dialogue block
      const pushDialogue = (speakerName, speakerId, dialogueText, fullLineText) => {
        const isPronoun = pronounSet.has(speakerName.toLowerCase());
        let resolvedSpeakerId = speakerId;
        if (isPronoun) {
          resolvedSpeakerId = this.resolvePronoun(speakerName, activeSubjectId, event);
        }
        if (resolvedSpeakerId) {
          activeSubjectId = resolvedSpeakerId;
        }

        let cleanedDialogue = dialogueText;
        cleanedDialogue = cleanedDialogue.replace(/^[\*\"\']+|[\*\"\']+$/g, '').trim();

        const year = this.extractYear(event?.date) || this.activeYear;
        const portraitSrc = resolvedSpeakerId ? this.getSyncPortraitSrc(resolvedSpeakerId, year) : '';
        const secureSrc = (portraitSrc && typeof toSecureMediaUrl === 'function') ? toSecureMediaUrl(portraitSrc) : portraitSrc;
        const charData = resolvedSpeakerId ? (this.characterCore?.[resolvedSpeakerId] || {}) : {};

        blocks.push({
          type: 'dialogue',
          speaker: resolvedSpeakerId ? (charData['full name'] || charData.navLabel || speakerName) : speakerName,
          speakerId: resolvedSpeakerId || speakerName,
          portraitSrc: secureSrc,
          customFont: charData.font || '',
          parts: this.timelineTextParts(cleanedDialogue),
          rawParts: this.timelineTextParts(fullLineText)
        });
      };

      // Helper: find all dialogue anchors ([Name/Pronoun] [verb]:) in a line
      const findDialogueAnchors = (line) => {
        const anchors = [];
        const words = line.split(/\s+/);
        // Build a position map: for each word, where it starts in the original string
        const positions = [];
        let searchFrom = 0;
        for (const word of words) {
          const idx = line.indexOf(word, searchFrom);
          positions.push(idx);
          searchFrom = idx + word.length;
        }

        for (let i = 0; i < words.length; i++) {
          // Check if this word is a verb followed by ':'
          const rawWord = words[i];
          if (!rawWord.endsWith(':')) continue;
          const verb = rawWord.slice(0, -1).toLowerCase();
          if (!verbSet.has(verb)) continue;

          // Look back 1-2 words for a speaker name
          let matchedSpeakerId = null;
          let matchedSpeakerName = '';
          let anchorStart = positions[i]; // default: starts at verb

          // Check 2-word name (e.g. "Jess Boone says:")
          if (i >= 2) {
            const twoWords = words[i - 2] + ' ' + words[i - 1];
            const twoWordsClean = twoWords.replace(/[^a-zA-Z0-9\s-]/g, '').trim();
            const id = this.resolveCharacterIdByName(twoWordsClean);
            if (id) {
              matchedSpeakerId = id;
              matchedSpeakerName = twoWords;
              anchorStart = positions[i - 2];
            }
          }

          // Check 1-word name (e.g. "Thema says:" or "She says:")
          if (!matchedSpeakerId && i >= 1) {
            const oneWord = words[i - 1];
            const oneWordClean = oneWord.replace(/[^a-zA-Z0-9\s-]/g, '').trim();
            const id = this.resolveCharacterIdByName(oneWordClean);
            const isPronoun = pronounSet.has(oneWordClean.toLowerCase());
            if (id || isPronoun) {
              matchedSpeakerId = id;
              matchedSpeakerName = oneWord;
              anchorStart = positions[i - 1];
            }
          }

          if (matchedSpeakerName) {
            anchors.push({
              anchorStart,
              dialogueStart: positions[i] + rawWord.length, // right after the colon
              speakerName: matchedSpeakerName,
              speakerId: matchedSpeakerId
            });
          }
        }
        return anchors;
      };

      lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) return;

        // 1. Check if it's an image block
        const imgMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
        if (imgMatch) {
          let src = imgMatch[2].trim();
          if (src.includes('portraits/')) {
            const idx = src.indexOf('portraits/');
            src = src.slice(idx);
          }
          blocks.push({ type: 'image', alt: imgMatch[1], src });
          return;
        }

        // 2. Check for dialogue anchors
        const anchors = findDialogueAnchors(trimmed);
        if (anchors.length > 0) {
          const firstAnchor = anchors[0];
          const prefix = trimmed.slice(0, firstAnchor.anchorStart).trim();

          // Validate: if the first anchor has a prefix that doesn't end at a sentence boundary,
          // treat the entire line as a normal paragraph (prevents "When Dawn says:" from splitting)
          if (prefix && !sentenceBoundaryRegex.test(prefix)) {
            pushParagraph(trimmed);
            return;
          }

          // Push prefix as paragraph if present
          if (prefix) {
            pushParagraph(prefix);
          }

          // Process each dialogue anchor
          for (let a = 0; a < anchors.length; a++) {
            const anchor = anchors[a];
            const nextAnchorStart = (a + 1 < anchors.length) ? anchors[a + 1].anchorStart : trimmed.length;
            const dialogueText = trimmed.slice(anchor.dialogueStart, nextAnchorStart).trim();
            const fullSegment = trimmed.slice(anchor.anchorStart, nextAnchorStart).trim();
            pushDialogue(anchor.speakerName, anchor.speakerId, dialogueText, fullSegment);
          }
          return;
        }

        // 3. Normal paragraph block
        pushParagraph(trimmed);
      });

      return blocks;
    },
    timelineTextParts(value) {
      const rawText = String(value || '');
      if (!rawText) {
        return [{ type: 'text', text: '' }];
      }

      const hasCacheDepsChanged = !this._timelineTextPartsCache || 
          this._timelineTextPartsCache.entries !== this.entries || 
          this._timelineTextPartsCache.entitiesRegistry !== this.entitiesRegistry ||
          !this._timelineTextPartsResultsCache;

      if (hasCacheDepsChanged) {
        this._timelineTextPartsResultsCache = new Map();
      } else if (this._timelineTextPartsResultsCache.has(rawText)) {
        return this._timelineTextPartsResultsCache.get(rawText);
      }

      // 1. Extract markdown images ![alt](src)
      const imgRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
      const intermediateParts = [];
      let lastIdx = 0;
      let imgMatch;

      while ((imgMatch = imgRegex.exec(rawText)) !== null) {
        const matchIdx = imgMatch.index;
        if (matchIdx > lastIdx) {
          intermediateParts.push({
            type: 'text',
            text: rawText.slice(lastIdx, matchIdx)
          });
        }

        let src = imgMatch[2].trim();
        if (src.includes('portraits/')) {
          const idx = src.indexOf('portraits/');
          src = src.slice(idx);
        }

        intermediateParts.push({
          type: 'image',
          alt: imgMatch[1],
          src: src
        });

        lastIdx = imgRegex.lastIndex;
      }

      if (lastIdx < rawText.length) {
        intermediateParts.push({
          type: 'text',
          text: rawText.slice(lastIdx)
        });
      }

      if (!this._timelineTextPartsCache || 
          this._timelineTextPartsCache.entries !== this.entries || 
          this._timelineTextPartsCache.entitiesRegistry !== this.entitiesRegistry) {
        const entryMap = new Map();
        (this.entries || []).forEach((entry) => {
          const id = String(entry?.id || '').trim();
          if (!id) return;
          entryMap.set(id.toLowerCase(), {
            id,
            tooltip: this.characterEyebrowById(id) || this.entryDisplayTitle(entry)
          });
        });
        // Also include entities
        Object.entries(this.entitiesRegistry || {}).forEach(([id, entity]) => {
          const lowerId = id.toLowerCase();
          if (entryMap.has(lowerId)) return;
          entryMap.set(lowerId, {
            id,
            tooltip: entity.label || entity.name || id
          });
        });

        const ids = Array.from(entryMap.keys())
          .filter(Boolean)
          .sort((a, b) => b.length - a.length)
          .map((key) => this.escapeRegex(key));

        const matcher = ids.length ? new RegExp(`\\b(${ids.join('|')})\\b`, 'gi') : null;

        this._timelineTextPartsCache = {
          entries: this.entries,
          entitiesRegistry: this.entitiesRegistry,
          entryMap,
          matcher
        };
      }

      // Disable highlight keyword matcher by treating it as if there's no matcher to remove the highlight system
      return intermediateParts.map(part => {
        if (part.type === 'text') {
          return { type: 'text', text: this.cleanTextPreservingNewlines(part.text) };
        }
        return part;
      });

      if (this._timelineTextPartsResultsCache) {
        this._timelineTextPartsResultsCache.set(rawText, parts);
      }
      return parts;
    },
    timelineEventsWithBirthdays(baseEvents) {
      const merged = Array.isArray(baseEvents)
        ? baseEvents.map((event) => ({ ...(event || {}), __synthetic: false }))
        : [];

      if (!this.characterCore || typeof this.characterCore !== 'object') {
        return merged;
      }

      const knownIds = Object.keys(this.characterCore || {})
        .map((id) => String(id || '').toLowerCase().trim())
        .filter(Boolean)
        .sort((a, b) => b.length - a.length);

      const extractCharacterIdFromHistoryToken = (rawToken) => {
        const token = String(rawToken || '').toLowerCase().trim().replace(/^[+-]/, '');
        if (!token) {
          return '';
        }
        if (knownIds.includes(token)) {
          return token;
        }
        const prefixed = knownIds.find((id) => token.startsWith(`${id}-`));
        if (prefixed) {
          return prefixed;
        }
        const loose = token.replace(/[^a-z0-9]/g, '');
        if (!loose) {
          return '';
        }
        return knownIds.find((id) => {
          const idLoose = id.replace(/[^a-z0-9]/g, '');
          return idLoose && (loose.startsWith(idLoose) || idLoose.startsWith(loose));
        }) || '';
      };

      const relationshipRows = Array.isArray(this.relationships) ? this.relationships : [];
      relationshipRows.forEach((rel) => {
        const relLabel = String(rel?.label || rel?.id || 'Relationship').trim();
        const relType = String(rel?.type || '').trim().toLowerCase();
        const relId = String(rel?.id || '').trim();
        const memberIds = [
          ...(Array.isArray(rel?.members) ? rel.members : []),
          ...(Array.isArray(rel?.children) ? rel.children : [])
        ]
          .map((id) => String(id || '').toLowerCase().trim())
          .filter(Boolean);
        const uniqueMemberIds = Array.from(new Set(memberIds));
        const memberNames = uniqueMemberIds.map((id) => this.relationshipDisplayNameById(id)).filter(Boolean);

        const addRelationshipEvent = (date, title, description, membershipChanges = [], editMeta = {}, extraTags = [], textMeta = {}) => {
          const parsed = this.parseTimelineDateParts(date || '');
          if (!parsed) {
            return;
          }
          const hasMembershipChanges = Array.isArray(membershipChanges) && membershipChanges.length > 0;
          const tags = Array.from(new Set([
            'relationship',
            relType,
            hasMembershipChanges ? 'group-change' : '',
            ...((Array.isArray(extraTags) ? extraTags : []).map((tag) => String(tag || '').trim()).filter(Boolean)),
            ...uniqueMemberIds
          ].filter(Boolean)));
          merged.push({
            date: String(date || '').trim(),
            title,
            description,
            tags,
            __synthetic: true,
            __relationshipSynthetic: true,
            __relationshipId: relId,
            __relationshipDateField: String(editMeta?.field || '').trim(),
            __relationshipOldDate: String(editMeta?.oldDate || date || '').trim(),
            __relationshipTextField: String(textMeta?.field || '').trim(),
            __relationshipNoteDate: String(textMeta?.date || '').trim(),
            __relationshipOldText: String(textMeta?.oldText || '').trim(),
            __compactTimeline: true,
            __membershipChanges: Array.isArray(membershipChanges) ? membershipChanges : []
          });
        };

        const startDate = String(rel?.startDate || '').trim();
        if (startDate) {
          const relationshipNotes = String(rel?.notes || rel?.['core-note'] || '').trim();
          const memberDesc = memberNames.length
            ? `Members: ${memberNames.join(', ')}.`
            : 'Relationship begins.';

          const combinedDesc = relationshipNotes
            ? `${memberDesc}\n\n${relationshipNotes}`
            : memberDesc;

          addRelationshipEvent(
            startDate,
            `${relLabel} Begins`,
            combinedDesc,
            [],
            { field: 'startDate' },
            relationshipNotes ? ['timeline-note'] : [],
            relationshipNotes ? { field: 'notes', oldText: relationshipNotes } : {}
          );
        }

        const splitDate = String(rel?.splitDate || '').trim();
        if (splitDate) {
          const desc = memberNames.length
            ? `Ending members: ${memberNames.join(', ')}.`
            : 'Relationship ends.';
          addRelationshipEvent(splitDate, `${relLabel} Ends`, desc, [], { field: 'splitDate' });
        }

        const history = rel?.history && typeof rel.history === 'object' ? rel.history : {};
        Object.entries(history).forEach(([dateKey, events]) => {
          const tokens = Array.isArray(events) ? events : [];
          const joined = [];
          const left = [];
          const timelineNotes = [];

          tokens.forEach((rawToken) => {
            const token = String(rawToken || '').trim();
            if (/^timeline-note\s*:/i.test(token)) {
              const note = token.replace(/^timeline-note\s*:\s*/i, '').trim();
              if (note) {
                timelineNotes.push(note);
              }
              return;
            }
            if (!token || (token[0] !== '+' && token[0] !== '-')) {
              return;
            }
            const charId = extractCharacterIdFromHistoryToken(token);
            if (!charId) {
              return;
            }
            const payload = {
              characterId: charId,
              label: this.relationshipDisplayNameById(charId),
              action: token[0] === '+' ? 'joined' : 'left'
            };
            if (payload.action === 'joined') {
              joined.push(payload);
            } else {
              left.push(payload);
            }
          });

          if (!joined.length && !left.length) {
            // Keep processing timeline-note text events even when there are no roster deltas.
          } else {
            const textBits = [];
            if (joined.length) {
              textBits.push(`Joined: ${joined.map((item) => item.label).join(', ')}`);
            }
            if (left.length) {
              textBits.push(`Left: ${left.map((item) => item.label).join(', ')}`);
            }

            addRelationshipEvent(
              dateKey,
              `${relLabel} Roster Update`,
              textBits.join('. '),
              [...joined, ...left],
              { field: 'history', oldDate: String(dateKey || '').trim() }
            );
          }

          timelineNotes.forEach((note, noteIndex) => {
            addRelationshipEvent(
              dateKey,
              `${relLabel} Timeline Note${timelineNotes.length > 1 ? ` ${noteIndex + 1}` : ''}`,
              note,
              [],
              { field: 'history', oldDate: String(dateKey || '').trim() },
              ['timeline-note'],
              { field: 'history-note', date: String(dateKey || '').trim(), oldText: note }
            );
          });
        });
      });

      merged.sort((a, b) => {
        const pa = this.parseTimelineDateParts(a?.date || '');
        const pb = this.parseTimelineDateParts(b?.date || '');
        if (!pa && !pb) return 0;
        if (!pa) return 1;
        if (!pb) return -1;
        if (pa.year !== pb.year) return pa.year - pb.year;
        if (pa.month !== pb.month) return pa.month - pb.month;
        return pa.day - pb.day;
      });

      return merged;
    },
  });
})(window);
