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
const recordsListEl = document.getElementById('records-list');
const overlayRecordsListEl = document.getElementById('overlay-records-list');
const overlayRecordsSection = document.getElementById('overlay-records-section');
const resetRecordsBtn = document.getElementById('reset-records-btn');
const bestComboEl = document.getElementById('best-combo');
const maxLinesEl = document.getElementById('max-lines');
const newRecordForm = document.getElementById('new-record-form');
const playerNameInput = document.getElementById('player-name-input');
const saveRecordBtn = document.getElementById('save-record-btn');

const pauseOverlay = document.getElementById('pause-overlay');
const pauseMenuView = document.getElementById('pause-menu-view');
const pauseControlsView = document.getElementById('pause-controls-view');
const resumeBtn = document.getElementById('resume-btn');
const restartPauseBtn = document.getElementById('restart-pause-btn');
const showControlsBtn = document.getElementById('show-controls-btn');
const backToPauseMenuBtn = document.getElementById('back-to-pause-menu-btn');
const startLevelSelect = document.getElementById('start-level-select');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let gridColor;
let startLevel;
let combo, comboMax, pendingScore;

const RECORDS_KEY = 'tetris-records';
const BEST_COMBO_KEY = 'tetris-best-combo';
const MAX_LINES_KEY = 'tetris-max-lines';
const MAX_RECORDS = 5;

function loadRecords() {
  try {
    const raw = localStorage.getItem(RECORDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(r => r && typeof r.name === 'string' && typeof r.score === 'number');
  } catch (e) {
    return [];
  }
}

function saveRecords(records) {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  } catch (e) {
    // localStorage puede no estar disponible; el récord no persiste pero el juego sigue
  }
}

function loadNumberStat(key) {
  try {
    const raw = localStorage.getItem(key);
    const n = raw === null ? 0 : parseInt(raw, 10);
    return Number.isFinite(n) ? n : 0;
  } catch (e) {
    return 0;
  }
}

function saveNumberStat(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch (e) {
    // ignorar si localStorage no está disponible
  }
}

function qualifiesForRecords(candidateScore, records) {
  if (records.length < MAX_RECORDS) return true;
  const min = Math.min(...records.map(r => r.score));
  return candidateScore > min;
}

function insertRecord(records, name, scoreValue) {
  const newRecord = { name, score: scoreValue };
  const updated = [...records, newRecord];
  updated.sort((a, b) => b.score - a.score);
  const trimmed = updated.slice(0, MAX_RECORDS);
  const index = trimmed.indexOf(newRecord);
  return { records: trimmed, index };
}

function renderRecordsList(listEl, records, highlightIndex) {
  listEl.textContent = '';
  if (records.length === 0) {
    const li = document.createElement('li');
    li.className = 'records-empty';
    li.textContent = 'Sin récords aún';
    listEl.appendChild(li);
    return;
  }
  records.forEach((rec, i) => {
    const li = document.createElement('li');
    li.className = 'records-item' + (i === highlightIndex ? ' records-item-new' : '');
    const nameSpan = document.createElement('span');
    nameSpan.className = 'records-name';
    nameSpan.textContent = rec.name;
    const scoreSpan = document.createElement('span');
    scoreSpan.className = 'records-score';
    scoreSpan.textContent = rec.score.toLocaleString();
    li.appendChild(nameSpan);
    li.appendChild(scoreSpan);
    listEl.appendChild(li);
  });
}

function refreshRecordsUI(highlightIndex) {
  const records = loadRecords();
  renderRecordsList(recordsListEl, records, -1);
  renderRecordsList(overlayRecordsListEl, records, highlightIndex ?? -1);
}

function refreshStatsUI() {
  bestComboEl.textContent = loadNumberStat(BEST_COMBO_KEY);
  maxLinesEl.textContent = loadNumberStat(MAX_LINES_KEY);
}

function resetRecords() {
  try {
    localStorage.removeItem(RECORDS_KEY);
  } catch (e) {
    // ignorar si localStorage no está disponible
  }
  refreshRecordsUI(-1);
}

function commitRecord() {
  if (pendingScore === null) return;
  const name = (playerNameInput.value || '').trim().slice(0, 12) || 'JUGADOR';
  const records = loadRecords();
  const { records: updated, index } = insertRecord(records, name, pendingScore);
  saveRecords(updated);
  renderRecordsList(recordsListEl, updated, -1);
  renderRecordsList(overlayRecordsListEl, updated, index);
  newRecordForm.classList.add('hidden');
  pendingScore = null;
}

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

