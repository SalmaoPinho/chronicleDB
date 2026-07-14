(function () {
  'use strict';

  const viewport = document.getElementById('mapViewport');
  const world = document.getElementById('mapWorld');
  const statusBar = document.getElementById('statusBar');
  const resetBtn = document.getElementById('resetViewBtn');

  if (!viewport || !world || !statusBar || !resetBtn) {
    return;
  }

  const state = {
    tx: 0,
    ty: 0,
    scale: 1,
    dragging: false,
    lastX: 0,
    lastY: 0
  };

  const SCALE_MIN = 0.55;
  const SCALE_MAX = 3.4;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function updateWorldTransform() {
    world.setAttribute('transform', `translate(${state.tx} ${state.ty}) scale(${state.scale})`);
    statusBar.textContent = `Pan: x ${Math.round(state.tx)}, y ${Math.round(state.ty)} · Zoom: ${state.scale.toFixed(2)}x`;
  }

  function zoomAtClientPoint(deltaY, clientX, clientY) {
    const rect = viewport.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;

    const intensity = deltaY > 0 ? 0.9 : 1.1;
    const nextScale = clamp(state.scale * intensity, SCALE_MIN, SCALE_MAX);
    if (nextScale === state.scale) {
      return;
    }

    const wx = (px - state.tx) / state.scale;
    const wy = (py - state.ty) / state.scale;

    state.scale = nextScale;
    state.tx = px - wx * state.scale;
    state.ty = py - wy * state.scale;

    updateWorldTransform();
  }

  viewport.addEventListener('pointerdown', (event) => {
    state.dragging = true;
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    viewport.classList.add('dragging');
    viewport.setPointerCapture(event.pointerId);
  });

  viewport.addEventListener('pointermove', (event) => {
    if (!state.dragging) {
      return;
    }

    const dx = event.clientX - state.lastX;
    const dy = event.clientY - state.lastY;
    state.lastX = event.clientX;
    state.lastY = event.clientY;

    state.tx += dx;
    state.ty += dy;
    updateWorldTransform();
  });

  function finishDrag(event) {
    if (!state.dragging) {
      return;
    }
    state.dragging = false;
    viewport.classList.remove('dragging');
    if (event && viewport.hasPointerCapture(event.pointerId)) {
      viewport.releasePointerCapture(event.pointerId);
    }
  }

  viewport.addEventListener('pointerup', finishDrag);
  viewport.addEventListener('pointercancel', finishDrag);
  viewport.addEventListener('pointerleave', finishDrag);

  viewport.addEventListener('wheel', (event) => {
    event.preventDefault();
    zoomAtClientPoint(event.deltaY, event.clientX, event.clientY);
  }, { passive: false });

  resetBtn.addEventListener('click', () => {
    state.tx = 0;
    state.ty = 0;
    state.scale = 1;
    updateWorldTransform();
  });

  updateWorldTransform();
})();
