/*  ================================================================
    ARCHERY CHALLENGE — game.js
    ================================================================
    Screens : menu → game → results
    Rounds  : 3 rounds, each player shoots once per round
    Order   : P1 shot 1 → P2 shot 1 → P1 shot 2 → P2 shot 2 → …
    Scoring : Bullseye=10, rings=8/6/4/2/0  (max 30 over 3 shots)
    Wind    : 0.1–5.0 scale, random direction, new each round
    Timer   : 10 s to aim; auto-fires when timer reaches 0
    ================================================================ */

'use strict';

/* ------------------------------------------------------------------ */
/*  CONSTANTS                                                           */
/* ------------------------------------------------------------------ */
const TOTAL_SHOTS  = 3;
const AIM_TIME_SEC = 10;

// Rings: ordered innermost → outermost — each ring has a distinct colour
// rPct = fraction of targetR, score = points if arrow lands in this ring
const RINGS = [
  { rPct: 0.10, score: 10, color: '#f5e642', label: 'Bullseye' },  // gold
  { rPct: 0.22, score: 8,  color: '#e84040', label: 'Red'      },  // red
  { rPct: 0.38, score: 6,  color: '#1e90ff', label: 'Blue'     },  // blue
  { rPct: 0.54, score: 4,  color: '#111111', label: 'Black'    },  // black
  { rPct: 0.70, score: 2,  color: '#ffffff', label: 'White'    },  // white
  { rPct: 0.86, score: 0,  color: '#2ecc40', label: 'Green'    },  // green
  { rPct: 1.00, score: 0,  color: '#ff8c00', label: 'Orange'   },  // orange
];

// How many canvas-px one wind-unit deflects the arrow (horizontal AND vertical)
const WIND_PX_PER_UNIT = 18;

// Key-press aim sensitivity (px per press) — snappy
const AIM_STEP_H = 14;
const AIM_STEP_V = 12;

// AI gaussian spread (σ in px) per difficulty
const AI_SPREAD = { low: 75, medium: 38, high: 11 };

// Colour per player's stuck arrows
const PLAYER_ARROW_COLOR = ['#5bc8f5', '#f57f5b'];

/* ------------------------------------------------------------------ */
/*  STATE                                                               */
/* ------------------------------------------------------------------ */
let G = {
  mode:       'vs-ai',   // 'vs-ai' | 'vs-player'
  difficulty: 'medium',
  players: [
    { name: 'Player 1', score: 0, shots: [], isAI: false },
    { name: 'Player 2', score: 0, shots: [], isAI: false },
  ],
  currentPlayer: 0,
  wind: { speed: 1.0, dir: 1, dirY: 0 },

  phase: 'idle',   // 'aiming' | 'flying' | 'showing' | 'idle'
  aimX:  0,
  aimY:  0,

  timerLeft:   AIM_TIME_SEC,
  timerHandle: null,

  // Flying arrow state
  arrow: {
    active: false,
    x: 0, y: 0,
    startX: 0, startY: 0,
    endX: 0, endY: 0,
  },

  // render loop guard
  loopRunning: false,
};

/* ------------------------------------------------------------------ */
/*  DOM REFERENCES                                                      */
/* ------------------------------------------------------------------ */
const screenMenu    = document.getElementById('screen-menu');
const screenGame    = document.getElementById('screen-game');
const screenResults = document.getElementById('screen-results');

const canvas = document.getElementById('game-canvas');
const ctx    = canvas.getContext('2d');

const hudP1Name  = document.getElementById('hud-p1-name');
const hudP2Name  = document.getElementById('hud-p2-name');
const hudP1Score = document.getElementById('hud-p1-score');
const hudP2Score = document.getElementById('hud-p2-score');
const hudP1El    = document.getElementById('hud-p1');
const hudP2El    = document.getElementById('hud-p2');

const roundLabel = document.getElementById('round-label');
const turnLabel  = document.getElementById('turn-label');

const windBarFill = document.getElementById('wind-bar-fill');
const windValue   = document.getElementById('wind-value');
const windDirText = document.getElementById('wind-direction-text');

const timerCircle = document.getElementById('timer-circle');
const timerText   = document.getElementById('timer-text');
const aimControls = document.getElementById('aim-controls');

const shotResult    = document.getElementById('shot-result');
const shotScoreBig  = document.getElementById('shot-score-big');
const shotZoneLabel = document.getElementById('shot-zone-label');

