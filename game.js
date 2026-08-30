'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#448aff', // J - blue
  '#ffb74d', // L - orange
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

// Skins visuales del tablero: paleta de colores por tipo de pieza (mismo
// shape que COLORS), fondo/grid del canvas y flags de efecto de dibujo.
// `background`/`grid` en null significa "usar el valor dinámico de la UI
// actual" (CSS var --grid-line / fondo del panel), para que el skin Retro
// se comporte exactamente igual que antes de esta feature, incluso con el
// toggle de modo oscuro/claro.
const SKINS = {
  retro: {
    label: 'Retro',
    colors: COLORS.slice(),
    background: null,
    grid: null,
    highlight: true,
    glow: false,
    rounded: false,
    bevel: false,
  },
  neon: {
    label: 'Neón',
    colors: [null, '#00e5ff', '#fff176', '#e040fb', '#69f0ae', '#ff1744', '#2979ff', '#ffab40'],
    background: '#000000',
    grid: '#111111',
    highlight: false,
    glow: true,
    rounded: false,
    bevel: false,
  },
  pastel: {
    label: 'Pastel',
    colors: [null, '#b3e5fc', '#fff9c4', '#e1bee7', '#c8e6c9', '#ffcdd2', '#bbdefb', '#ffe0b2'],
    background: '#fdfaf6',
    grid: '#ece6df',
    highlight: false,
    glow: false,
    rounded: true,
    bevel: false,
  },
  pixel: {
    label: 'Pixel Art',
    colors: COLORS.slice(),
    background: '#12121a',
    grid: '#2a2a3a',
    highlight: false,
    glow: false,
    rounded: false,
    bevel: true,
  },
};

let currentSkin = SKINS.retro;

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggleBtn = document.getElementById('theme-toggle');
const skinSelect = document.getElementById('skin-select');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let gridColor;

function getGridColor() {
  return getComputedStyle(document.documentElement).getPropertyValue('--grid-line').trim();
}

function readStoredTheme() {
  try {
    return localStorage.getItem('theme');
  } catch (e) {
    return null;
  }
}

function storeTheme(theme) {
  try {
    localStorage.setItem('theme', theme);
  } catch (e) {
    // localStorage puede no estar disponible (modo privado, file://, etc.); el tema igual se aplica en memoria
  }
}

function applyTheme(theme) {
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
    themeToggleBtn.textContent = '☀️';
  } else {
    document.documentElement.removeAttribute('data-theme');
    themeToggleBtn.textContent = '🌙';
  }
  gridColor = getGridColor();
}

function toggleTheme() {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const nextTheme = isLight ? 'dark' : 'light';
  applyTheme(nextTheme);
  storeTheme(nextTheme);
}

function resolveSkinName(name) {
  return SKINS[name] ? name : 'retro';
}

function readStoredSkin() {
  try {
    return localStorage.getItem('skin');
  } catch (e) {
    return null;
  }
}

function storeSkin(name) {
  try {
    localStorage.setItem('skin', name);
  } catch (e) {
    // localStorage puede no estar disponible (modo privado, file://, etc.); el skin igual se aplica en memoria
  }
}

// Solo asigna currentSkin en memoria, sin redibujar. Se usa en la carga
// inicial, ANTES de que init() haya corrido, porque draw()/drawNext()
// dependen de `current`/`next`/`ghostY()` que todavía no existen.
function setSkin(name) {
  currentSkin = SKINS[resolveSkinName(name)];
}

// Aplica y persiste el skin, y redibuja. Solo debe dispararse desde el
// evento 'change' del selector, momento en el que el juego ya arrancó.
function applySkin(name) {
  const resolved = resolveSkinName(name);
  setSkin(resolved);
  storeSkin(resolved);
  draw();
  drawNext();
}

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const skin = currentSkin;
  const color = skin.colors[colorIndex] || COLORS[colorIndex];
  const px = x * size + 1;
  const py = y * size + 1;
  const s = size - 2;

  context.save();
  context.globalAlpha = alpha ?? 1;

  if (skin.glow) {
    context.shadowBlur = size * 0.6;
    context.shadowColor = color;
  }

  context.fillStyle = color;
  if (skin.rounded && typeof context.roundRect === 'function') {
    context.beginPath();
    context.roundRect(px, py, s, s, Math.min(6, s / 4));
    context.fill();
  } else {
    context.fillRect(px, py, s, s);
  }

  // Los overlays (highlight/bisel) no deben heredar el glow del relleno.
  context.shadowBlur = 0;

  if (skin.highlight) {
    context.fillStyle = 'rgba(255,255,255,0.12)';
    context.fillRect(px, py, s, 4);
  }

  if (skin.bevel) {
    context.fillStyle = 'rgba(255,255,255,0.28)';
    context.fillRect(px, py, s, 3);
    context.fillRect(px, py, 3, s);
    context.fillStyle = 'rgba(0,0,0,0.35)';
    context.fillRect(px, py + s - 3, s, 3);
    context.fillRect(px + s - 3, py, 3, s);
  }

  context.restore();
}

function drawGrid() {
  const skin = currentSkin;
  ctx.strokeStyle = skin.grid || gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  const skin = currentSkin;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (skin.background) {
    ctx.fillStyle = skin.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  const skin = currentSkin;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  if (skin.background) {
    nextCtx.fillStyle = skin.background;
    nextCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
  }
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);
themeToggleBtn.addEventListener('click', toggleTheme);

// Asignación inicial del skin: silenciosa (sin redibujar), porque el juego
// (current/next/ghostY) todavía no existe en este punto. El cambio "en
// caliente" con persistencia y redibujado solo ocurre en el listener
// 'change' de abajo, que se dispara después de init().
const initialSkinName = resolveSkinName(readStoredSkin());
setSkin(initialSkinName);
if (skinSelect) {
  skinSelect.value = initialSkinName;
  skinSelect.addEventListener('change', () => applySkin(skinSelect.value));
}

applyTheme(readStoredTheme() === 'light' ? 'light' : 'dark');
init();
