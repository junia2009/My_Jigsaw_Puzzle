'use strict';

/* ============================================================
 * My Jigsaw Puzzle
 * 好きな写真からジグソーパズルを生成して遊べるゲーム
 * ============================================================ */

// アプリのバージョン
const APP_VERSION = '1.6.2';

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
let timeMode = 'sunset';     // 時間帯テーマ (day / sunset / night)
let soundOn = localStorage.getItem('jigsaw-sound') !== '0'; // 波の音

// ============================================================
// 時間帯テーマ: 実際の時刻に合わせて空が変わる
//   6-16時: 昼の海 / 16-19時: 夕暮れ (デフォルト) / 19-6時: 夜の海
//   ?time=day|sunset|night で強制指定も可能
// ============================================================

// ゲーム画面キャンバス用のパレット (ピースが見やすいよう控えめの明るさ)
const CANVAS_THEMES = {
  day: {
    sky: [[0, '#123a55'], [0.5, '#1c5878'], [1, '#2e7d99']],
    sea: [[0, '#1d5e77'], [0.35, '#123f56'], [1, '#0a2334']],
    glow: 'rgba(255,255,255,0.12)',
    refl: 'rgba(255,255,255,0.10)',
    starAlpha: 0,
  },
  sunset: {
    sky: [[0, '#150f2d'], [0.45, '#311c48'], [0.78, '#5c2a52'], [1, '#8f4255']],
    sea: [[0, '#6d3350'], [0.3, '#3a2150'], [1, '#150f26']],
    glow: 'rgba(255,170,110,0.2)',
    refl: 'rgba(255,190,120,0.14)',
    starAlpha: 1,
  },
  night: {
    sky: [[0, '#05060f'], [0.5, '#0e0f28'], [1, '#231744']],
    sea: [[0, '#191537'], [0.35, '#0e0c24'], [1, '#05060f']],
    glow: 'rgba(180,200,255,0.10)',
    refl: 'rgba(190,210,255,0.09)',
    starAlpha: 1.25,
  },
};

function applyTimeTheme() {
  const forced = new URLSearchParams(location.search).get('time');
  if (forced && CANVAS_THEMES[forced]) {
    timeMode = forced;
  } else {
    const h = new Date().getHours();
    timeMode = h >= 6 && h < 16 ? 'day' : h >= 16 && h < 19 ? 'sunset' : 'night';
  }
  document.body.classList.remove('time-day', 'time-sunset', 'time-night');
  document.body.classList.add('time-' + timeMode);
  const taglines = {
    day: 'まぶしい海辺で、大切な思い出をもういちど。',
    sunset: '夕暮れの海辺で、大切な思い出をもういちど。',
    night: '星降る夜の海辺で、大切な思い出をもういちど。',
  };
  const tagline = document.getElementById('tagline');
  if (tagline) tagline.textContent = taglines[timeMode];
}

// バージョン表記 (画面タイトルとタブタイトル)
const versionBadge = document.getElementById('version-badge');
if (versionBadge) versionBadge.textContent = 'v' + APP_VERSION;
document.title = `My Jigsaw Puzzle v${APP_VERSION} - 写真でジグソーパズル`;