/* ------------------------------------------------------------------ */
/*  CANVAS SIZING                                                       */
/* ------------------------------------------------------------------ */
function resizeCanvas() {
  const hud  = document.getElementById('hud');
  const hudH = hud ? hud.getBoundingClientRect().height : 0;
  canvas.width  = window.innerWidth;
  canvas.height = Math.max(window.innerHeight - hudH, 100);
  if (G.phase !== 'idle') renderFrame();
}
window.addEventListener('resize', resizeCanvas);

/* ------------------------------------------------------------------ */
/*  SCREEN MANAGEMENT                                                   */
/* ------------------------------------------------------------------ */
function showScreen(name) {
  [screenMenu, screenGame, screenResults].forEach(s => s.classList.remove('active'));
  if (name === 'menu')    screenMenu.classList.add('active');
  if (name === 'game')    screenGame.classList.add('active');
  if (name === 'results') screenResults.classList.add('active');
}

/* ------------------------------------------------------------------ */
/*  MENU INTERACTIONS                                                   */
/* ------------------------------------------------------------------ */
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    G.mode = btn.dataset.mode;

    const aiSection = document.getElementById('ai-difficulty-section');
    const p2Label   = document.querySelector('#p2-name-field label');
    if (G.mode === 'vs-ai') {
      aiSection.style.display = '';
      p2Label.textContent = 'Player 2 / AI Name';
    } else {
      aiSection.style.display = 'none';
      p2Label.textContent = 'Player 2 Name';
    }
  });
});

document.querySelectorAll('.diff-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    G.difficulty = btn.dataset.diff;
  });
});

document.getElementById('btn-start').addEventListener('click', startGame);
document.getElementById('btn-rematch').addEventListener('click', startGame);
document.getElementById('btn-menu').addEventListener('click', () => showScreen('menu'));

/* ------------------------------------------------------------------ */
/*  GAME START                                                          */
/* ------------------------------------------------------------------ */
function startGame() {
  // Abort any running timer
  clearInterval(G.timerHandle);
  G.timerHandle = null;

  const p1Name = document.getElementById('p1-name').value.trim() || 'Player 1';
  const p2Name = document.getElementById('p2-name').value.trim() || (G.mode === 'vs-ai' ? 'CPU' : 'Player 2');

  G.players = [
    { name: p1Name, score: 0, shots: [], isAI: false },
    { name: p2Name, score: 0, shots: [], isAI: G.mode === 'vs-ai' },
  ];
  G.currentPlayer = 0;
  G.phase         = 'idle';
  G.loopRunning   = false;
  G.arrow.active  = false;

  hudP1Name.textContent = p1Name;
  hudP2Name.textContent = p2Name;

  showScreen('game');

  // Give browser one frame to render the game screen so canvas gets its size
  requestAnimationFrame(() => {
    resizeCanvas();
    updateHUD();
    generateWind();
    startTurn();
  });
}

/* ------------------------------------------------------------------ */
/*  WIND                                                                */
/* ------------------------------------------------------------------ */
function generateWind() {
  G.wind.speed = parseFloat((Math.random() * 4.9 + 0.1).toFixed(1));
  G.wind.dir   = Math.random() < 0.5 ? 1 : -1;
  // Vertical wind component: independent random direction, scaled 0–1 relative to horizontal
  G.wind.dirY  = parseFloat(((Math.random() * 2 - 1)).toFixed(2)); // -1 (up) to +1 (down)
  updateWindDisplay();
}

function updateWindDisplay() {
  const { speed, dir, dirY } = G.wind;
  const pct = ((speed - 0.1) / 4.9) * 100;
  windBarFill.style.width = pct + '%';
  windValue.textContent   = speed.toFixed(1);

  // Build a compass arrow: combine horizontal and vertical into a Unicode arrow
  const horizChar = dir  === 1 ? '→' : '←';
  const vertChar  = dirY  > 0.3 ? '↓' : dirY < -0.3 ? '↑' : '';
  // Diagonal arrows
  let arrow = '';
  if      (dir ===  1 && dirY >  0.3) arrow = '↘';
  else if (dir ===  1 && dirY < -0.3) arrow = '↗';
  else if (dir === -1 && dirY >  0.3) arrow = '↙';
  else if (dir === -1 && dirY < -0.3) arrow = '↖';
  else if (dir ===  1)                arrow = '→';
  else if (dir === -1)                arrow = '←';
  else if (dirY > 0)                  arrow = '↓';
  else                                arrow = '↑';

  windDirText.textContent = arrow;
}

