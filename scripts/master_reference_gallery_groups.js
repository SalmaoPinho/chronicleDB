(function initMasterReferenceGalleryGroups(global) {
  const { escapeHtml } = global.MasterReferenceUtils || {};

  const EMBEDDED_GALLERY_THEME_TOKENS = new Set([
    "halloween", "beach", "christmas", "winter", "summer", "valentines", "gym", "formal",
    "pijamas", "cheerleader", "training", "pool", "bathroom", "morning", "twitch", "tennis"
  ]);
  const EMBEDDED_GALLERY_SKIP_TOKENS = new Set(["img", "image", "pfp", "pose", "look", "style", "wins", "door", "montage"]);

  function cgToken(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function cgSplitStemTokens(stem) {
    const spaced = String(stem || "")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
      .replace(/[^a-zA-Z0-9]+/g, " ")
      .trim()
      .toLowerCase();

    return spaced
      .split(/\s+/)
      .map(cgToken)
      .filter((token) => token && token.length >= 3 && !/^\d+$/.test(token));
  }

  function cgGetResolutionTier(width, height) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return "unknown size";
    if (width >= 3840 || height >= 2160) return "4k+ tier";
    if (width >= 2560 || height >= 1440) return "1440p tier";
    if (width >= 1920 || height >= 1080) return "1080p tier";
    if (width >= 1280 || height >= 720) return "720p tier";
    return "sub-720p tier";
  }

  function cgGetOrientationLabel(width, height) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return "unknown";
    const ratio = width / height;
    if (ratio > 1.15) return "landscape";
    if (ratio < 0.85) return "portrait";
    return "square-ish";
  }

  function cgGroupByResolution(images) {
    const map = new Map();
    images.forEach((img) => {
      const key = img.resolutionGroup || "unknown · unknown size";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(img);
    });
    return map;
  }

  // characterPrefixMap: Map of characterId -> [prefix1, prefix2, ...]
  function cgGroupImages(images, characterPrefixMap) {
    const tokenCounts = new Map();
    images.forEach((img) => {
      img.tokens.forEach((token) => {
        if (!EMBEDDED_GALLERY_SKIP_TOKENS.has(token)) {
          tokenCounts.set(token, (tokenCounts.get(token) || 0) + 1);
        }
      });
    });

    const themeGroups = new Map();
    const charGroups = new Map();
    // build a flat set of all prefixes for quick fallback checks
    const allPrefixes = new Set();
    if (characterPrefixMap && typeof characterPrefixMap.forEach === 'function') {
      characterPrefixMap.forEach((prefixes) => {
        (Array.isArray(prefixes) ? prefixes : []).forEach((p) => allPrefixes.add(String(p || '').toLowerCase()));
      });
    }

    images.forEach((img) => {
      const themes = img.tokens.filter((token) => EMBEDDED_GALLERY_THEME_TOKENS.has(token));
      const imgNameLower = String(img.name || '').toLowerCase();
      const names = [];
      if (characterPrefixMap && typeof characterPrefixMap.forEach === 'function') {
        characterPrefixMap.forEach((prefixes, charId) => {
          const list = Array.isArray(prefixes) ? prefixes : [];
          for (let i = 0; i < list.length; i += 1) {
            const prefix = String(list[i] || '').toLowerCase();
            if (!prefix) continue;
            if (imgNameLower.startsWith(prefix)) {
              names.push(charId);
              break;
            }
          }
        });
      }
      Array.from(new Set(names)).forEach((name) => {
        if (!charGroups.has(name)) charGroups.set(name, []);
        charGroups.get(name).push(img);
      });
      Array.from(new Set(themes)).forEach((theme) => {
        if (!themeGroups.has(theme)) themeGroups.set(theme, []);
        themeGroups.get(theme).push(img);
      });
      if (!themes.length) {
        const fallback = img.tokens.find((token) => (tokenCounts.get(token) || 0) >= 3 && !allPrefixes.has(token));
        if (fallback) {
          if (!themeGroups.has(fallback)) themeGroups.set(fallback, []);
          themeGroups.get(fallback).push(img);
        }
      }
    });
    return { themeGroups, charGroups };
  }

  function cgRenderGroupMap(map, host, options, onOpenLightbox) {
    const search = String(options.search || "").trim().toLowerCase();
    const year = String(options.year || "all");
    const minSize = Number.isFinite(Number(options.minSize)) ? Number(options.minSize) : 2;
    host.innerHTML = "";

    const groups = Array.from(map.entries())
      .map(([name, items]) => {
        let filteredItems = items;
        if (year !== "all") {
          filteredItems = filteredItems.filter((item) => String(item.year || "") === year);
        }
        if (search) {
          const groupMatch = String(name || "").toLowerCase().includes(search);
          filteredItems = filteredItems.filter((item) => groupMatch || String(item.name || "").toLowerCase().includes(search));
        }
        return [name, filteredItems];
      })
      .filter(([, items]) => items.length >= minSize)
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));

    if (!groups.length) {
      host.innerHTML = '<div class="embedded-gallery-empty">No group matches found.</div>';
      return;
    }

    groups.forEach(([name, items]) => {
      const card = document.createElement("article");
      card.className = "embedded-gallery-group";
      const yearSet = Array.from(new Set(items.map((item) => item.year).filter(Boolean))).sort();
      const yearLabel = yearSet.length ? ` · ${yearSet.join(", ")}` : "";
      card.innerHTML = `
      <div class="embedded-gallery-group-head">
        <div class="embedded-gallery-group-name">${escapeHtml(String(name || ""))}${escapeHtml(yearLabel)}</div>
        <div class="embedded-gallery-group-count">${items.length}</div>
      </div>
      <div class="embedded-gallery-grid"></div>
    `;
      const grid = card.querySelector(".embedded-gallery-grid");
      items.forEach((item) => {
        const tile = document.createElement("figure");
        tile.className = "embedded-gallery-tile";
        const displaySrc = item.displaySrc || item.src;
        tile.innerHTML = `
        <img src="${escapeHtml(displaySrc)}" alt="${escapeHtml(item.name)}">
        <figcaption class="embedded-gallery-caption" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}${item.year ? ` · ${escapeHtml(item.year)}` : ""}</figcaption>
      `;
        const img = tile.querySelector("img");
        img.onload = () => {
          if (typeof item === "object") {
            item.width = img.naturalWidth || 0;
            item.height = img.naturalHeight || 0;
            item.resolutionGroup = `${cgGetOrientationLabel(item.width, item.height)} · ${cgGetResolutionTier(item.width, item.height)}`;
          }
        };
        tile.addEventListener("click", () => onOpenLightbox(item));
        grid.appendChild(tile);
      });
      host.appendChild(card);
    });
  }

  global.MasterReferenceGalleryGroups = {
    cgSplitStemTokens,
    cgGetResolutionTier,
    cgGetOrientationLabel,
    cgGroupByResolution,
    cgGroupImages,
    cgRenderGroupMap
  };
}(window));
