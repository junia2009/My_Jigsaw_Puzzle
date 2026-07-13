'use strict';

/* ============================================================
 * My Jigsaw Puzzle
 * 好きな写真からジグソーパズルを生成して遊べるゲーム
 * ============================================================ */

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);

const setupScreen = $('setup-screen');
const gameScreen = $('game-screen');
const dropzone = $('dropzone');
const fileInput = $('file-input');
const dropzoneEmpty = $('dropzone-empty');
const dropzonePreview = $('dropzone-preview');
const previewImg = $('preview-img');
const changeImageBtn = $('change-image-btn');
const sampleBtn = $('sample-btn');
const difficultyButtons = $('difficulty-buttons');
const startBtn = $('start-btn');

const canvas = $('game-canvas');
const ctx = canvas.getContext('2d');
const gameMain = $('game-main');
const statTime = $('stat-time');
const statPieces = $('stat-pieces');
const hintBtn = $('hint-btn');
const peekBtn = $('peek-btn');
const shuffleBtn = $('shuffle-btn');
const newBtn = $('new-btn');
const peekModal = $('peek-modal');
const peekImg = $('peek-img');
const clearOverlay = $('clear-overlay');
const clearStats = $('clear-stats');
const clearAgainBtn = $('clear-again-btn');
const clearNewBtn = $('clear-new-btn');

// ---------- 状態 ----------
let sourceImage = null;      // 選択された画像 (ImageBitmap / Canvas / Image)
let targetPieces = 24;       // 目標ピース数
let game = null;             // 進行中のゲーム

// ============================================================
// セットアップ画面
// ============================================================

dropzone.addEventListener('click', () => fileInput.click());

changeImageBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  fileInput.click();
});

fileInput.addEventListener('change', () => {
  if (fileInput.files && fileInput.files[0]) {
    loadImageFile(fileInput.files[0]);
  }
});

['dragover', 'dragenter'].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  })
);
['dragleave', 'drop'].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
  })
);
dropzone.addEventListener('drop', (e) => {
  const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) loadImageFile(file);
});

sampleBtn.addEventListener('click', () => {
  setSourceImage(createSampleImage());
});

difficultyButtons.addEventListener('click', (e) => {
  const btn = e.target.closest('.diff-btn');
  if (!btn) return;
  difficultyButtons.querySelectorAll('.diff-btn').forEach((b) => b.classList.remove('selected'));
  btn.classList.add('selected');
  targetPieces = parseInt(btn.dataset.pieces, 10);
});

startBtn.addEventListener('click', () => {
  if (sourceImage) startGame();
});

async function loadImageFile(file) {
  try {
    // EXIF の回転を反映して読み込む
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    setSourceImage(bmp);
  } catch (_) {
    // フォールバック (古いブラウザ)
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      setSourceImage(img);
    };
    img.src = url;
  }
}

function setSourceImage(img) {
  sourceImage = img;
  // プレビュー用に縮小コピーを作る
  const thumb = scaleImageToCanvas(img, 640);
  previewImg.src = thumb.toDataURL('image/jpeg', 0.85);
  dropzoneEmpty.hidden = true;
  dropzonePreview.hidden = false;
  startBtn.disabled = false;
}

function scaleImageToCanvas(img, maxSize) {
  const w = img.width;
  const h = img.height;
  const scale = Math.min(1, maxSize / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * scale));
  c.height = Math.max(1, Math.round(h * scale));
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c;
}

