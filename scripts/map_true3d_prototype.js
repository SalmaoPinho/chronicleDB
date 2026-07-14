import * as THREE from '../node_modules/three/build/three.module.js';

(function () {
  'use strict';

  const viewport = document.getElementById('threeViewport');
  const statusBar = document.getElementById('statusBar');
  const resetViewBtn = document.getElementById('resetViewBtn');
  const menuToggleBtn = document.getElementById('menuToggleBtn');
  const navPanel = document.getElementById('navPanel');
  const closeNavBtn = document.getElementById('closeNavBtn');
  const jumpList = document.getElementById('jumpList');
  const exportSceneBtn = document.getElementById('exportSceneBtn');
  const holeOverlayToggle = document.getElementById('holeOverlayToggle');

  if (!viewport || !statusBar || !resetViewBtn) {
    return;
  }

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  viewport.appendChild(renderer.domElement);

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(56, 1, 0.1, 12000);

  const control = {
    target: new THREE.Vector3(0, 0, 0),
    radius: 720,
    theta: 0.85,
    phi: 1.08,
    minRadius: 180,
    maxRadius: 2400,
    minPhi: 0.35,
    maxPhi: 1.48
  };
  const movementKeys = new Set();
  const MOVE_KEY_CODES = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD']);
  let statusPrefix = '';
  let configSourceNote = '';
  let initialRadius = 720;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function updateCamera() {
    control.phi = clamp(control.phi, control.minPhi, control.maxPhi);
    control.radius = clamp(control.radius, control.minRadius, control.maxRadius);

    const sinPhi = Math.sin(control.phi);
    const x = control.target.x + control.radius * sinPhi * Math.sin(control.theta);
    const y = control.target.y + control.radius * Math.cos(control.phi);
    const z = control.target.z + control.radius * sinPhi * Math.cos(control.theta);

    camera.position.set(x, y, z);
    camera.lookAt(control.target);

    const details =
      `Target: (${control.target.x.toFixed(0)}, ${control.target.z.toFixed(0)}) · ` +
      `Distance: ${control.radius.toFixed(0)} · ` +
      'WASD move | Drag orbit | Right-drag pan | Wheel zoom';

    statusBar.textContent = statusPrefix ? `${statusPrefix} · ${details}` : details;
  }

  function setNavPanelOpen(isOpen) {
    if (!navPanel) {
      return;
    }
    navPanel.classList.toggle('open', isOpen);
    navPanel.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
  }

  function wireMenuShell() {
    if (menuToggleBtn) {
      menuToggleBtn.addEventListener('click', () => {
        const nextState = !navPanel?.classList.contains('open');
        setNavPanelOpen(Boolean(nextState));
      });
    }
    if (closeNavBtn) {
      closeNavBtn.addEventListener('click', () => setNavPanelOpen(false));
    }
  }

  function setupExportAction() {
    if (!exportSceneBtn) {
      return;
    }
    exportSceneBtn.addEventListener('click', () => {
      const exporter = new THREE.ObjectExporter();
      const data = exporter.parse(scene);
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `ashford-scene-${Date.now()}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
    });
  }

  function sanitizeFileName(input) {
    return String(input || 'building')
      .replace(/[<>:"/\\|?*]+/g, '')
      .replace(/\s+/g, '_')
      .slice(0, 80);
  }

  function buildObjFromObjects(objects, objectName) {
    const lines = [`o ${objectName}`];
    let vertexOffset = 0;
    const v = new THREE.Vector3();

    function appendMesh(mesh) {
      const geometry = mesh.geometry;
      if (!geometry || !geometry.isBufferGeometry) {
        return;
      }
      const pos = geometry.getAttribute('position');
      if (!pos || !pos.count) {
        return;
      }

      mesh.updateWorldMatrix(true, false);
      const matrix = mesh.matrixWorld;

      lines.push(`g ${sanitizeFileName(mesh.name || mesh.uuid)}`);

      for (let i = 0; i < pos.count; i += 1) {
        v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
        lines.push(`v ${v.x.toFixed(6)} ${v.y.toFixed(6)} ${v.z.toFixed(6)}`);
      }

      const index = geometry.getIndex();
      if (index) {
        for (let i = 0; i < index.count; i += 3) {
          const a = index.getX(i) + 1 + vertexOffset;
          const b = index.getX(i + 1) + 1 + vertexOffset;
          const c = index.getX(i + 2) + 1 + vertexOffset;
          lines.push(`f ${a} ${b} ${c}`);
        }
      } else {
        for (let i = 0; i < pos.count; i += 3) {
          const a = i + 1 + vertexOffset;
          const b = i + 2 + vertexOffset;
          const c = i + 3 + vertexOffset;
          lines.push(`f ${a} ${b} ${c}`);
        }
      }

      vertexOffset += pos.count;
    }

    for (const root of objects || []) {
      if (!root) {
        continue;
      }
      root.traverse((node) => {
        if (node.isMesh) {
          appendMesh(node);
        }
      });
    }

    return lines.join('\n');
  }

  function downloadLotObj(lot) {
    if (!lot) {
      return;
    }
    const title = String(lot?.title || '').trim();
    if (!title) {
      return;
    }
    const objText = buildObjFromObjects(lot.objects || [], sanitizeFileName(title));
    if (!objText || objText.length < 12) {
      return;
    }
    const blob = new Blob([objText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${sanitizeFileName(title)}.obj`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function setupJumpMenu(targets, exportLots) {
    if (!jumpList) {
      return;
    }

    jumpList.innerHTML = '';
    const residentialKinds = new Set(['boone-house', 'house-small', 'house-standard', 'house-big', 'apartment-tower', 'mansion']);
    const homes = targets.filter((entry) => residentialKinds.has(String(entry.kind || '')));
    const source = homes.length ? homes : targets;
    source.sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));

    const exportByTitle = new Map();
    for (const lot of Array.isArray(exportLots) ? exportLots : []) {
      const title = String(lot?.title || '').trim();
      if (!title) {
        continue;
      }
      const existing = exportByTitle.get(title) || [];
      existing.push(lot);
      exportByTitle.set(title, existing);
    }

    for (const target of source) {
      if (!target?.title) {
        continue;
      }

      const lotGroup = exportByTitle.get(String(target.title)) || [];
      const exportLot = lotGroup.length ? lotGroup.shift() : null;

      const row = document.createElement('div');
      row.className = 'jump-row';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'jump-btn';
      btn.textContent = target.title;
      btn.addEventListener('click', () => {
        control.target.set(target.x, 0, target.z);
        const preferredRadius = Math.max(340, (Number(target.extent) || 220) * 1.8);
        control.radius = clamp(preferredRadius, control.minRadius, control.maxRadius);
        updateCamera();
      });

      const exportBtn = document.createElement('button');
      exportBtn.type = 'button';
      exportBtn.className = 'jump-export-btn';
      exportBtn.textContent = 'E';
      exportBtn.title = `Export ${target.title} as OBJ`;
      exportBtn.setAttribute('aria-label', `Export ${target.title} as OBJ`);
      if (!exportLot) {
        exportBtn.disabled = true;
      }
      exportBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        downloadLotObj(exportLot);
      });

      row.appendChild(btn);
      row.appendChild(exportBtn);
      jumpList.appendChild(row);
    }
  }

  function resize() {
    const rect = viewport.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width || viewport.clientWidth || 1));
    const height = Math.max(1, Math.round(rect.height || viewport.clientHeight || 1));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }

  // --- Procedural Canvas Textures for College Project Requirements ---
  function createGrassTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#6fa165'; // grass green base
    ctx.fillRect(0, 0, 128, 128);
    
    // Draw noise blade patterns
    for (let i = 0; i < 2000; i++) {
      const x = Math.random() * 128;
      const y = Math.random() * 128;
      const len = 1 + Math.random() * 3;
      const greenIntensity = 120 + Math.floor(Math.random() * 50);
      ctx.strokeStyle = `rgb(${45 + Math.floor(Math.random() * 15)}, ${greenIntensity}, 45)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - len);
      ctx.stroke();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(16, 16);
    return texture;
  }

  function createBrickTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#b55a4c'; // terracotta/brick red base
    ctx.fillRect(0, 0, 128, 128);
    
    // Draw running brick bonds
    ctx.fillStyle = '#d5cebd'; // mortar gray/beige lines
    const rows = 12;
    const cols = 6;
    const rh = 128 / rows;
    const cw = 128 / cols;
    
    for (let r = 0; r <= rows; r++) {
      ctx.fillRect(0, r * rh, 128, 1.5); // horizontal mortar
    }
    for (let r = 0; r < rows; r++) {
      const offset = (r % 2) * (cw / 2);
      for (let c = 0; c <= cols + 1; c++) {
        ctx.fillRect(c * cw - offset, r * rh, 1.5, rh); // vertical mortar
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 4);
    return texture;
  }

  function createGravelTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    
    // Base neutral grey
    ctx.fillStyle = '#e0e0e0';
    ctx.fillRect(0, 0, 128, 128);

    // Mottling
    for (let i = 0; i < 25; i++) {
      const cx = Math.random() * 128;
      const cy = Math.random() * 128;
      const radius = 6 + Math.random() * 12;
      const opacity = 0.05 + Math.random() * 0.05;
      const isDark = Math.random() > 0.5;
      
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      if (isDark) {
        grad.addColorStop(0, `rgba(100, 100, 100, ${opacity})`);
        grad.addColorStop(1, 'rgba(100, 100, 100, 0)');
      } else {
        grad.addColorStop(0, `rgba(255, 255, 255, ${opacity})`);
        grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      }
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // High density gravel-like subtle specks with high contrast
    for (let i = 0; i < 5000; i++) {
      const x = Math.random() * 128;
      const y = Math.random() * 128;
      const rand = Math.random();
      let color;
      if (rand < 0.45) {
        color = 'rgba(40, 40, 40, 0.45)'; // darker dark speck
      } else {
        color = 'rgba(255, 255, 255, 0.55)'; // brighter light speck
      }
      ctx.fillStyle = color;
      const w = Math.random() < 0.9 ? 1 : 2;
      const h = Math.random() < 0.9 ? 1 : 2;
      ctx.fillRect(x, y, w, h);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(48, 48); // significantly scaled down
    return texture;
  }

  function createConcreteTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#a6adb0'; // concrete grey base
    ctx.fillRect(0, 0, 128, 128);
    
    // Soft mottling
    for (let i = 0; i < 15; i++) {
      const cx = Math.random() * 128;
      const cy = Math.random() * 128;
      const radius = 12 + Math.random() * 16;
      const opacity = 0.04 + Math.random() * 0.06;
      const isDark = Math.random() > 0.5;
      
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      if (isDark) {
        grad.addColorStop(0, `rgba(90, 90, 90, ${opacity})`);
        grad.addColorStop(1, 'rgba(90, 90, 90, 0)');
      } else {
        grad.addColorStop(0, `rgba(210, 210, 210, ${opacity})`);
        grad.addColorStop(1, 'rgba(210, 210, 210, 0)');
      }
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Concrete gravel-like specks noise with higher contrast
    for (let i = 0; i < 4000; i++) {
      const x = Math.random() * 128;
      const y = Math.random() * 128;
      const rand = Math.random();
      let color;
      if (rand < 0.5) {
        color = 'rgba(40, 40, 40, 0.38)'; // darker concrete grit
      } else {
        color = 'rgba(255, 255, 255, 0.42)'; // brighter concrete grit
      }
      ctx.fillStyle = color;
      const w = Math.random() < 0.92 ? 1 : 2;
      const h = Math.random() < 0.92 ? 1 : 2;
      ctx.fillRect(x, y, w, h);
    }
    
    // Concrete seam lines
    ctx.strokeStyle = 'rgba(70, 70, 70, 0.35)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, 64);
    ctx.lineTo(128, 64);
    ctx.moveTo(64, 0);
    ctx.lineTo(64, 128);
    ctx.stroke();
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(32, 32); // significantly scaled down concrete base texture
    return texture;
  }

  function createRoadTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0f0f0f'; // black roads for now
    ctx.fillRect(0, 0, 64, 64);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 4);
    return texture;
  }

  // Pre-instantiated textures
  const grassTexture = createGrassTexture();
  const brickTexture = createBrickTexture();
  const gravelTexture = createGravelTexture();
  const roadTexture = createRoadTexture();
  const concreteTexture = createConcreteTexture();

  function makeMaterial(color, texture) {
    const matConfig = { color, roughness: 0.92, metalness: 0.05 };
    if (texture) {
      matConfig.map = texture;
    }
    return new THREE.MeshStandardMaterial(matConfig);
  }

  const windowTextureCache = new Map();

  function getWindowTexturesForColor(wallColor) {
    const colorHex = new THREE.Color(wallColor).getHex();
    if (windowTextureCache.has(colorHex)) {
      return windowTextureCache.get(colorHex);
    }

    const hexString = '#' + new THREE.Color(wallColor).getHexString();
    
    // Create base map canvas (256x256)
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    
    // Create emissive map canvas (256x256)
    const emCanvas = document.createElement('canvas');
    emCanvas.width = 256;
    emCanvas.height = 256;
    const emCtx = emCanvas.getContext('2d');
    
    // 1. Fill base map with wall color
    ctx.fillStyle = hexString;
    ctx.fillRect(0, 0, 256, 256);
    
    // 2. Fill emissive map with black (no initial glow)
    emCtx.fillStyle = '#000000';
    emCtx.fillRect(0, 0, 256, 256);
    
    // Grid of windows (8 columns, 8 rows) - vertical proportions
    const cols = 8;
    const rows = 8;
    const winW = 18; 
    const winH = 24;
    const padX = (256 - (cols * winW)) / (cols + 1);
    const padY = (256 - (rows * winH)) / (rows + 1);
    
    for (let r = 0; r < rows; r++) {
      const y = padY + r * (winH + padY);
      for (let c = 0; c < cols; c++) {
        const x = padX + c * (winW + padX);
        
        // Deterministic pseudo-randomness based on grid coordinates
        const glowSeed = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
        const randVal = glowSeed - Math.floor(glowSeed);
        
        if (randVal > 0.45) {
          // Glowing warm light window
          const glowGrad = ctx.createLinearGradient(x, y, x, y + winH);
          glowGrad.addColorStop(0, '#ffffff'); // bright center glow
          glowGrad.addColorStop(0.25, '#fff2cc'); // soft warm cream
          glowGrad.addColorStop(0.75, '#ffc233'); // radiant gold
          glowGrad.addColorStop(1.0, '#ff8000'); // warm amber bottom
          
          ctx.fillStyle = glowGrad;
          ctx.fillRect(x, y, winW, winH);
          
          // Draw the same glowing colors in the emissive map so they shine!
          emCtx.fillStyle = glowGrad;
          emCtx.fillRect(x, y, winW, winH);
          
          // Window reflection shine highlights
          ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
          ctx.fillRect(x + 2, y + 2, winW - 4, 2);
          emCtx.fillStyle = 'rgba(255, 255, 255, 0.45)';
          emCtx.fillRect(x + 2, y + 2, winW - 4, 2);
        } else {
          // Dark window (deep reflection glass)
          ctx.fillStyle = '#12161f';
          ctx.fillRect(x, y, winW, winH);
          
          // Highlight reflection diagonal
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x + 2, y + winH - 2);
          ctx.lineTo(x + winW - 2, y + 2);
          ctx.stroke();
          
          // Emissive map remains black for dark windows
        }
        
        // Window frame border
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, y, winW, winH);
      }
    }
    
    const mapTex = new THREE.CanvasTexture(canvas);
    mapTex.wrapS = THREE.RepeatWrapping;
    mapTex.wrapT = THREE.RepeatWrapping;
    
    const emTex = new THREE.CanvasTexture(emCanvas);
    emTex.wrapS = THREE.RepeatWrapping;
    emTex.wrapT = THREE.RepeatWrapping;
    
    const result = { map: mapTex, emissiveMap: emTex };
    windowTextureCache.set(colorHex, result);
    return result;
  }

  function makeMultiMaterialBox(width, height, depth, wallColor, roofColor, templateType = 'box') {
    let topMaterial;
    if (templateType === 'box') {
      topMaterial = makeMaterial(roofColor || 0x666b72, gravelTexture);
    } else {
      topMaterial = makeMaterial(wallColor);
    }

    const textures = getWindowTexturesForColor(wallColor);
    const texX = textures.map.clone();
    const emX = textures.emissiveMap.clone();
    
    const texZ = textures.map.clone();
    const emZ = textures.emissiveMap.clone();

    // Constant world dimensions for a single texture tile (8 windows)
    // 8 windows * 12 world units = 96 units wide / high to ensure a 1:1 aspect ratio (no stretching)
    const tileDim = 96;

    const repeatXX = depth / tileDim;
    const repeatXY = height / tileDim;
    texX.repeat.set(repeatXX, repeatXY);
    emX.repeat.set(repeatXX, repeatXY);

    // Offset in integer window increments (1/8ths) to align outlines at corners perfectly
    const offsetX = Math.floor(Math.random() * 8) / 8;
    const offsetY = Math.floor(Math.random() * 8) / 8;
    texX.offset.set(offsetX, offsetY);
    emX.offset.set(offsetX, offsetY);

    const repeatZX = width / tileDim;
    const repeatZY = height / tileDim;
    texZ.repeat.set(repeatZX, repeatZY);
    emZ.repeat.set(repeatZX, repeatZY);

    // Align Z-facing offsets with integer window boundaries
    const offsetZX = Math.floor(Math.random() * 8) / 8;
    const offsetZY = Math.floor(Math.random() * 8) / 8;
    texZ.offset.set(offsetZX, offsetZY);
    emZ.offset.set(offsetZX, offsetZY);

    const sideMatX = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: texX,
      emissiveMap: emX,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 1.3, // gives them a self-luminous glow!
      roughness: 0.5,
      metalness: 0.1
    });

    const sideMatZ = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: texZ,
      emissiveMap: emZ,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 1.3,
      roughness: 0.5,
      metalness: 0.1
    });

    return [
      sideMatX, // +X
      sideMatX, // -X
      topMaterial, // +Y (Top)
      topMaterial, // -Y (Bottom)
      sideMatZ, // +Z
      sideMatZ  // -Z
    ];
  }

  // --- Procedural Trees (Low-Poly Pine Trees) ---
  function addTree(x, z, scale = 1.0, castShadow = false) {
    const treeGroup = new THREE.Group();
    
    // Trunk
    const trunkHeight = 6 * scale;
    const trunkRadius = 0.8 * scale;
    const trunkGeo = new THREE.CylinderGeometry(trunkRadius * 0.7, trunkRadius, trunkHeight, 5);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = trunkHeight / 2;
    trunk.castShadow = castShadow;
    trunk.receiveShadow = true;
    treeGroup.add(trunk);
    
    // Foliage (stacked low-poly cones)
    const foliageLevels = 3;
    const foliageHeight = 7 * scale;
    const foliageRadius = 3.5 * scale;
    const foliageMat = makeMaterial(0x2d592a, grassTexture); // green foliage with grass texture details
    
    for (let i = 0; i < foliageLevels; i++) {
      const levelGeo = new THREE.ConeGeometry(foliageRadius * (1 - i * 0.22), foliageHeight, 5);
      const level = new THREE.Mesh(levelGeo, foliageMat);
      level.position.y = trunkHeight + (i * foliageHeight * 0.4);
      level.castShadow = castShadow;
      level.receiveShadow = true;
      treeGroup.add(level);
    }
    
    treeGroup.position.set(x, 0, z); // Y offset adjusted in caller if on non-zero Y
    treeGroup.rotation.y = Math.random() * Math.PI * 2;
    scene.add(treeGroup);
    return treeGroup;
  }

  function scatterTreesOnLot(centerX, centerZ, sizeX, sizeZ, count, baseHeight, castShadow = false) {
    for (let i = 0; i < count; i++) {
      const tx = centerX + (Math.random() - 0.5) * sizeX * 0.82;
      const tz = centerZ + (Math.random() - 0.5) * sizeZ * 0.82;
      const scale = 3.25 + Math.random() * 3.0;
      const tree = addTree(tx, tz, scale, castShadow);
      tree.position.y = baseHeight;
    }
  }

  function scatterTreesOnTerrainStrip(width, depth, x, z) {
    const area = width * depth;
    const treeCount = Math.min(35, Math.floor(area / 800000)); // Cap at 35 to prevent lag
    for (let i = 0; i < treeCount; i++) {
      const tx = x + (Math.random() - 0.5) * width * 0.95;
      const tz = z + (Math.random() - 0.5) * depth * 0.95;
      const scale = 4.0 + Math.random() * 3.75;
      const tree = addTree(tx, tz, scale, false);
      tree.position.y = 1.2; // terrain strip Y is 1.2
    }
  }

  // --- Procedural Cars for Traffic ---
  function createCarMesh(colorHex, roadWidth) {
    const carGroup = new THREE.Group();

    const width = Math.max(3, roadWidth * 0.16);
    const length = width * 1.8;
    const height = width * 0.65;

    // 1. Car Body
    const bodyGeo = new THREE.BoxGeometry(length, height, width);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: colorHex,
      roughness: 0.4,
      metalness: 0.1
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    const wheelRadius = width * 0.18;
    const bodyY = wheelRadius + height * 0.5;
    body.position.y = bodyY;
    carGroup.add(body);

    // 2. Cabin
    const cabinH = height * 0.75;
    const cabinW = width * 0.85;
    const cabinL = length * 0.55;
    const cabinGeo = new THREE.BoxGeometry(cabinL, cabinH, cabinW);
    const cabinMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      roughness: 0.2,
      metalness: 0.8
    });
    const cabin = new THREE.Mesh(cabinGeo, cabinMat);
    cabin.position.set(-length * 0.1, bodyY + height * 0.5 + cabinH * 0.5 - 0.1, 0);
    carGroup.add(cabin);

    // 3. Wheels (4 small box meshes to minimize draw call impact)
    const wheelW = width * 0.22;
    const wheelH = wheelRadius * 2;
    const wheelL = wheelRadius * 2;
    const wheelGeo = new THREE.BoxGeometry(wheelL, wheelH, wheelW);
    const wheelMat = new THREE.MeshStandardMaterial({
      color: 0x111111,
      roughness: 0.9
    });

    const spawnWheel = (cx, cz) => {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.position.set(cx, wheelRadius, cz);
      carGroup.add(wheel);
    };

    const wheelXOffset = length * 0.28;
    const wheelZOffset = width * 0.45;
    spawnWheel(wheelXOffset, -wheelZOffset);
    spawnWheel(wheelXOffset, wheelZOffset);
    spawnWheel(-wheelXOffset, -wheelZOffset);
    spawnWheel(-wheelXOffset, wheelZOffset);

    // 4. Headlights (yellow emissive boxes)
    const lightGeo = new THREE.BoxGeometry(0.15, height * 0.3, width * 0.15);
    const lightMat = new THREE.MeshStandardMaterial({
      color: 0xffeb3b,
      emissive: 0xffeb3b,
      emissiveIntensity: 2.0
    });
    const leftHeadlight = new THREE.Mesh(lightGeo, lightMat);
    leftHeadlight.position.set(length * 0.5 + 0.05, bodyY, -width * 0.32);
    carGroup.add(leftHeadlight);

    const rightHeadlight = new THREE.Mesh(lightGeo, lightMat);
    rightHeadlight.position.set(length * 0.5 + 0.05, bodyY, width * 0.32);
    carGroup.add(rightHeadlight);

    // 5. Taillights (red emissive boxes)
    const tailMat = new THREE.MeshStandardMaterial({
      color: 0xf44336,
      emissive: 0xf44336,
      emissiveIntensity: 1.5
    });
    const leftTaillight = new THREE.Mesh(lightGeo, tailMat);
    leftTaillight.position.set(-length * 0.5 - 0.05, bodyY, -width * 0.32);
    carGroup.add(leftTaillight);

    const rightTaillight = new THREE.Mesh(lightGeo, tailMat);
    rightTaillight.position.set(-length * 0.5 - 0.05, bodyY, width * 0.32);
    carGroup.add(rightTaillight);

    // Disable shadow casting for maximum traffic density performance
    carGroup.castShadow = false;
    carGroup.receiveShadow = false;
    carGroup.traverse((child) => {
      child.castShadow = false;
      child.receiveShadow = false;
    });

    return carGroup;
  }

  // --- Procedural Skybox (Sky Gradient, Sun, and God Rays painted on a single texture to avoid lag) ---
  function createSkybox() {
    const skyGeo = new THREE.SphereGeometry(200000, 32, 15);
    
    // Draw sky linear gradient on canvas
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    
    // 1. Draw base sky gradient (vertical)
    const skyGrad = ctx.createLinearGradient(0, 0, 0, 512);
    skyGrad.addColorStop(0, '#0a172c');   // dark twilight top sky
    skyGrad.addColorStop(0.35, '#133566'); // deep blue sky
    skyGrad.addColorStop(0.65, '#4b73ad'); // light horizon blue
    skyGrad.addColorStop(0.85, '#e0a579'); // warm sunset band
    skyGrad.addColorStop(1.0, '#ebd2b2');  // soft warm horizon haze
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, 1024, 512);
    
    // 2. Draw Sunrays (painted onto the sky canvas!)
    const sunX = 512;
    const sunY = 200;
    
    function drawRay(targetX1, targetX2) {
      const rayGrad = ctx.createLinearGradient(sunX, sunY, (targetX1 + targetX2) / 2, 512);
      rayGrad.addColorStop(0, 'rgba(255, 248, 210, 0.22)');
      rayGrad.addColorStop(0.4, 'rgba(255, 245, 210, 0.08)');
      rayGrad.addColorStop(1.0, 'rgba(255, 245, 210, 0.0)');
      
      ctx.fillStyle = rayGrad;
      ctx.beginPath();
      ctx.moveTo(sunX, sunY);
      ctx.lineTo(targetX1, 512);
      ctx.lineTo(targetX2, 512);
      ctx.closePath();
      ctx.fill();
    }
    
    // Draw 4 distinct beams of god rays
    drawRay(220, 320);
    drawRay(380, 460);
    drawRay(540, 640);
    drawRay(720, 840);
    
    // 3. Draw Sun glowing radial gradient
    const sunGrad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 150);
    sunGrad.addColorStop(0, 'rgba(255, 255, 252, 1.0)');
    sunGrad.addColorStop(0.12, 'rgba(255, 250, 210, 0.9)');
    sunGrad.addColorStop(0.28, 'rgba(255, 230, 150, 0.45)');
    sunGrad.addColorStop(0.5, 'rgba(255, 210, 120, 0.15)');
    sunGrad.addColorStop(1.0, 'rgba(255, 210, 120, 0.0)');
    
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 150, 0, Math.PI * 2);
    ctx.fill();
    
    // 4. Draw soft painted clouds (non-3D)
    function drawCloudGroup(cx, cy, numBlobs, baseWidth) {
      for (let i = 0; i < numBlobs; i++) {
        // Randomly offset each blob in the group
        const bx = cx + (Math.random() - 0.5) * baseWidth * 0.7;
        const by = cy + (Math.random() - 0.5) * baseWidth * 0.15;
        const bw = baseWidth * (0.5 + Math.random() * 0.6);
        const bh = bw * (0.22 + Math.random() * 0.12);
        
        ctx.save();
        const grad = ctx.createRadialGradient(bx, by, 0, bx, by, bw * 0.5);
        // Slightly warm sunset tint for clouds closer to horizon, whiter for high altitude
        const tint = cy > 210 ? '254, 238, 222' : '255, 255, 255';
        grad.addColorStop(0, `rgba(${tint}, 0.28)`);
        grad.addColorStop(0.3, `rgba(${tint}, 0.18)`);
        grad.addColorStop(0.7, `rgba(${tint}, 0.05)`);
        grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        
        ctx.fillStyle = grad;
        ctx.translate(bx, by);
        ctx.scale(bw / bh, 1);
        ctx.beginPath();
        ctx.arc(0, 0, bh * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // Spawn 5 cloud groups around the sky sphere
    drawCloudGroup(180, 160, 4, 160);
    drawCloudGroup(340, 210, 5, 130);
    drawCloudGroup(550, 150, 6, 210); // near sun
    drawCloudGroup(760, 190, 4, 170);
    drawCloudGroup(900, 220, 5, 140);

    const skyTex = new THREE.CanvasTexture(canvas);
    const skyMat = new THREE.MeshBasicMaterial({
      map: skyTex,
      side: THREE.BackSide,
      depthWrite: false
    });
    
    const sky = new THREE.Mesh(skyGeo, skyMat);
    // Rotate skybox to align the sun position exactly with DirectionalLight (360, 520, 280)
    sky.rotation.y = Math.atan2(360, 280) - Math.PI;
    scene.add(sky);
    return sky;
  }

  const DEFAULT_BUILDING_TYPES = {
    center: { template: 'none', baseColor: 0xcdb28c },
    park: { template: 'none', baseColor: 0x6da66f },
    'boone-house': {
      template: 'house',
      widthRatio: 0.48,
      depthRatio: 0.46,
      heightRatio: 3.7,
      wallColor: 0xf5f2ea,
      roofColor: 0x7b4b3d,
      porchColor: 0xbca57e,
      baseColor: 0xcab792
    },
    'house-standard': {
      template: 'house',
      widthRatio: 0.68,
      depthRatio: 0.68,
      heightRatio: 4.8,
      wallColor: 0xf2efe6,
      roofColor: 0x8a4e3f,
      porchColor: 0xbca57e,
      baseColor: 0xbec3bc
    },
    'house-small': {
      template: 'house',
      widthRatio: 0.52,
      depthRatio: 0.5,
      heightRatio: 3.9,
      wallColor: 0xe9e2d3,
      roofColor: 0x6e4e3b,
      porchColor: 0xac9471,
      roofHeightRatio: 0.44,
      porchDepthRatio: 0.17,
      baseColor: 0xbec3bc
    },
    'house-big': {
      template: 'house',
      widthRatio: 0.64,
      depthRatio: 0.63,
      heightRatio: 4.9,
      wallColor: 0xf4f1e8,
      roofColor: 0x7e5042,
      porchColor: 0xbfa481,
      roofHeightRatio: 0.52,
      porchDepthRatio: 0.22,
      maxWidthBlocks: 1.55,
      maxDepthBlocks: 1.42,
      baseColor: 0xbec3bc
    },
    mansion: {
      template: 'house',
      widthRatio: 0.76,
      depthRatio: 0.72,
      heightRatio: 6.3,
      wallColor: 0xe6e2d7,
      roofColor: 0x4a4f5a,
      porchColor: 0xbdb6a3,
      roofHeightRatio: 0.48,
      maxWidthBlocks: 1.95,
      maxDepthBlocks: 1.75,
      baseColor: 0xc9cdc7
    },
    'high-school': { template: 'school', wallColor: 0xc9b69f, roofColor: 0x6f7478, trimColor: 0x3f4755, baseColor: 0xbec3bc },
    church: { template: 'church', wallColor: 0xd7d0c0, roofColor: 0x5e666e, towerColor: 0xc9c0ad, baseColor: 0xbec3bc },
    mall: {
      template: 'box',
      widthRatio: 0.88,
      depthRatio: 0.84,
      heightRatio: 2.7,
      wallColor: 0xbfb8aa,
      roofColor: 0x5f6670,
      accentColor: 0x3f4a58,
      baseColor: 0xc7cbc3
    },
    'fast-food': {
      template: 'box',
      widthRatio: 0.62,
      depthRatio: 0.56,
      heightRatio: 2.2,
      wallColor: 0xd7b476,
      roofColor: 0xb94d37,
      accentColor: 0xf2e5c1,
      baseColor: 0xc5c8bf
    },
    'office-tower': {
      template: 'box',
      widthRatio: 0.58,
      depthRatio: 0.58,
      heightRatio: 8.2,
      wallColor: 0x8ea2b8,
      roofColor: 0x4a5563,
      accentColor: 0xb9d0e8,
      baseColor: 0xbdc4bf
    },
    'civic-hall': {
      template: 'box',
      widthRatio: 0.78,
      depthRatio: 0.7,
      heightRatio: 4.6,
      wallColor: 0xb8b6b0,
      roofColor: 0x646b73,
      accentColor: 0xd6d7da,
      baseColor: 0xc4c8c1
    },
    campus: {
      template: 'box',
      widthRatio: 0.82,
      depthRatio: 0.68,
      heightRatio: 3.9,
      wallColor: 0xb99b82,
      roofColor: 0x6a5f55,
      accentColor: 0xe4d8ca,
      baseColor: 0xc4c8c1
    }
  };

  function mergeBuildingTypes(rawTypes) {
    const merged = {};
    const source = rawTypes && typeof rawTypes === 'object' ? rawTypes : {};

    for (const [kind, defaults] of Object.entries(DEFAULT_BUILDING_TYPES)) {
      const fromJson = source[kind] && typeof source[kind] === 'object' ? source[kind] : {};
      merged[kind] = { ...defaults, ...fromJson };
    }

    for (const [kind, value] of Object.entries(source)) {
      if (!merged[kind] && value && typeof value === 'object') {
        merged[kind] = { ...value };
      }
    }

    return merged;
  }

  function normalizeRandomizedBuildingConfig(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const byKind = source.kinds && typeof source.kinds === 'object' ? source.kinds : {};
    return {
      enabled: source.enabled !== false,
      default: source.default && typeof source.default === 'object' ? source.default : {},
      kinds: byKind
    };
  }

  function stableHash(input) {
    const text = String(input || '');
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function seededUnit(seedText, salt) {
    const hash = stableHash(`${seedText}|${salt}`);
    return hash / 4294967295;
  }

  function randomInRange(rangeConfig, fallbackValue, seedText, salt) {
    const min = Number(rangeConfig?.min);
    const max = Number(rangeConfig?.max);
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return fallbackValue;
    }
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    const t = seededUnit(seedText, salt);
    return lo + (hi - lo) * t;
  }

  function randomColorFromList(colors, fallbackColor, seedText, salt) {
    if (!Array.isArray(colors) || !colors.length) {
      return fallbackColor;
    }
    const index = Math.floor(seededUnit(seedText, salt) * colors.length);
    const selected = Number(colors[Math.min(colors.length - 1, Math.max(0, index))]);
    if (!Number.isFinite(selected)) {
      return fallbackColor;
    }
    return selected;
  }

  function getRandomizedBuildingProfile(baseProfile, lotConfig, randomizedBuilding) {
    if (!randomizedBuilding?.enabled) {
      return baseProfile;
    }

    const kindName = String(lotConfig?.kind || '');
    const defaultConfig = randomizedBuilding.default || {};
    const kindConfig = randomizedBuilding.kinds?.[kindName] || {};
    const merged = { ...defaultConfig, ...kindConfig };
    const seedKey = `${lotConfig?.debug || 0}|${lotConfig?.title || ''}|${lotConfig?.cx || 0}|${lotConfig?.cz || 0}|${kindName}`;

    const profile = { ...baseProfile };
    if (merged.heightRatio && typeof merged.heightRatio === 'object') {
      const fallbackHeight = Number(profile.heightRatio) || 4.8;
      profile.heightRatio = randomInRange(merged.heightRatio, fallbackHeight, seedKey, 'heightRatio');
    }

    profile.wallColor = randomColorFromList(merged.wallColors, profile.wallColor, seedKey, 'wallColor');
    profile.roofColor = randomColorFromList(merged.roofColors, profile.roofColor, seedKey, 'roofColor');
    profile.baseColor = randomColorFromList(merged.baseColors, profile.baseColor, seedKey, 'baseColor');
    profile.accentColor = randomColorFromList(merged.accentColors, profile.accentColor, seedKey, 'accentColor');
    profile.porchColor = randomColorFromList(merged.porchColors, profile.porchColor, seedKey, 'porchColor');
    profile.trimColor = randomColorFromList(merged.trimColors, profile.trimColor, seedKey, 'trimColor');
    profile.towerColor = randomColorFromList(merged.towerColors, profile.towerColor, seedKey, 'towerColor');

    return profile;
  }

  function inferLotKind(location) {
    const id = String(location?.id || '').toLowerCase();
    const name = String(location?.name || '').toLowerCase();
    const text = `${id} ${name}`;

    if (id === 'boone-house') {
      return 'center';
    }
    if (text.includes('park')) {
      return 'park';
    }
    if (text.includes('high school') || text.includes('ashford-high') || text.includes('school')) {
      return 'high-school';
    }
    if (text.includes('church')) {
      return 'church';
    }
    if (
      text.includes('mansion') ||
      text.includes('hospital') ||
      text.includes('convention') ||
      text.includes('mall') ||
      text.includes('university') ||
      text.includes('college')
    ) {
      return 'house-big';
    }
    if (
      text.includes('apartment') ||
      text.includes('trailer') ||
      text.includes('diner') ||
      text.includes('post-office') ||
      text.includes('post office') ||
      text.includes('library')
    ) {
      return 'house-small';
    }
    return 'house-standard';
  }

  function inferLotSpan(location) {
    const shape = String(location?.shape || '').toLowerCase();
    const id = String(location?.id || '').toLowerCase();
    const name = String(location?.name || '').toLowerCase();
    const footprint = location?.footprint || {};
    const w = Number(footprint.w);
    const h = Number(footprint.h);

    if (Number.isFinite(w) && Number.isFinite(h)) {
      const spanX = w >= 125 ? 3 : w >= 100 ? 2 : 1;
      const spanZ = h >= 125 ? 3 : h >= 100 ? 2 : 1;
      return { spanX, spanZ };
    }

    if (shape === 'rect-center') {
      return { spanX: 2, spanZ: 2 };
    }

    if (id === 'boone-house') {
      return { spanX: 2, spanZ: 2 };
    }

    if (name.includes('mansion')) {
      return { spanX: 3, spanZ: 3 };
    }

    return { spanX: 1, spanZ: 1 };
  }

  function buildLotsFromLocations(map, halfExtent, existingLots, debugStart) {
    const locations = Array.isArray(map?.locations) ? map.locations : [];
    if (!locations.length) {
      return Array.isArray(existingLots) ? existingLots : [];
    }

    const boone =
      locations.find((location) => String(location?.id || '').toLowerCase() === 'boone-house') ||
      locations[0];

    const booneX = Number(boone?.x);
    const booneY = Number(boone?.y);
    if (!Number.isFinite(booneX) || !Number.isFinite(booneY)) {
      return Array.isArray(existingLots) ? existingLots : [];
    }

    const coords = locations
      .map((location, index) => {
        const x = Number(location?.x);
        const y = Number(location?.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          return null;
        }
        return {
          location,
          index,
          dx: x - booneX,
          dz: y - booneY
        };
      })
      .filter(Boolean);

    if (!coords.length) {
      return Array.isArray(existingLots) ? existingLots : [];
    }

    const maxAbsOffset = coords.reduce((max, item) => {
      return Math.max(max, Math.abs(item.dx), Math.abs(item.dz));
    }, 1);

    const radius = Math.max(1, halfExtent - 1);
    const worldPerGrid = Math.max(1, maxAbsOffset / radius);
    const occupied = new Set();

    function clampGrid(value) {
      return Math.max(-halfExtent, Math.min(halfExtent, value));
    }

    function findNearestFreeCell(gx, gz) {
      const baseKey = `${gx},${gz}`;
      if (!occupied.has(baseKey)) {
        occupied.add(baseKey);
        return { gx, gz };
      }

      const maxRing = halfExtent * 2 + 2;
      for (let ring = 1; ring <= maxRing; ring += 1) {
        for (let ox = -ring; ox <= ring; ox += 1) {
          for (let oz = -ring; oz <= ring; oz += 1) {
            if (Math.abs(ox) !== ring && Math.abs(oz) !== ring) {
              continue;
            }
            const nx = clampGrid(gx + ox);
            const nz = clampGrid(gz + oz);
            const key = `${nx},${nz}`;
            if (!occupied.has(key)) {
              occupied.add(key);
              return { gx: nx, gz: nz };
            }
          }
        }
      }

      occupied.add(baseKey);
      return { gx, gz };
    }

    const lots = coords.map((entry, i) => {
      let gx = Math.round(entry.dx / worldPerGrid);
      let gz = Math.round(entry.dz / worldPerGrid);
      gx = clampGrid(gx);
      gz = clampGrid(gz);

      const chosen = findNearestFreeCell(gx, gz);
      const span = inferLotSpan(entry.location);
      return {
        debug: debugStart + i,
        cx: chosen.gx,
        cz: chosen.gz,
        spanX: span.spanX,
        spanZ: span.spanZ,
        kind: inferLotKind(entry.location),
        title: String(entry.location?.name || ''),
        subtitle: String(entry.location?.subtitle || '')
      };
    });

    return lots;
  }

  function parseGridConfig(payload) {
    const map = payload?.map || {};
    const grid = payload?.grid || map.grid || {};
    const grid3d = payload?.grid3d || map.grid3d || {};

    const sizeRaw = Number(grid.size);
    const size = Number.isFinite(sizeRaw) && sizeRaw > 0 ? sizeRaw : 40;

    const halfExtentRaw = Number(grid3d.halfExtent);
    let halfExtent = Number.isFinite(halfExtentRaw) && halfExtentRaw >= 1 ? Math.round(halfExtentRaw) : 4;

    const blockScaleRaw = Number(grid3d.blockScale);
    const blockScale = Number.isFinite(blockScaleRaw) && blockScaleRaw > 0.6 ? blockScaleRaw : 1.95;

    const roadScaleRaw = Number(grid3d.roadScale);
    const roadScale = Number.isFinite(roadScaleRaw) && roadScaleRaw > 0.2 ? roadScaleRaw : 0.72;

    const baseHeightRaw = Number(grid3d.baseHeight);
    const baseHeight = Number.isFinite(baseHeightRaw) && baseHeightRaw > 0 ? baseHeightRaw : 7;

    const debugStartRaw = Number(grid3d.debugStart);
    const debugStart = Number.isFinite(debugStartRaw) ? Math.max(1, Math.round(debugStartRaw)) : 1;

    const sourceLots = Array.isArray(grid3d.lots) ? grid3d.lots : [];
    const shouldImportLocations = Array.isArray(map.locations) && grid3d.importFromLocations !== false;
    const lots = shouldImportLocations
      ? buildLotsFromLocations(map, halfExtent, sourceLots, debugStart)
      : sourceLots;

    const autoFitLots = grid3d.autoFitLots !== false;
    if (autoFitLots && lots.length) {
      let maxEdge = 0;
      let totalCells = 0;
      for (const lot of lots) {
        const spanX = Math.max(1, Number(lot?.spanX) || 1);
        const spanZ = Math.max(1, Number(lot?.spanZ) || 1);
        const cx = Math.round(Number(lot?.cx) || 0);
        const cz = Math.round(Number(lot?.cz) || 0);
        const startX = Math.round(cx - (spanX - 1) / 2);
        const startZ = Math.round(cz - (spanZ - 1) / 2);
        const endX = startX + spanX - 1;
        const endZ = startZ + spanZ - 1;

        maxEdge = Math.max(maxEdge, Math.abs(startX), Math.abs(endX), Math.abs(startZ), Math.abs(endZ));
        totalCells += spanX * spanZ;
      }

      const padding = 1;
      const halfFromBounds = maxEdge + padding;
      const targetFillRatio = 0.38;
      const sideFromArea = Math.ceil(Math.sqrt(totalCells / targetFillRatio));
      const halfFromArea = Math.max(1, Math.ceil((sideFromArea - 1) / 2));
      halfExtent = Math.max(halfExtent, halfFromBounds, halfFromArea);
      halfExtent = Math.min(36, halfExtent);
    }

    return {
      size,
      halfExtent,
      blockScale,
      roadScale,
      baseHeight,
      showDebugNumbers: Boolean(grid3d.showDebugNumbers),
      showPlaceSubtitles: grid3d.showPlaceSubtitles !== false,
      renderUncommittedAsBuildings: grid3d.renderUncommittedAsBuildings === true,
      uncommittedBuildingKind:
        typeof grid3d.uncommittedBuildingKind === 'string' && grid3d.uncommittedBuildingKind.trim()
          ? grid3d.uncommittedBuildingKind.trim()
          : 'house-small',
      uncommittedKindMode:
        typeof grid3d.uncommittedKindMode === 'string' && grid3d.uncommittedKindMode.trim()
          ? grid3d.uncommittedKindMode.trim()
          : 'fixed',
      terrainMarginCells: Math.max(1, Number(grid3d.terrainMarginCells) || 3),
      terrainAlignmentNudge:
        Number.isFinite(Number(grid3d.terrainAlignmentNudge)) ? Number(grid3d.terrainAlignmentNudge) : 0,
      viewRadiusMultiplier:
        Number.isFinite(Number(grid3d.viewRadiusMultiplier)) && Number(grid3d.viewRadiusMultiplier) > 0.25
          ? Number(grid3d.viewRadiusMultiplier)
          : 1.05,
      maxRadiusMultiplier:
        Number.isFinite(Number(grid3d.maxRadiusMultiplier)) && Number(grid3d.maxRadiusMultiplier) > 0.8
          ? Number(grid3d.maxRadiusMultiplier)
          : 3.8,
      farPlaneMultiplier:
        Number.isFinite(Number(grid3d.farPlaneMultiplier)) && Number(grid3d.farPlaneMultiplier) > 1
          ? Number(grid3d.farPlaneMultiplier)
          : 3,
      buildingTypes: mergeBuildingTypes(grid3d.buildingTypes),
      randomizedBuilding: normalizeRandomizedBuildingConfig(grid3d.randomizedBuilding),
      debugStart,
      lots
    };
  }

  async function loadGridConfig() {
    const fallback = {
      size: 40,
      halfExtent: 4,
      blockScale: 1.95,
      roadScale: 0.72,
      baseHeight: 7,
      showDebugNumbers: true,
      showPlaceSubtitles: true,
      renderUncommittedAsBuildings: false,
      uncommittedBuildingKind: 'house-small',
      uncommittedKindMode: 'fixed',
      terrainMarginCells: 3,
      terrainAlignmentNudge: 0,
      viewRadiusMultiplier: 1.05,
      maxRadiusMultiplier: 3.8,
      farPlaneMultiplier: 3,
      buildingTypes: mergeBuildingTypes(null),
      randomizedBuilding: normalizeRandomizedBuildingConfig(null),
      debugStart: 1,
      lots: []
    };

    const workspaceDataMap = new URL('../data/maps/ashford/map.json', import.meta.url).href;
    const workspaceDataLocations = new URL('../data/maps/ashford/locations.json', import.meta.url).href;
    const workspaceDataRandomized = new URL('../data/maps/ashford/randomized_buildings.json', import.meta.url).href;

    const candidateUrls = [workspaceDataMap, workspaceDataLocations];

    let lastError = 'unknown error';
    for (const url of candidateUrls) {
      try {
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) {
          lastError = `${url} -> HTTP ${response.status}`;
          continue;
        }
        const text = await response.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch (parseError) {
          lastError = `${url} -> JSON parse error: ${parseError?.message || 'invalid json'}`;
          continue;
        }

        if (url.includes('map.json') && data?.grid3d?.importFromLocations !== false) {
          try {
            const locationCandidates = [workspaceDataLocations];
            if (url.includes('map.json')) {
              locationCandidates.push(url.replace(/map\.json(?:\?.*)?$/i, 'locations.json'));
            }

            const dedupedCandidates = [...new Set(locationCandidates)];
            for (const locationUrl of dedupedCandidates) {
              const locationResponse = await fetch(locationUrl, { cache: 'no-store' });
              if (!locationResponse.ok) {
                continue;
              }
              const locationText = await locationResponse.text();
              const locationPayload = JSON.parse(locationText);
              const locationList = Array.isArray(locationPayload?.map?.locations)
                ? locationPayload.map.locations
                : [];
              if (locationList.length && !Array.isArray(data?.map?.locations)) {
                data.map = data.map || {};
                data.map.locations = locationList;
              }
              break;
            }
          } catch (locationMergeError) {
            // Keep rendering with map config even when location enrichment fails.
          }
        }

        if (url.includes('map.json')) {
          try {
            const randomizedResponse = await fetch(workspaceDataRandomized, { cache: 'no-store' });
            if (randomizedResponse.ok) {
              const randomizedText = await randomizedResponse.text();
              const randomizedPayload = JSON.parse(randomizedText);
              const randomizedConfig = randomizedPayload?.randomizedBuilding || randomizedPayload;
              if (randomizedConfig && typeof randomizedConfig === 'object') {
                data.grid3d = data.grid3d || {};
                data.grid3d.randomizedBuilding = randomizedConfig;
              }
            }
          } catch (randomizedError) {
            // Keep rendering even if randomized config cannot be loaded.
          }
        }

        let parsed;
        try {
          parsed = parseGridConfig(data);
        } catch (shapeError) {
          lastError = `${url} -> config shape error: ${shapeError?.message || 'invalid config'}`;
          continue;
        }

        const shortName = url.includes('map.json') ? 'map.json' : 'locations.json';
        configSourceNote = `config: ${shortName}`;
        return parsed;
      } catch (error) {
        lastError = `${url} -> ${error?.message || 'fetch failed'}`;
      }
    }

    configSourceNote = `config: fallback (${lastError})`;
    return fallback;
  }

  const hemi = new THREE.HemisphereLight(0xe9f4ff, 0x4f6b46, 0.9);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff6dd, 1.05);
  sun.position.set(360, 520, 280);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -1300;
  sun.shadow.camera.right = 1300;
  sun.shadow.camera.top = 1300;
  sun.shadow.camera.bottom = -1300;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 2400;
  scene.add(sun);

  // Create Skybox (with painted Sun and Sunrays)
  const skyMesh = createSkybox();

  function createCityGrid(config) {
    const unit = config.size * 3;
    const blockSize = Math.max(36, unit * config.blockScale);
    const roadWidth = Math.max(22, unit * config.roadScale);
    const pitch = blockSize + roadWidth;
    const half = config.halfExtent;
    const lanes = half * 2 + 2;
    const totalSpan = lanes * roadWidth + (lanes - 1) * blockSize;

    // Use textures for roads, bases, centers, parks, and outer terrain
    const roadMaterial = makeMaterial(0xffffff, roadTexture); // road texture is black
    const baseMaterial = makeMaterial(0xffffff, concreteTexture); // concrete foundations
    const centerMaterial = makeMaterial(0xcdb28c, grassTexture);
    const parkMaterial = makeMaterial(0x6da66f, grassTexture);

    // Align terrain ring to the real outer grid footprint to avoid half-road edge gaps.
    const innerTerrainSpan = totalSpan;
    const outerTerrainSpan = innerTerrainSpan + config.terrainMarginCells * pitch * 2;
    const alignmentNudge = clamp(config.terrainAlignmentNudge, -pitch * 0.9, pitch * 0.9);
    const stripSize = Math.max(24, (outerTerrainSpan - innerTerrainSpan) / 2 + Math.abs(alignmentNudge));
    const terrainMaterial = makeMaterial(0x5fa165, grassTexture);

    function addTerrainStrip(width, depth, x, z) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(width, 1.2, depth), terrainMaterial);
      strip.position.set(x, 0.6, z);
      strip.receiveShadow = true;
      scene.add(strip);
      scatterTreesOnTerrainStrip(width, depth, x, z);
    }

    addTerrainStrip(outerTerrainSpan, stripSize, 0, innerTerrainSpan * 0.5 + stripSize * 0.5 - alignmentNudge);
    addTerrainStrip(outerTerrainSpan, stripSize, 0, -innerTerrainSpan * 0.5 - stripSize * 0.5 + alignmentNudge);
    addTerrainStrip(stripSize, innerTerrainSpan, innerTerrainSpan * 0.5 + stripSize * 0.5 - alignmentNudge, 0);
    addTerrainStrip(stripSize, innerTerrainSpan, -innerTerrainSpan * 0.5 - stripSize * 0.5 + alignmentNudge, 0);

    const grid = new THREE.GridHelper(totalSpan + roadWidth, lanes * 2, 0x3f643f, 0x678e64);
    grid.position.y = 2.7;
    if (Array.isArray(grid.material)) {
      grid.material.forEach((material) => {
        material.transparent = true;
        material.opacity = 0.3;
        material.depthWrite = false;
      });
    } else if (grid.material) {
      grid.material.transparent = true;
      grid.material.opacity = 0.3;
      grid.material.depthWrite = false;
    }
    scene.add(grid);

    const laneOffsets = [];
    for (let i = 0; i < lanes; i += 1) {
      laneOffsets.push(-totalSpan / 2 + roadWidth / 2 + i * (blockSize + roadWidth));
    }

    const occupied = new Set();
    const roadMasks = [];
    const placedLotAnchors = [];
    const grassHoleCells = new Set();
    const establishedLotCells = new Set();
    const largeEstablishedLotCells = new Set();
    const namedTargets = [];
    const exportLots = [];
    const holeOverlayGroup = new THREE.Group();
    holeOverlayGroup.visible = false;
    scene.add(holeOverlayGroup);
    const keyFor = (gx, gz) => `${gx},${gz}`;
    let debugCounter = config.debugStart;

    function nextDebugNumber(forcedDebug) {
      const forced = Number(forcedDebug);
      if (Number.isFinite(forced) && forced >= 1) {
        const id = Math.round(forced);
        debugCounter = Math.max(debugCounter, id + 1);
        return id;
      }
      const id = debugCounter;
      debugCounter += 1;
      return id;
    }

    function createDebugLabel(text) {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return null;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'rgba(245, 241, 226, 0.92)';
      ctx.fillRect(12, 10, 104, 44);
      ctx.strokeStyle = 'rgba(102, 89, 64, 0.9)';
      ctx.lineWidth = 2;
      ctx.strokeRect(12, 10, 104, 44);
      ctx.fillStyle = '#2c2922';
      ctx.font = '700 28px Trebuchet MS, Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(text), 64, 32);

      const texture = new THREE.CanvasTexture(canvas);
      texture.needsUpdate = true;
      const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
      const sprite = new THREE.Sprite(material);
      sprite.scale.set(58, 29, 1);
      return sprite;
    }

    function createPlaceLabel(title, subtitle) {
      const top = String(title || '').trim();
      const bottom = String(subtitle || '').trim();
      if (!top && !bottom) {
        return null;
      }

      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 160;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return null;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'rgba(245, 241, 226, 0.92)';
      ctx.fillRect(8, 18, 496, bottom ? 112 : 82);
      ctx.strokeStyle = 'rgba(102, 89, 64, 0.92)';
      ctx.lineWidth = 3;
      ctx.strokeRect(8, 18, 496, bottom ? 112 : 82);

      if (top) {
        ctx.fillStyle = '#2d2a24';
        ctx.font = '700 34px Trebuchet MS, Segoe UI, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(top, 256, bottom ? 56 : 64, 468);
      }

      if (bottom) {
        ctx.fillStyle = '#474338';
        ctx.font = '500 24px Trebuchet MS, Segoe UI, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(bottom, 256, 96, 468);
      }

      const texture = new THREE.CanvasTexture(canvas);
      texture.needsUpdate = true;
      const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
      const sprite = new THREE.Sprite(material);
      sprite.scale.set(190, bottom ? 60 : 48, 1);
      sprite.renderOrder = 1000;
      return sprite;
    }

    function addBaseMesh(centerX, centerZ, sizeX, sizeZ, material, debugNumber, castShadow = true) {
      const base = new THREE.Mesh(new THREE.BoxGeometry(sizeX, config.baseHeight, sizeZ), material);
      base.position.set(centerX, config.baseHeight / 2, centerZ);
      base.receiveShadow = true;
      base.castShadow = castShadow;
      scene.add(base);

      if (config.showDebugNumbers) {
        const label = createDebugLabel(debugNumber);
        if (label) {
          label.position.set(centerX, config.baseHeight + 14, centerZ);
          scene.add(label);
        }
      }
    }

    function addHouseBuilding(centerX, centerZ, lotSizeX, lotSizeZ, profile, castShadow = true) {
      const roofMaterial = makeMaterial(profile.roofColor || 0x8a4e3f, gravelTexture);
      const porchMaterial = makeMaterial(profile.porchColor || 0xbca57e);

      const widthRatio = profile.widthRatio || 0.68;
      const depthRatio = profile.depthRatio || 0.68;
      const heightRatio = profile.heightRatio || 4.8;
      const maxWidthBlocks = profile.maxWidthBlocks || 1.45;
      const maxDepthBlocks = profile.maxDepthBlocks || 1.45;

      const maxHouseW = Math.max(96, blockSize * maxWidthBlocks);
      const maxHouseD = Math.max(92, blockSize * maxDepthBlocks);
      const houseW = Math.max(32, Math.min(lotSizeX * widthRatio, lotSizeX * 0.92, maxHouseW));
      const houseD = Math.max(28, Math.min(lotSizeZ * depthRatio, lotSizeZ * 0.9, maxHouseD));
      const wallH = Math.max(15, config.baseHeight * heightRatio * 1.8);
      const baseTop = config.baseHeight;

      const materials = makeMultiMaterialBox(houseW, wallH, houseD, profile.wallColor || 0xf2efe6, profile.roofColor || 0x8a4e3f, 'house');
      const body = new THREE.Mesh(new THREE.BoxGeometry(houseW, wallH, houseD), materials);
      body.position.set(centerX, baseTop + wallH / 2, centerZ);
      body.castShadow = castShadow;
      body.receiveShadow = true;
      scene.add(body);

      const roofHeight = wallH * (profile.roofHeightRatio || 0.5);
      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(Math.max(houseW, houseD) * 0.56, roofHeight, 4),
        roofMaterial
      );
      roof.rotation.y = Math.PI * 0.25;
      roof.position.set(centerX, baseTop + wallH + roofHeight / 2 - 1, centerZ);
      roof.castShadow = castShadow;
      roof.receiveShadow = true;
      scene.add(roof);

      const porchDepth = houseD * (profile.porchDepthRatio || 0.2);
      const porch = new THREE.Mesh(
        new THREE.BoxGeometry(houseW * 0.44, 3, porchDepth),
        porchMaterial
      );
      porch.position.set(centerX, baseTop + 1.6, centerZ + houseD * 0.41);
      porch.castShadow = castShadow;
      porch.receiveShadow = true;
      scene.add(porch);

      return baseTop + wallH + roofHeight;
    }

    function addHighSchool(centerX, centerZ, lotSizeX, lotSizeZ, profile, castShadow = true) {
      const roofMaterial = makeMaterial(profile.roofColor || 0x6f7478, gravelTexture);
      const trimMaterial = makeMaterial(profile.trimColor || 0x3f4755);
      const baseTop = config.baseHeight;

      const bodyW = Math.max(70, lotSizeX * (Number(profile.widthRatio) || 0.9));
      const bodyD = Math.max(48, lotSizeZ * (Number(profile.depthRatio) || 0.66));
      const bodyH = Math.max(18, config.baseHeight * (Number(profile.heightRatio) || 5.3) * 1.8);

      const bodyMaterials = makeMultiMaterialBox(bodyW, bodyH, bodyD, profile.wallColor || 0xc9b69f, profile.roofColor || 0x6f7478, 'school');
      const body = new THREE.Mesh(new THREE.BoxGeometry(bodyW, bodyH, bodyD), bodyMaterials);
      body.position.set(centerX, baseTop + bodyH / 2, centerZ);
      body.castShadow = castShadow;
      body.receiveShadow = true;
      scene.add(body);

      const gymW = bodyW * 0.34;
      const gymD = bodyD * 0.78;
      const gymH = bodyH * 0.82;
      const gymMaterials = makeMultiMaterialBox(gymW, gymH, gymD, profile.wallColor || 0xc9b69f, profile.roofColor || 0x6f7478, 'school');
      const gym = new THREE.Mesh(new THREE.BoxGeometry(gymW, gymH, gymD), gymMaterials);
      gym.position.set(centerX - bodyW * 0.31, baseTop + gymH / 2, centerZ + bodyD * 0.18);
      gym.castShadow = castShadow;
      gym.receiveShadow = true;
      scene.add(gym);

      const roof = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 1.02, 4, bodyD * 1.02), roofMaterial);
      roof.position.set(centerX, baseTop + bodyH + 2, centerZ);
      roof.castShadow = castShadow;
      roof.receiveShadow = true;
      scene.add(roof);

      const entryH = bodyH * 0.55;
      const entry = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.24, entryH, bodyD * 0.18), trimMaterial);
      entry.position.set(centerX + bodyW * 0.12, baseTop + entryH / 2, centerZ + bodyD * 0.43);
      entry.castShadow = castShadow;
      entry.receiveShadow = true;
      scene.add(entry);

      return baseTop + bodyH + 4;
    }

    function addChurch(centerX, centerZ, lotSizeX, lotSizeZ, profile, castShadow = true) {
      const roofMaterial = makeMaterial(profile.roofColor || 0x5e666e, gravelTexture);
      const baseTop = config.baseHeight;

      const naveW = Math.max(44, lotSizeX * (Number(profile.widthRatio) || 0.5));
      const naveD = Math.max(72, lotSizeZ * (Number(profile.depthRatio) || 0.84));
      const naveH = Math.max(20, config.baseHeight * (Number(profile.heightRatio) || 5.2) * 1.8);

      const naveMaterials = makeMultiMaterialBox(naveW, naveH, naveD, profile.wallColor || 0xd7d0c0, profile.roofColor || 0x5e666e, 'church');
      const nave = new THREE.Mesh(new THREE.BoxGeometry(naveW, naveH, naveD), naveMaterials);
      nave.position.set(centerX, baseTop + naveH / 2, centerZ);
      nave.castShadow = castShadow;
      nave.receiveShadow = true;
      scene.add(nave);

      const roof = new THREE.Mesh(new THREE.ConeGeometry(naveW * 0.76, naveH * 0.58, 4), roofMaterial);
      roof.rotation.y = Math.PI * 0.25;
      roof.position.set(centerX, baseTop + naveH + (naveH * 0.58) / 2 - 1, centerZ);
      roof.castShadow = castShadow;
      roof.receiveShadow = true;
      scene.add(roof);

      const towerW = naveW * 0.36;
      const towerD = naveW * 0.36;
      const towerH = naveH * 1.35;
      const towerMaterials = makeMultiMaterialBox(towerW, towerH, towerD, profile.towerColor || 0xc9c0ad, profile.roofColor || 0x5e666e, 'church');
      const tower = new THREE.Mesh(new THREE.BoxGeometry(towerW, towerH, towerD), towerMaterials);
      tower.position.set(centerX, baseTop + towerH / 2, centerZ + naveD * 0.42);
      tower.castShadow = castShadow;
      tower.receiveShadow = true;
      scene.add(tower);

      const spire = new THREE.Mesh(new THREE.ConeGeometry(towerW * 0.48, towerH * 0.55, 4), roofMaterial);
      spire.rotation.y = Math.PI * 0.25;
      spire.position.set(centerX, baseTop + towerH + (towerH * 0.55) / 2, centerZ + naveD * 0.42);
      spire.castShadow = castShadow;
      spire.receiveShadow = true;
      scene.add(spire);

      return baseTop + towerH + towerH * 0.55;
    }

    function addBoxBuilding(centerX, centerZ, lotSizeX, lotSizeZ, profile, castShadow = true) {
      const roofMaterial = makeMaterial(profile.roofColor || 0x666b72, gravelTexture);
      const accentMaterial = makeMaterial(profile.accentColor || 0xded9ce);
      const baseTop = config.baseHeight;

      const boxW = Math.max(34, Math.min(lotSizeX * (Number(profile.widthRatio) || 0.72), lotSizeX * 0.92));
      const boxD = Math.max(30, Math.min(lotSizeZ * (Number(profile.depthRatio) || 0.68), lotSizeZ * 0.9));
      const boxH = Math.max(15, config.baseHeight * (Number(profile.heightRatio) || 3.2) * 1.8);

      const materials = makeMultiMaterialBox(boxW, boxH, boxD, profile.wallColor || 0xbdb9ad, profile.roofColor || 0x666b72, 'box');
      const body = new THREE.Mesh(new THREE.BoxGeometry(boxW, boxH, boxD), materials);
      body.position.set(centerX, baseTop + boxH / 2, centerZ);
      body.castShadow = castShadow;
      body.receiveShadow = true;
      scene.add(body);

      const roof = new THREE.Mesh(new THREE.BoxGeometry(boxW * 1.03, 3, boxD * 1.03), roofMaterial);
      roof.position.set(centerX, baseTop + boxH + 1.5, centerZ);
      roof.castShadow = castShadow;
      roof.receiveShadow = true;
      scene.add(roof);

      const accent = new THREE.Mesh(new THREE.BoxGeometry(boxW * 0.45, 4, Math.max(12, boxD * 0.12)), accentMaterial);
      accent.position.set(centerX, baseTop + boxH * 0.45, centerZ + boxD * 0.5);
      accent.castShadow = castShadow;
      accent.receiveShadow = true;
      scene.add(accent);

      return baseTop + boxH + 3;
    }

    function resolveBuildingType(kind) {
      const fromJson = config.buildingTypes[kind];
      if (fromJson) {
        return fromJson;
      }
      return config.buildingTypes['house-standard'] || DEFAULT_BUILDING_TYPES['house-standard'];
    }

    function addBuildingForKind(lotConfig, centerX, centerZ, lotSizeX, lotSizeZ, castShadow = true) {
      const kind = lotConfig?.kind;
      const typeDef = getRandomizedBuildingProfile(resolveBuildingType(kind), lotConfig, config.randomizedBuilding);
      const template = String(typeDef.template || '').toLowerCase();

      if (template === 'none') {
        return config.baseHeight;
      }
      if (template === 'school') {
        return addHighSchool(centerX, centerZ, lotSizeX, lotSizeZ, typeDef, castShadow);
      }
      if (template === 'church') {
        return addChurch(centerX, centerZ, lotSizeX, lotSizeZ, typeDef, castShadow);
      }
      if (template === 'box') {
        return addBoxBuilding(centerX, centerZ, lotSizeX, lotSizeZ, typeDef, castShadow);
      }
      return addHouseBuilding(centerX, centerZ, lotSizeX, lotSizeZ, typeDef, castShadow);
    }

    function getUncommittedSatelliteKind(primaryKind) {
      if (primaryKind === 'apartment-tower') {
        return 'apartment-tower';
      }
      if (primaryKind === 'mansion') {
        return 'house-big';
      }
      if (primaryKind === 'house-big') {
        return 'house-standard';
      }
      return 'house-small';
    }

    function fillExpandedLot(lotConfig, startX, startZ, endX, endZ) {
      const spanX = endX - startX + 1;
      const spanZ = endZ - startZ + 1;
      if (spanX <= 1 && spanZ <= 1) {
        return;
      }

      const primaryKind = String(lotConfig?.kind || '');
      if (primaryKind === 'park' || primaryKind === 'center') {
        return;
      }

      // Apply satellites only to randomized/uncommitted expanded lots.
      const hasTitle = String(lotConfig?.title || '').trim().length > 0;
      if (hasTitle) {
        return;
      }

      const centralGX = Math.round((startX + endX) * 0.5);
      const centralGZ = Math.round((startZ + endZ) * 0.5);
      const satelliteKind = getUncommittedSatelliteKind(primaryKind || 'house-small');

      function touchesEstablishedLot(gx, gz) {
        for (let ox = -1; ox <= 1; ox += 1) {
          for (let oz = -1; oz <= 1; oz += 1) {
            if (establishedLotCells.has(keyFor(gx + ox, gz + oz))) {
              return true;
            }
          }
        }
        return false;
      }

      for (let gx = startX; gx <= endX; gx += 1) {
        for (let gz = startZ; gz <= endZ; gz += 1) {
          if (gx === centralGX && gz === centralGZ) {
            continue;
          }

          if (touchesEstablishedLot(gx, gz)) {
            continue;
          }

          const jitterX = (seededUnit(`${lotConfig?.debug || 0}|${gx}|${gz}`, 'satelliteJitterX') - 0.5) * blockSize * 0.08;
          const jitterZ = (seededUnit(`${lotConfig?.debug || 0}|${gx}|${gz}`, 'satelliteJitterZ') - 0.5) * blockSize * 0.08;
          const worldX = gx * pitch + jitterX;
          const worldZ = gz * pitch + jitterZ;

          addBuildingForKind(
            {
              kind: satelliteKind,
              debug: `${lotConfig?.debug || 0}-${gx}-${gz}`,
              title: '',
              cx: gx,
              cz: gz
            },
            worldX,
            worldZ,
            blockSize * 0.88,
            blockSize * 0.88
          );
        }
      }
    }

    function canPlaceSpan(startX, startZ, spanX, spanZ) {
      const endX = startX + spanX - 1;
      const endZ = startZ + spanZ - 1;
      if (startX < -half || endX > half || startZ < -half || endZ > half) {
        return false;
      }

      for (let gx = startX; gx <= endX; gx += 1) {
        for (let gz = startZ; gz <= endZ; gz += 1) {
          if (occupied.has(keyFor(gx, gz))) {
            return false;
          }
        }
      }
      return true;
    }

    function findPlacementForLot(preferredCx, preferredCz, spanX, spanZ, forceExact = false) {
      const maxRing = half * 2 + 2;

      function tryCenter(centerX, centerZ) {
        const startX = Math.round(centerX - (spanX - 1) / 2);
        const startZ = Math.round(centerZ - (spanZ - 1) / 2);
        if (!canPlaceSpan(startX, startZ, spanX, spanZ)) {
          return null;
        }
        return { startX, startZ };
      }

      const direct = tryCenter(preferredCx, preferredCz);
      if (direct || forceExact) {
        return direct;
      }

      for (let ring = 1; ring <= maxRing; ring += 1) {
        for (let ox = -ring; ox <= ring; ox += 1) {
          for (let oz = -ring; oz <= ring; oz += 1) {
            if (Math.abs(ox) !== ring && Math.abs(oz) !== ring) {
              continue;
            }
            const candidate = tryCenter(preferredCx + ox, preferredCz + oz);
            if (candidate) {
              return candidate;
            }
          }
        }
      }
      return null;
    }

    function placeLotBase(lotConfig, forceExact = false) {
      const sceneObjectCountBefore = scene.children.length;
      const spanX = Math.max(1, Number(lotConfig.spanX) || 1);
      const spanZ = Math.max(1, Number(lotConfig.spanZ) || 1);
      const preferredCx = Math.round(Number(lotConfig.cx) || 0);
      const preferredCz = Math.round(Number(lotConfig.cz) || 0);
      const placement = findPlacementForLot(preferredCx, preferredCz, spanX, spanZ, forceExact);
      if (!placement) {
        return false;
      }

      const startX = placement.startX;
      const startZ = placement.startZ;
      const endX = startX + spanX - 1;
      const endZ = startZ + spanZ - 1;

      for (let gx = startX; gx <= endX; gx += 1) {
        for (let gz = startZ; gz <= endZ; gz += 1) {
          occupied.add(keyFor(gx, gz));
          if (String(lotConfig?.title || '').trim()) {
            establishedLotCells.add(keyFor(gx, gz));
            if (spanX > 1 || spanZ > 1) {
              largeEstablishedLotCells.add(keyFor(gx, gz));
            }
          }
        }
      }

      const sizeX = spanX * blockSize + (spanX - 1) * roadWidth;
      const sizeZ = spanZ * blockSize + (spanZ - 1) * roadWidth;
      const centerX = (startX + endX) * 0.5 * pitch;
      const centerZ = (startZ + endZ) * 0.5 * pitch;
      const typeDef = resolveBuildingType(lotConfig.kind);
      const centerCellX = (startX + endX) * 0.5;
      const centerCellZ = (startZ + endZ) * 0.5;
      placedLotAnchors.push({
        cx: centerCellX,
        cz: centerCellZ,
        kind: String(lotConfig.kind || '')
      });

      if (spanX > 1 || spanZ > 1) {
        const minX = startX * pitch - roadWidth * 0.5;
        const maxX = endX * pitch + roadWidth * 0.5;
        const minZ = startZ * pitch - roadWidth * 0.5;
        const maxZ = endZ * pitch + roadWidth * 0.5;
        roadMasks.push({ minX, maxX, minZ, maxZ });
      }

      let material = baseMaterial;
      if (!String(lotConfig?.title || '').trim()) {
        material = baseMaterial;
      } else if (Number.isFinite(Number(typeDef.baseColor))) {
        material = makeMaterial(Number(typeDef.baseColor), concreteTexture);
      } else if (lotConfig.kind === 'center') {
        material = centerMaterial;
      } else if (lotConfig.kind === 'park') {
        material = parkMaterial;
      } else if (lotConfig.kind === 'house-standard') {
        material = baseMaterial;
      }

      const hasTitle = String(lotConfig?.title || '').trim().length > 0;
      const debugNumber = nextDebugNumber(lotConfig.debug);
      addBaseMesh(centerX, centerZ, sizeX, sizeZ, material, debugNumber, hasTitle);
      const structureTopY = addBuildingForKind(lotConfig, centerX, centerZ, sizeX, sizeZ, hasTitle) || config.baseHeight;
      fillExpandedLot(lotConfig, startX, startZ, endX, endZ);

      // Scatter trees in yards or parks
      if (lotConfig.kind === 'park') {
        scatterTreesOnLot(centerX, centerZ, sizeX, sizeZ, 12, config.baseHeight, hasTitle);
      } else if (lotConfig.kind === 'center') {
        scatterTreesOnLot(centerX, centerZ, sizeX, sizeZ, 5, config.baseHeight, hasTitle);
      } else if (lotConfig.kind !== 'road' && lotConfig.kind !== 'mall' && lotConfig.kind !== 'office-tower' && lotConfig.kind !== 'high-school' && lotConfig.kind !== 'campus') {
        // Residential yards get a random tree in one of the corners
        const cornerX = Math.random() > 0.5 ? 1 : -1;
        const cornerZ = Math.random() > 0.5 ? 1 : -1;
        const treeX = centerX + cornerX * sizeX * 0.38;
        const treeZ = centerZ + cornerZ * sizeZ * 0.38;
        const tree = addTree(treeX, treeZ, 3.25 + Math.random() * 2.5, hasTitle);
        tree.position.y = config.baseHeight;
      }

      if (String(lotConfig?.title || '').trim()) {
        namedTargets.push({
          title: String(lotConfig.title),
          kind: String(lotConfig.kind || ''),
          x: centerX,
          z: centerZ,
          extent: Math.max(sizeX, sizeZ)
        });
      }

      if (config.showPlaceSubtitles !== false && lotConfig.title) {
        const placeLabel = createPlaceLabel(lotConfig.title, lotConfig.subtitle || '');
        if (placeLabel) {
          placeLabel.position.set(centerX, structureTopY + 22, centerZ);
          scene.add(placeLabel);
        }
      }

      if (String(lotConfig?.title || '').trim()) {
        const created = scene.children.slice(sceneObjectCountBefore);
        exportLots.push({
          title: String(lotConfig.title),
          kind: String(lotConfig.kind || ''),
          x: centerX,
          z: centerZ,
          objects: created
        });
      }

      return true;
    }

    const customLots = config.lots.length
      ? config.lots
      : [
          { cx: 0, cz: 0, spanX: 1, spanZ: 1, kind: 'house-standard' },
          { cx: -3, cz: -3, spanX: 2, spanZ: 2, kind: 'house-small' },
          { cx: 3, cz: -1, spanX: 3, spanZ: 2, kind: 'house-big' },
          { cx: -2, cz: 3, spanX: 2, spanZ: 3, kind: 'high-school' },
          { cx: 1, cz: 3, spanX: 3, spanZ: 2, kind: 'park' },
          { cx: 3, cz: 3, spanX: 2, spanZ: 2, kind: 'church' }
        ];

    for (const lot of customLots) {
      placeLotBase(lot);
    }

    const residentialKinds = new Set([
      'boone-house',
      'house-small',
      'house-standard',
      'house-big',
      'apartment-tower',
      'mansion'
    ]);

    function getResidentialFamily(kind) {
      if (kind === 'apartment-tower') {
        return 'apartment';
      }
      if (kind === 'mansion' || kind === 'house-big') {
        return 'mansion';
      }
      return 'house';
    }

    function pickKindForFamily(family, gx, gz) {
      const r = seededUnit(`${gx},${gz},${family}`, 'familyKind');
      if (family === 'apartment') {
        return r < 0.72 ? 'apartment-tower' : 'house-small';
      }
      if (family === 'mansion') {
        return r < 0.65 ? 'mansion' : 'house-big';
      }
      if (r < 0.45) {
        return 'house-small';
      }
      if (r < 0.9) {
        return 'house-standard';
      }
      return 'house-big';
    }

    function resolveUncommittedKind(gx, gz) {
      if (config.uncommittedKindMode !== 'nearest-residential') {
        return config.uncommittedBuildingKind;
      }

      const anchors = placedLotAnchors.filter((entry) => residentialKinds.has(entry.kind));
      if (!anchors.length) {
        return config.uncommittedBuildingKind;
      }

      let nearest = null;
      let nearestDistSq = Number.POSITIVE_INFINITY;
      for (const anchor of anchors) {
        const dx = gx - anchor.cx;
        const dz = gz - anchor.cz;
        const distSq = dx * dx + dz * dz;
        if (distSq < nearestDistSq) {
          nearestDistSq = distSq;
          nearest = anchor;
        }
      }

      if (!nearest) {
        return config.uncommittedBuildingKind;
      }

      return pickKindForFamily(getResidentialFamily(nearest.kind), gx, gz);
    }

    function parseExpandedSpanOptions(rawSpans) {
      if (!Array.isArray(rawSpans)) {
        return [];
      }
      return rawSpans
        .map((entry) => {
          if (!Array.isArray(entry) || entry.length < 2) {
            return null;
          }
          const sx = Math.max(1, Math.round(Number(entry[0]) || 1));
          const sz = Math.max(1, Math.round(Number(entry[1]) || 1));
          if (sx <= 1 && sz <= 1) {
            return null;
          }
          return [sx, sz];
        })
        .filter(Boolean);
    }

    function resolveUncommittedSpan(kind, gx, gz) {
      const randomKindConfig = config.randomizedBuilding?.kinds?.[kind] || {};

      let chance = Number(randomKindConfig.expandedBaseChance);
      if (!Number.isFinite(chance)) {
        if (kind === 'apartment-tower') {
          chance = 0.35;
        } else if (kind === 'mansion' || kind === 'house-big') {
          chance = 0.24;
        } else {
          chance = 0;
        }
      }
      chance = clamp(chance, 0, 1);
      if (chance <= 0) {
        return { spanX: 1, spanZ: 1 };
      }

      const expandRoll = seededUnit(`${gx},${gz},${kind}`, 'expandedBaseChance');
      if (expandRoll > chance) {
        return { spanX: 1, spanZ: 1 };
      }

      let options = parseExpandedSpanOptions(randomKindConfig.expandedBaseSpans);
      if (!options.length) {
        if (kind === 'apartment-tower') {
          options = [
            [2, 2],
            [3, 2]
          ];
        } else if (kind === 'mansion') {
          options = [
            [2, 2],
            [3, 2],
            [3, 3]
          ];
        } else if (kind === 'house-big') {
          options = [
            [2, 2],
            [3, 2]
          ];
        }
      }

      if (!options.length) {
        return { spanX: 1, spanZ: 1 };
      }

      const pick = Math.floor(seededUnit(`${gx},${gz},${kind}`, 'expandedBaseSpanPick') * options.length);
      const chosen = options[Math.min(options.length - 1, Math.max(0, pick))];
      return { spanX: chosen[0], spanZ: chosen[1] };
    }

    for (let gx = -half; gx <= half; gx += 1) {
      for (let gz = -half; gz <= half; gz += 1) {
        if (occupied.has(keyFor(gx, gz))) {
          continue;
        }
        const debugNumber = nextDebugNumber();
        if (config.renderUncommittedAsBuildings) {
          const kind = resolveUncommittedKind(gx, gz);
          const span = resolveUncommittedSpan(kind, gx, gz);
          let placed = placeLotBase(
            {
              kind,
              debug: debugNumber,
              title: '',
              cx: gx,
              cz: gz,
              spanX: span.spanX,
              spanZ: span.spanZ
            },
            true
          );

          if (!placed && (span.spanX > 1 || span.spanZ > 1)) {
            // Retry as 1x1 before giving up, to reduce empty/fallback cells in dense areas.
            placed = placeLotBase(
              {
                kind,
                debug: debugNumber,
                title: '',
                cx: gx,
                cz: gz,
                spanX: 1,
                spanZ: 1
              },
              true
            );
          }

          if (placed) {
            continue;
          }

          // If expanded/randomized building cannot be placed, keep a plain grass lot.
          const cellX = gx * pitch;
          const cellZ = gz * pitch;
          addBaseMesh(cellX, cellZ, blockSize, blockSize, parkMaterial, debugNumber);
          grassHoleCells.add(keyFor(gx, gz));

          const holeMarker = new THREE.Mesh(
            new THREE.PlaneGeometry(blockSize * 0.78, blockSize * 0.78),
            new THREE.MeshBasicMaterial({ color: 0x20bfff, transparent: true, opacity: 0.55 })
          );
          holeMarker.rotation.x = -Math.PI / 2;
          holeMarker.position.set(cellX, config.baseHeight + 0.35, cellZ);
          holeOverlayGroup.add(holeMarker);
          continue;
        }

        const cellX = gx * pitch;
        const cellZ = gz * pitch;
        addBaseMesh(cellX, cellZ, blockSize, blockSize, baseMaterial, debugNumber);
      }
    }

    function addGrassRoadConnector(centerX, centerZ, width, depth) {
      const connector = new THREE.Mesh(new THREE.BoxGeometry(width, config.baseHeight, depth), parkMaterial);
      connector.position.set(centerX, config.baseHeight / 2, centerZ);
      connector.receiveShadow = true;
      connector.castShadow = true;
      scene.add(connector);

      roadMasks.push({
        minX: centerX - width * 0.5,
        maxX: centerX + width * 0.5,
        minZ: centerZ - depth * 0.5,
        maxZ: centerZ + depth * 0.5
      });
    }

    function addLargeLotSeamConnector(centerX, centerZ, width, depth) {
      const seamHeight = config.baseHeight + 0.35;
      const connector = new THREE.Mesh(new THREE.BoxGeometry(width, seamHeight, depth), baseMaterial);
      connector.position.set(centerX, seamHeight / 2, centerZ);
      connector.receiveShadow = true;
      connector.castShadow = true;
      scene.add(connector);

      roadMasks.push({
        minX: centerX - width * 0.5,
        maxX: centerX + width * 0.5,
        minZ: centerZ - depth * 0.5,
        maxZ: centerZ + depth * 0.5
      });
    }

    // Join adjacent fallback holes by bridging over roads with grass connectors.
    for (const key of grassHoleCells) {
      const parts = key.split(',');
      const gx = Number(parts[0]);
      const gz = Number(parts[1]);
      if (!Number.isFinite(gx) || !Number.isFinite(gz)) {
        continue;
      }

      const rightKey = keyFor(gx + 1, gz);
      if (grassHoleCells.has(rightKey)) {
        const centerX = (gx + 0.5) * pitch;
        const centerZ = gz * pitch;
        addGrassRoadConnector(centerX, centerZ, roadWidth + blockSize * 0.12, blockSize * 0.9);
      }

      const downKey = keyFor(gx, gz + 1);
      if (grassHoleCells.has(downKey)) {
        const centerX = gx * pitch;
        const centerZ = (gz + 0.5) * pitch;
        addGrassRoadConnector(centerX, centerZ, blockSize * 0.9, roadWidth + blockSize * 0.12);
      }
    }

    // Fill seams around fallback hole cells when they touch large established lots.
    for (const key of grassHoleCells) {
      const parts = key.split(',');
      const gx = Number(parts[0]);
      const gz = Number(parts[1]);
      if (!Number.isFinite(gx) || !Number.isFinite(gz)) {
        continue;
      }

      const leftKey = keyFor(gx - 1, gz);
      if (largeEstablishedLotCells.has(leftKey)) {
        const centerX = (gx - 0.5) * pitch;
        const centerZ = gz * pitch;
        addLargeLotSeamConnector(centerX, centerZ, roadWidth + blockSize * 0.2, blockSize * 0.96);
      }

      const rightKey = keyFor(gx + 1, gz);
      if (largeEstablishedLotCells.has(rightKey)) {
        const centerX = (gx + 0.5) * pitch;
        const centerZ = gz * pitch;
        addLargeLotSeamConnector(centerX, centerZ, roadWidth + blockSize * 0.2, blockSize * 0.96);
      }

      const upKey = keyFor(gx, gz - 1);
      if (largeEstablishedLotCells.has(upKey)) {
        const centerX = gx * pitch;
        const centerZ = (gz - 0.5) * pitch;
        addLargeLotSeamConnector(centerX, centerZ, blockSize * 0.96, roadWidth + blockSize * 0.2);
      }

      const downKey = keyFor(gx, gz + 1);
      if (largeEstablishedLotCells.has(downKey)) {
        const centerX = gx * pitch;
        const centerZ = (gz + 0.5) * pitch;
        addLargeLotSeamConnector(centerX, centerZ, blockSize * 0.96, roadWidth + blockSize * 0.2);
      }
    }

    function isRoadMasked(x, z) {
      for (const mask of roadMasks) {
        if (x > mask.minX + 1 && x < mask.maxX - 1 && z > mask.minZ + 1 && z < mask.maxZ - 1) {
          return true;
        }
      }
      return false;
    }

    function addRoadPiece(width, depth, x, z) {
      if (isRoadMasked(x, z)) {
        return;
      }
      const piece = new THREE.Mesh(new THREE.BoxGeometry(width, 2.4, depth), roadMaterial);
      piece.position.set(x, 1.2, z);
      piece.receiveShadow = true;
      scene.add(piece);
    }

    // Render roads after all lots/uncommitted placement so masks include every occupied large area.
    for (let ix = 0; ix < laneOffsets.length; ix += 1) {
      for (let iz = 0; iz < laneOffsets.length; iz += 1) {
        addRoadPiece(roadWidth, roadWidth, laneOffsets[ix], laneOffsets[iz]);
      }
    }

    for (let li = 0; li < laneOffsets.length; li += 1) {
      const z = laneOffsets[li];
      for (let gx = -half; gx <= half; gx += 1) {
        addRoadPiece(blockSize, roadWidth, gx * pitch, z);
      }
    }

    for (let li = 0; li < laneOffsets.length; li += 1) {
      const x = laneOffsets[li];
      for (let gz = -half; gz <= half; gz += 1) {
        addRoadPiece(roadWidth, blockSize, x, gz * pitch);
      }
    }

    return {
      unit,
      blockSize,
      roadWidth,
      pitch,
      totalSpan,
      baseCount: debugCounter - config.debugStart,
      namedTargets,
      holeOverlayGroup,
      exportLots,
      laneOffsets,
      isRoadMasked
    };
  }

  function createTextSprite(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return null;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(255, 250, 235, 0.92)';
    ctx.fillRect(0, 18, 350, 88);
    ctx.strokeStyle = 'rgba(108, 84, 53, 0.8)';
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 18, 350, 88);
    ctx.fillStyle = '#3a2f22';
    ctx.font = '700 40px Trebuchet MS, Segoe UI, sans-serif';
    ctx.fillText(text, 20, 74);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(260, 66, 1);
    return sprite;
  }

  let isPointerDown = false;
  let lastX = 0;
  let lastY = 0;
  let pointerMode = 'orbit';

  function onPointerDown(event) {
    isPointerDown = true;
    lastX = event.clientX;
    lastY = event.clientY;
    pointerMode = event.button === 2 ? 'pan' : 'orbit';
  }

  function onPointerMove(event) {
    if (!isPointerDown) {
      return;
    }

    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;

    if (pointerMode === 'orbit') {
      control.theta -= dx * 0.0065;
      control.phi += dy * 0.0042;
    } else {
      const panScale = control.radius * 0.0012;
      const right = new THREE.Vector3().subVectors(camera.position, control.target).cross(camera.up).normalize();
      const forward = new THREE.Vector3().subVectors(camera.position, control.target);
      forward.y = 0;
      forward.normalize();
      control.target.addScaledVector(right, -dx * panScale);
      control.target.addScaledVector(forward, dy * panScale);
    }

    updateCamera();
  }

  function onPointerUp() {
    isPointerDown = false;
  }

  function onWheel(event) {
    event.preventDefault();
    const zoomFactor = event.deltaY > 0 ? 1.08 : 0.92;
    control.radius *= zoomFactor;
    updateCamera();
  }

  function onKeyDown(event) {
    if (!MOVE_KEY_CODES.has(event.code)) {
      return;
    }
    movementKeys.add(event.code);
    event.preventDefault();
  }

  function onKeyUp(event) {
    if (!MOVE_KEY_CODES.has(event.code)) {
      return;
    }
    movementKeys.delete(event.code);
    event.preventDefault();
  }

  function updateKeyboardMovement(deltaSeconds) {
    if (!movementKeys.size) {
      return false;
    }

    const forward = new THREE.Vector3().subVectors(control.target, camera.position);
    forward.y = 0;
    if (forward.lengthSq() < 0.0001) {
      return false;
    }
    forward.normalize();

    const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
    const moveDirection = new THREE.Vector3();

    if (movementKeys.has('KeyW')) {
      moveDirection.add(forward);
    }
    if (movementKeys.has('KeyS')) {
      moveDirection.sub(forward);
    }
    if (movementKeys.has('KeyD')) {
      moveDirection.add(right);
    }
    if (movementKeys.has('KeyA')) {
      moveDirection.sub(right);
    }

    if (moveDirection.lengthSq() < 0.0001) {
      return false;
    }

    moveDirection.normalize();
    const unitsPerSecond = Math.max(80, control.radius * 0.65);
    const step = unitsPerSecond * deltaSeconds;
    control.target.addScaledVector(moveDirection, step);
    return true;
  }

  viewport.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  viewport.addEventListener('wheel', onWheel, { passive: false });
  viewport.addEventListener('contextmenu', (event) => event.preventDefault());
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => movementKeys.clear());

  resetViewBtn.addEventListener('click', () => {
    control.target.set(0, 0, 0);
    control.radius = initialRadius;
    control.theta = 0.85;
    control.phi = 1.08;
    updateCamera();
  });

  window.addEventListener('resize', resize);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', resize);
  }
  const viewportResizeObserver = new ResizeObserver(() => resize());
  viewportResizeObserver.observe(viewport);

  wireMenuShell();
  setupExportAction();

  async function init() {
    const gridConfig = await loadGridConfig();
    const generated = createCityGrid(gridConfig);

    initialRadius = Math.max(720, generated.totalSpan * gridConfig.viewRadiusMultiplier);
    control.radius = initialRadius;
    control.maxRadius = Math.max(2400, generated.totalSpan * gridConfig.maxRadiusMultiplier);
    camera.far = Math.max(12000, control.maxRadius * gridConfig.farPlaneMultiplier);
    camera.updateProjectionMatrix();

    if (holeOverlayToggle) {
      holeOverlayToggle.addEventListener('change', () => {
        if (generated.holeOverlayGroup) {
          generated.holeOverlayGroup.visible = Boolean(holeOverlayToggle.checked);
        }
      });
      holeOverlayToggle.checked = false;
    }

    setupJumpMenu(generated.namedTargets || [], generated.exportLots || []);

    resize();
    updateCamera();
    statusPrefix =
      `Grid size: ${gridConfig.size} · Block: ${generated.blockSize.toFixed(0)} · Road: ${generated.roadWidth.toFixed(0)} · Bases: ${generated.baseCount}`;
    if (configSourceNote) {
      statusPrefix += ` · ${configSourceNote}`;
    }
    updateCamera();

    // --- Spawn Traffic Cars ---
    const trafficCars = [];
    if (generated.laneOffsets && generated.laneOffsets.length > 0) {
      const carColors = [
        0xd32f2f, // red
        0x1976d2, // blue
        0x388e3c, // green
        0xfbc02d, // yellow
        0x8e24aa, // purple
        0xf57c00, // orange
        0x757575, // silver
        0xeeeeee, // white
        0x212121  // black
      ];

      const numCars = 35;
      const roadWidth = generated.roadWidth;
      const totalSpan = generated.totalSpan;

      for (let i = 0; i < numCars; i++) {
        const color = carColors[Math.floor(Math.random() * carColors.length)];
        const carMesh = createCarMesh(color, roadWidth);
        scene.add(carMesh);

        const axis = Math.random() < 0.5 ? 'x' : 'z';
        const laneVal = generated.laneOffsets[Math.floor(Math.random() * generated.laneOffsets.length)];
        const dir = Math.random() < 0.5 ? 1 : -1;
        const speed = 45 + Math.random() * 50; // speed in units/sec

        // Two-lane traffic: offset from lane center to drive on the right side
        let offset = 0;
        if (axis === 'x') {
          // Travel +x -> offset to +z side. Travel -x -> offset to -z side.
          offset = dir === 1 ? roadWidth * 0.24 : -roadWidth * 0.24;
        } else {
          // Travel +z -> offset to -x side. Travel -z -> offset to +x side.
          offset = dir === 1 ? -roadWidth * 0.24 : roadWidth * 0.24;
        }

        const startPos = (Math.random() - 0.5) * totalSpan;

        // Set orientation
        let dirX = 0, dirZ = 0;
        if (axis === 'x') {
          dirX = dir;
        } else {
          dirZ = dir;
        }
        carMesh.rotation.y = -Math.atan2(dirZ, dirX);

        trafficCars.push({
          mesh: carMesh,
          axis,
          lane: laneVal,
          dir,
          speed,
          offset,
          pos: startPos
        });
      }
    }

    let lastTime = performance.now();

    function tick() {
      const now = performance.now();
      const deltaSeconds = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      if (skyMesh) {
        skyMesh.position.copy(camera.position);
      }

      // Update traffic cars with intersection-crossing pathfinding
      const halfSpan = generated.totalSpan / 2;
      const roadWidth = generated.roadWidth;

      for (const car of trafficCars) {
        const prevPos = car.pos;
        const step = car.dir * car.speed * deltaSeconds;
        const nextPos = prevPos + step;

        let crossedLaneVal = null;
        for (const laneVal of generated.laneOffsets) {
          // Did we cross laneVal in this step?
          if ((step > 0 && prevPos <= laneVal && laneVal <= nextPos) ||
              (step < 0 && nextPos <= laneVal && laneVal <= prevPos)) {
            crossedLaneVal = laneVal;
            break;
          }
        }

        if (crossedLaneVal !== null) {
          // Intersection found! Calculate coordinates
          const laneX = car.axis === 'x' ? crossedLaneVal : car.lane;
          const laneZ = car.axis === 'z' ? crossedLaneVal : car.lane;

          // Outgoing options: axis, dir, checkX, checkZ, isUTurn
          const options = [
            { axis: 'x', dir: 1, tx: laneX + roadWidth * 0.6, tz: laneZ + roadWidth * 0.24, isUTurn: (car.axis === 'x' && car.dir === -1) },
            { axis: 'x', dir: -1, tx: laneX - roadWidth * 0.6, tz: laneZ - roadWidth * 0.24, isUTurn: (car.axis === 'x' && car.dir === 1) },
            { axis: 'z', dir: 1, tx: laneX - roadWidth * 0.24, tz: laneZ + roadWidth * 0.6, isUTurn: (car.axis === 'z' && car.dir === -1) },
            { axis: 'z', dir: -1, tx: laneX + roadWidth * 0.24, tz: laneZ - roadWidth * 0.6, isUTurn: (car.axis === 'z' && car.dir === 1) }
          ];

          const validOptions = [];
          const backupOptions = []; // U-turns

          for (const opt of options) {
            // Is this route open?
            const blocked = generated.isRoadMasked && generated.isRoadMasked(opt.tx, opt.tz);
            if (!blocked) {
              if (opt.isUTurn) {
                backupOptions.push(opt);
              } else {
                validOptions.push(opt);
              }
            }
          }

          let selected = null;
          if (validOptions.length > 0) {
            selected = validOptions[Math.floor(Math.random() * validOptions.length)];
          } else if (backupOptions.length > 0) {
            selected = backupOptions[Math.floor(Math.random() * backupOptions.length)];
          }

          if (selected) {
            car.axis = selected.axis;
            car.dir = selected.dir;
            if (selected.axis === 'x') {
              car.lane = laneZ;
              car.pos = laneX + selected.dir * 1.5; // nudge past intersection threshold
              car.offset = selected.dir === 1 ? roadWidth * 0.24 : -roadWidth * 0.24;
            } else {
              car.lane = laneX;
              car.pos = laneZ + selected.dir * 1.5; // nudge past intersection threshold
              car.offset = selected.dir === 1 ? -roadWidth * 0.24 : roadWidth * 0.24;
            }

            // Rotate mesh
            let dirX = 0, dirZ = 0;
            if (selected.axis === 'x') dirX = selected.dir; else dirZ = selected.dir;
            car.mesh.rotation.y = -Math.atan2(dirZ, dirX);
          } else {
            // Straight fallback
            car.pos = nextPos;
          }
        } else {
          // Straight movement
          car.pos = nextPos;
        }

        // Wrap around boundaries
        if (car.pos > halfSpan) {
          car.pos = -halfSpan;
        } else if (car.pos < -halfSpan) {
          car.pos = halfSpan;
        }

        let cx = 0, cz = 0;
        if (car.axis === 'x') {
          cx = car.pos;
          cz = car.lane + car.offset;
        } else {
          cx = car.lane + car.offset;
          cz = car.pos;
        }

        car.mesh.position.set(cx, 2.4, cz);

        // Hide car if it goes through a masked road segment
        if (generated.isRoadMasked) {
          car.mesh.visible = !generated.isRoadMasked(cx, cz);
        }
      }

      if (updateKeyboardMovement(deltaSeconds)) {
        updateCamera();
      }

      renderer.render(scene, camera);
      requestAnimationFrame(tick);
    }

    tick();
  }

  init();
})();