/* ------------------------------------------------------------------ */
/*  TURN MANAGEMENT                                                     */
/* ------------------------------------------------------------------ */
function startTurn() {
  const p       = G.players[G.currentPlayer];
  const shotNum = p.shots.length + 1;   // 1-indexed shot number this player is about to take

  roundLabel.textContent = `Round ${shotNum} / ${TOTAL_SHOTS}`;
  turnLabel.textContent  = `${p.name}'s turn`;

  hudP1El.classList.toggle('active', G.currentPlayer === 0);
  hudP2El.classList.toggle('active', G.currentPlayer === 1);

  // Slight random drift at aim start to keep things interesting
  G.aimX = (Math.random() - 0.5) * 12;
  G.aimY = (Math.random() - 0.5) * 12;
  G.phase = 'aiming';

  if (p.isAI) {
    startAITurn();
  } else {
    startHumanTurn();
  }
}

/* ------------------------------------------------------------------ */
/*  HUMAN TURN                                                          */
/* ------------------------------------------------------------------ */
function startHumanTurn() {
  aimControls.classList.remove('hidden');
  startAimTimer();
  startRenderLoop();
}

function startAimTimer() {
  clearInterval(G.timerHandle);
  G.timerLeft = AIM_TIME_SEC;
  updateTimerDisplay(G.timerLeft);

  G.timerHandle = setInterval(() => {
    G.timerLeft -= 1;
    updateTimerDisplay(G.timerLeft);
    if (G.timerLeft <= 0) {
      clearInterval(G.timerHandle);
      G.timerHandle = null;
      fireArrow();
    }
  }, 1000);
}

function updateTimerDisplay(t) {
  const circumference = 2 * Math.PI * 34; // ≈ 213.6
  const pct  = Math.max(t, 0) / AIM_TIME_SEC;
  const dash = circumference * (1 - pct);
  timerCircle.style.strokeDashoffset = dash;
  timerText.textContent = Math.max(t, 0);
  timerCircle.classList.toggle('danger', t <= 3);
}

/* ------------------------------------------------------------------ */
/*  AI TURN                                                             */
/* ------------------------------------------------------------------ */
function startAITurn() {
  aimControls.classList.add('hidden');

  const thinkEl = document.createElement('div');
  thinkEl.id = 'ai-thinking';
  thinkEl.textContent = `${G.players[G.currentPlayer].name} is aiming…`;
  screenGame.appendChild(thinkEl);

  const thinkMs = 1200 + Math.random() * 1000;

  setTimeout(() => {
    if (thinkEl.parentNode) thinkEl.remove();

    if (G.phase !== 'aiming') return; // guard: game may have been reset

    const spread     = AI_SPREAD[G.difficulty];
    const windCompX  = -(G.wind.dir  * G.wind.speed * WIND_PX_PER_UNIT);
    const windCompY  = -(G.wind.dirY * G.wind.speed * WIND_PX_PER_UNIT);
    const windFactor = { low: 0, medium: 0.6, high: 0.95 }[G.difficulty];

    // Approximate gaussian using sum of three uniforms (central limit theorem)
    const gaussX = (Math.random() + Math.random() + Math.random() - 1.5) * spread;
    const gaussY = (Math.random() + Math.random() + Math.random() - 1.5) * spread;

    G.aimX = windCompX * windFactor + gaussX;
    G.aimY = windCompY * windFactor + gaussY;

    fireArrow();
  }, thinkMs);

  startRenderLoop();
}

/* ------------------------------------------------------------------ */
/*  KEYBOARD AIMING                                                     */
/* ------------------------------------------------------------------ */
document.addEventListener('keydown', e => {
  if (G.phase !== 'aiming') return;
  if (G.players[G.currentPlayer].isAI) return;

  switch (e.key) {
    case 'ArrowLeft':  G.aimX -= AIM_STEP_H; e.preventDefault(); break;
    case 'ArrowRight': G.aimX += AIM_STEP_H; e.preventDefault(); break;
    case 'ArrowUp':    G.aimY -= AIM_STEP_V; e.preventDefault(); break;
    case 'ArrowDown':  G.aimY += AIM_STEP_V; e.preventDefault(); break;
    case ' ':
      e.preventDefault();
      clearInterval(G.timerHandle);
      G.timerHandle = null;
      fireArrow();
      break;
  }
});

