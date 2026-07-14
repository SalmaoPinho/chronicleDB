(function initMrMethodsPrompts(global) {
  const {
    MR_UI_STATE_KEY
  } = global.MR_CONSTANTS || {};

  global.MR_METHODS = global.MR_METHODS || {};

  const FALLBACK_PRESETS = {};

  Object.assign(global.MR_METHODS, {

    async openImagePromptModal(event, index = 0) {
      this.closeAllModals();
      this.imgPromptEvent = event;
      this.imgPromptEventIndex = index;
      this.imgPromptOpen = true;
      this.imgPromptGeneratedText = '';

      // Resolve character tags from the event
      this.imgPromptCharacters = this.timelineCharacterTags(event);
      this.imgPromptExcludedCharacters = [];

      if (this.imgPromptCharacters.length === 1) {
        const charId = this.imgPromptCharacters[0];
        this.imgPromptCharacterPositions = {
          ...this.imgPromptCharacterPositions,
          [charId]: 'center'
        };
      }

      // Reset dynamic fields if needed, or keep from last session (state handles it)
      this.imgPromptActiveActions = {};
      this.imgPromptNewspaperHeadline = event?.title ? `"${event.title.toUpperCase()}"` : '';
      this.imgPromptReferenceYear = String(event ? (this.timelineEventYear(event) || this.activeYear) : this.activeYear);

      // Load presets if not already loaded
      if (!this.imgPromptPresets) {
        await this.loadImagePromptPresets();
      }

      // Ensure portraits are queued/loaded for this specific event
      this.queueTimelinePortraitLoad(this.timelineEventKey(event, index), event);

      this.generateImagePrompt();
    },

    closeImagePromptModal() {
      this.imgPromptOpen = false;
      this.imgPromptEvent = null;
      this.saveUiState();
    },

    async loadImagePromptPresets() {
      this.imgPromptPresetsLoading = true;
      try {
        const resp = await fetch(`${this.backendOrigin()}/api/prompt/presets`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        if (data.ok) {
          this.imgPromptPresets = data.presets || FALLBACK_PRESETS;
        } else {
          this.imgPromptPresets = FALLBACK_PRESETS;
        }
      } catch (err) {
        console.error('Failed to load image prompt presets, using fallbacks:', err);
        this.imgPromptPresets = FALLBACK_PRESETS;
      } finally {
        this.imgPromptPresetsLoading = false;
      }
    },

    toggleImagePromptAction(actionKey) {
      const current = { ...this.imgPromptActiveActions };
      current[actionKey] = !current[actionKey];
      this.imgPromptActiveActions = current;
      this.generateImagePrompt();
    },

    toggleImagePromptCharacter(charId) {
      if (this.imgPromptExcludedCharacters.includes(charId)) {
        this.imgPromptExcludedCharacters = this.imgPromptExcludedCharacters.filter(id => id !== charId);
      } else {
        this.imgPromptExcludedCharacters.push(charId);
      }
      this.generateImagePrompt();
    },

    imgPromptPortraits() {
      const eventPortraits = this.imgPromptEvent ? this.timelinePortraitsForEvent(this.imgPromptEvent, this.imgPromptEventIndex) : [];
      const lookupYear = this.imgPromptReferenceYear || this.activeYear;
      return (this.imgPromptCharacters || []).map(charId => {
        const existing = eventPortraits.find(p => p.characterId === charId);
        // If it exists in the event, and it has a src, use it
        if (existing && existing.src) return existing;
        
        // Otherwise, resolve the closest sync portrait for the reference year
        const fallbackSrc = this.getSyncPortraitSrc(charId, lookupYear) || this.relationshipPortraitForMember(charId, lookupYear) || '';
        return { characterId: charId, src: fallbackSrc };
      });
    },

    availableImagePromptCharacters() {
      const all = Object.keys(this.characterCore || {});
      const current = this.imgPromptCharacters || [];
      return all.filter(id => !current.includes(id)).sort((a, b) => {
        const nameA = this.characterCore[a]?.['short name'] || a;
        const nameB = this.characterCore[b]?.['short name'] || b;
        return nameA.localeCompare(nameB);
      });
    },

    addImagePromptCharacter(charId) {
      if (!charId) return;
      if (!this.imgPromptCharacters.includes(charId)) {
        this.imgPromptCharacters.push(charId);
      }
      this.imgPromptExcludedCharacters = this.imgPromptExcludedCharacters.filter(id => id !== charId);

      // If this is the only character, set its position to center
      if (this.imgPromptCharacters.length === 1) {
        this.imgPromptCharacterPositions = {
          ...this.imgPromptCharacterPositions,
          [charId]: 'center'
        };
      } else {
        if (!this.imgPromptCharacterPositions[charId]) {
          this.imgPromptCharacterPositions = {
            ...this.imgPromptCharacterPositions,
            [charId]: 'auto'
          };
        }
      }

      this.generateImagePrompt();
    },

    removeImagePromptCharacter(charId) {
      this.imgPromptCharacters = (this.imgPromptCharacters || []).filter(id => id !== charId);
      this.imgPromptExcludedCharacters = (this.imgPromptExcludedCharacters || []).filter(id => id !== charId);
      this.generateImagePrompt();
    },

    submitAddImagePromptCharacter() {
      const charId = (this.imgPromptAddCharacterInput || '').trim();
      if (!charId) return;

      const matchedId = Object.keys(this.characterCore || {}).find(id => id.toLowerCase() === charId.toLowerCase());
      const finalId = matchedId || charId;

      this.addImagePromptCharacter(finalId);
      this.imgPromptAddCharacterInput = '';
    },

    generateImagePrompt() {
      if (!this.imgPromptPresets) return;

      const charIds = (this.imgPromptCharacters || []).filter(id => !this.imgPromptExcludedCharacters.includes(id));
      const numChars = charIds.length;
      
      const styles = this.imgPromptPresets.styles || {};
      const backgrounds = this.imgPromptPresets.backgrounds?.presets || [];
      const actions = this.imgPromptPresets.actions?.actions || [];

      // --- Utility: title case a name ---
      const titleCase = (str) => (str || '').replace(/\b\w/g, c => c.toUpperCase());

      // --- Utility: extract visual-only descriptors from narrative fields ---
      // The eyes/hair fields are written in literary character-voice with personality
      // observations, cross-references, and commentary. We need only colors and
      // physical structure for the image AI.

      // Strip narrative phrases that follow a visual descriptor
      const NARRATIVE_NOISE = /,\s*(genuine|expressive|careful|confident|watchful|sharp|present|wide|dark confident|usually|often|always|sometimes|typically|generally|rarely|almost|the kind|meaning|similar|distinct|I have|too much|not supposed|styled to|falls perfectly|same\b|lighter than|similar to|in a way|track rather|that move|voluminous|unapologetically).*$/i;

      const extractVisual = (raw) => {
        if (!raw) return '';
        // Split on sentence boundaries (period, semicolon, em-dash) but NOT regular hyphens
        // which are common in compound words (mid-length, pastel-pink, old-glass)
        let visual = raw.split(/[.;–—]/, 1)[0].trim();
        // Strip narrative commentary after commas
        visual = visual.replace(NARRATIVE_NOISE, '').trim();
        // Remove possessive cross-references like "same as clint's", "same origin as clint's"
        visual = visual.replace(/\bsame\s+(?:origin\s+)?as\s+\w+'s\b/gi, '').trim();
        // Clean trailing commas/spaces/colons
        visual = visual.replace(/[,:\s]+$/, '').trim();
        return visual;
      };

      // Specialized eye color extraction — take only the color portion
      const extractEyeColor = (raw) => {
        if (!raw) return '';
        let result = extractVisual(raw);
        // If result still contains "eye visible" from "one dark brown eye visible", fix it
        result = result.replace(/\b(eye|eyes)\s*(visible|covered|hidden)?\s*$/i, '').trim();
        result = result.replace(/\bone\s+/i, '').trim(); // "one dark brown" → "dark brown"
        // Strip non-color descriptors that might leak through (e.g. "old-glass creek-water")
        result = result.replace(/,\s*[\w-]+[\s-][\w-]*\s*(green|blue|brown|grey|gray|hazel|amber)\b/i, '').trim();
        result = result.replace(/[,\s]+$/, '').trim();
        return result;
      };

      // Specialized hair description — keep color + length + texture, strip commentary
      const extractHairDesc = (raw) => {
        if (!raw) return '';
        let result = extractVisual(raw);
        // Remove "styled to..." or "from every angle" type suffixes
        result = result.replace(/,\s*styled\b.*$/i, '').trim();
        result = result.replace(/[,\s]+$/, '').trim();
        return result;
      };

      // --- Build character appearance string ---
      const getCharAppearance = (id) => {
        if (!this.imgPromptIncludeAppearance) return '';
        const core = this.characterCore?.[id] || {};
        const rawHair = core.hair || '';
        const rawEyes = core.eyes || '';
        const ethnicity = core.ethnicity || '';
        const gender = core.gender || '';

        const parts = [];
        
        // Age (if adapt-age is on)
        if (this.imgPromptAdaptAge) {
          const age = this.characterAgeForYear(id, this.imgPromptReferenceYear || this.activeYear);
          if (age !== null) parts.push(`${age}-year-old`);
        }

        // Ethnicity + gender as a natural phrase
        if (ethnicity && ethnicity !== 'unknown') parts.push(ethnicity);
        if (gender && gender !== 'unknown') parts.push(gender);

        // Clean hair
        const hair = extractHairDesc(rawHair);
        if (hair) {
          parts.push(hair.toLowerCase().endsWith('hair') ? hair : `${hair} hair`);
        }

        // Clean eyes — use specialized eye color extraction
        const eyes = extractEyeColor(rawEyes);
        if (eyes) {
          parts.push(eyes.toLowerCase().endsWith('eyes') ? eyes : `${eyes} eyes`);
        }

        return parts.length ? `, ${parts.join(', ')}` : '';
      };

      // --- Build character name ---
      const getCharName = (id, index) => {
        if (this.imgPromptNaming === 'names') {
          const core = this.characterCore?.[id] || {};
          return titleCase(core['full name'] || core['short name'] || id);
        }
        return `Person ${index + 1}`;
      };

      // --- Positions ---
      const positions = ['on the left', 'in the center', 'on the right'];
      const positionsTwo = ['on the left', 'on the right'];

      // ========== BUILD PROMPT ==========
      const sections = [];

      // 1. SHOT — orientation, type, framing
      const orientation = this.imgPromptOrientation === 'vertical' ? 'Vertical' : (this.imgPromptOrientation === 'horizontal' ? 'Horizontal' : '');
      const type = this.imgPromptType.charAt(0).toUpperCase() + this.imgPromptType.slice(1);
      const framing = this.imgPromptFraming.replace(/-/g, ' ');
      sections.push(`${orientation} ${type} photo, ${framing}, ${numChars || 1} ${numChars === 1 ? 'person' : 'people'}.`);

      // 2. CHARACTERS — name + clean appearance + position
      if (numChars > 0) {
        const hasAnyCustomPos = charIds.some(id => this.imgPromptCharacterPositions?.[id] && this.imgPromptCharacterPositions[id] !== 'auto');
        const positionMap = {
          left: 'on the left',
          center: 'in the center',
          right: 'on the right',
          front: 'in the foreground',
          behind: 'standing in the background'
        };

        const charDescs = charIds.map((id, i) => {
          const name = getCharName(id, i);
          const appearance = getCharAppearance(id);
          
          let pos = null;
          if (hasAnyCustomPos) {
            const customPos = this.imgPromptCharacterPositions?.[id];
            if (customPos && customPos !== 'auto') {
              pos = positionMap[customPos] || customPos;
            }
          } else {
            // Default automatic layout
            pos = numChars <= 3
              ? (numChars === 1 ? 'in the center' : (numChars === 2 ? positionsTwo[i] : positions[i]))
              : null;
          }

          return pos
            ? `${name}${appearance} — ${pos}`
            : `${name}${appearance}`;
        });
        
        if (numChars <= 3) {
          sections.push(`Characters: ${charDescs.join('. ')}.`);
        } else {
          sections.push(`Group of ${numChars}: ${charDescs.join(', ')}.`);
        }
      }

      // 3. ACTIONS
      const selectedActionTexts = [];
      Object.entries(this.imgPromptActiveActions).forEach(([key, active]) => {
        if (active) {
          const preset = actions.find(a => a.key === key);
          if (preset) selectedActionTexts.push(preset.prompt);
        }
      });
      if (this.imgPromptLookingAt && this.imgPromptLookingAt !== 'none') {
        let lookingTarget = this.imgPromptLookingAt;
        if (lookingTarget === 'custom') {
          lookingTarget = this.imgPromptCustomLookingAt;
        }
        if (lookingTarget) {
          selectedActionTexts.push(`looking at ${lookingTarget}`);
        }
      }
      if (this.imgPromptCustomAction) {
        selectedActionTexts.push(this.imgPromptCustomAction);
      }
      if (selectedActionTexts.length) {
        sections.push(`Action: ${selectedActionTexts.join(', ')}.`);
      }

      // 4. SETTING — background + clothing
      const settingParts = [];
      if (this.imgPromptBackground === 'custom') {
        if (this.imgPromptCustomBackground) settingParts.push(this.imgPromptCustomBackground);
      } else {
        const bgPreset = backgrounds.find(b => b.key === this.imgPromptBackground);
        if (bgPreset && bgPreset.description) settingParts.push(bgPreset.description);
      }
      const clothingPresets = this.imgPromptPresets?.clothing?.presets || [];
      const clothPreset = clothingPresets.find(c => c.key === this.imgPromptClothing);
      if (clothPreset && clothPreset.description) settingParts.push(clothPreset.description);
      if (settingParts.length) {
        sections.push(`Setting: ${settingParts.join(' ')}`);
      }

      // 5. CONTEXT — ignore, brief, or full
      if (this.imgPromptEvent?.description && this.imgPromptContextMode !== 'none') {
        const desc = this.plainText(this.imgPromptEvent.description);
        if (this.imgPromptContextMode === 'full') {
          sections.push(`Scene context: ${desc}`);
        } else {
          // 'brief'
          // Extract first 2 meaningful sentences
          const sentences = desc.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 10);
          const brief = sentences.slice(0, 2).join(' ');
          if (brief) {
            sections.push(`Scene context: ${brief}`);
          }
        }
      }

      // 6. MOOD & LIGHTING
      const moodInt = (this.imgPromptMoodIntensity || 5) / 10;
      const lightInt = (this.imgPromptLightingIntensity || 5) / 10;
      
      let moodStr = this.imgPromptMood;
      if (moodInt > 0.8) moodStr = `intensely ${moodStr}`;
      else if (moodInt < 0.3) moodStr = `subtly ${moodStr}`;
      
      let lightStr = this.imgPromptLighting;
      if (lightInt > 0.8) lightStr = `intense ${lightStr}`;
      else if (lightInt < 0.3) lightStr = `dim ${lightStr}`;

      sections.push(`Mood: ${moodStr}. Lighting: ${lightStr}.`);

      // Newspaper Headline Section
      if (this.imgPromptStyle === 'newspaper' && this.imgPromptNewspaperHeadline) {
        let headline = this.imgPromptNewspaperHeadline.trim();
        if (headline) {
          if (!/^["'].*["']$/.test(headline)) {
            headline = `"${headline}"`;
          }
          sections.push(headline);
        }
      }

      // 7. STYLE
      const stylePreset = (styles.styles || []).find(s => s.key === this.imgPromptStyle);
      const styleParts = [];
      if (stylePreset) {
        let suffix = stylePreset.suffix;
        if (this.imgPromptStyle === 'newspaper') {
          // Resolve event date
          const dateStr = this.imgPromptEvent?.date || `${this.imgPromptReferenceYear || this.activeYear}-01-01`;
          const parts = dateStr.split('-');
          let formattedDate = dateStr;
          if (parts.length === 3) {
            const months = [
              "January", "February", "March", "April", "May", "June",
              "July", "August", "September", "October", "November", "December"
            ];
            const year = parts[0];
            const monthIdx = parseInt(parts[1], 10) - 1;
            const day = parseInt(parts[2], 10);
            if (monthIdx >= 0 && monthIdx < 12) {
              formattedDate = `${months[monthIdx]} ${day}, ${year}`;
            }
          }
          suffix = suffix.replace("top page header text", `top page header text displaying the date "${formattedDate}"`);
        } else if (this.imgPromptStyle === 'cctv') {
          const dateStr = this.imgPromptEvent?.date || `${this.imgPromptReferenceYear || this.activeYear}-01-01`;
          const timestamp = `${dateStr} 04:18:22`;
          suffix = suffix.replace(
            "visible timestamp overlay in corner (white monospace text)",
            `visible timestamp overlay in corner reading "${timestamp}" in white monospace text`
          );
        }
        styleParts.push(suffix);
      }
      if (this.imgPromptMotionBlur) {
        styleParts.push("mid-motion blur around the subject(s)");
      }
      if (this.imgPromptType === 'far away shot') {
        styleParts.push("unnoticed candid photograph, subject is minding their own business and not looking at the camera, shot taken from a hidden vantage point behind a foreground object, heavily zoomed in with a telephoto lens, voyeuristic perspective");
      }
      if (styleParts.length) {
        sections.push(`Style: ${styleParts.join(', ')}`);
      }

      // 8. EXTRA INSTRUCTIONS
      if (this.imgPromptExtraInstructions) {
        sections.push(this.imgPromptExtraInstructions);
      }

      // 9. CONSTRAINTS — concise, structured
      const constraints = [];
      if (this.imgPromptAdaptAge) {
        constraints.push('Adapt hairstyles and facial features to reflect character ages while keeping core identity from references.');
      } else {
        constraints.push('Match hair, eye color, and facial features exactly to each character\'s reference portrait.');
      }
      constraints.push('Preserve character accessories (masks, goggles, helmets) exactly as shown in references.');
      constraints.push(`Exactly ${numChars || 1} ${numChars === 1 ? 'person' : 'people'}, no extra limbs, no duplicated faces.`);
      sections.push(constraints.join(' '));

      // 10. ASPECT RATIO
      if (this.imgPromptAspectRatio && this.imgPromptAspectRatio !== 'auto') {
        sections.push(`--ar ${this.imgPromptAspectRatio}`);
      }

      this.imgPromptGeneratedText = sections.join('\n');
    },

    async copyImagePrompt(includeMedia = false) {
      let text = this.imgPromptGeneratedText;
      if (!text) return;

      if (includeMedia) {
        const portraits = this.imgPromptPortraits()
          .filter(p => !this.imgPromptExcludedCharacters.includes(p.characterId));
        const urls = portraits.map(p => {
          const lookupYear = this.imgPromptReferenceYear || this.activeYear;
          const src = p.src || (p.characterId ? this.relationshipPortraitForMember(p.characterId, lookupYear) : '');
          if (!src) return null;
          // Ensure it's an absolute URL
          const base = this.backendOrigin ? this.backendOrigin() : '';
          return src.startsWith('http') ? src : `${base}/${src}`;
        }).filter(Boolean);

        if (urls.length) {
          text = urls.join(' ') + '\n\n' + text;
        }
      }

      try {
        await navigator.clipboard.writeText(text);
        const originalText = this.imgPromptGeneratedText;
        this.imgPromptGeneratedText = 'COPIED TO CLIPBOARD!';
        setTimeout(() => {
          if (this.imgPromptGeneratedText === 'COPIED TO CLIPBOARD!') {
            this.imgPromptGeneratedText = originalText;
          }
        }, 1500);
      } catch (err) {
        console.error('Failed to copy prompt:', err);
      }
    },

    async getPortraitBlob(portrait) {
      let src = portrait.src;
      const lookupYear = this.imgPromptReferenceYear || this.activeYear;
      if (!src && portrait.characterId) {
        // Try sync lookup from global index/manifest
        src = this.getSyncPortraitSrc(portrait.characterId, lookupYear);
      }
      if (!src && portrait.characterId) {
        // Fallback to relationship cache (which might be empty/async)
        src = this.relationshipPortraitForMember(portrait.characterId, lookupYear);
      }
      if (!src) return null;
      const base = this.backendOrigin ? this.backendOrigin() : '';
      const url = src.startsWith('http') ? src : `${base}/${src}`;

      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = url;
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = () => reject(new Error('Failed to load image for clipboard'));
        });

        // Downscale to max 1024px to keep file size well under 4MB limit for Windows Clipboard History
        const MAX_DIM = 1024;
        let w = img.width;
        let h = img.height;
        if (w > MAX_DIM || h > MAX_DIM) {
          if (w > h) {
            h = Math.round((h * MAX_DIM) / w);
            w = MAX_DIM;
          } else {
            w = Math.round((w * MAX_DIM) / h);
            h = MAX_DIM;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);

        return new Promise((resolve) => {
          canvas.toBlob((blob) => {
            resolve(blob);
          }, 'image/png');
        });
      } catch (err) {
        console.error('Failed to generate blob for portrait:', src, err);
        return null;
      }
    },

    async copyPortraitImage(portrait, silent = false) {
      try {
        const blob = await this.getPortraitBlob(portrait);
        if (!blob) throw new Error('Blob generation failed');

        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]);

        if (!silent) {
          // Temporary feedback
          const originalText = this.imgPromptGeneratedText;
          this.imgPromptGeneratedText = `COPIED ${this.characterCore?.[portrait.characterId]?.['short name'] || 'PORTRAIT'}!`;
          setTimeout(() => {
            if (this.imgPromptGeneratedText.startsWith('COPIED')) {
              this.imgPromptGeneratedText = originalText;
            }
          }, 1000);
        }
      } catch (err) {
        console.error('Image copying failed:', err);
        if (!silent) {
          const lookupYear = this.imgPromptReferenceYear || this.activeYear;
          let src = portrait.src || (portrait.characterId ? this.getSyncPortraitSrc(portrait.characterId, lookupYear) : '');
          const base = this.backendOrigin ? this.backendOrigin() : '';
          const url = src.startsWith('http') ? src : `${base}/${src}`;
          try { await navigator.clipboard.writeText(url); } catch (e) {}
        }
      }
    },

    async copyAllSequential() {
      const portraits = this.imgPromptPortraits()
        .filter(p => !this.imgPromptExcludedCharacters.includes(p.characterId));
      const originalPrompt = this.imgPromptGeneratedText;
      
      this.imgPromptGeneratedText = 'PREPARING BATCH COPY...';
      
      try {
        // 1. Preload all blobs sequentially first to eliminate network latency from the clipboard loop
        const itemsToCopy = [];
        for (let i = 0; i < portraits.length; i++) {
          const p = portraits[i];
          const name = this.characterCore?.[p.characterId]?.['short name'] || p.characterId;
          this.imgPromptGeneratedText = `PREPARING ${i+1}/${portraits.length}: ${name}...`;
          
          const blob = await this.getPortraitBlob(p);
          if (blob) {
            itemsToCopy.push({ name, blob });
          }
        }

        // Helper to ensure window focus before attempting to write to clipboard
        const ensureFocus = async () => {
          if (document.hasFocus()) return;
          
          const previousStatus = this.imgPromptGeneratedText;
          this.imgPromptGeneratedText = '⚠️ CLICK WINDOW TO FOCUS & RESUME COPY ⚠️';
          
          await new Promise((resolve) => {
            const handleFocus = () => {
              window.removeEventListener('focus', handleFocus);
              document.removeEventListener('click', handleFocus);
              resolve();
            };
            window.addEventListener('focus', handleFocus);
            document.addEventListener('click', handleFocus);
          });
          
          // Give browser a moment to register activation and focus
          await new Promise(r => setTimeout(r, 300));
          this.imgPromptGeneratedText = previousStatus;
        };
        
        // 2. Sequentially write each preloaded blob to the clipboard with a solid delay
        for (let i = 0; i < itemsToCopy.length; i++) {
          const item = itemsToCopy[i];
          this.imgPromptGeneratedText = `COPYING IMAGE ${i+1}/${itemsToCopy.length}: ${item.name}...`;
          
          let success = false;
          let attempts = 0;
          while (!success && attempts < 2) {
            attempts++;
            await ensureFocus();
            
            try {
              await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': item.blob })
              ]);
              success = true;
            } catch (writeErr) {
              console.warn(`Clipboard write attempt ${attempts} failed for ${item.name}:`, writeErr);
              if (writeErr.name === 'NotAllowedError' && attempts < 2) {
                // Force a click authorization prompt even if document thinks it has focus
                const previousStatus = this.imgPromptGeneratedText;
                this.imgPromptGeneratedText = '⚠️ CLICK WINDOW TO AUTHORIZE NEXT COPY ⚠️';
                await new Promise((resolve) => {
                  const handleFocus = () => {
                    window.removeEventListener('focus', handleFocus);
                    document.removeEventListener('click', handleFocus);
                    resolve();
                  };
                  window.addEventListener('focus', handleFocus);
                  document.addEventListener('click', handleFocus);
                });
                await new Promise(r => setTimeout(r, 300));
                this.imgPromptGeneratedText = previousStatus;
              } else {
                // If it's a different error or we exceeded attempts, log and proceed so the batch doesn't abort
                console.error(`Failed to copy portrait ${item.name} after ${attempts} attempts:`, writeErr);
                break;
              }
            }
          }
          
          // Wait 600ms to let the OS Clipboard History catch it before overwriting
          await new Promise(r => setTimeout(r, 600));
        }
        
        // 3. Finally copy the prompt
        this.imgPromptGeneratedText = 'COPYING FINAL PROMPT...';
        let promptCopied = false;
        let promptAttempts = 0;
        while (!promptCopied && promptAttempts < 2) {
          promptAttempts++;
          await ensureFocus();
          
          try {
            await navigator.clipboard.writeText(originalPrompt);
            promptCopied = true;
          } catch (writeErr) {
            console.warn(`Clipboard writeText attempt ${promptAttempts} failed for prompt:`, writeErr);
            if (writeErr.name === 'NotAllowedError' && promptAttempts < 2) {
              const previousStatus = this.imgPromptGeneratedText;
              this.imgPromptGeneratedText = '⚠️ CLICK WINDOW TO AUTHORIZE PROMPT COPY ⚠️';
              await new Promise((resolve) => {
                const handleFocus = () => {
                  window.removeEventListener('focus', handleFocus);
                  document.removeEventListener('click', handleFocus);
                  resolve();
                };
                window.addEventListener('focus', handleFocus);
                document.addEventListener('click', handleFocus);
              });
              await new Promise(r => setTimeout(r, 300));
              this.imgPromptGeneratedText = previousStatus;
            } else {
              break;
            }
          }
        }
        
        // Final feedback
        this.imgPromptGeneratedText = 'COPIED EVERYTHING SUCCESSFULLY!';
        setTimeout(() => {
          if (this.imgPromptGeneratedText === 'COPIED EVERYTHING SUCCESSFULLY!') {
            this.imgPromptGeneratedText = originalPrompt;
          }
        }, 2500);
      } catch (err) {
        console.error('Sequential copy failed:', err);
        this.imgPromptGeneratedText = 'BATCH COPY FAILED';
        setTimeout(() => { this.imgPromptGeneratedText = originalPrompt; }, 2000);
      }
    },

    async copyMissingPortraitPrompt(characterId, event, domEvent) {
      const core = this.characterCore?.[characterId] || {};
      const gender = core.gender && core.gender !== 'unknown' ? core.gender : 'person';
      const fullName = core['full name'] || characterId;
      
      const yearStr = event.date ? event.date.substring(0, 4) : this.activeYear;
      const year = parseInt(yearStr, 10);
      let ageStr = '';
      if (!isNaN(year)) {
        const age = this.characterAgeForYear(characterId, year);
        if (age !== null && age !== undefined) {
          ageStr = `${age}-year-old `;
        }
      }
      
      const ethnicity = core.ethnicity && core.ethnicity !== 'unknown' ? core.ethnicity + ' ' : '';

      let decadeStr = '';
      if (!isNaN(year)) {
        const decade = Math.floor(year / 10) * 10;
        decadeStr = `, in the style of the ${decade}s`;
      }
      
      const prompt = `A vertical photo, head to waist, of a ${ageStr}${ethnicity}${gender} called ${fullName}${decadeStr}`;
      
      try {
        await navigator.clipboard.writeText(prompt);
        if (domEvent && domEvent.currentTarget) {
          const btn = domEvent.currentTarget;
          const oldHtml = btn.innerHTML;
          btn.innerHTML = `<span style="font-size:0.6rem; color:var(--accent);">COPIED</span>`;
          setTimeout(() => {
            btn.innerHTML = oldHtml;
          }, 1500);
        }
      } catch (err) {
        console.error('Failed to copy missing portrait prompt:', err);
      }
    },

    saveCustomImgPromptPreset(name) {
      const presetName = (name || this.imgPromptNewPresetName || '').trim();
      if (!presetName) return;

      const preset = {
        imgPromptNaming: this.imgPromptNaming,
        imgPromptOrientation: this.imgPromptOrientation,
        imgPromptType: this.imgPromptType,
        imgPromptFraming: this.imgPromptFraming,
        imgPromptBackground: this.imgPromptBackground,
        imgPromptClothing: this.imgPromptClothing,
        imgPromptCustomBackground: this.imgPromptCustomBackground,
        imgPromptActiveActions: { ...this.imgPromptActiveActions },
        imgPromptCustomAction: this.imgPromptCustomAction,
        imgPromptMood: this.imgPromptMood,
        imgPromptLighting: this.imgPromptLighting,
        imgPromptStyle: this.imgPromptStyle,
        imgPromptIncludeAppearance: this.imgPromptIncludeAppearance,
        imgPromptIncludeContext: this.imgPromptIncludeContext,
        imgPromptExtraInstructions: this.imgPromptExtraInstructions,
        imgPromptMoodIntensity: this.imgPromptMoodIntensity,
        imgPromptLightingIntensity: this.imgPromptLightingIntensity,
        imgPromptAdaptAge: this.imgPromptAdaptAge,
        imgPromptMotionBlur: this.imgPromptMotionBlur,
        imgPromptAspectRatio: this.imgPromptAspectRatio,
        imgPromptCharacterPositions: { ...this.imgPromptCharacterPositions },
        imgPromptNewspaperHeadline: this.imgPromptNewspaperHeadline
      };

      const updated = { ...(this.imgPromptSavedPresets || {}) };
      updated[presetName] = preset;
      this.imgPromptSavedPresets = updated;

      try {
        window.localStorage.setItem('mr.img_prompt_saved_presets', JSON.stringify(updated));
      } catch (err) {
        console.error('Failed to save preset to localStorage:', err);
      }

      this.imgPromptNewPresetName = '';
      this.generateImagePrompt();
    },

    loadCustomImgPromptPreset(name) {
      if (!name || !this.imgPromptSavedPresets) return;
      const preset = this.imgPromptSavedPresets[name];
      if (!preset) return;

      if (preset.imgPromptNaming !== undefined) this.imgPromptNaming = preset.imgPromptNaming;
      if (preset.imgPromptOrientation !== undefined) this.imgPromptOrientation = preset.imgPromptOrientation;
      if (preset.imgPromptType !== undefined) this.imgPromptType = preset.imgPromptType;
      if (preset.imgPromptFraming !== undefined) this.imgPromptFraming = preset.imgPromptFraming;
      if (preset.imgPromptBackground !== undefined) this.imgPromptBackground = preset.imgPromptBackground;
      if (preset.imgPromptClothing !== undefined) this.imgPromptClothing = preset.imgPromptClothing;
      if (preset.imgPromptCustomBackground !== undefined) this.imgPromptCustomBackground = preset.imgPromptCustomBackground;
      if (preset.imgPromptActiveActions !== undefined) this.imgPromptActiveActions = { ...preset.imgPromptActiveActions };
      if (preset.imgPromptCustomAction !== undefined) this.imgPromptCustomAction = preset.imgPromptCustomAction;
      if (preset.imgPromptMood !== undefined) this.imgPromptMood = preset.imgPromptMood;
      if (preset.imgPromptLighting !== undefined) this.imgPromptLighting = preset.imgPromptLighting;
      if (preset.imgPromptStyle !== undefined) this.imgPromptStyle = preset.imgPromptStyle;
      if (preset.imgPromptIncludeAppearance !== undefined) this.imgPromptIncludeAppearance = preset.imgPromptIncludeAppearance;
      if (preset.imgPromptIncludeContext !== undefined) this.imgPromptIncludeContext = preset.imgPromptIncludeContext;
      if (preset.imgPromptExtraInstructions !== undefined) this.imgPromptExtraInstructions = preset.imgPromptExtraInstructions;
      if (preset.imgPromptMoodIntensity !== undefined) this.imgPromptMoodIntensity = Number(preset.imgPromptMoodIntensity);
      if (preset.imgPromptLightingIntensity !== undefined) this.imgPromptLightingIntensity = Number(preset.imgPromptLightingIntensity);
      if (preset.imgPromptAdaptAge !== undefined) this.imgPromptAdaptAge = preset.imgPromptAdaptAge;
      if (preset.imgPromptMotionBlur !== undefined) this.imgPromptMotionBlur = preset.imgPromptMotionBlur;
      if (preset.imgPromptAspectRatio !== undefined) this.imgPromptAspectRatio = preset.imgPromptAspectRatio;
      if (preset.imgPromptCharacterPositions !== undefined) this.imgPromptCharacterPositions = { ...preset.imgPromptCharacterPositions };
      if (preset.imgPromptNewspaperHeadline !== undefined) this.imgPromptNewspaperHeadline = preset.imgPromptNewspaperHeadline;

      this.generateImagePrompt();
    },

    deleteCustomImgPromptPreset(name) {
      if (!name || !this.imgPromptSavedPresets) return;
      const updated = { ...(this.imgPromptSavedPresets || {}) };
      delete updated[name];
      this.imgPromptSavedPresets = updated;

      try {
        window.localStorage.setItem('mr.img_prompt_saved_presets', JSON.stringify(updated));
      } catch (err) {
        console.error('Failed to delete preset from localStorage:', err);
      }
    },

    openSillyTavernModal(event, index = 0) {
      this.closeAllModals();
      this.sillyTavernEvent = event;
      this.sillyTavernEventIndex = index;
      this.sillyTavernOpen = true;
      this.sillyTavernGeneratedPrompt = '';
      this.sillyTavernTab = 'prompt';
      this.sillyTavernPastedJson = '';
      this.sillyTavernFinalizedJson = '';
      this.sillyTavernError = '';

      // Ensure relationships are loaded
      if (!this.relationships || !this.relationships.length) {
        try {
          this.loadRelationships();
        } catch (err) {
          console.error('Failed to load relationships:', err);
        }
      }

      // Get character tags from the current event
      const tags = this.timelineCharacterTags(event) || [];
      this.sillyTavernCharacters = tags;

      // Select first character by default
      if (tags.length > 0) {
        this.sillyTavernSelectedChar = tags[0];
        this.loadSillyTavernCharacterData(tags[0]);
      } else {
        this.sillyTavernSelectedChar = '';
        this.sillyTavernSelectedCharB64 = '';
      }
    },

    closeSillyTavernModal() {
      this.sillyTavernOpen = false;
      this.sillyTavernEvent = null;
      this.sillyTavernSelectedChar = '';
      this.sillyTavernSelectedCharB64 = '';
      this.sillyTavernGeneratedPrompt = '';
      this.sillyTavernTab = 'prompt';
      this.sillyTavernPastedJson = '';
      this.sillyTavernFinalizedJson = '';
      this.sillyTavernError = '';
    },

    async selectSillyTavernCharacter(charId) {
      await this.loadSillyTavernCharacterData(charId);
    },

    async getPortraitBase64(portrait) {
      let src = portrait.src;
      if (!src && portrait.characterId) {
        src = this.getSyncPortraitSrc(portrait.characterId, this.activeYear);
      }
      if (!src && portrait.characterId) {
        src = this.relationshipPortraitForMember(portrait.characterId, this.activeYear);
      }
      if (!src) return null;
      const base = this.backendOrigin ? this.backendOrigin() : '';
      const url = src.startsWith('http') ? src : `${base}/${src}`;

      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = url;
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = () => reject(new Error('Failed to load image for base64 conversion'));
        });

        // Downscale to max 400px to keep JSON extremely compact and optimized for SillyTavern imports!
        const MAX_DIM = 400;
        let w = img.width;
        let h = img.height;
        if (w > MAX_DIM || h > MAX_DIM) {
          if (w > h) {
            h = Math.round((h * MAX_DIM) / w);
            w = MAX_DIM;
          } else {
            w = Math.round((w * MAX_DIM) / h);
            h = MAX_DIM;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);

        return canvas.toDataURL('image/png');
      } catch (err) {
        console.error('Failed to generate base64 for portrait:', src, err);
        return null;
      }
    },

    async loadSillyTavernCharacterData(charId) {
      this.sillyTavernSelectedChar = charId;
      this.sillyTavernSelectedCharB64 = '';
      this.generateSillyTavernPrompt();

      const portraits = this.timelinePortraitsForEvent(this.sillyTavernEvent, this.sillyTavernEventIndex) || [];
      const portrait = portraits.find(p => p.characterId === charId) || { characterId: charId };

      try {
        const b64 = await this.getPortraitBase64(portrait);
        if (b64 && this.sillyTavernSelectedChar === charId) {
          this.sillyTavernSelectedCharB64 = b64;
          this.generateSillyTavernPrompt();
        }
      } catch (err) {
        console.error('Failed to async load SillyTavern portrait:', err);
      }
    },

    generateSillyTavernPrompt() {
      if (!this.sillyTavernEvent || !this.sillyTavernSelectedChar) {
        this.sillyTavernGeneratedPrompt = '';
        return;
      }

      const charId = this.sillyTavernSelectedChar;
      const core = this.characterCore?.[charId] || {};
      const fullName = core['full name'] || core['short name'] || charId;
      const shortName = core['short name'] || charId;
      const age = this.characterAgeAtDate(charId, this.sillyTavernEvent.date) ?? 'Unknown';
      const gender = core.gender || 'Unknown';
      const hair = core.hair || 'Unknown';
      const eyes = core.eyes || 'Unknown';
      const ethnicity = core.ethnicity || 'Unknown';
      const bio = core.bio || core.appearance || 'No profile dossier details.';

      // 1. Context: preceding events for this character
      const allEvents = [...(this.injectedTimelineEvents || [])];
      allEvents.sort((a, b) => {
        const pa = this.parseTimelineDateParts(a.date);
        const pb = this.parseTimelineDateParts(b.date);
        if (!pa && !pb) return 0;
        if (!pa) return 1;
        if (!pb) return -1;
        return this.compareTimelineDateParts(pa, pb);
      });

      const eventIdx = allEvents.findIndex(e => e.id === this.sillyTavernEvent.id || (e.date === this.sillyTavernEvent.date && e.title === this.sillyTavernEvent.title));
      let precedingEvents = [];
      if (eventIdx !== -1) {
        precedingEvents = allEvents.slice(0, eventIdx);
      } else {
        const targetParts = this.parseTimelineDateParts(this.sillyTavernEvent.date);
        precedingEvents = allEvents.filter(ev => {
          const p = this.parseTimelineDateParts(ev.date);
          return this.compareTimelineDateParts(p, targetParts) < 0;
        });
      }

      const contextEntries = precedingEvents.filter(ev => {
        const evTags = this.timelineCharacterTags(ev) || [];
        return evTags.includes(charId);
      });

      const maxContextEntries = 15;
      const compactContextEntries = contextEntries.slice(-maxContextEntries);

      const contextText = compactContextEntries.map(e => {
        const d = this.formatTimelineDate(e.date);
        const t = this.plainText(e.title);
        const desc = this.plainText(e.description);
        return `- Date: ${d} | Title: ${t}\n  Description: ${desc}`;
      }).join('\n\n');

      // 2. Resolve relationships involving this character from relationship Markdown models
      const characterRelationships = [];
      const eventParts = this.parseTimelineDateParts(this.sillyTavernEvent.date);

      (this.relationships || []).forEach(r => {
        if (r.members && r.members.includes(charId)) {
          const partnerId = r.members.find(m => m !== charId);
          if (!partnerId) return;

          const titleCase = (str) => (str || '').replace(/\b\w/g, c => c.toUpperCase());
          const partnerName = titleCase(this.characterCore?.[partnerId]?.['full name'] || this.characterCore?.[partnerId]?.['short name'] || partnerId);
          const partnerShort = titleCase(this.characterCore?.[partnerId]?.['short name'] || partnerId);
          
          let category = 'Relationship';
          if (r.__source) {
            const matches = r.__source.match(/relationships\/(\w+)\.md/i);
            if (matches && matches[1]) {
              category = matches[1].charAt(0).toUpperCase() + matches[1].slice(1);
            }
          }

          const filteredHistory = [];
          if (r.history) {
            Object.entries(r.history).forEach(([hDate, hNotes]) => {
              const hParts = this.parseTimelineDateParts(hDate);
              if (hParts && this.compareTimelineDateParts(hParts, eventParts) <= 0) {
                hNotes.forEach(note => {
                  filteredHistory.push(`  - [${hDate}] ${this.plainText(note)}`);
                });
              }
            });
          }

          const relBlock = [];
          relBlock.push(`- **Partner**: ${partnerName} (${partnerShort} | ID: ${partnerId})`);
          relBlock.push(`  **Category**: ${category}`);
          if (r.label) relBlock.push(`  **Status**: ${this.plainText(r.label)}`);
          if (filteredHistory.length > 0) {
            relBlock.push(`  **History / Past Events**:\n${filteredHistory.join('\n')}`);
          }
          characterRelationships.push(relBlock.join('\n'));
        }
      });

      const relationshipText = characterRelationships.length > 0
        ? characterRelationships.join('\n\n')
        : 'No recorded relationships for this character at this point.';

      const dateStr = this.formatTimelineDate(this.sillyTavernEvent.date);
      const titleStr = this.plainText(this.sillyTavernEvent.title);
      const synopsisStr = this.plainText(this.sillyTavernEvent.description);

      const prompt = `You are a professional SillyTavern Character Card Creator.
Your task is to generate a complete, high-fidelity SillyTavern Character Card JSON in **chara_card_v3** specification format for the character **${fullName}** (ID: ${charId}).

The character must be anchored chronologically at a specific moment in the timeline: **${dateStr}**.
Their personality, knowledge, active scenario, emotional state, and first message MUST reflect this exact chronological point in the story. They have no knowledge of any future events beyond this date.

Here is the exact character dossier and narrative context at this point in time:

### CHARACTER PROFILE
- **ID / Tag**: ${charId}
- **Short Name**: ${shortName}
- **Full Name**: ${fullName}
- **Gender**: ${gender}
- **Age at Scene**: ${age} years old
- **Physical Features**: Hair: ${hair} | Eyes: ${eyes} | Ethnicity: ${ethnicity}

### THE ANCHOR EVENT (The moment of the First Message)
- **Date**: ${dateStr}
- **Event / Scene**: ${titleStr}
- **Synopsis**: ${synopsisStr}

### PRECEDING NARRATIVE CONTEXT
This is the chronological list of past events in which ${shortName} participated. Use this to construct their background knowledge, memories, relationships, and emotional scars up to this point in time:
${contextText || '- No preceding events recorded.'}

### ACTIVE RELATIONSHIPS
These are the recorded relationships involving ${shortName} at this point in time, including relevant history:
${relationshipText}

### DOSSIER AND CHARACTER PROFILE DETAILS
${bio}

---

### INSTRUCTIONS FOR GENERATING THE CHARA_CARD_V3 JSON
You must output a single, complete, valid JSON object in **chara_card_v3** specification format.
Do NOT wrap the JSON in markdown code blocks. Start directly with '{' and end with '}'.

Here is the exact schema and guidelines you must follow:
{
    "spec": "chara_card_v3",
    "spec_version": "3.0",
    "data": {
        "name": "${shortName}",
        "description": "Write a highly detailed, premium description of ${fullName}'s personality, physical appearance, quirks, and general behavior. Avoid writing them as dry, clinical case files or database logs; instead, frame their traits as active human dynamics, showing how they use wit, sarcasm, or distinct personality ticks to deflect, tease, or banter. Keep the character fun, expressive, and highly responsive in active chat.",
        "personality": "Write a concise summary of their traits, mental state, and typical speech style. Emphasize their conversational hooks and how they display their emotions/wit dynamically.",
        "scenario": "Describe the current situation based on the Anchor Event: ${titleStr}. Detail the immediate environment, ${shortName}'s immediate goals, and the starting context for interaction.",
        "first_mes": "Write a high-fidelity starting message (2-3 paragraphs) that starts exactly at the Anchor Event. ${shortName} must talk to {{user}} in first person, initiating dialogue that is direct, snappy, and full of character. Ensure there is a strong conversational hook that sparks immediate banter or interesting interaction. Keep narration active, emphasizing expressive gestures, physical comedy, or physical reactions rather than long, depressing moping. Include action beats in asterisks.",
        "mes_example": "Provide 2-3 short example dialogues showing how ${shortName} speaks, capturing their unique tone, wit, and conversational style. Write them as snappy, engaging exchanges rather than dry or purely anti-social monologue blocks.",
        "creator_notes": "Generated for Ashford & Fairmount Character Manager.",
        "system_prompt": "You are roleplaying as ${shortName}. Speak in a dry, clever, and engaging voice. Keep the narration brief, active, and focused on physical actions, expression, and snappy pacing. Do not write long, repetitive paragraphs about internal trauma, depression, or write thoughts as clinical computer files/logs. Mask any internal stress with dry, competent humor, fast-talking sarcasm, and playful banter. Keep sentences declarative and sharp.",
        "post_history_instructions": "mixed perspective: first person for character dialogue, third person for entry/description.",
        "tags": ["ashford", "${charId}", "${gender.toLowerCase()}"],
        "creator": "Ashford AI",
        "character_version": "1.0",
        "avatar": "%AVATAR_PLACEHOLDER%",
        "alternate_greetings": [],
        "extensions": {
            "fav": false,
            "talkativeness": "0.5",
            "depth_prompt": {
                "prompt": "[Roleplay Instructions: You are portraying ${shortName}. Keep narration brief, active, and focused on physical actions and snappy pacing. Avoid long, depressing internal monologues or clinical, computer-like narratives. Play up their witty, expressive, and conversational side, ensuring they engage in playful banter, snarky teasing, or dynamic physical reactions. Keep the roleplay fun, responsive, and snappy.]",
                "depth": 4,
                "role": "system"
            }
        }
    }
}

Strictly adhere to the story's facts. Ensure that the first_mes and scenario are strictly grounded in:
Date: ${dateStr}
Scene: ${titleStr}
Synopsis: ${synopsisStr}

Ensure the output is 100% valid JSON. Do not add any text before or after the JSON block.`;

      this.sillyTavernGeneratedPrompt = prompt;
    },

    async copySillyTavernPrompt() {
      if (!this.sillyTavernGeneratedPrompt) return;
      try {
        await navigator.clipboard.writeText(this.sillyTavernGeneratedPrompt);
        const originalText = this.sillyTavernGeneratedPrompt;
        this.sillyTavernGeneratedPrompt = 'COPIED TO CLIPBOARD SUCCESSFULLY!';
        setTimeout(() => {
          if (this.sillyTavernGeneratedPrompt === 'COPIED TO CLIPBOARD SUCCESSFULLY!') {
            this.sillyTavernGeneratedPrompt = originalText;
          }
        }, 1500);
      } catch (err) {
        console.error('Failed to copy SillyTavern prompt:', err);
      }
    },

    finalizeSillyTavernCard() {
      const rawText = (this.sillyTavernPastedJson || '').trim();
      if (!rawText) {
        this.sillyTavernFinalizedJson = '';
        this.sillyTavernError = '';
        return;
      }

      // Locate first JSON block in the text to avoid surrounding commentary
      let jsonText = rawText;
      const firstCurly = rawText.indexOf('{');
      const lastCurly = rawText.lastIndexOf('}');
      if (firstCurly !== -1 && lastCurly !== -1 && lastCurly > firstCurly) {
        jsonText = rawText.substring(firstCurly, lastCurly + 1);
      }

      // Pre-parser/sanitizer to handle unescaped quotes inside JSON string values
      const sanitizeJsonString = (raw) => {
        let result = '';
        let inString = false;
        let i = 0;
        const stack = [];
        while (i < raw.length) {
          const char = raw[i];
          if (!inString) {
            result += char;
            if (char === '{') {
              stack.push('}');
            } else if (char === '[') {
              stack.push(']');
            } else if (char === '}') {
              stack.pop();
            } else if (char === ']') {
              stack.pop();
            } else if (char === '"') {
              inString = true;
            }
          } else {
            if (char === '"') {
              let bsCount = 0;
              let k = i - 1;
              while (k >= 0 && raw[k] === '\\') {
                bsCount++;
                k--;
              }
              if (bsCount % 2 === 1) {
                result += char;
              } else {
                const afterStr = raw.substring(i + 1);
                const trimmed = afterStr.trim();
                let isClosing = false;
                const currentContext = stack[stack.length - 1];
                if (
                  trimmed.startsWith('}') ||
                  trimmed.startsWith(']') ||
                  trimmed.startsWith(',')
                ) {
                  if (trimmed.startsWith(',')) {
                    const afterComma = trimmed.substring(1).trim();
                    if (currentContext === '}') {
                      if (afterComma.startsWith('"')) {
                        isClosing = true;
                      }
                    } else if (currentContext === ']') {
                      if (
                        afterComma.startsWith('"') ||
                        afterComma.startsWith('{') ||
                        afterComma.startsWith('[') ||
                        /^[0-9\-tfn]/.test(afterComma)
                      ) {
                        isClosing = true;
                      }
                    } else {
                      if (
                        afterComma.startsWith('"') ||
                        afterComma.startsWith('{') ||
                        afterComma.startsWith('[') ||
                        /^[0-9\-tfn]/.test(afterComma)
                      ) {
                        isClosing = true;
                      }
                    }
                  } else {
                    isClosing = true;
                  }
                } else if (trimmed.startsWith(':')) {
                  isClosing = true;
                } else if (trimmed === '') {
                  isClosing = true;
                }
                if (isClosing) {
                  inString = false;
                  result += char;
                } else {
                  result += '\\"';
                }
              }
            } else {
              result += char;
            }
          }
          i++;
        }
        return result;
      };

      try {
        const sanitizedJson = sanitizeJsonString(jsonText);
        const parsed = JSON.parse(sanitizedJson);
        
        // Ensure data structures match char_card_v3 spec
        if (parsed.data) {
          // Robust hybrid card handling: migrate top-level character keys if missing in data block
          const topLevelDataKeys = [
            'name', 'description', 'personality', 'scenario', 'first_mes', 'mes_example',
            'creator_notes', 'system_prompt', 'post_history_instructions', 'tags',
            'creator', 'character_version', 'alternate_greetings', 'extensions', 'character_book'
          ];
          topLevelDataKeys.forEach(key => {
            if (parsed[key] !== undefined && parsed.data[key] === undefined) {
              parsed.data[key] = parsed[key];
            }
          });
          parsed.data.avatar = this.sillyTavernSelectedCharB64 || 'none';
        } else {
          // Wrap in data block if AI returned a flat structure (legacy CCv1)
          const dataFields = { ...parsed };
          delete dataFields.spec;
          delete dataFields.spec_version;
          parsed.spec = 'chara_card_v3';
          parsed.spec_version = '3.0';
          parsed.data = dataFields;
          parsed.data.avatar = this.sillyTavernSelectedCharB64 || 'none';
        }

        const titleCase = (str) => {
          if (!str) return '';
          return str.replace(/\b\w/g, c => c.toUpperCase());
        };

        // Standardize name title casing and recommended EdgeTTS voice injection
        if (parsed.data) {
          if (parsed.data.name) {
            parsed.data.name = titleCase(parsed.data.name);
          }
          if (parsed.data.creator) {
            parsed.data.creator = titleCase(parsed.data.creator);
          }

          const gender = (this.characterCore?.[this.sillyTavernSelectedChar]?.gender || '').toLowerCase();
          const voice = gender === 'male' ? 'en-US-ChristopherNeural' : 'en-US-JennyNeural';
          const edgeTtsNote = `[EdgeTTS Voice: ${voice}]`;
          
          let notes = (parsed.data.creator_notes || '').trim();
          if (!notes.includes('EdgeTTS Voice:')) {
            notes = notes ? `${notes}\n\n${edgeTtsNote}` : edgeTtsNote;
          }
          parsed.data.creator_notes = notes;
        }

        // Clean up any stray legacy V1 fields at the top level to pass strict validation
        const standardKeys = ['spec', 'spec_version', 'data', 'create_date'];
        Object.keys(parsed).forEach(key => {
          if (!standardKeys.includes(key)) {
            delete parsed[key];
          }
        });

        this.sillyTavernFinalizedJson = JSON.stringify(parsed, null, 4);
        this.sillyTavernError = '';
      } catch (err) {
        console.error('Failed to parse SillyTavern JSON response:', err);
        this.sillyTavernError = 'Could not parse JSON. Ensure you copied the entire JSON block from the AI.';
        this.sillyTavernFinalizedJson = '';
      }
    },

    downloadSillyTavernCard(format = 'json') {
      if (!this.sillyTavernFinalizedJson) return;
      try {
        const charId = this.sillyTavernSelectedChar || 'character';
        const dateStr = this.sillyTavernEvent?.date || 'date';

        if (format === 'png' && this.sillyTavernSelectedCharB64) {
          const filename = `${charId}_sillytavern_${dateStr}.png`;
          
          // 1. Convert portrait base64 to Uint8Array
          const b64Data = this.sillyTavernSelectedCharB64.split(',')[1];
          const binaryStr = window.atob(b64Data);
          const len = binaryStr.length;
          const pngBytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            pngBytes[i] = binaryStr.charCodeAt(i);
          }
          
          // 2. Base64-encode the finalized JSON card text to fit in metadata
          const jsonText = this.sillyTavernFinalizedJson;
          const base64Json = window.btoa(unescape(encodeURIComponent(jsonText)));
          
          // 3. CRC32 helper function
          const crc32Table = [];
          for (let i = 0; i < 256; i++) {
            let c = i;
            for (let j = 0; j < 8; j++) {
              c = ((c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1));
            }
            crc32Table[i] = c;
          }
          const calculateCrc32 = (buf) => {
            let crc = 0xffffffff;
            for (let i = 0; i < buf.length; i++) {
              crc = (crc >>> 8) ^ crc32Table[(crc ^ buf[i]) & 0xff];
            }
            return (crc ^ 0xffffffff) >>> 0;
          };

          // 4. Inject tEXt chunk with keyword "chara"
          const keyBytes = new TextEncoder().encode('chara');
          const valBytes = new TextEncoder().encode(base64Json);
          const chunkLength = keyBytes.length + 1 + valBytes.length;
          const chunkBytes = new Uint8Array(4 + 4 + chunkLength + 4);
          
          const view = new DataView(chunkBytes.buffer);
          view.setUint32(0, chunkLength, false); // Big endian length
          
          // Write chunk type 'tEXt' (116, 69, 88, 116)
          chunkBytes[4] = 116;
          chunkBytes[5] = 69;
          chunkBytes[6] = 88;
          chunkBytes[7] = 116;
          
          // Write chunk data
          let pos = 8;
          for (let i = 0; i < keyBytes.length; i++) {
            chunkBytes[pos++] = keyBytes[i];
          }
          chunkBytes[pos++] = 0; // null separator
          for (let i = 0; i < valBytes.length; i++) {
            chunkBytes[pos++] = valBytes[i];
          }
          
          // Calculate CRC32 over Chunk Type and Chunk Data
          const crcInput = chunkBytes.slice(4, 4 + 4 + chunkLength);
          const crc = calculateCrc32(crcInput);
          view.setUint32(4 + 4 + chunkLength, crc, false); // Big endian CRC

          // Assemble the new PNG with injected chunk after the IHDR chunk (offset 33)
          const newPngBytes = new Uint8Array(pngBytes.length + chunkBytes.length);
          newPngBytes.set(pngBytes.subarray(0, 33), 0);
          newPngBytes.set(chunkBytes, 33);
          newPngBytes.set(pngBytes.subarray(33), 33 + chunkBytes.length);

          // Trigger download of PNG
          const blob = new Blob([newPngBytes], { type: 'image/png' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        } else {
          // Download JSON
          const filename = `${charId}_sillytavern_${dateStr}.json`;
          const blob = new Blob([this.sillyTavernFinalizedJson], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
      } catch (err) {
        console.error('Failed to download SillyTavern card:', err);
      }
    }

  });
})(window);
