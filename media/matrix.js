const PALETTES = {
  classic: {
    chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*',
    colors: ['#00FF41', '#00CC33', '#009922', '#006611', '#003308'],
    headColor: '#FFFFFF',
    bg: 'rgba(0, 0, 0, 0.25)',
  },
  cyan: {
    chars: '01<>[]|/\\{}()=+-*',
    colors: ['#00FFFF', '#00CCDD', '#0099BB', '#006688', '#003344'],
    headColor: '#E0FFFF',
    bg: 'rgba(0, 0, 0, 0.25)',
  },
  amber: {
    chars: '0123456789ABCDEFabcdef:;.,!?@#$%&*()[]|/\\~`',
    colors: ['#FFB000', '#DD9500', '#BB7700', '#885500', '#553300'],
    headColor: '#FFEECC',
    bg: 'rgba(0, 0, 0, 0.25)',
  },
  purple: {
    chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
    colors: ['#BF40FF', '#9933CC', '#7722AA', '#551188', '#330066'],
    headColor: '#E8CCFF',
    bg: 'rgba(0, 0, 0, 0.25)',
  },
  red: {
    chars: 'REDPILL0123456789!@#$%^&*',
    colors: ['#FF3333', '#DD2222', '#BB1111', '#880808', '#550404'],
    headColor: '#FFCCCC',
    bg: 'rgba(0, 0, 0, 0.25)',
  },
  rainbow: {
    chars: '0123456789ABCDEF',
    colors: ['#FF0000', '#FF7700', '#FFFF00', '#00FF00', '#0000FF', '#8B00FF', '#FF1493'],
    headColor: '#FFFFFF',
    bg: 'rgba(0, 0, 0, 0.25)',
    isRainbow: true,
  },
  pink: {
    chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
    colors: ['#FF69B4', '#FF1493', '#CC1177', '#991166', '#660044'],
    headColor: '#FFE0F0',
    bg: 'rgba(0, 0, 0, 0.25)',
  },
  ice: {
    chars: '0123456789ICEFLOWXYZ',
    colors: ['#E0FFFF', '#87CEEB', '#6BB3D9', '#4A99C0', '#2A7FA7'],
    headColor: '#FFFFFF',
    bg: 'rgba(0, 0, 0, 0.25)',
  },
};

let matrixCanvas = null;
let matrixCtx = null;
let matrixColumns = [];
let matrixAnimId = null;
let matrixRunning = false;
let currentPalette = 'classic';
let matrixSpeedFactor = 3;
let matrixDensityFactor = 3;
let lastFrameTime = 0;
let lastRenderedAt = 0;
let matrixResizeDebounceId = null;
let saveState = () => {};
let matrixEnabled = false;

function $(selector) {
  return document.querySelector(selector);
}

function $$(selector) {
  return Array.from(document.querySelectorAll(selector));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getMatrixFrameInterval(reducedMotionEnabled) {
  return reducedMotionEnabled ? 1000 / 18 : 1000 / 30;
}

function matrixReset() {
  if (!matrixCanvas) return;
  const fontSize = 18;
  const colSpacing = Math.max(2, 48 - matrixDensityFactor * 8);
  const colWidth = fontSize + colSpacing;
  const numCols = Math.ceil(matrixCanvas.width / colWidth);

  matrixColumns = [];
  for (let i = 0; i < numCols; i += 1) {
    matrixColumns.push({
      x: i * colWidth + colWidth / 2,
      y: Math.random() * -matrixCanvas.height * 2,
      speed: 15 + Math.random() * 20,
      lastDrawnY: -100,
      opacity: 0.5 + Math.random() * 0.5,
    });
  }
}

function matrixResize() {
  if (!matrixCanvas) return;
  matrixCanvas.width = window.innerWidth;
  matrixCanvas.height = window.innerHeight;
  matrixReset();
}

function scheduleMatrixResize() {
  if (matrixResizeDebounceId) {
    clearTimeout(matrixResizeDebounceId);
  }
  matrixResizeDebounceId = setTimeout(() => {
    matrixResizeDebounceId = null;
    if (matrixRunning) matrixResize();
  }, 120);
}

function matrixDraw(time) {
  if (!matrixRunning) return;
  matrixAnimId = requestAnimationFrame(matrixDraw);
  if (time - lastRenderedAt < getMatrixFrameInterval(document.body.classList.contains('reduced-motion'))) return;
  lastRenderedAt = time;
  const deltaTime = Math.min(time - lastFrameTime || 16.6, 50);
  lastFrameTime = time;

  const palette = PALETTES[currentPalette];
  const w = matrixCanvas.width;
  const h = matrixCanvas.height;
  matrixCtx.fillStyle = palette.bg;
  matrixCtx.fillRect(0, 0, w, h);
  matrixCtx.font = `${18}px "JetBrains Mono", "MS Gothic", monospace`;

  const speedMult = 0.01 + matrixSpeedFactor * matrixSpeedFactor * 0.04;
  matrixColumns.forEach((col) => {
    col.y += col.speed * speedMult * deltaTime * 0.1;
    const currentGridY = Math.floor(col.y / 18) * 18;
    if (currentGridY > col.lastDrawnY) {
      const charSet = palette.chars;
      if (col.lastDrawnY >= 0) {
        matrixCtx.fillStyle = palette.isRainbow
          ? palette.colors[(Math.floor(Date.now() / 200) + col.x) % palette.colors.length]
          : palette.colors[Math.floor(Math.random() * palette.colors.length)];
        matrixCtx.globalAlpha = col.opacity;
        matrixCtx.fillText(charSet[Math.floor(Math.random() * charSet.length)], col.x, col.lastDrawnY);
      }
      const headChar = palette.chars[Math.floor(Math.random() * palette.chars.length)];
      matrixCtx.fillStyle = palette.headColor;
      matrixCtx.globalAlpha = col.opacity;
      matrixCtx.fillText(headChar, col.x, currentGridY);
      col.lastDrawnY = currentGridY;
      if (currentGridY > h && Math.random() > 0.95) {
        col.y = -18 - Math.random() * 200;
        col.lastDrawnY = -100;
        col.speed = 15 + Math.random() * 20;
        col.opacity = 0.5 + Math.random() * 0.5;
      }
    }
  });
  matrixCtx.globalAlpha = 1;
}

export function matrixStart() {
  if (matrixRunning || !matrixCanvas) return;
  matrixRunning = true;
  lastFrameTime = performance.now();
  lastRenderedAt = 0;
  matrixResize();
  matrixCtx.fillStyle = '#000';
  matrixCtx.fillRect(0, 0, matrixCanvas.width, matrixCanvas.height);
  matrixAnimId = requestAnimationFrame(matrixDraw);
}

export function matrixStop() {
  matrixRunning = false;
  if (matrixAnimId) {
    cancelAnimationFrame(matrixAnimId);
    matrixAnimId = null;
  }
  if (matrixResizeDebounceId) {
    clearTimeout(matrixResizeDebounceId);
    matrixResizeDebounceId = null;
  }
}

function applyPaletteButtons() {
  $$('.palette-swatch').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.palette === currentPalette);
    btn.addEventListener('click', () => {
      $$('.palette-swatch').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentPalette = btn.dataset.palette;
      matrixReset();
      saveState();
    });
  });
}

