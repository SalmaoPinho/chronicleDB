(function (global) {
  'use strict';

  const cache = {
    manifest: new Map(),
    directory: new Map(),
    catalog: new Map()
  };

  function normalizeKey(value) {
    return (value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function unique(items) {
    return Array.from(new Set(items));
  }

  function isImageFile(fileName) {
    return /\.(png|jpe?g|webp|gif|avif)$/i.test(fileName || '');
  }

  function isVideoFile(fileName) {
    return /\.mp4$/i.test(fileName || '');
  }

  function isMediaFile(fileName) {
    return isImageFile(fileName) || isVideoFile(fileName);
  }

  function baseName(fileName) {
    return (fileName || '')
      .split('/')
      .pop()
      .split('?')[0]
      .replace(/\.[^.]+$/, '');
  }

  function toFileName(pathOrHref) {
    return decodeURIComponent((pathOrHref || '').split('/').pop().split('?')[0]);
  }

  function normalizeAssetPath(path) {
    return String(path || '').replace(/\\/g, '/').replace(/^\/+/, '');
  }

  function normalizeAssetPathKey(path) {
    return normalizeAssetPath(path).toLowerCase();
  }

  function defaultPathExists() {
    return true;
  }

  function parsePathParts(path) {
    const normalized = normalizeAssetPath(path);
    const extMatch = normalized.match(/(\.[^.]+)$/);
    if (!extMatch) {
      return null;
    }

    const ext = extMatch[1];
    const withoutExt = normalized.slice(0, -ext.length);
    const stem = withoutExt.split('/').pop() || '';
    const dir = normalized.slice(0, normalized.length - (stem.length + ext.length));
    return { normalized, ext, stem, dir };
  }

  function normalizeStem(stem) {
    return String(stem || '').replace(/(unmasked|masked|exposed|identity|secretidentity|civilian)$/i, '').toLowerCase();
  }

  function buildStemCandidates(stem) {
    const baseStem = normalizeStem(stem);
    return [
      `${baseStem}unmasked`,
      baseStem,
      `${baseStem}masked`
    ];
  }

  function findPathByStem(availablePaths, preferredDirectoryNeedle, stem, ext) {
    if (!(availablePaths instanceof Set) || !availablePaths.size) {
      return '';
    }

    const preferredNeedle = String(preferredDirectoryNeedle || '').toLowerCase();
    const targetExt = String(ext || '').toLowerCase();
    const targetStems = buildStemCandidates(stem);

    let fallback = '';
    for (const candidate of availablePaths.values()) {
      const parsed = parsePathParts(candidate);
      if (!parsed) {
        continue;
      }

      if (parsed.ext.toLowerCase() !== targetExt) {
        continue;
      }

      const candidateStem = parsed.stem.toLowerCase();
      if (!targetStems.includes(candidateStem)) {
        continue;
      }

      const isPreferred = preferredNeedle && parsed.normalized.toLowerCase().includes(preferredNeedle);
      if (isPreferred) {
        return parsed.normalized;
      }

      if (!fallback) {
        fallback = parsed.normalized;
      }
    }

    return fallback;
  }

  function findXrayPair(src, options) {
    const opts = options || {};
    const pathExists = typeof opts.pathExists === 'function' ? opts.pathExists : defaultPathExists;
    const availablePaths = new Set(
      (Array.isArray(opts.availablePaths) ? opts.availablePaths : [])
        .map((value) => normalizeAssetPathKey(value))
        .filter(Boolean)
    );

    const hasPath = (candidate) => {
      const normalizedCandidate = normalizeAssetPath(candidate);
      if (!normalizedCandidate) {
        return false;
      }

      if (availablePaths.has(normalizeAssetPathKey(normalizedCandidate))) {
        return true;
      }

      return pathExists(normalizedCandidate);
    };

    const normalized = normalizeAssetPath(src);
    if (!normalized || !isImageFile(normalized)) {
      return '';
    }

    const parsed = parsePathParts(normalized);
    if (!parsed) {
      return '';
    }

    const ext = parsed.ext;
    const stem = parsed.stem;
    const dir = parsed.dir;
    const isUnmaskedName = /unmasked$/i.test(stem);
    const maskedStem = stem.replace(/unmasked$/i, '');
    const unmaskedStem = isUnmaskedName ? stem : `${stem}Unmasked`;

    const candidates = [
      normalized.includes('/portraits/') ? normalized.replace('/portraits/', '/portraits/rows/') : '',
      normalized.includes('/portraits/rows/') ? normalized.replace('/portraits/rows/', '/portraits/') : '',
      `${dir}${unmaskedStem}${ext}`,
      `${dir}${maskedStem}${ext}`,
      normalized.includes('/portraits/') ? normalized.replace('/portraits/', '/') : '',
      normalized.includes('/portraits/') ? normalized.replace(`/portraits/${stem}${ext}`, `/portraits/rows/${unmaskedStem}${ext}`) : ''
    ]
      .map((candidate) => normalizeAssetPath(candidate))
      .filter((candidate, index, arr) => candidate && candidate !== normalized && arr.indexOf(candidate) === index);

    const directMatch = candidates.find((candidate) => hasPath(candidate)) || '';
    if (directMatch) {
      return directMatch;
    }

    const sourceKey = normalizeAssetPathKey(normalized);
    const byYearUnmasked = findPathByStem(availablePaths, '/unmasked/', stem, ext);
    if (byYearUnmasked && normalizeAssetPathKey(byYearUnmasked) !== sourceKey) {
      return byYearUnmasked;
    }

    const byAnyDir = findPathByStem(availablePaths, '', stem, ext);
    if (byAnyDir && normalizeAssetPathKey(byAnyDir) !== sourceKey) {
      return byAnyDir;
    }

    return '';
  }

  function findXrayExposed(src, options) {
    const opts = options || {};
    const pathExists = typeof opts.pathExists === 'function' ? opts.pathExists : defaultPathExists;
    const availablePaths = new Set(
      (Array.isArray(opts.availablePaths) ? opts.availablePaths : [])
        .map((value) => normalizeAssetPathKey(value))
        .filter(Boolean)
    );

    const hasPath = (candidate) => {
      const normalizedCandidate = normalizeAssetPath(candidate);
      if (!normalizedCandidate) {
        return false;
      }

      if (availablePaths.has(normalizeAssetPathKey(normalizedCandidate))) {
        return true;
      }

      return pathExists(normalizedCandidate);
    };

    const normalized = normalizeAssetPath(src);
    if (!normalized || !isImageFile(normalized)) {
      return '';
    }

    const extMatch = normalized.match(/(\.[^.]+)$/);
    if (!extMatch) {
      return '';
    }

    const ext = extMatch[1];
    const withoutExt = normalized.slice(0, -ext.length);
    const stem = withoutExt.split('/').pop() || '';
    const dir = normalized.slice(0, normalized.length - (stem.length + ext.length));
    const baseStem = stem.replace(/(unmasked|masked|exposed|identity|secretidentity|civilian)$/i, '');

    const candidates = [
      normalized.includes('/portraits/') ? normalized.replace('/portraits/', '/portraits/rows/') : '',
      normalized.includes('/portraits/rows/') ? normalized.replace('/portraits/rows/', '/portraits/') : '',
      `${dir}${baseStem}Exposed${ext}`,
      `${dir}${baseStem}Identity${ext}`,
      `${dir}${baseStem}SecretIdentity${ext}`,
      `${dir}${baseStem}Civilian${ext}`,
      normalized.includes('/portraits/') ? normalized.replace('/portraits/', '/') : ''
    ]
      .map((candidate) => normalizeAssetPath(candidate))
      .filter((candidate, index, arr) => candidate && candidate !== normalized && arr.indexOf(candidate) === index);

    return candidates.find((candidate) => hasPath(candidate)) || '';
  }

  function findXrayLayers(src, options) {
    const revealSrc = findXrayPair(src, options) || '';
    let exposedSrc = findXrayExposed(src, options) || '';

    if (!exposedSrc && revealSrc) {
      exposedSrc = findXrayExposed(revealSrc, options) || '';
    }

    if (exposedSrc === normalizeAssetPath(src) || exposedSrc === revealSrc) {
      exposedSrc = '';
    }

    return { revealSrc, exposedSrc };
  }

  async function getDirectoryMedia(path, options) {
    const opts = options || {};
    const includeVideos = opts.includeVideos !== false;
    const cacheKey = `${path}|${includeVideos ? 'media' : 'images'}`;
    if (cache.directory.has(cacheKey)) {
      return cache.directory.get(cacheKey);
    }

    const promise = (async () => {
      try {
        const normalizedPath = String(path || '').endsWith('/') ? path : `${path}/`;
        
        // 1. Try manifest first (new standard)
        try {
          const manifestResponse = await fetch(`${normalizedPath}image_index.json`);
          if (manifestResponse.ok) {
            const files = await manifestResponse.json();
            if (Array.isArray(files)) {
              return files.filter((name) => includeVideos ? isMediaFile(name) : isImageFile(name));
            }
          }
        } catch (e) {
          console.warn(`Manifest fetch failed for ${path}, falling back to scraping.`);
        }

        // 2. Fallback to HTML scraping
        const response = await fetch(normalizedPath);
        if (!response.ok) {
          return [];
        }

        const html = await response.text();
        const hrefMatches = [...html.matchAll(/href=["']([^"']+)["']/gi)].map((m) => m[1]);
        return unique(
          hrefMatches
            .map(toFileName)
            .filter((name) => name && (includeVideos ? isMediaFile(name) : isImageFile(name)))
        );
      } catch {
        return [];
      }
    })();

    cache.directory.set(cacheKey, promise);
    return promise;
  }

  async function getManifestMedia(manifestPath, options) {
    const opts = options || {};
    const includeVideos = opts.includeVideos !== false;
    const cacheKey = `${manifestPath}|${includeVideos ? 'media' : 'images'}`;
    if (cache.manifest.has(cacheKey)) {
      return cache.manifest.get(cacheKey);
    }

    const promise = (async () => {
      try {
        const response = await fetch(manifestPath);
        if (!response.ok) {
          return { portraits: [], outfits: [], groups: [] };
        }

        const json = await response.json();
        const filterMedia = (list) => {
          const values = Array.isArray(list) ? list : [];
          return values.filter((name) => includeVideos ? isMediaFile(name) : isImageFile(name));
        };

        return {
          portraits: filterMedia(json.portraits),
          outfits: filterMedia(json.outfits),
          groups: filterMedia(json.groups)
        };
      } catch {
        return { portraits: [], outfits: [], groups: [] };
      }
    })();

    cache.manifest.set(cacheKey, promise);
    return promise;
  }

  async function getMediaCatalog(sources, options) {
    const opts = options || {};
    const includeVideos = opts.includeVideos !== false;
    const key = JSON.stringify({ sources, includeVideos });
    if (cache.catalog.has(key)) {
      return cache.catalog.get(key);
    }

    const promise = (async () => {
      const manifestPath = sources.manifestPath;
      const [manifest, listedPortraits, listedOutfits, listedGroups] = await Promise.all([
        getManifestMedia(manifestPath, { includeVideos }),
        sources.portraitsDir ? getDirectoryMedia(sources.portraitsDir, { includeVideos }) : Promise.resolve([]),
        sources.outfitsDir ? getDirectoryMedia(sources.outfitsDir, { includeVideos }) : Promise.resolve([]),
        sources.groupsDir ? getDirectoryMedia(sources.groupsDir, { includeVideos }) : Promise.resolve([])
      ]);

      return {
        portraits: unique([...(manifest.portraits || []), ...listedPortraits]),
        outfits: unique([...(manifest.outfits || []), ...listedOutfits]),
        groups: unique([...(manifest.groups || []), ...listedGroups])
      };
    })();

    cache.catalog.set(key, promise);
    return promise;
  }

  function nameVariants(fullName) {
    const aliases = {
      jessica: 'jess',
      nasrin: 'amber',
      zachary: 'zack',
      zach: 'zack',
      thomas: 'tom',
      william: 'wren'
    };

    const cleaned = (fullName || '')
      .replace(/\./g, ' ')
      .replace(/[^a-zA-Z\s-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const parts = cleaned.split(' ').filter(Boolean);
    if (!parts.length) {
      return [];
    }

    const first = parts[0].toLowerCase();
    const last = parts[parts.length - 1].toLowerCase();
    const firstAlias = aliases[first] || first;

    return unique([
      normalizeKey(first),
      normalizeKey(firstAlias),
      normalizeKey(last),
      normalizeKey(`${first}${last}`),
      normalizeKey(`${firstAlias}${last}`),
      normalizeKey(cleaned)
    ]).filter(Boolean);
  }

  function findBestMediaForName(fullName, catalog, options) {
    const opts = options || {};
    const minScore = Number.isFinite(opts.minScore) ? opts.minScore : 70;
    const includeOutfits = opts.includeOutfits !== false;
    const includeGroups = !!opts.includeGroups;

    const variants = nameVariants(fullName);
    if (!variants.length) {
      return null;
    }

    const scoreFile = (fileName) => {
      const key = normalizeKey(baseName(fileName));
      let score = 0;

      variants.forEach((variant) => {
        if (!variant) {
          return;
        }
        if (key === variant) {
          score = Math.max(score, 120);
        } else if (key.startsWith(variant)) {
          score = Math.max(score, 95);
        } else if (key.includes(variant)) {
          score = Math.max(score, 75);
        }
      });

      return score;
    };

    const sources = [
      { dir: opts.portraitsDir || '', files: catalog.portraits || [] },
      ...(includeOutfits ? [{ dir: opts.outfitsDir || '', files: catalog.outfits || [] }] : []),
      ...(includeGroups ? [{ dir: opts.groupsDir || '', files: catalog.groups || [] }] : [])
    ];

    let best = null;
    sources.forEach((source) => {
      source.files.forEach((file) => {
        const score = scoreFile(file);
        if (!best || score > best.score || (score === best.score && file.localeCompare(best.file) < 0)) {
          best = { file, score, dir: source.dir };
        }
      });
    });

    if (!best || best.score < minScore) {
      return null;
    }

    return {
      src: best.dir ? `${best.dir}/${best.file}` : best.file,
      file: best.file,
      score: best.score,
      dir: best.dir,
      type: isVideoFile(best.file) ? 'video' : 'image',
      label: baseName(best.file)
    };
  }

  global.ProjectMediaUtils = {
    normalizeKey,
    unique,
    isImageFile,
    isVideoFile,
    isMediaFile,
    baseName,
    toFileName,
    getDirectoryMedia,
    getManifestMedia,
    getMediaCatalog,
    nameVariants,
    findBestMediaForName,
    findXrayPair,
    findXrayExposed,
    findXrayLayers
  };
})(window);