applyTimeTheme();
// 遊んでいる間に時間帯が変わったら追従 (毎分チェック)
setInterval(() => {
  const before = timeMode;
  applyTimeTheme();
  if (before !== timeMode && game) draw();
}, 60000);

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
  dropzone.classList.add('has-image');
  // 選択後は表示を最小限に (サンプルボタンをしまう)
  sampleBtn.hidden = true;
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

  // 盤面サイズ: 画面の縦横それぞれの上限内で最大化する
  // (縦長画面ならピースは上下に、横長画面なら左右に散らばる)
  let boardW = Math.min(cw * 0.86, ch * 0.62 * aspect);
  let boardH = boardW / aspect;
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
    // 背景の星 (位置は開始時に固定)
    stars: Array.from({ length: 70 }, () => ({
      x: Math.random(),
      y: Math.random() * 0.42,
      r: 0.6 + Math.random() * 1.1,
      a: 0.25 + Math.random() * 0.55,
    })),
    effects: [], // スナップ時の光のエフェクト
  };

  peekImg.src = boardImg.toDataURL('image/jpeg', 0.9);
  hintBtn.classList.remove('active');
  scatterPieces();
  updateStats();
  draw();
  startWaveSound(); // スタート操作 (ユーザー操作) 起点なので自動再生制限に掛からない
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

  // 背景: 時間帯テーマに合わせた海 (ピースが見やすいよう控えめの明るさ)
  const theme = CANVAS_THEMES[timeMode] || CANVAS_THEMES.sunset;
  const hor = H * 0.62;
  const sky = ctx.createLinearGradient(0, 0, 0, hor);
  for (const [pos, col] of theme.sky) sky.addColorStop(pos, col);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, hor + 1);

  const sea = ctx.createLinearGradient(0, hor, 0, H);
  for (const [pos, col] of theme.sea) sea.addColorStop(pos, col);
  ctx.fillStyle = sea;
  ctx.fillRect(0, hor, W, H - hor);

  // 水平線に残る光
  const after = ctx.createRadialGradient(W / 2, hor, 0, W / 2, hor, W * 0.45);
  after.addColorStop(0, theme.glow);
  after.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = after;
  ctx.fillRect(0, 0, W, H);

  // 光の道 (左右にもやわらかくフェード)
  const rw = W * 0.09;
  const refl = ctx.createLinearGradient(W / 2 - rw, 0, W / 2 + rw, 0);
  refl.addColorStop(0, 'rgba(0,0,0,0)');
  refl.addColorStop(0.5, theme.refl);
  refl.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = refl;
  ctx.fillRect(W / 2 - rw, hor, rw * 2, H - hor);

  // 星 (昼は非表示)
  if (theme.starAlpha > 0) {
    for (const s of g.stars) {
      ctx.globalAlpha = Math.min(1, s.a * theme.starAlpha);
      ctx.fillStyle = '#ffeeda';
      ctx.beginPath();
      ctx.arc(s.x * W, s.y * H, s.r * g.dpr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // 周辺減光
  const vig = ctx.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.4, W / 2, H * 0.5, Math.max(W, H) * 0.75);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(8,4,18,0.5)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);

  // 盤面
  ctx.save();
  ctx.fillStyle = 'rgba(12,7,24,0.45)';
  ctx.strokeStyle = 'rgba(255,215,170,0.35)';
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
    drawEffects();
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

  drawEffects();
}

// ---------- スナップ時の光のエフェクト ----------
let fxRunning = false;

function spawnSnapEffect(x, y, base) {
  if (!game) return;
  game.effects.push({
    t0: performance.now(),
    dur: 700,
    x,
    y,
    base,
    parts: Array.from({ length: 14 }, () => ({
      ang: Math.random() * Math.PI * 2,
      sp: base * (0.5 + Math.random() * 0.9),
      r: 1.4 + Math.random() * 2.2,
    })),
  });
  ensureFxLoop();
}

