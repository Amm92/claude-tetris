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
const gameoverBox = document.getElementById('gameover-box');
const pauseMenu = document.getElementById('pause-menu');
const pauseControls = document.getElementById('pause-controls');
const resumeBtn = document.getElementById('resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const controlsBtn = document.getElementById('controls-btn');
const startLevelSelect = document.getElementById('start-level-select');
const nameForm = document.getElementById('name-form');
const playerNameInput = document.getElementById('player-name');
const recordsBox = document.getElementById('records-box');
const recordsList = document.getElementById('records-list');
const recComboEl = document.getElementById('rec-combo');
const recMaxLinesEl = document.getElementById('rec-maxlines');
const resetRecordsBtn = document.getElementById('reset-records-btn');

const MAX_START_LEVEL = 15;

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let combo, maxCombo, started, scoreSaved;
let gridColor;
let startLevel = readStoredStartLevel();

/* ---------- Tabla de records (localStorage) ---------- */

const RECORDS_KEY = 'tetris.records';
const MAX_RECORDS = 5;

function defaultRecords() {
  return { top: [], bestCombo: 0, maxLines: 0 };
}

function loadRecords() {
  try {
    const raw = localStorage.getItem(RECORDS_KEY);
    if (!raw) return defaultRecords();
    const data = JSON.parse(raw);
    return {
      top: Array.isArray(data.top)
        ? data.top
            .filter(e => e && typeof e.score === 'number')
            .slice(0, MAX_RECORDS)
        : [],
      bestCombo: Number(data.bestCombo) || 0,
      maxLines: Number(data.maxLines) || 0,
    };
  } catch (e) {
    return defaultRecords();
  }
}

function saveRecords() {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  } catch (e) {
    // localStorage puede no estar disponible; los records viven en memoria durante la sesión
  }
}

function qualifiesForTop(value) {
  if (value <= 0) return false;
  if (records.top.length < MAX_RECORDS) return true;
  return value > records.top[records.top.length - 1].score;
}

function addScore(name, s, l, lv) {
  const entry = { name, score: s, lines: l, level: lv, date: Date.now() };
  records.top.push(entry);
  records.top.sort((a, b) => b.score - a.score || a.date - b.date);
  records.top = records.top.slice(0, MAX_RECORDS);
  saveRecords();
  return records.top.indexOf(entry);
}

let records = loadRecords();

function renderRecords(opts) {
  opts = opts || {};
  let list = records.top.slice();
  let highlight = typeof opts.highlightIndex === 'number' ? opts.highlightIndex : -1;

  if (opts.preview) {
    list.push({ ...opts.preview, __preview: true });
    list.sort((a, b) => b.score - a.score);
    list = list.slice(0, MAX_RECORDS);
    highlight = list.findIndex(e => e.__preview);
  }

  recordsList.innerHTML = '';
  if (list.length === 0) {
    const li = document.createElement('li');
    li.className = 'records-empty';
    li.textContent = 'Sin récords todavía';
    recordsList.appendChild(li);
  } else {
    list.forEach((entry, i) => {
      const li = document.createElement('li');
      if (i === highlight) li.className = 'highlight';

      const rank = document.createElement('span');
      rank.className = 'rec-rank';
      rank.textContent = (i + 1) + '.';

      const name = document.createElement('span');
      name.className = 'rec-name';
      name.textContent = entry.name || (entry.__preview ? 'TÚ' : 'Anónimo');

      const val = document.createElement('span');
      val.className = 'rec-score';
      val.textContent = entry.score.toLocaleString();

      li.append(rank, name, val);
      recordsList.appendChild(li);
    });
  }

  recComboEl.textContent = records.bestCombo;
  recMaxLinesEl.textContent = records.maxLines;
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
    const v = parseInt(localStorage.getItem('startLevel'), 10);
    return v >= 1 && v <= MAX_START_LEVEL ? v : 1;
  } catch (e) {
    return 1;
  }
}