/* ------------------------------------------------------------------ */
/*  FIRE ARROW                                                          */
/* ------------------------------------------------------------------ */
function fireArrow() {
  if (G.phase !== 'aiming') return;
  G.phase = 'flying';

  clearInterval(G.timerHandle);
  G.timerHandle = null;
  aimControls.classList.add('hidden');

  const { cx, cy, targetR } = getTargetGeometry();

  // Wind deflects arrow: horizontal (dirX) and vertical (dirY)
  const windDeflectX = G.wind.dir  * G.wind.speed * WIND_PX_PER_UNIT;
  const windDeflectY = G.wind.dirY * G.wind.speed * WIND_PX_PER_UNIT;

  const endX = cx + G.aimX + windDeflectX;
  const endY = cy + G.aimY + windDeflectY;

  // Arrow originates from the archer on the left
  const startX = 110;
  const startY = cy + G.aimY * 0.2 + (G.wind.dirY * G.wind.speed * WIND_PX_PER_UNIT) * 0.1;

  G.arrow = { active: true, x: startX, y: startY, startX, startY, endX, endY };

  animateArrow(startX, startY, endX, endY, cx, cy, targetR);
}

/* ------------------------------------------------------------------ */
/*  ARROW FLIGHT ANIMATION                                              */
/* ------------------------------------------------------------------ */
function animateArrow(startX, startY, endX, endY, cx, cy, targetR) {
  const DURATION  = 580; // ms
  const startTime = performance.now();

  function step(now) {
    const t    = Math.min((now - startTime) / DURATION, 1);
    const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // ease-in-out

    G.arrow.x = startX + (endX - startX) * ease;
    G.arrow.y = startY + (endY - startY) * ease;

    renderFrame();

    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      G.arrow.x      = endX;
      G.arrow.y      = endY;
      G.arrow.active = false;
      onArrowLanded(endX, endY, cx, cy, targetR);
    }
  }

  requestAnimationFrame(step);
}

/* ------------------------------------------------------------------ */
/*  SCORE CALCULATION                                                   */
/* ------------------------------------------------------------------ */
function onArrowLanded(x, y, cx, cy, targetR) {
  G.phase = 'showing';

  const dist    = Math.hypot(x - cx, y - cy);
  const distPct = dist / targetR;

  let score = 0;
  let zone  = 'Miss';

  for (const ring of RINGS) {
    if (distPct <= ring.rPct) {
      score = ring.score;
      zone  = ring.label;
      break;
    }
  }
  // Fully outside every ring → Miss
  if (distPct > RINGS[RINGS.length - 1].rPct) {
    score = 0;
    zone  = 'Miss';
  }

  const p = G.players[G.currentPlayer];
  p.shots.push({ score, zone, x, y, player: G.currentPlayer });
  p.score += score;

  updateHUD();
  renderFrame();         // draw the arrow stuck at impact point
  showShotResult(score, zone);

  setTimeout(() => {
    hideShotResult();
    advanceTurn();
  }, 2200);
}

/* ------------------------------------------------------------------ */
/*  SHOT RESULT POPUP                                                   */
/* ------------------------------------------------------------------ */
function showShotResult(score, zone) {
  shotScoreBig.textContent  = score > 0 ? `+${score}` : 'MISS';
  shotZoneLabel.textContent = zone;
  shotResult.classList.remove('hidden');
  void shotResult.offsetWidth; // force reflow so animation re-triggers
  shotResult.classList.add('show');
}

function hideShotResult() {
  shotResult.classList.remove('show');
  setTimeout(() => shotResult.classList.add('hidden'), 300);
}