function ensureFxLoop() {
  if (fxRunning) return;
  fxRunning = true;
  const tick = () => {
    if (!game || !game.effects.length) {
      fxRunning = false;
      if (game) draw();
      return;
    }
    draw();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function drawEffects() {
  const g = game;
  if (!g || !g.effects.length) return;
  const now = performance.now();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const e of g.effects) {
    const k = (now - e.t0) / e.dur;
    if (k >= 1) continue;
    const ease = 1 - Math.pow(1 - k, 3);
    const fade = 1 - k;

    // 中心のグロー
    const R = e.base * (0.35 + ease * 1.05);
    const glow = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, R);
    glow.addColorStop(0, `rgba(255,224,160,${0.55 * fade})`);
    glow.addColorStop(1, 'rgba(255,224,160,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(e.x, e.y, R, 0, Math.PI * 2);
    ctx.fill();

    // 広がる波紋リング
    ctx.strokeStyle = `rgba(255,242,205,${0.75 * fade})`;
    ctx.lineWidth = 2.2 * g.dpr * fade + 0.4;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.base * ease * 1.25, 0, Math.PI * 2);
    ctx.stroke();

    // 飛び散る火花
    for (const s of e.parts) {
      const d = s.sp * ease;
      ctx.fillStyle = `rgba(255,228,175,${0.9 * fade})`;
      ctx.beginPath();
      ctx.arc(e.x + Math.cos(s.ang) * d, e.y + Math.sin(s.ang) * d, s.r * g.dpr * (1 - k * 0.6), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
  g.effects = g.effects.filter((e) => now - e.t0 < e.dur);
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
    spawnSnapEffect(p.tx + g.cellW / 2, p.ty + g.cellH / 2, Math.min(g.cellW, g.cellH) * 1.15);
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
  spawnSnapEffect(g.boardX + g.boardW / 2, g.boardY + g.boardH / 2, Math.min(g.boardW, g.boardH) * 0.55);
  stopWaveSound();
  playFanfare();
  spawnConfetti();
  clearStats.textContent =
    `タイム: ${time}\nピース数: ${g.pieces.length}  /  移動回数: ${g.moves}回`;
  setTimeout(() => {
    clearOverlay.hidden = false;
  }, 700);
}

function spawnConfetti() {
  const emoji = ['🌺', '🐚', '⭐', '✨', '🧩', '🌴'];
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

// ---------- 波の音 (フィルタしたノイズを LFO でゆらす) ----------
let waveNodes = null;

function startWaveSound() {
  if (waveNodes || !soundOn) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const sr = audioCtx.sampleRate;

    // ブラウンノイズ (低めの成分が多い = 波っぽい)
    const buf = audioCtx.createBuffer(1, sr * 4, sr);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      data[i] = last * 3.5;
    }
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    src.loop = true;

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 520;
    filter.Q.value = 0.6;

    // 音量をゆっくり揺らして「寄せては返す」感じに
    const master = audioCtx.createGain();
    master.gain.value = 0.05;
    const addLfo = (freq, depth) => {
      const lfo = audioCtx.createOscillator();
      const lg = audioCtx.createGain();
      lfo.frequency.value = freq;
      lg.gain.value = depth;
      lfo.connect(lg).connect(master.gain);
      lfo.start();
      return lfo;
    };
    const lfo1 = addLfo(0.07, 0.035);
    const lfo2 = addLfo(0.121, 0.016);

    src.connect(filter).connect(master).connect(audioCtx.destination);
    src.start();
    waveNodes = { src, lfo1, lfo2, master };
  } catch (_) {
    /* 音が出せない環境では無視 */
  }
}

function stopWaveSound() {
  if (!waveNodes) return;
  const w = waveNodes;
  waveNodes = null;
  try {
    w.master.gain.setTargetAtTime(0.0001, audioCtx.currentTime, 0.25);
    setTimeout(() => {
      try {
        w.src.stop();
        w.lfo1.stop();
        w.lfo2.stop();
      } catch (_) { /* 既に停止済み */ }
    }, 900);
  } catch (_) { /* 破棄途中のエラーは無視 */ }
}

const soundBtn = $('sound-btn');
const soundIco = $('sound-ico');

function updateSoundBtn() {
  soundIco.textContent = soundOn ? '🔊' : '🔇';
  soundBtn.classList.toggle('active', soundOn);
}

updateSoundBtn();

soundBtn.addEventListener('click', () => {
  soundOn = !soundOn;
  localStorage.setItem('jigsaw-sound', soundOn ? '1' : '0');
  updateSoundBtn();
  if (game && !game.done && soundOn) startWaveSound();
  else stopWaveSound();
});

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
  stopWaveSound();
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
    // updateViaCache:'none' で sw.js 自体も HTTP キャッシュを使わず毎回確認する
    navigator.serviceWorker
      .register('./sw.js', { updateViaCache: 'none' })
      .then((reg) => reg.update().catch(() => {}))
      .catch((err) => {
        console.warn('Service Worker の登録に失敗:', err);
      });
  });
}

// デバッグ・テスト用フック
window.__puzzle = {
  get game() {
    return game;
  },
  get soundPlaying() {
    return !!waveNodes;
  },
  get timeMode() {
    return timeMode;
  },
  setSourceImage,
  startGame,
};