function bindControls() {
  const matrixSpeedInput = $('#matrixSpeed');
  if (matrixSpeedInput) {
    matrixSpeedInput.value = String(matrixSpeedFactor);
    matrixSpeedInput.addEventListener('input', (e) => {
      matrixSpeedFactor = clamp(parseInt(e.target.value, 10) || 3, 1, 5);
      saveState();
    });
  }
  const matrixDensityInput = $('#matrixDensity');
  if (matrixDensityInput) {
    matrixDensityInput.value = String(matrixDensityFactor);
    matrixDensityInput.addEventListener('input', (e) => {
      matrixDensityFactor = clamp(parseInt(e.target.value, 10) || 3, 1, 5);
      matrixReset();
      saveState();
    });
  }
  const btnToggle = $('#btnToggleMatrixControls');
  const btnClose = $('#btnCloseMatrixControls');
  const matrixControls = $('#matrixControls');
  const viewMatrix = $('#viewMatrix');
  if (btnToggle && btnClose && matrixControls) {
    const setPaletteOpen = (open) => {
      matrixControls.classList.toggle('collapsed', !open);
      if (viewMatrix) viewMatrix.classList.toggle('palette-open', open);
    };
    setPaletteOpen(!matrixControls.classList.contains('collapsed'));
    btnToggle.addEventListener('click', () => {
      if (!matrixRunning) return;
      setPaletteOpen(matrixControls.classList.contains('collapsed'));
      saveState();
    });
    btnClose.addEventListener('click', () => {
      setPaletteOpen(false);
      saveState();
    });
  }
}

export function setMatrixEnabled(enabled, persist = true) {
  matrixEnabled = !!enabled;
  const matrixToggleBtn = $('#btnToggleMatrixFx');
  const matrixControls = $('#matrixControls');
  const viewMatrix = $('#viewMatrix');
  document.body.classList.toggle('matrix-enabled', matrixEnabled);
  document.body.classList.toggle('matrix-active', matrixEnabled);
  if (matrixToggleBtn) {
    matrixToggleBtn.classList.toggle('active', matrixEnabled);
    matrixToggleBtn.setAttribute('aria-pressed', String(matrixEnabled));
  }
  if (!matrixEnabled) {
    matrixStop();
    matrixControls?.classList.add('collapsed');
    viewMatrix?.classList.remove('palette-open');
  } else {
    matrixStart();
  }
  if (persist) saveState();
}

export function getMatrixSnapshot() {
  return {
    enabled: matrixEnabled,
    palette: currentPalette,
    speed: matrixSpeedFactor,
    density: matrixDensityFactor,
    paletteOpen: $('#matrixControls') ? !$('#matrixControls').classList.contains('collapsed') : false,
  };
}

export function initMatrix(bootMatrix, reducedMotion, callbacks) {
  saveState = callbacks?.saveState || (() => {});
  matrixEnabled = bootMatrix?.enabled === true;
  currentPalette = typeof bootMatrix?.palette === 'string' && PALETTES[bootMatrix.palette] ? bootMatrix.palette : 'classic';
  matrixSpeedFactor = Number.isFinite(bootMatrix?.speed) ? clamp(Math.round(bootMatrix.speed), 1, 5) : 3;
  matrixDensityFactor = Number.isFinite(bootMatrix?.density) ? clamp(Math.round(bootMatrix.density), 1, 5) : 3;
  matrixCanvas = document.querySelector('#matrixCanvas');
  if (!matrixCanvas) return;
  matrixCtx = matrixCanvas.getContext('2d');
  applyPaletteButtons();
  bindControls();
  if (matrixEnabled) matrixStart();
  window.addEventListener('resize', () => {
    if (matrixEnabled) scheduleMatrixResize();
  });
}