function storeStartLevel(v) {
  try {
    localStorage.setItem('startLevel', String(v));
  } catch (e) {
    // localStorage puede no estar disponible; el valor igual se usa en memoria
  }
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
    level = Math.max(startLevel, Math.floor(lines / 10) + 1);
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
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
    if (combo > maxCombo) maxCombo = combo;
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
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
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
  ctx.clearRect(0, 0, canvas.width, canvas.height);
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
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  started = false;
  scoreSaved = false;
  cancelAnimationFrame(animId);
  pauseMenu.classList.add('hidden');
  gameoverBox.classList.remove('hidden');

  if (maxCombo > records.bestCombo) records.bestCombo = maxCombo;
  if (lines > records.maxLines) records.maxLines = lines;
  saveRecords();

  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  restartBtn.textContent = 'Jugar de nuevo';
  recordsBox.classList.remove('hidden');

  if (qualifiesForTop(score)) {
    playerNameInput.value = '';
    nameForm.classList.remove('hidden');
    renderRecords({ preview: { name: '', score, lines, level } });
    overlay.classList.remove('hidden');
    playerNameInput.focus();
  } else {
    nameForm.classList.add('hidden');
    renderRecords();
    overlay.classList.remove('hidden');
  }
}

function showStart() {
  overlayTitle.textContent = 'TETRIS';
  overlayScore.textContent = '';
  restartBtn.textContent = 'Jugar';
  nameForm.classList.add('hidden');
  recordsBox.classList.remove('hidden');
  renderRecords();
  overlay.classList.remove('hidden');
}

function openPauseMenu() {
  paused = true;
  cancelAnimationFrame(animId);
  pauseControls.classList.add('hidden');
  gameoverBox.classList.add('hidden');
  pauseMenu.classList.remove('hidden');
  overlay.classList.remove('hidden');
  resumeBtn.focus();
}

function resumeGame() {
  if (!paused || gameOver) return;
  paused = false;
  overlay.classList.add('hidden');
  pauseMenu.classList.add('hidden');
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  lastTime = performance.now();
  dropAccum = 0;
  animId = requestAnimationFrame(loop);
}

function togglePause() {
  if (gameOver || !started) return;
  if (paused) resumeGame();
  else openPauseMenu();
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

function resetState() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = startLevel;
  combo = 0;
  maxCombo = 0;
  paused = false;
  gameOver = false;
  dropInterval = Math.max(100, 1000 - (level - 1) * 90);
  dropAccum = 0;
  updateHUD();
}

function startGame() {
  resetState();
  started = true;
  scoreSaved = false;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  overlay.classList.add('hidden');
  pauseMenu.classList.add('hidden');
  gameoverBox.classList.remove('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

function init() {
  resetState();
  started = false;
  cancelAnimationFrame(animId);
  next = randomPiece();
  current = randomPiece();
  drawNext();
  draw();
  showStart();
}

document.addEventListener('keydown', e => {
  if (e.target && e.target.tagName === 'INPUT') return;
  if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); return; }
  if (paused || gameOver || !started) return;
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

restartBtn.addEventListener('click', startGame);
pauseRestartBtn.addEventListener('click', startGame);
resumeBtn.addEventListener('click', resumeGame);
controlsBtn.addEventListener('click', () => pauseControls.classList.toggle('hidden'));
themeToggleBtn.addEventListener('click', toggleTheme);

for (let i = 1; i <= MAX_START_LEVEL; i++) {
  const opt = document.createElement('option');
  opt.value = String(i);
  opt.textContent = i;
  startLevelSelect.appendChild(opt);
}
startLevelSelect.value = String(startLevel);
startLevelSelect.addEventListener('change', () => {
  startLevel = parseInt(startLevelSelect.value, 10) || 1;
  storeStartLevel(startLevel);
});

nameForm.addEventListener('submit', e => {
  e.preventDefault();
  if (scoreSaved) return;
  const name = playerNameInput.value.trim().slice(0, 12) || 'Anónimo';
  const idx = addScore(name, score, lines, level);
  scoreSaved = true;
  nameForm.classList.add('hidden');
  renderRecords({ highlightIndex: idx });
});

playerNameInput.addEventListener('input', () => {
  if (scoreSaved || nameForm.classList.contains('hidden')) return;
  renderRecords({ preview: { name: playerNameInput.value.trim(), score, lines, level } });
});

resetRecordsBtn.addEventListener('click', () => {
  records = defaultRecords();
  saveRecords();
  if (gameOver && !scoreSaved && qualifiesForTop(score)) {
    renderRecords({ preview: { name: playerNameInput.value.trim(), score, lines, level } });
  } else {
    renderRecords();
  }
});

applyTheme(readStoredTheme() === 'light' ? 'light' : 'dark');
init();
