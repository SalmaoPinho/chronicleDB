(function () {
  class UniversalListener {
    constructor(options = {}) {
      this.options = options;
      this.storageKey = String(options.storageKey || "universal-listener");
      this.voiceSelect = options.voiceSelect || null;
      this.speedInput = options.speedInput || null;
      this.speedLabel = options.speedLabel || null;
      this.volumeInput = options.volumeInput || null;
      this.volumeLabel = options.volumeLabel || null;
      this.onProgress = typeof options.onProgress === "function" ? options.onProgress : () => { };
      this.onState = typeof options.onState === "function" ? options.onState : () => { };
      this.getElements = typeof options.getElements === "function"
        ? options.getElements
        : () => [];

      this.elements = [];
      this.isReading = false;
      this.currentIndex = 0;
      this.currentUtterance = null;
      this.currentContextId = "default";
      this._playbackToken = 0;
      this.speed = Number.parseFloat(window.localStorage.getItem(`${this.storageKey}:speed`) || "1") || 1;
      this.volume = Number.parseFloat(window.localStorage.getItem(`${this.storageKey}:volume`) || "1");
      if (isNaN(this.volume) || this.volume < 0 || this.volume > 1) {
        this.volume = 1;
      }
      this.selectedVoice = String(window.localStorage.getItem(`${this.storageKey}:voice`) || "");
      this._pollHandle = null;
    }

    normalizeVoiceKey(value) {
      return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
    }

    resolveLocalVoiceModel(voiceHint, speakerGender = null) {
      const hint = this.normalizeVoiceKey(voiceHint);
      if (!hint) {
        return String(speakerGender || "").toLowerCase() === "male"
          ? "edge:en-US-GuyNeural"
          : "edge:en-US-JennyNeural";
      }

      if (hint.startsWith("local")) {
        const direct = String(voiceHint || "").replace(/^local:/i, "").trim();
        return `local:${direct || "en_US-amy-medium"}`;
      }

      if (hint.startsWith("edge")) {
        const direct = String(voiceHint || "").replace(/^edge:/i, "").trim();
        return `edge:${direct || "en-US-JennyNeural"}`;
      }

      // Map common voice names/hints to Edge TTS voices for browsers that lack them natively
      if (hint.includes("jenny")) return "edge:en-US-JennyNeural";
      if (hint.includes("guy")) return "edge:en-US-GuyNeural";
      if (hint.includes("aria")) return "edge:en-US-AriaNeural";
      if (hint.includes("ana")) return "edge:en-US-AnaNeural";
      if (hint.includes("christopher")) return "edge:en-US-ChristopherNeural";
      if (hint.includes("eric")) return "edge:en-US-EricNeural";
      if (hint.includes("michelle")) return "edge:en-US-MichelleNeural";
      if (hint.includes("roger")) return "edge:en-US-RogerNeural";
      if (hint.includes("steffan")) return "edge:en-US-SteffanNeural";
      if (hint.includes("ava")) return "edge:en-US-AvaNeural";
      if (hint.includes("andrew")) return "edge:en-US-AndrewNeural";
      if (hint.includes("emma")) return "edge:en-US-EmmaNeural";
      if (hint.includes("brian")) return "edge:en-US-BrianNeural";
      if (hint.includes("emily")) return "edge:en-IE-EmilyNeural";
      if (hint.includes("libby")) return "edge:en-GB-LibbyNeural";
      if (hint.includes("thomas")) return "edge:en-GB-ThomasNeural";
      if (hint.includes("neerja")) return "edge:en-IN-NeerjaNeural";
      if (hint.includes("clara")) return "edge:en-CA-ClaraNeural";
      if (hint.includes("sonia")) return "edge:en-GB-SoniaNeural";
      if (hint.includes("maisie")) return "edge:en-GB-MaisieNeural";
      if (hint.includes("ryan")) return "edge:en-GB-RyanNeural";

      if (hint.includes("lessac") || hint.includes("male")) {
        return "edge:en-US-GuyNeural";
      }

      if (
        hint.includes("amy") || hint.includes("ezzine")
      ) {
        return "edge:en-US-JennyNeural";
      }

      return String(speakerGender || "").toLowerCase() === "male"
        ? "edge:en-US-GuyNeural"
        : "edge:en-US-JennyNeural";
    }

    localVoiceOptions() {
      return [
        { value: "edge:en-US-AvaNeural", label: "Edge TTS: Ava (Female)" },
        { value: "edge:en-US-AndrewNeural", label: "Edge TTS: Andrew (Male)" },
        { value: "edge:en-US-EmmaNeural", label: "Edge TTS: Emma (Female)" },
        { value: "edge:en-US-BrianNeural", label: "Edge TTS: Brian (Male)" },
        { value: "edge:en-IE-EmilyNeural", label: "Edge TTS: Emily (Female - Ireland)" },
        { value: "edge:en-GB-LibbyNeural", label: "Edge TTS: Libby (Female - UK)" },
        { value: "edge:en-GB-ThomasNeural", label: "Edge TTS: Thomas (Male - UK)" },
        { value: "edge:en-CA-ClaraNeural", label: "Edge TTS: Clara (Female - Canada)" },
        { value: "edge:en-GB-SoniaNeural", label: "Edge TTS: Sonia (Female - UK)" },
        { value: "edge:en-GB-MaisieNeural", label: "Edge TTS: Maisie (Female - UK)" },
        { value: "edge:en-GB-RyanNeural", label: "Edge TTS: Ryan (Male - UK)" },
        { value: "edge:en-IN-NeerjaNeural", label: "Edge TTS: Neerja (Female - India)" },
        { value: "edge:en-US-JennyNeural", label: "Edge TTS: Jenny (Female)" },
        { value: "edge:en-US-GuyNeural", label: "Edge TTS: Guy (Male)" },
        { value: "edge:en-US-AriaNeural", label: "Edge TTS: Aria (Female)" },
        { value: "edge:en-US-AnaNeural", label: "Edge TTS: Ana (Female)" },
        { value: "edge:en-US-ChristopherNeural", label: "Edge TTS: Christopher (Male)" },
        { value: "edge:en-US-EricNeural", label: "Edge TTS: Eric (Male)" },
        { value: "edge:en-US-MichelleNeural", label: "Edge TTS: Michelle (Female)" },
        { value: "edge:en-US-RogerNeural", label: "Edge TTS: Roger (Male)" },
        { value: "edge:en-US-SteffanNeural", label: "Edge TTS: Steffan (Male)" },
        { value: "local:en_US-amy-medium", label: "Local Piper: Amy" },
        { value: "local:en_US-lessac-medium", label: "Local Piper: Lessac" }
      ];
    }

    init() {
      this.bindVoiceControls();
      this.populateVoices();
      window.speechSynthesis.onvoiceschanged = () => this.populateVoices();
      this._pollHandle = window.setInterval(() => {
        this.populateVoices();
      }, 500);
      window.setTimeout(() => {
        if (this._pollHandle) {
          window.clearInterval(this._pollHandle);
          this._pollHandle = null;
        }
      }, 30000);
      this.syncSpeedUI();
      this.syncVolumeUI();
      this.setState(false);
    }

    refreshVoices() {
      this.populateVoices();
    }

    destroy() {
      this.stop();
      if (this._pollHandle) {
        window.clearInterval(this._pollHandle);
        this._pollHandle = null;
      }
    }

    bindVoiceControls() {
      if (this.speedInput) {
        this.speedInput.value = String(this.speed);
        this.speedInput.addEventListener("input", (event) => {
          const nextSpeed = Number.parseFloat(event.target.value);
          if (!Number.isFinite(nextSpeed)) {
            return;
          }
          this.speed = nextSpeed;
          window.localStorage.setItem(`${this.storageKey}:speed`, String(this.speed));
          this.syncSpeedUI();
          if (this.isReading) {
            this.skipTo(this.currentIndex);
          }
        });
      }

      if (this.volumeInput) {
        this.volumeInput.value = String(Math.round(this.volume * 100));
        this.volumeInput.addEventListener("input", (event) => {
          const nextVol = Number.parseFloat(event.target.value) / 100;
          if (!Number.isFinite(nextVol)) {
            return;
          }
          this.volume = nextVol;
          window.localStorage.setItem(`${this.storageKey}:volume`, String(this.volume));
          this.syncVolumeUI();
          if (this.currentAudio) {
            this.currentAudio.volume = this.volume;
          }
          if (window._universal_listener_active_audio) {
            window._universal_listener_active_audio.volume = this.volume;
          }
        });
      }

      if (this.voiceSelect) {
        this.voiceSelect.addEventListener("change", (event) => {
          this.selectedVoice = String(event.target.value || "");
          window.localStorage.setItem(`${this.storageKey}:voice`, this.selectedVoice);
          if (this.isReading) {
            this.skipTo(this.currentIndex);
          }
        });
      }
    }

    syncSpeedUI() {
      if (this.speedLabel) {
        this.speedLabel.textContent = this.speed.toFixed(1);
      }
    }

    syncVolumeUI() {
      if (this.volumeLabel) {
        this.volumeLabel.textContent = Math.round(this.volume * 100);
      }
      if (this.volumeInput) {
        this.volumeInput.value = String(Math.round(this.volume * 100));
      }
    }

    populateVoices() {
      if (!this.voiceSelect) {
        return;
      }
      const forceLocal = Boolean(this.options.backendOrigin && this.options.forceLocalTTS);
      const allVoices = forceLocal ? [] : window.speechSynthesis.getVoices();
      const voices = forceLocal
        ? []
        : allVoices.filter((voice) => {
            const lang = String(voice.lang || "").toLowerCase();
            const name = String(voice.name || "").toLowerCase();
            return /^en($|[-_])/.test(lang)
              || name.includes("jenny")
              || name.includes("aria");
          });
      if (!voices.length && !forceLocal) {
        if (!this.options.backendOrigin) {
          return;
        }
      }

      const localVoices = this.options.backendOrigin ? this.localVoiceOptions() : [];

      const natural = (voice) => {
        const name = String(voice.name || "").toLowerCase();
        return name.includes("natural")
          || name.includes("online")
          || name.includes("neural")
          || name.includes("google")
          || name.includes("aria")
          || name.includes("premium")
          || name.includes("enhanced");
      };

      const sorted = forceLocal
        ? []
        : voices.sort((a, b) => {
            const aNatural = natural(a);
            const bNatural = natural(b);
            if (aNatural !== bNatural) {
              return aNatural ? -1 : 1;
            }
            return String(a.name || "").localeCompare(String(b.name || ""));
          });

      const hasBrowserVoices = sorted.length > 0;

      const previous = this.voiceSelect.value || this.selectedVoice;
      const browserOptions = forceLocal
        ? ""
        : sorted
          .map((voice) => {
            const label = natural(voice)
              ? `✨ ${voice.name} (High Quality)`
              : String(voice.name || "Voice");
            const selected = String(voice.name || "") === previous ? " selected" : "";
            return `<option value="${voice.name}"${selected}>${label}</option>`;
          })
          .join("");
      const localOptions = localVoices
        .map((voice) => {
          const selected = String(voice.value || "") === previous ? " selected" : "";
          return `<option value="${voice.value}"${selected}>${voice.label}</option>`;
        })
        .join("");
      this.voiceSelect.innerHTML = `${browserOptions}${localOptions}`;

      const browserValues = sorted.map((voice) => String(voice.name || ""));
      const localValues = localVoices.map((voice) => String(voice.value || ""));
      const availableValues = new Set([...browserValues, ...localValues]);

      const bestBrowser = sorted.find((voice) => {
        const name = String(voice.name || "").toLowerCase();
        return name.includes("ava") && !name.includes("multi");
      })
        || sorted.find((voice) => {
          const name = String(voice.name || "").toLowerCase();
          return name.includes("microsoft") && name.includes("jenny");
        })
        || sorted.find((voice) => String(voice.name || "").toLowerCase().includes("jenny"))
        || sorted.find((voice) => String(voice.name || "").toLowerCase().includes("aria"))
        || sorted.find((voice) => natural(voice))
        || sorted[0]
        || null;

      const bestLocal = localVoices[0] || null;
      const currentIsLocal = String(previous || "").startsWith("local:") || String(previous || "").startsWith("edge:");
      const previousIsMultiAva = String(previous || "").toLowerCase().includes("ava") && String(previous || "").toLowerCase().includes("multi");
      const browserStillExists = hasBrowserVoices && bestBrowser;
      const previousStillExists = previous ? availableValues.has(String(previous)) : false;

      if (forceLocal) {
        if (!String(this.voiceSelect.value || "").startsWith("local:") && !String(this.voiceSelect.value || "").startsWith("edge:")) {
          this.voiceSelect.value = String((bestLocal && bestLocal.value) || "edge:en-US-JennyNeural");
        }
      } else if (previousStillExists) {
        this.voiceSelect.value = previous;
      } else if (browserStillExists) {
        this.voiceSelect.value = String(bestBrowser.value || bestBrowser.name || "");
      } else if (bestLocal) {
        this.voiceSelect.value = String(bestLocal.value || "");
      }

      if (!this.voiceSelect.value && bestLocal) {
        this.voiceSelect.value = String(bestLocal.value || "");
      }

      this.selectedVoice = this.voiceSelect.value;
      if (this.selectedVoice) {
        window.localStorage.setItem(`${this.storageKey}:voice`, this.selectedVoice);
      }
    }

    getVoice() {
      if (this.options.backendOrigin && this.options.forceLocalTTS) {
        return null;
      }
      if (String(this.selectedVoice || "").startsWith("local:") || String(this.selectedVoice || "").startsWith("edge:")) {
        return null;
      }
      const voices = window.speechSynthesis.getVoices();
      return voices.find((voice) => voice.name === this.selectedVoice) || voices[0] || null;
    }

    setContext(contextId = "default") {
      this.currentContextId = String(contextId || "default");
    }

    collectElements() {
      const collected = this.getElements();
      this.elements = Array.isArray(collected) ? collected.filter(Boolean) : [];
      return this.elements;
    }

    contextProgressKey() {
      return `${this.storageKey}:progress:${this.currentContextId}`;
    }

    getSavedProgress() {
      const raw = window.localStorage.getItem(this.contextProgressKey());
      const value = Number.parseInt(String(raw || "0"), 10);
      if (!Number.isFinite(value)) {
        return 0;
      }
      return Math.max(0, value);
    }

    saveProgress(index) {
      window.localStorage.setItem(this.contextProgressKey(), String(Math.max(0, Number(index || 0))));
    }

    setState(reading) {
      this.isReading = Boolean(reading);
      this.onState(this.isReading);
    }

    start(startIndex = null) {
      if (startIndex !== null && this.isReading) {
        this.stop();
      } else if (this.isReading && startIndex == null) {
        this.stop();
        return;
      }

      this.collectElements();
      if (!this.elements.length) {
        return;
      }

      let index = startIndex == null ? this.getSavedProgress() : Number(startIndex);
      if (!Number.isFinite(index) || index < 0) {
        index = 0;
      }
      if (index >= this.elements.length) {
        index = 0;
      }

      this._playbackToken += 1;
      this.setState(true);
      this.currentIndex = index;
      this.speak(index);
    }

    stop() {
      this._playbackToken += 1;
      window.speechSynthesis.cancel();
      if (this.currentAudio) {
        try {
          this.currentAudio.pause();
          this.currentAudio.currentTime = 0;
        } catch (e) {
          // ignore
        }
        this.currentAudio = null;
      }
      this.currentUtterance = null;
      this.setState(false);
    }

    skipTo(index) {
      const target = Number(index);
      if (!Number.isFinite(target)) {
        return;
      }

      if (!this.isReading) {
        this.start(target);
        return;
      }

      this._playbackToken += 1;
      this.currentIndex = target;
      this.saveProgress(target);
      window.speechSynthesis.cancel();
      if (this.currentAudio) {
        try {
          this.currentAudio.pause();
          this.currentAudio.currentTime = 0;
        } catch (e) {
          // ignore
        }
        this.currentAudio = null;
      }
      if (target < 0) {
        this.speak(0);
        return;
      }
      if (target >= this.elements.length) {
        this.stop();
        return;
      }
      this.speak(target);
    }

    resolveSpeechText(el) {
      if (!el) {
        return "";
      }
      if (typeof this.options.resolveSpeechText === "function") {
        return String(this.options.resolveSpeechText(el) || "").trim();
      }
      return String(el.textContent || "").trim();
    }

    highlightElement(el) {
      const className = String(this.options.highlightClass || "speaking-now");
      document.querySelectorAll(`.${className}`).forEach((node) => node.classList.remove(className));
      if (el) {
        el.classList.add(className);
      }
    }

    speak(index, options = {}) {
      const now = Date.now();
      if (this._lastSpeakTime && (now - this._lastSpeakTime < 50)) {
        console.warn(`UniversalListener: Debouncing speak(${index}) - called too rapidly.`);
        return;
      }
      this._lastSpeakTime = now;

      if (!this.isReading) {
        return;
      }
      if (index < 0 || index >= this.elements.length) {
        this.stop();
        return;
      }

      if (this._lastLocalFailureIndex !== index) {
        this._localFailure = false;
      }

      // Ensure NO other speech is happening from ANY instance
      window.speechSynthesis.cancel();

      const el = this.elements[index];
      this.currentIndex = index;
      this.saveProgress(index);
      this.highlightElement(el);

      if (el && typeof el.scrollIntoView === "function") {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }

      this.onProgress({
        index,
        total: this.elements.length,
        element: el
      });

      if (window._universal_listener_active_audio) {
        try { window._universal_listener_active_audio.pause(); window._universal_listener_active_audio.currentTime = 0; } catch (e) { }
        window._universal_listener_active_audio = null;
      }

      let text = this.resolveSpeechText(el);
      if (text) {
        text = text.replace(/[\*\_`~]/g, "").replace(/\s+/g, " ").trim();
      }
      let audioPath = "";
      if (typeof this.options.resolveAudio === "function") {
        const audioResult = this.options.resolveAudio(el);
        if (audioResult && typeof audioResult === "object") {
          audioPath = String(audioResult.path || audioResult.audio || audioResult.src || audioResult.url || "").trim();
        } else {
          audioPath = String(audioResult || "").trim();
        }
      }

      if (audioPath && !options.skipAudio) {
        window.speechSynthesis.cancel();
        const fullPath = this.options.backendOrigin 
          ? `${this.options.backendOrigin}/${audioPath}`
          : audioPath;
        
        const playbackToken = this._playbackToken;
        console.log(`UniversalListener: [Token:${playbackToken}] Playing Audio: ${fullPath}`);
        console.trace("UniversalListener: Audio Playback Trace");
        
        const audio = new Audio(fullPath);
        audio.volume = this.volume;
        this.currentAudio = audio;
        window._universal_listener_active_audio = audio;

        audio.onended = () => {
          if (playbackToken !== this._playbackToken) return;
          this.currentAudio = null;
          if (window._universal_listener_active_audio === audio) window._universal_listener_active_audio = null;
          if (!text && this.isReading && this.currentIndex === index) {
            window.setTimeout(() => this.speak(index + 1), 150);
          }
        };

        audio.onerror = () => {
          if (playbackToken !== this._playbackToken) return;
          if (audio._failed) return;
          audio._failed = true;
          this.currentAudio = null;
          if (window._universal_listener_active_audio === audio) window._universal_listener_active_audio = null;
          if (!text) {
            this.speak(index + 1);
          }
        };

        audio.play().catch(() => {
           if (playbackToken === this._playbackToken) {
             if (audio._failed) return;
             audio._failed = true;
             if (!text) {
               this.speak(index + 1);
             }
           }
        });
        if (!text) {
          return;
        }
      }

      if (!text) {
        this.speak(index + 1);
        return;
      }

      const utterance = new SpeechSynthesisUtterance(text);
      const playbackToken = this._playbackToken;
      
      let voice = null;
      let customPitch = null;
      let customRate = null;
      let isLocal = false;
      let localVoiceModel = "";
        let speakerGender = null;
      const forceLocal = Boolean(this.options.backendOrigin && this.options.forceLocalTTS);

      if (typeof this.options.resolveVoice === "function") {
        const res = this.options.resolveVoice(el);
        let voiceHint = "";
        
        if (res && typeof res === "object") {
            voiceHint = res.name || res.voice || "";
            customPitch = res.pitch;
            customRate = res.rate;
          speakerGender = res.gender || null;
        } else {
            voiceHint = String(res || "");
        }

        if (voiceHint) {
            if (voiceHint.startsWith("local:") || voiceHint.startsWith("edge:")) {
                isLocal = true;
                localVoiceModel = voiceHint;
            } else {
                // When a backend is available and the hint contains Edge TTS indicator
                // keywords (microsoft, edge, online, neural), route directly to the
                // Edge TTS proxy instead of matching browser SpeechSynthesis voices.
                // Browser voices are significantly lower quality than the streamed
                // Edge TTS neural voices from the backend.
                const hintLower = voiceHint.toLowerCase();
                const isEdgeHint = this.options.backendOrigin && (
                  hintLower.includes("microsoft") ||
                  hintLower.includes("edge") ||
                  hintLower.includes("online") ||
                  hintLower.includes("neural")
                );

                if (isEdgeHint) {
                  // Skip browser voice matching entirely — route to Edge TTS backend
                  isLocal = true;
                  localVoiceModel = this.resolveLocalVoiceModel(voiceHint, speakerGender);
                } else {
                  const allVoices = window.speechSynthesis.getVoices();
                  const normalize = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
                  const target = normalize(voiceHint);
                  
                  voice = allVoices.find(v => normalize(v.name) === target) 
                       || allVoices.find(v => normalize(v.name).includes(target))
                       || allVoices.find(v => target.includes(normalize(v.name)));
                  
                  if (!voice && voiceHint.includes("-")) {
                      const parts = voiceHint.split("-");
                      for (const part of parts) {
                          if (["microsoft", "edge", "online", "natural", "core"].includes(part)) continue;
                          const pTarget = normalize(part);
                          voice = allVoices.find(v => normalize(v.name).includes(pTarget));
                          if (voice) break;
                      }
                  }

                  if (!voice && (this.options.backendOrigin || forceLocal)) {
                    isLocal = true;
                    localVoiceModel = this.resolveLocalVoiceModel(voiceHint, speakerGender);
                  }
                }
            }
        }
      }

        if (!isLocal && !voice && (forceLocal || String(this.selectedVoice || "").startsWith("local:") || String(this.selectedVoice || "").startsWith("edge:")) && this.options.backendOrigin) {
        isLocal = true;
        localVoiceModel = this.resolveLocalVoiceModel(this.selectedVoice, speakerGender);
      }

        if (forceLocal && this.options.backendOrigin) {
          isLocal = true;
          localVoiceModel = this.resolveLocalVoiceModel(this.selectedVoice || localVoiceModel, speakerGender);
        }

      // Handle Local TTS via Backend API
      if (isLocal && this.options.backendOrigin && !this._localFailure) {
        const url = `${this.options.backendOrigin}/api/tts?text=${encodeURIComponent(text)}&voice=${encodeURIComponent(localVoiceModel)}&t=${Date.now()}`;
        console.log(`UniversalListener: [Token:${playbackToken}] Requesting local TTS: ${url}`);
        
        if (window._universal_listener_active_audio) {
            try { window._universal_listener_active_audio.pause(); window._universal_listener_active_audio.currentTime = 0; } catch(e){}
        }
        
        const audio = new Audio();
        audio.crossOrigin = "anonymous";
        audio.src = url;
        audio.volume = this.volume;
        this.currentAudio = audio; 
        window._universal_listener_active_audio = audio;
        
        audio.playbackRate = customRate != null ? Number(customRate) : this.speed;
        
        audio.onended = () => {
          if (playbackToken !== this._playbackToken) return;
          this.currentAudio = null;
          if (window._universal_listener_active_audio === audio) window._universal_listener_active_audio = null;
          if (this.isReading && this.currentIndex === index) {
            window.setTimeout(() => this.speak(index + 1), 150);
          }
        };

        audio.onerror = (e) => {
            if (playbackToken !== this._playbackToken) return;
            if (audio._failed) return;
            audio._failed = true;
            console.error("UniversalListener: Local TTS Playback Error", {
                error: e,
                url: url,
                readyState: audio.readyState,
                networkState: audio.networkState
            });
            this.currentAudio = null;
            if (window._universal_listener_active_audio === audio) window._universal_listener_active_audio = null;
            
            // Fallback to native synthesis ONLY if we haven't already tried to fallback
            if (isLocal) {
                console.warn("UniversalListener: Local TTS failed, falling back to native synthesis.");
                this._localFailure = true; // Temporary flag to prevent loop
                this._lastLocalFailureIndex = index;
                this.speak(index); 
            }
        };

        audio.play().catch(e => {
            if (playbackToken !== this._playbackToken) return;
            if (audio._failed) return;
            audio._failed = true;
            console.warn("UniversalListener: Local TTS play blocked or failed:", e.message);
            // If it's a "no supported source" error, it's likely a backend issue
            if (e.name === "NotSupportedError") {
                 this._localFailure = true;
                 this._lastLocalFailureIndex = index;
                 this.speak(index);
            } else {
                 this.stop();
            }
        });
        return;
      }

      // Reset local failure flag if we reach here
      this._localFailure = false;
      
      if (!voice) {
        voice = this.getVoice();
      }

      if (voice) {
        utterance.voice = voice;
      }
      
      utterance.volume = this.volume;
      utterance.pitch = customPitch != null ? Number(customPitch) : 1.05;
      utterance.rate = customRate != null ? Number(customRate) : this.speed;

      console.log(`UniversalListener: [Token:${playbackToken}] Starting Native TTS: "${text.slice(0, 30)}..." using voice: ${voice?.name || "Default"}`);

      utterance.onend = () => {
        if (playbackToken !== this._playbackToken) return;
        if (this.isReading && this.currentIndex === index) {
          window.setTimeout(() => this.speak(index + 1), 150);
        }
      };

      utterance.onerror = (event) => {
        if (playbackToken !== this._playbackToken) return;
        if (String(event?.error || "") === "interrupted") return;
        console.warn("UniversalListener: Native TTS error:", event);
        this.stop();
      };

      this.currentUtterance = utterance;
      window.speechSynthesis.speak(utterance);
    }
  }

  window.UniversalListener = UniversalListener;
})();