/* ------------------------------------------------------------------ */
/*  ADVANCE TURN / ROUND LOGIC                                          */
/* ------------------------------------------------------------------ */
function advanceTurn() {
  // If game was somehow reset while we were waiting, do nothing
  if (G.phase === 'idle') return;

  const p1Shots = G.players[0].shots.length;
  const p2Shots = G.players[1].shots.length;

  if (p1Shots === TOTAL_SHOTS && p2Shots === TOTAL_SHOTS) {
    endGame();
    return;
  }

  // Decide who goes next
  // We always keep P1 and P2 interleaved: P1 → P2 → P1 → P2 …
  if (p1Shots > p2Shots) {
    // P1 has one more shot than P2 → P2's turn
    G.currentPlayer = 1;
  } else {
    // Equal shots (both just finished a round) or P2 just went
    if (p1Shots >= TOTAL_SHOTS) {
      // P1 is done, but we already checked both done above; shouldn't happen
      endGame();
      return;
    }
    G.currentPlayer = 0;
    // New round → new wind
    generateWind();
  }

  G.phase = 'aiming';
  startTurn();
}

/* ------------------------------------------------------------------ */
/*  HUD UPDATE                                                          */
/* ------------------------------------------------------------------ */
function updateHUD() {
  hudP1Score.textContent = G.players[0].score;
  hudP2Score.textContent = G.players[1].score;

  for (let pi = 0; pi < 2; pi++) {
    const used = G.players[pi].shots.length;
    for (let i = 0; i < TOTAL_SHOTS; i++) {
      const pip = document.getElementById(`p${pi + 1}-pip-${i}`);
      if (pip) pip.classList.toggle('used', i < used);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  END GAME                                                            */
/* ------------------------------------------------------------------ */
function endGame() {
  G.phase = 'idle';
  clearInterval(G.timerHandle);
  G.timerHandle  = null;
  G.loopRunning  = false;

  const s0 = G.players[0].score;
  const s1 = G.players[1].score;

  let headline, trophy;
  if (s0 > s1)      { headline = `${G.players[0].name} Wins!`; trophy = '🏆'; }
  else if (s1 > s0) { headline = `${G.players[1].name} Wins!`; trophy = '🏆'; }
  else              { headline = "It's a Draw!";                trophy = '🤝'; }

  document.getElementById('result-trophy').textContent   = trophy;
  document.getElementById('result-headline').textContent = headline;
  document.getElementById('res-p1-name').textContent     = G.players[0].name;
  document.getElementById('res-p2-name').textContent     = G.players[1].name;
  document.getElementById('res-p1-score').textContent    = s0;
  document.getElementById('res-p2-score').textContent    = s1;

  buildBreakdown();
  showScreen('results');
}

function buildBreakdown() {
  const grid = document.getElementById('breakdown-grid');
  grid.innerHTML = '';

  G.players.forEach((p, pi) => {
    const col = document.createElement('div');
    col.className = 'breakdown-player';

    const nameDiv = document.createElement('div');
    nameDiv.className = 'breakdown-player-name';
    nameDiv.textContent = p.name;
    col.appendChild(nameDiv);

    p.shots.forEach((s, i) => {
      const row = document.createElement('div');
      row.className = 'breakdown-shot';
      row.innerHTML = `
        <span class="shot-num">Shot ${i + 1}</span>
        <span class="shot-zone">${s.zone}</span>
        <span class="shot-pts">${s.score} pts</span>
      `;
      col.appendChild(row);
    });

    grid.appendChild(col);
  });
}

/* ================================================================== */
/*  RENDERING                                                           */
/* ================================================================== */

function getTargetGeometry() {
  const w = canvas.width;
  const h = canvas.height;
  const cx = w * 0.70;
  const cy = h * 0.48;
  const targetR = Math.min(w * 0.16, h * 0.30);  // smaller target
  return { cx, cy, targetR, w, h };
}

/* ------------------------------------------------------------------ */
/*  Render loop — runs only while phase === 'aiming'                    */
/* ------------------------------------------------------------------ */
function startRenderLoop() {
  if (G.loopRunning) return;
  G.loopRunning = true;

  function frame() {
    renderFrame();
    if (G.phase === 'aiming') {
      requestAnimationFrame(frame);
    } else {
      G.loopRunning = false;
    }
  }
  requestAnimationFrame(frame);
}

/* ------------------------------------------------------------------ */
/*  Master render                                                       */
/* ------------------------------------------------------------------ */
function renderFrame() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBackground();
  drawTarget();
  drawAllStuckArrows();
  if (G.phase === 'aiming') drawAimCrosshair();
  if (G.arrow.active)       drawFlyingArrow();
  else if (G.phase === 'showing') drawJustLandedArrow();
}

/* ------------------------------------------------------------------ */
/*  Background                                                          */
/* ------------------------------------------------------------------ */
function drawBackground() {
  const { w, h } = getTargetGeometry();

  // Sky
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.58);
  sky.addColorStop(0, '#091d38');
  sky.addColorStop(1, '#163a58');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // Distant hills silhouette
  ctx.fillStyle = '#0e2c48';
  ctx.beginPath();
  ctx.moveTo(0, h * 0.58);
  for (let x = 0; x <= w; x += 50) {
    const bump = Math.sin(x * 0.016 + 1.8) * h * 0.09 + Math.sin(x * 0.008 + 0.5) * h * 0.04;
    ctx.lineTo(x, h * 0.58 - Math.max(0, bump));
  }
  ctx.lineTo(w, h * 0.58);
  ctx.closePath();
  ctx.fill();

  // Ground
  const grd = ctx.createLinearGradient(0, h * 0.57, 0, h);
  grd.addColorStop(0, '#1b4022');
  grd.addColorStop(1, '#0c2210');
  ctx.fillStyle = grd;
  ctx.fillRect(0, h * 0.57, w, h * 0.43);

  // Grass edge
  ctx.fillStyle = '#2a6032';
  ctx.fillRect(0, h * 0.57, w, 5);

  // Target post / stand
  const { cx, cy, targetR } = getTargetGeometry();
  ctx.fillStyle = '#6b3c18';
  const postW = 14;
  ctx.fillRect(cx - postW / 2, cy + targetR * 0.92, postW, h - cy - targetR * 0.92);

  drawArcher(h);
}

/* ------------------------------------------------------------------ */
/*  Archer figure                                                       */
/* ------------------------------------------------------------------ */
function drawArcher(canvasH) {
  const ax = 78;
  const ay = canvasH * 0.57;

  // Legs
  ctx.fillStyle = '#1e1008';
  ctx.fillRect(ax - 9, ay - 34, 9,  34);
  ctx.fillRect(ax + 1, ay - 34, 9,  34);

  // Body
  ctx.fillStyle = '#3d2614';
  ctx.fillRect(ax - 7, ay - 82, 15, 50);

  // Head
  ctx.fillStyle = '#c8a472';
  ctx.beginPath();
  ctx.arc(ax + 1, ay - 92, 13, 0, Math.PI * 2);
  ctx.fill();

  // Bow arc
  ctx.strokeStyle = '#7a4e1e';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(ax + 8, ay - 62, 28, -Math.PI * 0.72, Math.PI * 0.72);
  ctx.stroke();

  // Bowstring
  const bx = ax + 8, by = ay - 62, br = 28;
  ctx.strokeStyle = '#ddd0a0';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(bx + br * Math.cos(-Math.PI * 0.72), by + br * Math.sin(-Math.PI * 0.72));
  ctx.lineTo(bx + br * Math.cos( Math.PI * 0.72), by + br * Math.sin( Math.PI * 0.72));
  ctx.stroke();

  // Nocked arrow (visual, not the flying one)
  ctx.strokeStyle = '#b0803a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(ax + 36, by);
  ctx.lineTo(ax + 8,  by);
  ctx.stroke();
}

/* ------------------------------------------------------------------ */
/*  Target                                                              */
/* ------------------------------------------------------------------ */
function drawTarget() {
  const { cx, cy, targetR } = getTargetGeometry();

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur  = 28;

  // Draw from outermost inward so inner rings paint over outer
  for (let i = RINGS.length - 1; i >= 0; i--) {
    ctx.beginPath();
    ctx.arc(cx, cy, targetR * RINGS[i].rPct, 0, Math.PI * 2);
    ctx.fillStyle = RINGS[i].color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth   = 1.2;
    ctx.stroke();
  }
  ctx.restore();

  // Score labels — place them in the midpoint of each band
  const fontSize = Math.max(10, targetR * 0.075);
  ctx.font         = `bold ${fontSize}px sans-serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';

  for (let i = 0; i < RINGS.length; i++) {
    const ring  = RINGS[i];
    const prevR = i === 0 ? 0 : RINGS[i - 1].rPct;
    const midR  = targetR * (ring.rPct + prevR) / 2;

    // Only draw labels for rings with score > 0 or bullseye
    if (ring.score === 0 && i > 0) continue;

    // Label colour: use white text on dark rings, dark text on light rings
    const darkRings = new Set(['#111111', '#1e90ff', '#e84040', '#2ecc40', '#ff8c00']);
    ctx.fillStyle = darkRings.has(ring.color) ? '#ffffff' : '#222222';
    ctx.fillText(ring.score, cx + midR * 0.55, cy);
  }
}

/* ------------------------------------------------------------------ */
/*  All stuck arrows (from all previous shots)                          */
/* ------------------------------------------------------------------ */
function drawAllStuckArrows() {
  // Collect all shots with their player index
  const shots = [];
  G.players[0].shots.forEach(s => shots.push({ ...s, pi: 0 }));
  G.players[1].shots.forEach(s => shots.push({ ...s, pi: 1 }));

  shots.forEach(s => {
    drawArrowAt(s.x, s.y, PLAYER_ARROW_COLOR[s.pi], false, 0);
  });
}

/* ------------------------------------------------------------------ */
/*  Arrow that just landed (before advancing turn)                      */
/* ------------------------------------------------------------------ */
function drawJustLandedArrow() {
  const shots = G.players[G.currentPlayer].shots;
  if (shots.length === 0) return;
  const last = shots[shots.length - 1];
  drawArrowAt(last.x, last.y, PLAYER_ARROW_COLOR[G.currentPlayer], true, 0);
}

/* ------------------------------------------------------------------ */
/*  Flying arrow                                                        */
/* ------------------------------------------------------------------ */
function drawFlyingArrow() {
  const { x, y, startX, startY, endX, endY } = G.arrow;
  const angle = Math.atan2(endY - startY, endX - startX);
  drawArrowAt(x, y, '#ffe566', false, angle);
}

/* ------------------------------------------------------------------ */
/*  Arrow primitive                                                     */
/*  x, y = tip position; color; glow; angle = direction in radians     */
/* ------------------------------------------------------------------ */
function drawArrowAt(x, y, color, glow, angle) {
  const shaftLen = 30;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  if (glow) {
    ctx.shadowColor = color;
    ctx.shadowBlur  = 14;
  }

  // Shaft
  ctx.strokeStyle = color;
  ctx.lineWidth   = 2.8;
  ctx.beginPath();
  ctx.moveTo(-shaftLen, 0);
  ctx.lineTo(0, 0);
  ctx.stroke();

  // Arrowhead (tip points right → angle 0)
  ctx.fillStyle = '#e8e8e8';
  ctx.beginPath();
  ctx.moveTo(4, 0);
  ctx.lineTo(-6, -3.5);
  ctx.lineTo(-6,  3.5);
  ctx.closePath();
  ctx.fill();

  // Fletchings
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-shaftLen, 0);
  ctx.lineTo(-shaftLen - 9, -6);
  ctx.lineTo(-shaftLen - 4,  0);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(-shaftLen, 0);
  ctx.lineTo(-shaftLen - 9,  6);
  ctx.lineTo(-shaftLen - 4,  0);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

/* ------------------------------------------------------------------ */
/*  Aim crosshair — shows player aim + wind-drift preview               */
/* ------------------------------------------------------------------ */
function drawAimCrosshair() {
  if (G.players[G.currentPlayer].isAI) return;

  const { cx, cy } = getTargetGeometry();

  const windDeflectX = G.wind.dir  * G.wind.speed * WIND_PX_PER_UNIT;
  const windDeflectY = G.wind.dirY * G.wind.speed * WIND_PX_PER_UNIT;
  const rawX  = cx + G.aimX;
  const rawY  = cy + G.aimY;
  const landX = rawX + windDeflectX;
  const landY = rawY + windDeflectY;

  // Dotted drift line from raw aim to predicted land
  ctx.save();
  ctx.strokeStyle = 'rgba(91,200,245,0.45)';
  ctx.lineWidth   = 1.5;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(rawX, rawY);
  ctx.lineTo(landX, landY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // White crosshair = where player is aiming (before wind)
  renderCrosshair(rawX,  rawY,  'rgba(255,255,255,0.9)', 20);
  // Cyan crosshair  = predicted impact after wind
  renderCrosshair(landX, landY, 'rgba(91,200,245,0.7)',  13);
}

function renderCrosshair(x, y, color, r) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth   = 1.8;
  ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, r * 0.5, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

/* ================================================================== */
/*  INIT — draw the target on first load so the page isn't blank        */
/* ================================================================== */
window.addEventListener('load', () => {
  resizeCanvas();
});