function readStoredStartLevel() {
  try {
    const raw = parseInt(localStorage.getItem('startLevel'), 10);
    if (Number.isFinite(raw) && raw >= 1 && raw <= 10) return raw;
  } catch (e) {
    // localStorage puede no estar disponible; usar valor por defecto
  }
  return 1;
}

function storeStartLevel(lvl) {
  try {
    localStorage.setItem('startLevel', String(lvl));
  } catch (e) {
    // localStorage puede no estar disponible; el nivel igual se aplica en memoria
  }
}

function getDropInterval(lvl) {
  return Math.max(100, 1000 - (lvl - 1) * 90);
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
    level = startLevel + Math.floor(lines / 10);
    dropInterval = getDropInterval(level);
    updateHUD();
  }
  return cleared;
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
  const cleared = clearLines();
  if (cleared > 0) {
    combo++;
    if (combo > comboMax) comboMax = combo;
  } else {
    combo = 0;
  }
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

  // estadísticas globales (todas las partidas)
  const prevBestCombo = loadNumberStat(BEST_COMBO_KEY);
  const prevMaxLines = loadNumberStat(MAX_LINES_KEY);
  if (comboMax > prevBestCombo) saveNumberStat(BEST_COMBO_KEY, comboMax);
  if (lines > prevMaxLines) saveNumberStat(MAX_LINES_KEY, lines);
  refreshStatsUI();

  // tabla de records por puntuación
  const records = loadRecords();
  overlayRecordsSection.classList.remove('hidden');
  if (qualifiesForRecords(score, records)) {
    pendingScore = score;
    playerNameInput.value = '';
    newRecordForm.classList.remove('hidden');
    renderRecordsList(overlayRecordsListEl, records, -1);
    setTimeout(() => playerNameInput.focus(), 0);
  } else {
    pendingScore = null;
    newRecordForm.classList.add('hidden');
    renderRecordsList(overlayRecordsListEl, records, -1);
  }
}

function showPauseMenuView() {
  pauseMenuView.classList.remove('hidden');
  pauseControlsView.classList.add('hidden');
}

function showPauseControlsView() {
  pauseMenuView.classList.add('hidden');
  pauseControlsView.classList.remove('hidden');
}

function openPauseMenu() {
  paused = true;
  cancelAnimationFrame(animId);
  showPauseMenuView();
  pauseOverlay.classList.remove('hidden');
}

function closePauseMenu() {
  paused = false;
  pauseOverlay.classList.add('hidden');
  lastTime = performance.now();
  animId = requestAnimationFrame(loop);
}

function togglePauseMenu() {
  if (gameOver) return;
  if (paused) {
    closePauseMenu();
  } else {
    openPauseMenu();
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
  level = startLevel;
  paused = false;
  gameOver = false;
  dropInterval = getDropInterval(startLevel);
  dropAccum = 0;
  combo = 0;
  comboMax = 0;
  pendingScore = null;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  pauseOverlay.classList.add('hidden');
  newRecordForm.classList.add('hidden');
  overlayRecordsSection.classList.add('hidden');
  refreshRecordsUI(-1);
  refreshStatsUI();
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP' || e.code === 'Escape') { togglePauseMenu(); return; }
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
resetRecordsBtn.addEventListener('click', resetRecords);
saveRecordBtn.addEventListener('click', commitRecord);
playerNameInput.addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.code === 'Enter' || e.key === 'Enter') {
    e.preventDefault();
    commitRecord();
  }
});

resumeBtn.addEventListener('click', closePauseMenu);
restartPauseBtn.addEventListener('click', init);
showControlsBtn.addEventListener('click', showPauseControlsView);
backToPauseMenuBtn.addEventListener('click', showPauseMenuView);
startLevelSelect.addEventListener('change', () => {
  const val = parseInt(startLevelSelect.value, 10);
  startLevel = Number.isFinite(val) ? Math.min(10, Math.max(1, val)) : 1;
  storeStartLevel(startLevel);
});

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
startLevel = readStoredStartLevel();
startLevelSelect.value = String(startLevel);
init();
