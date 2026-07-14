// xray.js
// Usage: XRayReveal(container, revealImage, topImage, options)
// options: {
//   radius, minRadius, maxRadius, scrollSpeed, ringColor,
//   exposedImage, hintText, captureWheel, toggleOnClick, showLayerButton, hasExposedLayer
// }

function XRayReveal(container, revealImg, topImg, options = {}) {
  const {
    radius = 54,
    minRadius = 28,
    maxRadius = 260,
    scrollSpeed = 0.06,
    ringColor = 'rgba(160,100,255,0.55)',
    exposedImage = null,
    hintText = 'Hover to reveal',
    captureWheel = false,
    toggleOnClick = false,
    showLayerButton = true,
    hasExposedLayer = false
  } = options;

  let W = Math.max(1, Math.round(container.clientWidth || 1));
  let H = Math.max(1, Math.round(container.clientHeight || 1));
  let currentRadius = Math.max(minRadius, Math.min(maxRadius, radius));
  let isExposedMode = false;
  let pointerX = null;
  let pointerY = null;

  container.innerHTML = '';
  container.style.position = 'relative';
  container.style.cursor = 'default';
  container.style.overflow = 'hidden';
  container.style.display = 'grid';
  container.style.placeItems = 'center';

  const baseCanvas = document.createElement('canvas');
  baseCanvas.width = W;
  baseCanvas.height = H;
  baseCanvas.style.cssText = 'display:block;width:100%;height:100%;grid-area:1 / 1;';
  const baseCtx = baseCanvas.getContext('2d');

  const revealCanvas = document.createElement('canvas');
  revealCanvas.width = W;
  revealCanvas.height = H;
  revealCanvas.style.cssText = 'display:block;width:100%;height:100%;grid-area:1 / 1;pointer-events:none;';

  const hint = document.createElement('div');
  hint.className = 'xray-hint';
  hint.textContent = hintText;

  const hud = document.createElement('div');
  hud.className = 'xray-hud';

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'xray-copy-btn';
  copyBtn.textContent = 'Copy';
  copyBtn.title = 'Copy current revealed image';

  const layerBtn = document.createElement('button');
  layerBtn.type = 'button';
  layerBtn.className = 'xray-layer-btn';
  layerBtn.textContent = hasExposedLayer ? 'Layer: Reveal' : 'Layer: Identity unavailable';
  layerBtn.title = 'Toggle reveal / identity layer';

  container.appendChild(baseCanvas);
  container.appendChild(revealCanvas);
  if (hintText) {
    container.appendChild(hint);
  }
  container.appendChild(hud);
  if (showLayerButton) {
    container.appendChild(layerBtn);
  }
  container.appendChild(copyBtn);

  const ctx = revealCanvas.getContext('2d');

  function syncCanvasSize() {
    const rect = container.getBoundingClientRect();
    const nextW = Math.max(1, Math.round(rect.width || container.clientWidth || 1));
    const nextH = Math.max(1, Math.round(rect.height || container.clientHeight || 1));
    if (nextW === W && nextH === H) {
      return;
    }

    W = nextW;
    H = nextH;
    baseCanvas.width = W;
    baseCanvas.height = H;
    revealCanvas.width = W;
    revealCanvas.height = H;
    baseCtx.clearRect(0, 0, W, H);
    drawImageCover(baseCtx, topImg, W, H);
    drawReveal(pointerX, pointerY);
  }

  function drawImageCover(targetCtx, image, targetW, targetH) {
    const iw = image.naturalWidth || image.width;
    const ih = image.naturalHeight || image.height;
    if (!iw || !ih) {
      return;
    }

    const scale = Math.max(targetW / iw, targetH / ih);
    const drawW = iw * scale;
    const drawH = ih * scale;
    const dx = (targetW - drawW) / 2;
    const dy = (targetH - drawH) / 2;
    targetCtx.drawImage(image, dx, dy, drawW, drawH);
  }

  syncCanvasSize();
  baseCtx.clearRect(0, 0, W, H);
  drawImageCover(baseCtx, topImg, W, H);

  function drawReveal(clientX, clientY) {
    ctx.clearRect(0, 0, W, H);
    if (clientX == null || clientY == null) {
      hud.style.opacity = '0';
      return;
    }

    const rect = baseCanvas.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return;
    }

    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
      hud.style.opacity = '0';
      return;
    }

    const sx = W / rect.width;
    const sy = H / rect.height;
    const scale = Math.max(sx, sy);
    const cx = (clientX - rect.left) * sx;
    const cy = (clientY - rect.top) * sy;
    const r = currentRadius * scale;
    const activeRevealImg = isExposedMode && exposedImage ? exposedImage : revealImg;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    drawImageCover(ctx, activeRevealImg, W, H);
    ctx.restore();

    const fade = ctx.createRadialGradient(cx, cy, r * 0.55, cx, cy, r);
    fade.addColorStop(0, 'transparent');
    fade.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = fade;
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = isExposedMode ? 'rgba(80,220,130,0.75)' : ringColor;
    ctx.lineWidth = 2 * scale;
    ctx.stroke();

    hud.style.opacity = '1';
    hud.textContent = `${Math.round(currentRadius)}px · ${isExposedMode ? 'identity' : 'reveal'}`;
    if (showLayerButton) {
      if (hasExposedLayer) {
        layerBtn.textContent = isExposedMode ? 'Layer: Identity' : 'Layer: Reveal';
      } else {
        layerBtn.textContent = 'Layer: Identity unavailable';
      }
    }
  }

  container.addEventListener('mousemove', (event) => {
    pointerX = event.clientX;
    pointerY = event.clientY;
    drawReveal(pointerX, pointerY);
  });

  container.addEventListener('mouseleave', () => {
    pointerX = null;
    pointerY = null;
    drawReveal(null, null);
  });

  container.addEventListener('wheel', (event) => {
    if (!captureWheel) {
      return;
    }
    event.preventDefault();
    currentRadius = Math.max(minRadius, Math.min(maxRadius, currentRadius + (event.deltaY * scrollSpeed)));
    if (pointerX != null && pointerY != null) {
      drawReveal(pointerX, pointerY);
    }
  }, { passive: false });

  container.addEventListener('click', () => {
    if (!toggleOnClick || !exposedImage) {
      return;
    }
    isExposedMode = !isExposedMode;
    const rect = baseCanvas.getBoundingClientRect();
    const drawX = pointerX != null ? pointerX : (rect.left + rect.width / 2);
    const drawY = pointerY != null ? pointerY : (rect.top + rect.height / 2);
    drawReveal(drawX, drawY);
  });

  async function copyActiveLayerImage() {
    const sourceImg = isExposedMode && exposedImage ? exposedImage : revealImg;
    const sourceUrl = sourceImg?.currentSrc || sourceImg?.src || '';
    if (!sourceUrl) {
      copyBtn.textContent = 'Copy Unavailable';
      window.setTimeout(() => {
        copyBtn.textContent = 'Copy';
      }, 1200);
      return;
    }

    try {
      const canvas = document.createElement('canvas');
      const drawW = sourceImg.naturalWidth || sourceImg.width;
      const drawH = sourceImg.naturalHeight || sourceImg.height;
      if (!drawW || !drawH) {
        throw new Error('Image dimensions unavailable');
      }

      canvas.width = drawW;
      canvas.height = drawH;
      const cctx = canvas.getContext('2d');
      cctx.drawImage(sourceImg, 0, 0, drawW, drawH);

      const pngBlob = await new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('PNG conversion failed'));
          }
        }, 'image/png');
      });

      if (navigator.clipboard && typeof navigator.clipboard.write === 'function' && typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': pngBlob })
        ]);
        copyBtn.textContent = 'Copied';
      } else if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(sourceUrl);
        copyBtn.textContent = 'URL Copied';
      } else {
        throw new Error('Clipboard API unavailable');
      }
      window.setTimeout(() => {
        copyBtn.textContent = 'Copy';
      }, 1000);
    } catch {
      try {
        const anchor = document.createElement('a');
        anchor.href = sourceUrl;
        anchor.download = sourceUrl.split('/').pop() || 'xray-image.png';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        copyBtn.textContent = 'Downloaded';
      } catch {
        copyBtn.textContent = 'Copy Failed';
      }
      window.setTimeout(() => {
        copyBtn.textContent = 'Copy';
      }, 1200);
    }
  }

  copyBtn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    copyActiveLayerImage();
  });

  if (showLayerButton) {
    layerBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!hasExposedLayer || !exposedImage) {
        layerBtn.textContent = 'Layer unavailable';
        window.setTimeout(() => {
          layerBtn.textContent = 'Layer: Identity unavailable';
        }, 900);
        return;
      }
      isExposedMode = !isExposedMode;
      const rect = baseCanvas.getBoundingClientRect();
      const drawX = pointerX != null ? pointerX : (rect.left + rect.width / 2);
      const drawY = pointerY != null ? pointerY : (rect.top + rect.height / 2);
      drawReveal(drawX, drawY);
    });
  }

  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => {
      syncCanvasSize();
    });
    ro.observe(container);
  } else {
    window.addEventListener('resize', syncCanvasSize);
  }
}