// サンプル画像 (夕焼けの海と山) をその場で描画して生成する
function createSampleImage() {
  const W = 1200;
  const H = 800;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');

  // 空
  const sky = g.createLinearGradient(0, 0, 0, H * 0.62);
  sky.addColorStop(0, '#2b1a5e');
  sky.addColorStop(0.45, '#b3477d');
  sky.addColorStop(0.8, '#ff8c5a');
  sky.addColorStop(1, '#ffd97a');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H * 0.62);

  // 太陽
  const sun = g.createRadialGradient(W * 0.5, H * 0.55, 10, W * 0.5, H * 0.55, 130);
  sun.addColorStop(0, '#fff6cf');
  sun.addColorStop(0.5, '#ffdf7e');
  sun.addColorStop(1, 'rgba(255,223,126,0)');
  g.fillStyle = sun;
  g.fillRect(0, 0, W, H * 0.62);

  // 星
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H * 0.3;
    g.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.7})`;
    g.fillRect(x, y, 2, 2);
  }

  // 山 (奥・手前)
  drawMountains(g, W, H * 0.62, '#5d2e64', 0.28, 7);
  drawMountains(g, W, H * 0.62, '#3a1f4e', 0.17, 5);

  // 海
  const sea = g.createLinearGradient(0, H * 0.62, 0, H);
  sea.addColorStop(0, '#ff9d6b');
  sea.addColorStop(0.15, '#c65a7d');
  sea.addColorStop(1, '#241a4a');
  g.fillStyle = sea;
  g.fillRect(0, H * 0.62, W, H * 0.38);

  // 太陽の反射
  for (let i = 0; i < 26; i++) {
    const y = H * 0.63 + i * (H * 0.35 / 26);
    const w = 30 + Math.random() * 120 + i * 3;
    g.fillStyle = `rgba(255,220,140,${0.35 - i * 0.011})`;
    g.fillRect(W * 0.5 - w / 2 + (Math.random() - 0.5) * 40, y, w, 4);
  }

  // 手前のヨット
  g.fillStyle = '#171130';
  g.beginPath();
  g.moveTo(W * 0.74, H * 0.78);
  g.quadraticCurveTo(W * 0.79, H * 0.83, W * 0.86, H * 0.78);
  g.lineTo(W * 0.74, H * 0.78);
  g.fill();
  g.beginPath();
  g.moveTo(W * 0.795, H * 0.77);
  g.lineTo(W * 0.795, H * 0.62);
  g.lineTo(W * 0.73, H * 0.77);
  g.closePath();
  g.fill();
  g.beginPath();
  g.moveTo(W * 0.805, H * 0.77);
  g.lineTo(W * 0.805, H * 0.64);
  g.lineTo(W * 0.855, H * 0.77);
  g.closePath();
  g.fill();

  return c;
}

function drawMountains(g, W, horizon, color, heightRatio, peaks) {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(0, horizon);
  for (let i = 0; i <= peaks; i++) {
    const x = (W / peaks) * i;
    const y = horizon - (i % 2 === 0 ? 0.4 : 1) * heightRatio * horizon * (0.6 + ((i * 37) % 10) / 18);
    g.lineTo(x, y);
  }
  g.lineTo(W, horizon);
  g.closePath();
  g.fill();
}

// ============================================================
// パズル生成
// ============================================================

// 目標ピース数と画像の縦横比から、セルがほぼ正方形になる行列数を決める
function computeGrid(aspect, target) {
  let best = null;
  for (let cols = 2; cols <= 40; cols++) {
    const rows = Math.max(2, Math.round(cols / aspect));
    const count = cols * rows;
    const cellAspect = (aspect * rows) / cols; // セルの縦横比 (1 が正方形)
    const err =
      Math.abs(count - target) / target + Math.abs(Math.log(cellAspect)) * 0.6;
    if (!best || err < best.err) best = { cols, rows, err };
  }
  return best;
}

// 1辺分のジグソー曲線を Path2D に追加する
// (ax,ay)→(bx,by)、sign: 0=直線 / +1=凸 / -1=凹、tab=タブの高さ(px)
function addEdge(path, ax, ay, bx, by, sign, tab) {
  if (sign === 0) {
    path.lineTo(bx, by);
    return;
  }
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  // 時計回りに辿ったとき外側を向く法線
  const nx = uy;
  const ny = -ux;
  const T = tab * sign;
  const P = (x, y) => [ax + ux * x * len + nx * y * T, ay + uy * x * len + ny * y * T];

  // ネック→バルジ(丸い頭)→ネックの4本のベジェ曲線
  const b = (c1, c2, p) => path.bezierCurveTo(...P(...c1), ...P(...c2), ...P(...p));
  b([0.3, 0], [0.45, 0.08], [0.42, 0.4]);
  b([0.4, 0.68], [0.32, 1.0], [0.5, 1.0]);
  b([0.68, 1.0], [0.6, 0.68], [0.58, 0.4]);
  b([0.55, 0.08], [0.7, 0], [1.0, 0]);
}

function buildPiecePath(w, h, edges, pad, tab) {
  const p = new Path2D();
  p.moveTo(pad, pad);
  addEdge(p, pad, pad, pad + w, pad, edges[0], tab);          // 上
  addEdge(p, pad + w, pad, pad + w, pad + h, edges[1], tab);  // 右
  addEdge(p, pad + w, pad + h, pad, pad + h, edges[2], tab);  // 下
  addEdge(p, pad, pad + h, pad, pad, edges[3], tab);          // 左
  p.closePath();
  return p;
}

// ============================================================
// ゲーム本体
// ============================================================

function startGame() {
  // キャンバスの内部解像度を確定
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  gameScreen.hidden = false;
  setupScreen.hidden = true;
  clearOverlay.hidden = true;

  const cw = Math.max(320, gameMain.clientWidth) * dpr;
  const ch = Math.max(320, gameMain.clientHeight) * dpr;
  canvas.width = cw;
  canvas.height = ch;

  const aspect = sourceImage.width / sourceImage.height;
  const { cols, rows } = computeGrid(aspect, targetPieces);

  // 盤面サイズ: 周囲にピース置き場の余白を残して中央に配置
  let boardW = cw * 0.58;
  let boardH = boardW / aspect;
  if (boardH > ch * 0.66) {
    boardH = ch * 0.66;
    boardW = boardH * aspect;
  }
  boardW = Math.round(boardW);
  boardH = Math.round(boardH);
  const boardX = Math.round((cw - boardW) / 2);
  const boardY = Math.round((ch - boardH) / 2);

  // 盤面サイズにスケールした画像
  const boardImg = document.createElement('canvas');
  boardImg.width = boardW;
  boardImg.height = boardH;
  boardImg.getContext('2d').drawImage(sourceImage, 0, 0, boardW, boardH);

  const cellW = boardW / cols;
  const cellH = boardH / rows;
  const tab = Math.min(cellW, cellH) * 0.22;
  const pad = Math.ceil(tab + 3);

  // 辺の凹凸をランダムに決める (隣同士で必ず噛み合う)
  const rnd = () => (Math.random() < 0.5 ? 1 : -1);
  const vEdge = []; // vEdge[r][c] = ピース(r,c) の右辺
  const hEdge = []; // hEdge[r][c] = ピース(r,c) の下辺
  for (let r = 0; r < rows; r++) {
    vEdge.push(Array.from({ length: cols - 1 }, rnd));
    hEdge.push(Array.from({ length: cols }, rnd));
  }

  // ピース生成
  const pieces = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const edges = [
        r === 0 ? 0 : -hEdge[r - 1][c],          // 上 (上のピースの下辺の逆)
        c === cols - 1 ? 0 : vEdge[r][c],        // 右
        r === rows - 1 ? 0 : hEdge[r][c],        // 下
        c === 0 ? 0 : -vEdge[r][c - 1],          // 左
      ];
      const w = Math.round(cellW);
      const h = Math.round(cellH);
      const path = buildPiecePath(cellW, cellH, edges, pad, tab);

      // ピース画像をオフスクリーンに切り出す
      const pc = document.createElement('canvas');
      pc.width = w + pad * 2;
      pc.height = h + pad * 2;
      const pctx = pc.getContext('2d', { willReadFrequently: true });
      pctx.save();
      pctx.clip(path);
      pctx.drawImage(
        boardImg,
        Math.round(c * cellW) - pad, Math.round(r * cellH) - pad, pc.width, pc.height,
        0, 0, pc.width, pc.height
      );
      // 立体感: 内側に薄い影と光
      pctx.lineWidth = 3;
      pctx.strokeStyle = 'rgba(0,0,0,0.28)';
      pctx.stroke(path);
      pctx.restore();
      pctx.lineWidth = 1.2;
      pctx.strokeStyle = 'rgba(255,255,255,0.35)';
      pctx.stroke(path);

      pieces.push({
        row: r,
        col: c,
        canvas: pc,
        pad,
        // 盤面上の正解位置 (セル左上・キャンバス座標)
        tx: boardX + c * cellW,
        ty: boardY + r * cellH,
        x: 0,
        y: 0,
        placed: false,
      });
    }
  }

  game = {
    dpr,
    cols,
    rows,
    cellW,
    cellH,
    boardX,
    boardY,
    boardW,
    boardH,
    boardImg,
    pieces,
    order: [...pieces], // 描画順 (末尾が最前面)
    dragging: null,
    dragDX: 0,
    dragDY: 0,
    placedCount: 0,
    moves: 0,
    hint: false,
    startTime: Date.now(),
    timerId: setInterval(updateStats, 1000),
    done: false,
    snapDist: Math.max(18 * dpr, Math.min(cellW, cellH) * 0.4),
  };

  peekImg.src = boardImg.toDataURL('image/jpeg', 0.9);
  hintBtn.classList.remove('active');
  scatterPieces();
  updateStats();
  draw();
}

// ピースを盤面の周囲にばらまく
function scatterPieces() {
  const g = game;
  const W = canvas.width;
  const H = canvas.height;
  for (const p of g.pieces) {
    if (p.placed) continue;
    const pw = p.canvas.width;
    const ph = p.canvas.height;
    // 盤面の外周4ゾーンのどこかへ
    for (let tries = 0; tries < 40; tries++) {
      const x = Math.random() * Math.max(1, W - pw);
      const y = Math.random() * Math.max(1, H - ph);
      const cx = x + pw / 2;
      const cy = y + ph / 2;
      const insideBoard =
        cx > g.boardX && cx < g.boardX + g.boardW &&
        cy > g.boardY && cy < g.boardY + g.boardH;
      p.x = x + p.pad; // p.x/p.y はセル左上基準なので pad ぶん補正
      p.y = y + p.pad;
      if (!insideBoard || tries === 39) break;
    }
  }
  // 描画順もシャッフル
  const loose = g.order.filter((p) => !p.placed);
  for (let i = loose.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [loose[i], loose[j]] = [loose[j], loose[i]];
  }
  g.order = [...g.order.filter((p) => p.placed), ...loose];
}

// ---------- 描画 ----------
function draw() {
  const g = game;
  if (!g) return;
  const W = canvas.width;
  const H = canvas.height;

  // 背景 (画面全体のテーマと揃えたダークトーン + 中央の淡いグロー)
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#141830');
  bg.addColorStop(1, '#0b0d17');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.6);
  glow.addColorStop(0, 'rgba(255,179,71,0.06)');
  glow.addColorStop(0.5, 'rgba(139,92,246,0.04)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // 盤面
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 7]);
  ctx.beginPath();
  ctx.roundRect(g.boardX - 6, g.boardY - 6, g.boardW + 12, g.boardH + 12, 10);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // ヒント (完成図をうっすら表示)
  if (g.hint && !g.done) {
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.drawImage(g.boardImg, g.boardX, g.boardY);
    ctx.restore();
  }

  if (g.done) {
    // 完成: つなぎ目のない元画像を表示
    ctx.drawImage(g.boardImg, g.boardX, g.boardY);
    return;
  }

  // ピース (placed → loose の順で order に並んでいる)
  for (const p of g.order) {
    ctx.drawImage(p.canvas, p.x - p.pad, p.y - p.pad);
  }

  // ドラッグ中のピースに影を付けて最前面に
  const d = g.dragging;
  if (d) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 18 * g.dpr;
    ctx.shadowOffsetY = 6 * g.dpr;
    ctx.drawImage(d.canvas, d.x - d.pad, d.y - d.pad);
    ctx.restore();
  }
}

// ---------- 入力 ----------
function canvasPos(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - rect.left) / rect.width) * canvas.width,
    y: ((e.clientY - rect.top) / rect.height) * canvas.height,
  };
}

function pieceAt(x, y) {
  const g = game;
  // 前面から順に、透明部分を除いて当たり判定
  for (let i = g.order.length - 1; i >= 0; i--) {
    const p = g.order[i];
    if (p.placed) continue;
    const lx = Math.floor(x - (p.x - p.pad));
    const ly = Math.floor(y - (p.y - p.pad));
    if (lx < 0 || ly < 0 || lx >= p.canvas.width || ly >= p.canvas.height) continue;
    const a = p.canvas.getContext('2d').getImageData(lx, ly, 1, 1).data[3];
    if (a > 20) return p;
  }
  return null;
}

canvas.addEventListener('pointerdown', (e) => {
  if (!game || game.done) return;
  const { x, y } = canvasPos(e);
  const p = pieceAt(x, y);
  if (!p) return;
  game.dragging = p;
  game.dragDX = x - p.x;
  game.dragDY = y - p.y;
  // 最前面へ
  game.order.splice(game.order.indexOf(p), 1);
  game.order.push(p);
  canvas.classList.add('dragging');
  canvas.setPointerCapture(e.pointerId);
  draw();
});

canvas.addEventListener('pointermove', (e) => {
  const g = game;
  if (!g || !g.dragging) return;
  const { x, y } = canvasPos(e);
  const p = g.dragging;
  const pw = p.canvas.width - p.pad;
  const ph = p.canvas.height - p.pad;
  p.x = Math.max(p.pad - pw * 0.5, Math.min(canvas.width - pw * 0.5, x - g.dragDX));
  p.y = Math.max(p.pad - ph * 0.5, Math.min(canvas.height - ph * 0.5, y - g.dragDY));
  draw();
});

function endDrag() {
  const g = game;
  if (!g || !g.dragging) return;
  const p = g.dragging;
  g.dragging = null;
  g.moves++;
  canvas.classList.remove('dragging');

  // 正解位置に近ければスナップ
  if (Math.hypot(p.x - p.tx, p.y - p.ty) < g.snapDist) {
    p.x = p.tx;
    p.y = p.ty;
    p.placed = true;
    g.placedCount++;
    // はまったピースは背面 (placed 群の末尾) へ
    g.order.splice(g.order.indexOf(p), 1);
    const lastPlaced = g.order.filter((q) => q.placed).length;
    g.order.splice(lastPlaced, 0, p);
    playSnapSound();
    updateStats();
    if (g.placedCount === g.pieces.length) {
      finishGame();
      return;
    }
  }
  draw();
}

canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

// ---------- 進行状況 ----------
function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function updateStats() {
  if (!game) return;
  statTime.textContent = `⏱ ${formatTime(Date.now() - game.startTime)}`;
  statPieces.textContent = `✅ ${game.placedCount} / ${game.pieces.length}`;
}

function finishGame() {
  const g = game;
  g.done = true;
  clearInterval(g.timerId);
  const time = formatTime(Date.now() - g.startTime);
  draw();
  playFanfare();
  spawnConfetti();
  clearStats.textContent =
    `タイム: ${time}\nピース数: ${g.pieces.length}  /  移動回数: ${g.moves}回`;
  setTimeout(() => {
    clearOverlay.hidden = false;
  }, 700);
}

function spawnConfetti() {
  const emoji = ['🎉', '✨', '🧩', '⭐', '🎊'];
  for (let i = 0; i < 40; i++) {
    const el = document.createElement('span');
    el.className = 'confetti';
    el.textContent = emoji[i % emoji.length];
    el.style.left = Math.random() * 100 + 'vw';
    el.style.animationDuration = 2.5 + Math.random() * 2.5 + 's';
    el.style.animationDelay = Math.random() * 1.2 + 's';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 6500);
  }
}

// ---------- 効果音 (WebAudio で生成) ----------
let audioCtx = null;

function beep(freq, dur, delay = 0, type = 'sine', gain = 0.12) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const t = audioCtx.currentTime + delay;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + dur);
  } catch (_) {
    /* 音が出せない環境では無視 */
  }
}

function playSnapSound() {
  beep(720, 0.09, 0, 'triangle', 0.15);
  beep(1080, 0.07, 0.04, 'triangle', 0.1);
}

function playFanfare() {
  [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.35, i * 0.13, 'triangle', 0.14));
}

// ---------- ツールバー ----------
hintBtn.addEventListener('click', () => {
  if (!game) return;
  game.hint = !game.hint;
  hintBtn.classList.toggle('active', game.hint);
  draw();
});

peekBtn.addEventListener('click', () => {
  peekModal.hidden = false;
});
peekModal.addEventListener('click', () => {
  peekModal.hidden = true;
});

shuffleBtn.addEventListener('click', () => {
  if (!game || game.done) return;
  scatterPieces();
  draw();
});

function backToSetup() {
  if (game) clearInterval(game.timerId);
  game = null;
  clearOverlay.hidden = true;
  gameScreen.hidden = true;
  setupScreen.hidden = false;
}

newBtn.addEventListener('click', backToSetup);
clearNewBtn.addEventListener('click', backToSetup);
clearAgainBtn.addEventListener('click', () => {
  clearOverlay.hidden = true;
  if (game) clearInterval(game.timerId);
  startGame();
});

// リサイズ時: ゲーム中はキャンバスの CSS スケーリングに任せる (座標変換で対応済み)

// ---------- PWA: Service Worker 登録 ----------
// (file:// で開いた場合は SW 非対応なのでスキップ)
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('Service Worker の登録に失敗:', err);
    });
  });
}

// デバッグ・テスト用フック
window.__puzzle = {
  get game() {
    return game;
  },
  setSourceImage,
  startGame,
};
