const canvas = document.getElementById('gameCanvas');
if (!canvas) {
    throw new Error('Canvas not found');
}
const ctx = canvas.getContext('2d');
if (!ctx) {
    throw new Error('2D context unavailable');
}

// ================= SPRITES (simple models) =================
function loadSprite(src) {
    const img = new Image();
    const state = { img, ready: false };
    img.onload = () => { state.ready = true; };
    img.onerror = () => { state.ready = false; };
    img.src = src;
    return state;
}

const SPRITES = {
    player: loadSprite('./assets/player.svg'),
    bullet: loadSprite('./assets/bullet.svg'),
    floor: loadSprite('./assets/floor_tile.svg'),
    wall: loadSprite('./assets/wall_tile.svg'),
    enemy: {
            small: loadSprite('./assets/enemy_small.svg'),
            medium: loadSprite('./assets/enemy_medium.svg'),
            big: loadSprite('./assets/enemy_big.svg'),
            shooter: loadSprite('./assets/enemy_shooter.svg'),
            splitter: loadSprite('./assets/enemy_splitter.svg')
    }
};

let floorPattern = null;
let wallPattern = null;

// ================= OBSTACLES =================
// Walls (rectangles). Layout can change per wave.
let obstacles = [];

function mulberry32(seed) {
    return function () {
        let t = seed += 0x6D2B79F5;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function rectsOverlap(a, b, pad = 0) {
    return !(
        a.x + a.w + pad <= b.x ||
        b.x + b.w + pad <= a.x ||
        a.y + a.h + pad <= b.y ||
        b.y + b.h + pad <= a.y
    );
}

function aabbIntersects(ax1, ay1, ax2, ay2, bx1, by1, bx2, by2) {
    return ax1 < bx2 && ax2 > bx1 && ay1 < by2 && ay2 > by1;
}

function playerIntersectsObstacle(px, py, obstacle) {
    const half = player.size / 2;
    const ax1 = px - half;
    const ay1 = py - half;
    const ax2 = px + half;
    const ay2 = py + half;
    return aabbIntersects(ax1, ay1, ax2, ay2, obstacle.x, obstacle.y, obstacle.x + obstacle.w, obstacle.y + obstacle.h);
}

function pointIntersectsObstacle(x, y, pad, obstacle) {
    return x >= obstacle.x - pad && x <= obstacle.x + obstacle.w + pad && y >= obstacle.y - pad && y <= obstacle.y + obstacle.h + pad;
}

function circleRectIntersects(cx, cy, cr, rect) {
    const closestX = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
    const closestY = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
    const dx = cx - closestX;
    const dy = cy - closestY;
    return (dx * dx + dy * dy) < (cr * cr);
}

function enemyIntersectsAnyObstacle(enemy) {
    for (const o of obstacles) {
        if (circleRectIntersects(enemy.x, enemy.y, enemy.r, o)) return true;
    }
    return false;
}

function generateObstaclesForWave(waveNumber) {
    const rand = mulberry32(1337 + waveNumber * 101);
    const newObstacles = [];
    const baseCount = 7;
    // Every wave adds +2 obstacles
    const count = Math.min(27, baseCount + Math.max(0, waveNumber - 1) * 2);

    const minW = 90;
    const maxW = 190;
    const thickness = 26;

    // Keep clear of bottom HUD, and keep a safe area around the player spawn (center)
    const hudBlock = { x: 0, y: canvas.height - 90, w: canvas.width, h: 90 };
    const centerSafe = { x: canvas.width / 2 - 90, y: canvas.height / 2 - 90, w: 180, h: 180 };

    const maxTries = 600 + count * 220;
    for (let tries = 0; tries < maxTries && newObstacles.length < count; tries++) {
        const isVertical = rand() < 0.25;
        const w = isVertical ? thickness : Math.round(minW + rand() * (maxW - minW));
        const h = isVertical ? Math.round(110 + rand() * 170) : thickness;

        const x = Math.round(40 + rand() * (canvas.width - w - 80));
        const topPad = 50;
        const bottomPad = 110;
        const y = Math.round(topPad + rand() * (canvas.height - h - (topPad + bottomPad)));
        const candidate = { x, y, w, h };

        if (rectsOverlap(candidate, hudBlock, 8)) continue;
        if (rectsOverlap(candidate, centerSafe, 8)) continue;

        let overlaps = false;
        for (const o of newObstacles) {
            if (rectsOverlap(candidate, o, 20)) {
                overlaps = true;
                break;
            }
        }
        if (overlaps) continue;

        newObstacles.push(candidate);
    }

    // Fallback placement (should be rare, but becomes important at high waves)
    while (newObstacles.length < count) {
        const idx = newObstacles.length;
        const cols = Math.max(1, Math.floor((canvas.width - 120) / 180));

        let placed = null;
        for (let attempt = 0; attempt < 60; attempt++) {
            const col = (idx + attempt) % cols;
            const row = Math.floor((idx + attempt) / cols);

            const w = 140;
            const h = thickness;
            const x = Math.round(60 + col * 180);
            const y = Math.round(70 + row * 110);
            const clampedY = Math.max(50, Math.min(canvas.height - h - 120, y));
            const candidate = { x: Math.max(40, Math.min(canvas.width - w - 40, x)), y: clampedY, w, h };

            if (rectsOverlap(candidate, hudBlock, 8)) continue;
            if (rectsOverlap(candidate, centerSafe, 8)) continue;

            let overlaps = false;
            for (const o of newObstacles) {
                if (rectsOverlap(candidate, o, 14)) {
                    overlaps = true;
                    break;
                }
            }
            if (overlaps) continue;

            placed = candidate;
            break;
        }

        newObstacles.push(placed ?? { x: 60, y: 70 + (idx % 6) * 34, w: 140, h: thickness });
    }

    obstacles = newObstacles;

    // If player ended up inside a wall (rare), snap back to center
    for (const o of obstacles) {
        if (playerIntersectsObstacle(player.x, player.y, o)) {
            player.x = canvas.width / 2;
            player.y = canvas.height / 2;
            break;
        }
    }
}

// ================= PLAYER =================
const BASE_PLAYER_SPEED = 5;
let player = {
    x: canvas.width / 2,
    y: canvas.height / 2,
    size: 20,
    speed: BASE_PLAYER_SPEED,
    angle: 0
};

// ================= HEALTH / HIT =================
let hearts = 3;
const MAX_HEARTS = 5;
let maxHeartsCap = MAX_HEARTS;
const INVINCIBILITY_MS = 900;
const SPAWN_INVINCIBILITY_MS = 1000;
let invincibleUntil = 0;
let spawnInvincibleUntil = 0;
let shieldCharges = 0;

// Feedback
let hitFlashUntil = 0;
let shakeUntil = 0;
let shakeMag = 0;

function triggerShake(mag, durationMs, now) {
    shakeMag = Math.max(shakeMag, mag);
    shakeUntil = Math.max(shakeUntil, now + durationMs);
}

// Enemy death explosions (particles)
let explosionParts = [];
const EXPLOSION_LIFE_MS = 420;

function spawnExplosion(x, y, baseColor) {
    const c = (typeof baseColor === 'string' && baseColor) ? baseColor : 'orange';
    const n = 16;
    for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 2.2 + Math.random() * 4.8;
        const r = 1.5 + Math.random() * 2.8;
        explosionParts.push({
            x,
            y,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp,
            r,
            life: EXPLOSION_LIFE_MS,
            ttl: EXPLOSION_LIFE_MS,
            c,
            k: Math.random() < 0.5 ? 'hot' : 'base'
        });
    }

    // Keep bounded (avoid unbounded growth in long sessions)
    if (explosionParts.length > 700) explosionParts.splice(0, explosionParts.length - 700);
}

function updateExplosions(dtMs, frameScale) {
    if (explosionParts.length === 0) return;
    for (let i = explosionParts.length - 1; i >= 0; i--) {
        const p = explosionParts[i];
        p.life -= dtMs;
        if (p.life <= 0) {
            explosionParts.splice(i, 1);
            continue;
        }
        // simple drag
        p.vx *= 0.94;
        p.vy *= 0.94;
        p.x += p.vx * frameScale;
        p.y += p.vy * frameScale;
    }
}

function drawExplosions() {
    if (explosionParts.length === 0) return;
    ctx.save();
    for (const p of explosionParts) {
        const t = Math.max(0, Math.min(1, p.life / p.ttl));
        const a = 0.95 * t;
        const hot = p.k === 'hot';
        ctx.fillStyle = hot ? `rgba(255,220,120,${a})` : `rgba(255,255,255,${a * 0.25})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (hot ? 1.25 : 1.0), 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = hot ? `rgba(255,120,60,${a})` : `rgba(0,0,0,${a * 0.15})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

// ================= PROGRESSION (removed) =================

// ================= BULLETS =================
let bullets = [];
const BULLET_SPEED = 10;
const BULLET_SIZE = 5;

// Give "faster fire" meaning by applying a fire-rate limit
let nextShotAt = 0;
const BASE_FIRE_DELAY_MS = 220;
const FAST_FIRE_DELAY_MS = 110;

function getEffectiveFireDelayMs(now) {
    const base = now < fastFireUntil ? FAST_FIRE_DELAY_MS : BASE_FIRE_DELAY_MS;
    return Math.max(50, Math.round(base));
}

// ================= ENEMIES =================
let enemies = [];
const BASE_ENEMY_SPEED = 1.25;

let enemyBullets = [];
const ENEMY_BULLET_SPEED = 4.2;
const ENEMY_BULLET_SIZE = 4;

// Cap clutter: keep enemy bullets bounded for performance.
const MAX_ENEMY_BULLETS = 220;
function pushEnemyBullet(b) {
    enemyBullets.push(b);
    if (enemyBullets.length > MAX_ENEMY_BULLETS) {
        enemyBullets.splice(0, enemyBullets.length - MAX_ENEMY_BULLETS);
    }
}

const ENEMY_TYPES = {
    // Requested sizes/colors + tougher enemies
    small: { color: 'green', radius: 10, hp: 1, speedMul: 1.75, kind: 'chaser' }, // fast small
    medium: { color: 'blue', radius: 16, hp: 3, speedMul: 1.15, kind: 'chaser' },
    big: { color: 'red', radius: 24, hp: 5, speedMul: 0.75, kind: 'chaser' }, // tank big

    // Variety
    shooter: { color: 'purple', radius: 14, hp: 2, speedMul: 1.0, kind: 'shooter', shootDelayMs: 900 },
    strafer: { color: 'cyan', radius: 14, hp: 2, speedMul: 1.15, kind: 'strafer', shootDelayMs: 1150 },
    // New roles
    rusher: { color: 'lime', radius: 11, hp: 2, speedMul: 1.55, kind: 'rusher' },
    flanker: { color: 'deepskyblue', radius: 15, hp: 2, speedMul: 1.1, kind: 'flanker' },
    splitter: { color: 'orange', radius: 22, hp: 4, speedMul: 0.95, kind: 'splitter' }
};

function pickEnemyType(wave) {
    // Weights shift to harder enemies over time
    const r = Math.random();
    const shooterChance = Math.min(0.18, 0.02 + wave * 0.012);
    const straferChance = Math.min(0.16, 0.00 + Math.max(0, wave - 2) * 0.012);
    const splitterChance = Math.min(0.14, 0.00 + Math.max(0, wave - 4) * 0.015);
    const bigChance = Math.min(0.30, 0.08 + wave * 0.015);
    const mediumChance = Math.min(0.55, 0.25 + wave * 0.02);
    const smallChance = Math.max(0.12, 1 - (shooterChance + straferChance + splitterChance + bigChance + mediumChance));

    if (r < smallChance) return ENEMY_TYPES.small;
    if (r < smallChance + mediumChance) return ENEMY_TYPES.medium;
    if (r < smallChance + mediumChance + bigChance) return ENEMY_TYPES.big;
    if (r < smallChance + mediumChance + bigChance + shooterChance) return ENEMY_TYPES.shooter;
    if (r < smallChance + mediumChance + bigChance + shooterChance + straferChance) return ENEMY_TYPES.strafer;
    return ENEMY_TYPES.splitter;
}

function getEnemyTypeKeyFromType(type) {
    if (type === ENEMY_TYPES.small) return 'small';
    if (type === ENEMY_TYPES.medium) return 'medium';
    if (type === ENEMY_TYPES.big) return 'big';
    if (type === ENEMY_TYPES.shooter) return 'shooter';
    if (type === ENEMY_TYPES.strafer) return 'medium';
    if (type === ENEMY_TYPES.splitter) return 'splitter';
    return 'small';
}

let isGameOver = false;
let isGameWon = false;
const MAX_WAVE = 50;

// Start screen: game should not begin until Play is pressed.
let hasStarted = false;
let startPage = 'main'; // 'main' | 'mode'

// Mode screen options
let practiceStartWave = 1; // 1 (off) | 5 | 10
let selectedStartWave = 1;

let isPaused = false;
let pauseStartedAt = 0; // real time (performance.now)
let pausedTotalMs = 0;

function getGameNow(realNow = performance.now()) {
    // Freeze game timers while paused by removing paused duration from the clock.
    if (isPaused) return realNow - pausedTotalMs - (realNow - pauseStartedAt);
    return realNow - pausedTotalMs;
}

function setPaused(paused) {
    if (paused === isPaused) return;
    const realNow = performance.now();
    if (paused) {
        isPaused = true;
        pauseStartedAt = realNow;
        pausePage = 'menu';
        requestAnimationFrame(update);
        return;
    }

    isPaused = false;
    pausedTotalMs += (realNow - pauseStartedAt);
}

function togglePause() {
    setPaused(!isPaused);
}

// ================= UI RECTS =================
const menuButton = { x: 0, y: 0, w: 0, h: 0 };
const fullscreenButton = { x: 0, y: 0, w: 0, h: 0 };

const playButton = { x: 0, y: 0, w: 0, h: 0 };
const easyModeButton = { x: 0, y: 0, w: 0, h: 0 };
const difficultModeButton = { x: 0, y: 0, w: 0, h: 0 };
const practiceButton = { x: 0, y: 0, w: 0, h: 0 };
const restartButton = { x: 0, y: 0, w: 0, h: 0 };
const modeButton = { x: 0, y: 0, w: 0, h: 0 };

const resumeButton = { x: 0, y: 0, w: 0, h: 0 };
const pauseSettingsButton = { x: 0, y: 0, w: 0, h: 0 };
const pauseRestartButton = { x: 0, y: 0, w: 0, h: 0 };
const pauseBackButton = { x: 0, y: 0, w: 0, h: 0 };

const settingsSoundButton = { x: 0, y: 0, w: 300, h: 46 };
const settingsMusicButton = { x: 0, y: 0, w: 300, h: 46 };
const settingsMobileButton = { x: 0, y: 0, w: 300, h: 46 };
const settingsAimAssistButton = { x: 0, y: 0, w: 300, h: 46 };
const settingsResetRecordsButton = { x: 0, y: 0, w: 300, h: 46 };

let pausePage = 'menu'; // 'menu' | 'settings'
function layoutPauseUi() {
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const btnW = 260;
    const btnH = 46;
    const gap = 14;
    const x = cx - btnW / 2;

    if (pausePage === 'menu') {
        const y0 = Math.round(cy - (btnH * 1.5 + gap));
        resumeButton.x = x;
        resumeButton.y = y0;
        resumeButton.w = btnW;
        resumeButton.h = btnH;

        pauseSettingsButton.x = x;
        pauseSettingsButton.y = y0 + (btnH + gap);
        pauseSettingsButton.w = btnW;
        pauseSettingsButton.h = btnH;

        pauseRestartButton.x = x;
        pauseRestartButton.y = y0 + (btnH + gap) * 2;
        pauseRestartButton.w = btnW;
        pauseRestartButton.h = btnH;
        return;
    }

    if (pausePage === 'settings') {
        const y0 = cy - 50;
        settingsSoundButton.x = cx - 320 / 2;
        settingsSoundButton.y = y0;
        settingsSoundButton.w = 320;
        settingsSoundButton.h = btnH;

        settingsMusicButton.x = cx - 320 / 2;
        settingsMusicButton.y = y0 + (btnH + gap);
        settingsMusicButton.w = 320;
        settingsMusicButton.h = btnH;

        settingsMobileButton.x = cx - 320 / 2;
        settingsMobileButton.y = y0 + (btnH + gap) * 2;
        settingsMobileButton.w = 320;
        settingsMobileButton.h = btnH;

        settingsAimAssistButton.x = cx - 320 / 2;
        settingsAimAssistButton.y = y0 + (btnH + gap) * 3;
        settingsAimAssistButton.w = 320;
        settingsAimAssistButton.h = btnH;

        settingsResetRecordsButton.x = cx - 320 / 2;
        settingsResetRecordsButton.y = y0 + (btnH + gap) * 4;
        settingsResetRecordsButton.w = 320;
        settingsResetRecordsButton.h = btnH;

        pauseBackButton.x = cx - 220 / 2;
        pauseBackButton.y = y0 + (btnH + gap) * 5 + 8;
        pauseBackButton.w = 220;
        pauseBackButton.h = btnH;
    }
}

function drawUiButton(rect, label) {
    ctx.fillStyle = 'white';
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 2;
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);

    ctx.fillStyle = 'black';
    ctx.font = '20px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2);

    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
}

function handlePausedClick(p) {
    layoutPauseUi();

    if (pausePage === 'menu') {
        if (pointInRect(p.x, p.y, resumeButton)) {
            setPaused(false);
            return true;
        }
        if (pointInRect(p.x, p.y, pauseSettingsButton)) {
            pausePage = 'settings';
            return true;
        }
        if (pointInRect(p.x, p.y, pauseRestartButton)) {
            restartGame();
            return true;
        }
        return false;
    }

    if (pausePage === 'settings') {
        if (pointInRect(p.x, p.y, pauseBackButton)) {
            pausePage = 'menu';
            return true;
        }
        if (pointInRect(p.x, p.y, settingsSoundButton)) {
            soundEnabled = !soundEnabled;
            if (!soundEnabled) {
                stopMusic();
            } else {
                startMusic();
            }
            saveSettings();
            return true;
        }
        if (pointInRect(p.x, p.y, settingsMusicButton)) {
            musicEnabled = !musicEnabled;
            if (!musicEnabled) stopMusic();
            else startMusic();
            saveSettings();
            return true;
        }
        if (pointInRect(p.x, p.y, settingsMobileButton)) {
            mobileControlsEnabled = !mobileControlsEnabled;
            canvas.style.touchAction = mobileControlsEnabled ? 'none' : '';
            saveSettings();
            return true;
        }
        if (pointInRect(p.x, p.y, settingsAimAssistButton)) {
            aimAssistEnabled = !aimAssistEnabled;
            saveSettings();
            return true;
        }
        if (pointInRect(p.x, p.y, settingsResetRecordsButton)) {
            bestScore = 0;
            bestWave = 1;
            saveRecords();
            return true;
        }
        return false;
    }

    return false;
}

function layoutButtons() {
    // Menu button (top-left)
    menuButton.w = 46;
    menuButton.h = 34;
    menuButton.x = 12;
    menuButton.y = 10;

    // Fullscreen button (top-right)
    fullscreenButton.w = 46;
    fullscreenButton.h = 34;
    fullscreenButton.x = canvas.width - fullscreenButton.w - 12;
    fullscreenButton.y = 10;
}

function layoutStartUi() {
    playButton.w = 260;
    playButton.h = 56;
    playButton.x = canvas.width / 2 - playButton.w / 2;
    playButton.y = canvas.height / 2 - playButton.h / 2 + 20;
}

function layoutModeSelectUi() {
    const btnW = 260;
    const btnH = 56;
    const gap = 14;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2 + 20;

    easyModeButton.w = btnW;
    easyModeButton.h = btnH;
    easyModeButton.x = cx - btnW / 2;
    easyModeButton.y = cy - btnH - gap / 2;

    difficultModeButton.w = btnW;
    difficultModeButton.h = btnH;
    difficultModeButton.x = cx - btnW / 2;
    difficultModeButton.y = cy + gap / 2;

    practiceButton.w = btnW;
    practiceButton.h = 44;
    practiceButton.x = cx - btnW / 2;
    practiceButton.y = difficultModeButton.y + difficultModeButton.h + 14;
}

function layoutGameOverUi() {
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    restartButton.w = 220;
    restartButton.h = 46;
    restartButton.x = cx - restartButton.w / 2;
    restartButton.y = cy + 62;

    modeButton.w = 220;
    modeButton.h = 46;
    modeButton.x = cx - modeButton.w / 2;
    modeButton.y = restartButton.y + restartButton.h + 14;
}

function goToModeSelect() {
    resetRunState();
    hasStarted = false;
    startPage = 'mode';
}

function resetRunState() {
    isGameOver = false;
    isGameWon = false;
    setPaused(false);
    pausedTotalMs = 0;
    didPlayGameOver = false;
    lastFrameTime = null;

    bullets = [];
    enemies = [];
    enemyBullets = [];
    powerUps = [];

    hearts = 3;
    maxHeartsCap = MAX_HEARTS;
    shieldCharges = 0;
    invincibleUntil = 0;
    spawnInvincibleUntil = getGameNow(performance.now()) + SPAWN_INVINCIBILITY_MS;

    dashUntil = 0;
    dashCooldownUntil = 0;
    nextShotAt = 0;

    fastFireUntil = 0;
    pierceUntil = 0;
    speedUntil = 0;
    timedPowerOrder = [];

    score = 0;
    const startW = Math.max(1, Math.min(MAX_WAVE, selectedStartWave || 1));
    wave = startW;
    betweenWaveAccumulatorMs = 0;
    spawnAccumulatorMs = 0;
    enemiesSpawnedThisWave = 0;

    player.x = canvas.width / 2;
    player.y = canvas.height / 2;
    player.angle = 0;

    generateObstaclesForWave(wave);
    startWave();
}

function drawFullscreenIcon(x, y, w, h, isOn) {
    const pad = 9;
    const lx = x + pad;
    const rx = x + w - pad;
    const ty = y + pad;
    const by = y + h - pad;
    const s = 8;

    ctx.save();
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 2;

    // Four corner brackets
    ctx.beginPath();
    // top-left
    ctx.moveTo(lx, ty + s);
    ctx.lineTo(lx, ty);
    ctx.lineTo(lx + s, ty);
    // top-right
    ctx.moveTo(rx - s, ty);
    ctx.lineTo(rx, ty);
    ctx.lineTo(rx, ty + s);
    // bottom-right
    ctx.moveTo(rx, by - s);
    ctx.lineTo(rx, by);
    ctx.lineTo(rx - s, by);
    // bottom-left
    ctx.moveTo(lx + s, by);
    ctx.lineTo(lx, by);
    ctx.lineTo(lx, by - s);
    ctx.stroke();

    // When fullscreen is ON, draw an "X" hint for exit
    if (isOn) {
        const cx = x + w / 2;
        const cy = y + h / 2;
        const r = 6;
        ctx.beginPath();
        ctx.moveTo(cx - r, cy - r);
        ctx.lineTo(cx + r, cy + r);
        ctx.moveTo(cx + r, cy - r);
        ctx.lineTo(cx - r, cy + r);
        ctx.stroke();
    }

    ctx.restore();
}

function drawMenuIcon(x, y, w, h) {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const halfW = 10;
    const gap = 5;
    ctx.save();
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - halfW, cy - gap);
    ctx.lineTo(cx + halfW, cy - gap);
    ctx.moveTo(cx - halfW, cy);
    ctx.lineTo(cx + halfW, cy);
    ctx.moveTo(cx - halfW, cy + gap);
    ctx.lineTo(cx + halfW, cy + gap);
    ctx.stroke();
    ctx.restore();
}

function isFullscreen() {
    return document.fullscreenElement === canvas || document.webkitFullscreenElement === canvas;
}

function toggleFullscreen() {
    // Must be called from a user gesture (click)
    if (isFullscreen()) {
        if (document.exitFullscreen) return document.exitFullscreen();
        if (document.webkitExitFullscreen) return document.webkitExitFullscreen();
        return;
    }

    if (canvas.requestFullscreen) return canvas.requestFullscreen();
    if (canvas.webkitRequestFullscreen) return canvas.webkitRequestFullscreen();
}

document.addEventListener('fullscreenchange', () => {
    // Keep keyboard controls working
    canvas.focus?.();
});

function getMousePos(canvas, evt) {
    const rect = canvas.getBoundingClientRect();
    return {
        // Map from CSS pixels to canvas coordinates
        x: (evt.clientX - rect.left) * (canvas.width / rect.width),
        y: (evt.clientY - rect.top) * (canvas.height / rect.height)
    };
}

function getCanvasPosFromClient(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: (clientX - rect.left) * (canvas.width / rect.width),
        y: (clientY - rect.top) * (canvas.height / rect.height)
    };
}

function pointInRect(px, py, r) {
    return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

function restartGame() {
    if (!hasStarted) {
        // If you somehow hit restart from the start screen, show mode selection.
        startPage = 'mode';
        return;
    }
    resetRunState();
}

// ================= WAVES / DIFFICULTY =================
let wave = 1;
let enemiesToSpawnThisWave = 0;
let enemiesSpawnedThisWave = 0;
let spawnIntervalMs = 1000;
let spawnAccumulatorMs = 0;
let betweenWaveAccumulatorMs = 0;
const BETWEEN_WAVE_MS = 1400;

let waveSpawnQueue = [];
let killsThisWave = 0;
let powerDroppedThisWave = false;
let forcedDropThisWave = false;
let waveClearRewardDropped = false;
let bossSpawnedThisWave = false;
const BOSS_INCOMING_MS = 1100;
let bossIncomingUntil = 0;
let bossMinionSpawnAccumulatorMs = 0;
let bossAddsTotalThisWave = 0;
let bossAddsSpawnedThisWave = 0;

let phase2SoonUntil = 0;

function shuffleInPlace(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = arr[i];
        arr[i] = arr[j];
        arr[j] = t;
    }
}

const FEATURED_ENEMY_TYPES = ['rusher', 'flanker', 'shooter', 'strafer', 'splitter', 'big', 'medium', 'small'];
function getFeaturedEnemyTypeForWave(w) {
    const idx = Math.max(0, (w - 1) % FEATURED_ENEMY_TYPES.length);
    return FEATURED_ENEMY_TYPES[idx];
}

function buildWaveSpawnQueue(w) {
    const total = Math.max(1, 4 + w * 2);
    const shooterFrac = Math.min(0.22, 0.05 + w * 0.012);
    const straferFrac = Math.min(0.18, w >= 3 ? (0.04 + (w - 2) * 0.01) : 0);
    const rusherFrac = Math.min(0.22, w >= 2 ? (0.05 + (w - 1) * 0.012) : 0);
    const flankerFrac = Math.min(0.18, w >= 4 ? (0.04 + (w - 3) * 0.01) : 0);
    const splitterFrac = Math.min(0.14, w >= 5 ? (0.03 + (w - 4) * 0.01) : 0);
    const bigFrac = Math.min(0.26, 0.08 + w * 0.012);

    let shooterN = Math.floor(total * shooterFrac);
    let straferN = Math.floor(total * straferFrac);
    let rusherN = Math.floor(total * rusherFrac);
    let flankerN = Math.floor(total * flankerFrac);
    let splitterN = Math.floor(total * splitterFrac);
    let bigN = Math.floor(total * bigFrac);

    // Keep early waves friendly
    if (w <= 2) {
        shooterN = Math.min(shooterN, 1);
        straferN = 0;
        rusherN = Math.min(rusherN, 1);
        flankerN = 0;
        splitterN = 0;
        bigN = Math.min(bigN, 1);
    }

    const mediumBase = Math.floor(total * 0.30);
    let mediumN = Math.min(total, Math.max(0, mediumBase));

    // Fix rounding overflow
    let used = shooterN + straferN + rusherN + flankerN + splitterN + bigN + mediumN;
    while (used > total && mediumN > 0) { mediumN--; used--; }
    while (used > total && bigN > 0) { bigN--; used--; }
    while (used > total && shooterN > 0) { shooterN--; used--; }
    while (used > total && straferN > 0) { straferN--; used--; }
    while (used > total && rusherN > 0) { rusherN--; used--; }
    while (used > total && flankerN > 0) { flankerN--; used--; }
    while (used > total && splitterN > 0) { splitterN--; used--; }

    const smallN = Math.max(0, total - (shooterN + straferN + rusherN + flankerN + splitterN + bigN + mediumN));

    // Smarter waves: start with pressure enemies, then mix in specialists.
    const pressure = [];
    const specialists = [];
    for (let i = 0; i < smallN; i++) pressure.push('small');
    for (let i = 0; i < mediumN; i++) pressure.push('medium');
    for (let i = 0; i < rusherN; i++) pressure.push('rusher');

    for (let i = 0; i < bigN; i++) specialists.push('big');
    for (let i = 0; i < flankerN; i++) specialists.push('flanker');
    for (let i = 0; i < shooterN; i++) specialists.push('shooter');
    for (let i = 0; i < straferN; i++) specialists.push('strafer');
    for (let i = 0; i < splitterN; i++) specialists.push('splitter');

    shuffleInPlace(pressure);
    shuffleInPlace(specialists);
    const q = pressure.concat(specialists);

    // Variety: guarantee a different featured type each wave (at least once).
    const featured = getFeaturedEnemyTypeForWave(w);
    if (featured && !q.includes(featured)) {
        // Replace a small first (keeps total stable), else replace a random entry.
        const smallIdx = q.indexOf('small');
        const idx = smallIdx >= 0 ? smallIdx : Math.floor(Math.random() * q.length);
        q[idx] = featured;
    }

    return q;
}

const WAVE_COUNTDOWN_MS = 3000;
let waveCountdownUntil = 0;

function startWave() {
    generateObstaclesForWave(wave);
    waveSpawnQueue = buildWaveSpawnQueue(wave);
    enemiesToSpawnThisWave = waveSpawnQueue.length;
    enemiesSpawnedThisWave = 0;
    spawnIntervalMs = Math.max(220, 950 - wave * 55);
    spawnAccumulatorMs = 0;
    betweenWaveAccumulatorMs = 0;
    killsThisWave = 0;
    powerDroppedThisWave = false;
    forcedDropThisWave = false;
    waveClearRewardDropped = false;
    bossSpawnedThisWave = false;
    bossMinionSpawnAccumulatorMs = 0;
    bossAddsSpawnedThisWave = 0;
    bossAddsTotalThisWave = Math.min(50, 12 + wave * 2);
    phase2SoonUntil = 0;
    waveCountdownUntil = getGameNow() + WAVE_COUNTDOWN_MS;
    sfxWave();

    // Every 2 waves, spawn a heart power-up that restores +1 life
    if (!isGameOver && wave % 2 === 0) {
        spawnHeartPowerUp();
    }
}

// ================= SCORE =================
let score = 0;

let bestScore = 0;
let bestWave = 1;
const STORAGE_KEYS = {
    bestScore: 'canvasShooter_bestScore',
    bestWave: 'canvasShooter_bestWave'
};

function loadRecords() {
    try {
        const s = parseInt(localStorage.getItem(STORAGE_KEYS.bestScore) ?? '0', 10);
        const w = parseInt(localStorage.getItem(STORAGE_KEYS.bestWave) ?? '1', 10);
        bestScore = Number.isFinite(s) ? Math.max(0, s) : 0;
        bestWave = Number.isFinite(w) ? Math.max(1, w) : 1;
    } catch {
        bestScore = 0;
        bestWave = 1;
    }
}

function saveRecords() {
    try {
        localStorage.setItem(STORAGE_KEYS.bestScore, String(bestScore));
        localStorage.setItem(STORAGE_KEYS.bestWave, String(bestWave));
    } catch {}
}

function updateRecords() {
    let changed = false;
    if (score > bestScore) {
        bestScore = score;
        changed = true;
    }
    if (wave > bestWave) {
        bestWave = wave;
        changed = true;
    }
    if (changed) saveRecords();
}

// ================= SOUND (WebAudio) =================
let audioCtx = null;
let soundEnabled = true;
let musicEnabled = true;

let musicOsc = null;
let musicGain = null;
let musicTimer = 0;
let musicPhase = 0;

let mobileControlsEnabled = (('ontouchstart' in window) || (navigator.maxTouchPoints ?? 0) > 0);
let aimAssistEnabled = false;
let difficultyMode = 'easy'; // 'easy' | 'hard'
const SETTINGS_KEYS = {
    soundEnabled: 'canvasShooter_soundEnabled',
    musicEnabled: 'canvasShooter_musicEnabled',
    mobileControlsEnabled: 'canvasShooter_mobileControlsEnabled',
    aimAssistEnabled: 'canvasShooter_aimAssistEnabled',
    difficultyMode: 'canvasShooter_difficultyMode'
};

function loadSettings() {
    try {
        const s = localStorage.getItem(SETTINGS_KEYS.soundEnabled);
        const mu = localStorage.getItem(SETTINGS_KEYS.musicEnabled);
        const m = localStorage.getItem(SETTINGS_KEYS.mobileControlsEnabled);
        const aa = localStorage.getItem(SETTINGS_KEYS.aimAssistEnabled);
        const d = localStorage.getItem(SETTINGS_KEYS.difficultyMode);
        if (s !== null) soundEnabled = s === '1';
        if (mu !== null) musicEnabled = mu === '1';
        if (m !== null) mobileControlsEnabled = m === '1';
        if (aa !== null) aimAssistEnabled = aa === '1';
        if (d === 'easy' || d === 'hard') difficultyMode = d;
    } catch {}

    canvas.style.touchAction = mobileControlsEnabled ? 'none' : '';
}

function saveSettings() {
    try {
        localStorage.setItem(SETTINGS_KEYS.soundEnabled, soundEnabled ? '1' : '0');
        localStorage.setItem(SETTINGS_KEYS.musicEnabled, musicEnabled ? '1' : '0');
        localStorage.setItem(SETTINGS_KEYS.mobileControlsEnabled, mobileControlsEnabled ? '1' : '0');
        localStorage.setItem(SETTINGS_KEYS.aimAssistEnabled, aimAssistEnabled ? '1' : '0');
        localStorage.setItem(SETTINGS_KEYS.difficultyMode, difficultyMode);
    } catch {}
}

function stopMusic() {
    if (musicTimer) {
        clearTimeout(musicTimer);
        musicTimer = 0;
    }
    if (musicOsc) {
        try { musicOsc.stop(); } catch {}
        try { musicOsc.disconnect(); } catch {}
    }
    if (musicGain) {
        try { musicGain.disconnect(); } catch {}
    }
    musicOsc = null;
    musicGain = null;
}

function startMusic() {
    if (!musicEnabled) return;
    if (!soundEnabled) return;
    ensureAudio();
    if (!audioCtx) return;
    if (musicOsc) return;

    musicGain = audioCtx.createGain();
    musicGain.gain.value = 0.012;
    musicGain.connect(audioCtx.destination);

    musicOsc = audioCtx.createOscillator();
    musicOsc.type = 'sine';
    musicOsc.frequency.value = 220;
    musicOsc.connect(musicGain);
    musicOsc.start();

    musicPhase = 0;
    const tick = () => {
        if (!musicEnabled || !soundEnabled || !audioCtx || !musicOsc || !musicGain) return;
        // Simple 4-step chord-ish bass pattern
        const notes = [220, 246.94, 196, 261.63];
        const f = notes[musicPhase % notes.length];
        musicPhase++;

        const t0 = audioCtx.currentTime;
        musicOsc.frequency.cancelScheduledValues(t0);
        musicOsc.frequency.setValueAtTime(musicOsc.frequency.value, t0);
        musicOsc.frequency.linearRampToValueAtTime(f, t0 + 0.06);

        musicGain.gain.cancelScheduledValues(t0);
        const target = (isPaused || !hasStarted || isGameOver) ? 0.0 : 0.012;
        musicGain.gain.setValueAtTime(musicGain.gain.value, t0);
        musicGain.gain.linearRampToValueAtTime(target, t0 + 0.08);

        musicTimer = setTimeout(tick, 420);
    };

    tick();
}

function ensureAudio() {
    if (!soundEnabled) return;
    if (!audioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) {
            soundEnabled = false;
            return;
        }
        audioCtx = new Ctx();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
    }
}

function playTone(freq, durationMs, waveType, volume) {
    if (!soundEnabled || !audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = waveType;
    osc.frequency.value = freq;

    const t0 = audioCtx.currentTime;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(volume, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durationMs / 1000);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + durationMs / 1000 + 0.02);
}

function sfxShoot() {
    ensureAudio();
    playTone(720, 55, 'square', 0.04);
}

function sfxHit() {
    ensureAudio();
    playTone(260, 45, 'triangle', 0.035);
}

function sfxKill() {
    ensureAudio();
    playTone(140, 90, 'sawtooth', 0.05);
}

let didPlayGameOver = false;
function sfxGameOver() {
    if (didPlayGameOver) return;
    didPlayGameOver = true;
    ensureAudio();
    playTone(120, 220, 'sine', 0.06);
}

function sfxWave() {
    ensureAudio();
    playTone(520, 70, 'square', 0.03);
    if (audioCtx) {
        setTimeout(() => playTone(660, 70, 'square', 0.03), 80);
    }
}

function sfxPowerUp() {
    ensureAudio();
    playTone(880, 55, 'triangle', 0.035);
}

function sfxDash() {
    ensureAudio();
    playTone(360, 55, 'sawtooth', 0.03);
}

function sfxHurt() {
    ensureAudio();
    playTone(190, 90, 'sine', 0.05);
}

// ================= INPUT =================
let keys = {};
document.addEventListener('keydown', e => {
    if (e.key === 'Escape' || e.key === 'Tab') {
        e.preventDefault();
        if (hasStarted) togglePause();
        return;
    }

    keys[e.key.toLowerCase()] = true;

    if (e.code === 'Space') {
        e.preventDefault();
        tryDash(getGameNow());
    }
});
document.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

// ================= MOUSE AIM =================
let lastAimWasTouch = false;
canvas.addEventListener('mousemove', e => {
    const p = getMousePos(canvas, e);
    player.angle = Math.atan2(p.y - player.y, p.x - player.x);
    lastAimWasTouch = false;
});

// ================= SHOOT =================
function wrapAnglePi(a) {
    while (a <= -Math.PI) a += Math.PI * 2;
    while (a > Math.PI) a -= Math.PI * 2;
    return a;
}

function getAimAssistAngle(baseAngle) {
    if (!aimAssistEnabled) return baseAngle;
    if (!mobileControlsEnabled) return baseAngle;
    if (!lastAimWasTouch) return baseAngle;
    if (!enemies.length) return baseAngle;

    // Find nearest target and gently help within a small cone.
    let best = null;
    let bestD2 = Infinity;
    for (const e of enemies) {
        const dx = e.x - player.x;
        const dy = e.y - player.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) {
            bestD2 = d2;
            best = e;
        }
    }
    if (!best) return baseAngle;

    const maxRange = 520;
    if (bestD2 > maxRange * maxRange) return baseAngle;

    const targetAngle = Math.atan2(best.y - player.y, best.x - player.x);
    const diff = wrapAnglePi(targetAngle - baseAngle);
    const maxCone = 0.22; // ~12.6 degrees
    if (Math.abs(diff) > maxCone) return baseAngle;

    // Slight snap (not full lock-on)
    return baseAngle + diff * 0.65;
}

function spawnPlayerBullet(now) {
    if (now < nextShotAt) return false;
    const fireDelay = getEffectiveFireDelayMs(now);
    nextShotAt = now + fireDelay;

    sfxShoot();

    // Spawn from the rocket "nose" so it doesn't look like bullets come from the side/center.
    const a = getAimAssistAngle(player.angle);
    const muzzleDist = player.size * 0.95;
    const sx = player.x + Math.cos(a) * muzzleDist;
    const sy = player.y + Math.sin(a) * muzzleDist;
    bullets.push({
        x: sx,
        y: sy,
        dx: Math.cos(a) * BULLET_SPEED,
        dy: Math.sin(a) * BULLET_SPEED,
        pierce: now < pierceUntil ? 1 : 0
    });
    return true;
}

canvas.addEventListener('click', (e) => {
    const p = getMousePos(canvas, e);

    // Ensure button rects are correct even if a click happens before the next draw()
    layoutButtons();

    if (!hasStarted) {
        layoutStartUi();
        layoutModeSelectUi();

        if (pointInRect(p.x, p.y, fullscreenButton)) {
            toggleFullscreen();
            return;
        }

        if (startPage === 'main') {
            if (pointInRect(p.x, p.y, playButton)) {
                startPage = 'mode';
            }
            return;
        }

        if (pointInRect(p.x, p.y, easyModeButton)) {
            difficultyMode = 'easy';
            saveSettings();
            selectedStartWave = practiceStartWave;
            startPage = 'main';
            hasStarted = true;
            startMusic();
            resetRunState();
            return;
        }
        if (pointInRect(p.x, p.y, difficultModeButton)) {
            difficultyMode = 'hard';
            saveSettings();
            selectedStartWave = practiceStartWave;
            startPage = 'main';
            hasStarted = true;
            startMusic();
            resetRunState();
            return;
        }
        if (pointInRect(p.x, p.y, practiceButton)) {
            practiceStartWave = (practiceStartWave === 1) ? 5 : (practiceStartWave === 5 ? 10 : 1);
            return;
        }
        return;
    }

    if (isGameOver || isGameWon) {
        layoutGameOverUi();
        if (pointInRect(p.x, p.y, restartButton)) {
            restartGame();
        }
        if (pointInRect(p.x, p.y, modeButton)) {
            goToModeSelect();
        }
        return;
    }

    // Menu button (top-left) toggles pause
    if (pointInRect(p.x, p.y, menuButton)) {
        togglePause();
        return;
    }

    // Fullscreen button has priority over shooting
    if (pointInRect(p.x, p.y, fullscreenButton)) {
        toggleFullscreen();
        return;
    }

    if (isPaused) {
        if (handlePausedClick(p)) return;
        return;
    }

    const now = getGameNow();
    spawnPlayerBullet(now);
});

// ================= MOBILE (TOUCH) =================
const joystick = {
    active: false,
    id: null,
    ox: 0,
    oy: 0,
    x: 0,
    y: 0,
    dx: 0,
    dy: 0,
    radius: 44
};

const aimTouch = {
    active: false,
    id: null,
    x: 0,
    y: 0
};

function updateJoystick(pos) {
    joystick.x = pos.x;
    joystick.y = pos.y;
    const vx = pos.x - joystick.ox;
    const vy = pos.y - joystick.oy;
    const d = Math.hypot(vx, vy);
    const r = joystick.radius;
    const clamped = d > r ? r / d : 1;
    const cx = vx * clamped;
    const cy = vy * clamped;
    joystick.dx = cx / r;
    joystick.dy = cy / r;
    // keep knob position clamped
    joystick.x = joystick.ox + cx;
    joystick.y = joystick.oy + cy;
}

function updateAim(pos) {
    aimTouch.x = pos.x;
    aimTouch.y = pos.y;
    player.angle = Math.atan2(pos.y - player.y, pos.x - player.x);
    lastAimWasTouch = true;
}

function handlePointerLikeTap(pos) {
    // Use the same UI priority as mouse click
    layoutButtons();

    if (!hasStarted) {
        layoutStartUi();
        layoutModeSelectUi();
        if (pointInRect(pos.x, pos.y, fullscreenButton)) {
            toggleFullscreen();
            return true;
        }

        if (startPage === 'main') {
            if (pointInRect(pos.x, pos.y, playButton)) {
                startPage = 'mode';
                return true;
            }
            return true;
        }

        if (pointInRect(pos.x, pos.y, easyModeButton)) {
            difficultyMode = 'easy';
            saveSettings();
            selectedStartWave = practiceStartWave;
            startPage = 'main';
            hasStarted = true;
            startMusic();
            resetRunState();
            return true;
        }
        if (pointInRect(pos.x, pos.y, difficultModeButton)) {
            difficultyMode = 'hard';
            saveSettings();
            selectedStartWave = practiceStartWave;
            startPage = 'main';
            hasStarted = true;
            startMusic();
            resetRunState();
            return true;
        }

        if (pointInRect(pos.x, pos.y, practiceButton)) {
            practiceStartWave = (practiceStartWave === 1) ? 5 : (practiceStartWave === 5 ? 10 : 1);
            return true;
        }

        return true;
    }

    if (isGameOver || isGameWon) {
        layoutGameOverUi();
        if (pointInRect(pos.x, pos.y, restartButton)) restartGame();
        if (pointInRect(pos.x, pos.y, modeButton)) goToModeSelect();
        return true;
    }

    if (pointInRect(pos.x, pos.y, menuButton)) {
        togglePause();
        return true;
    }

    if (pointInRect(pos.x, pos.y, fullscreenButton)) {
        toggleFullscreen();
        return true;
    }

    if (isPaused) {
        return handlePausedClick(pos);
    }

    return false;
}

canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();

    const now = getGameNow();
    for (const t of Array.from(e.changedTouches)) {
        const pos = getCanvasPosFromClient(t.clientX, t.clientY);

        // UI taps should work even if mobile controls are turned off
        if (handlePointerLikeTap(pos)) continue;

        if (!mobileControlsEnabled) continue;

        const leftSide = pos.x < canvas.width * 0.45;
        if (leftSide && !joystick.active) {
            joystick.active = true;
            joystick.id = t.identifier;
            joystick.ox = pos.x;
            joystick.oy = pos.y;
            joystick.x = pos.x;
            joystick.y = pos.y;
            joystick.dx = 0;
            joystick.dy = 0;
            continue;
        }

        if (!aimTouch.active) {
            aimTouch.active = true;
            aimTouch.id = t.identifier;
            updateAim(pos);
            spawnPlayerBullet(now);
        }
    }
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
    if (!mobileControlsEnabled) return;
    e.preventDefault();

    for (const t of Array.from(e.changedTouches)) {
        const pos = getCanvasPosFromClient(t.clientX, t.clientY);
        if (joystick.active && t.identifier === joystick.id) {
            updateJoystick(pos);
        }
        if (aimTouch.active && t.identifier === aimTouch.id) {
            updateAim(pos);
        }
    }
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
    if (!mobileControlsEnabled) return;
    e.preventDefault();

    for (const t of Array.from(e.changedTouches)) {
        if (joystick.active && t.identifier === joystick.id) {
            joystick.active = false;
            joystick.id = null;
            joystick.dx = 0;
            joystick.dy = 0;
        }
        if (aimTouch.active && t.identifier === aimTouch.id) {
            aimTouch.active = false;
            aimTouch.id = null;
        }
    }
}, { passive: false });

canvas.addEventListener('touchcancel', (e) => {
    if (!mobileControlsEnabled) return;
    e.preventDefault();
    joystick.active = false;
    joystick.id = null;
    joystick.dx = 0;
    joystick.dy = 0;
    aimTouch.active = false;
    aimTouch.id = null;
}, { passive: false });

// ================= DASH =================
const DASH_DURATION_MS = 120;
const DASH_COOLDOWN_MS = 5000;
const DASH_SPEED = 18;
let dashUntil = 0;
let dashCooldownUntil = 0;
let dashVX = 0;
let dashVY = 0;

function tryDash(now) {
    if (isPaused) return;
    if (isGameOver) return;
    if (now < dashCooldownUntil) return;
    dashCooldownUntil = now + DASH_COOLDOWN_MS;
    dashUntil = now + DASH_DURATION_MS;

    // Dash direction: WASD input, else aim direction
    let dx = 0;
    let dy = 0;
    if (keys['w']) dy -= 1;
    if (keys['s']) dy += 1;
    if (keys['a']) dx -= 1;
    if (keys['d']) dx += 1;
    const len = Math.hypot(dx, dy);
    if (len > 0.0001) {
        dx /= len;
        dy /= len;
    } else {
        dx = Math.cos(player.angle);
        dy = Math.sin(player.angle);
    }

    dashVX = dx * DASH_SPEED;
    dashVY = dy * DASH_SPEED;
    sfxDash();
}

// ================= POWER UPS =================
let powerUps = [];
const POWERUP_RADIUS = 10;
const POWERUP_DROP_CHANCE = 0.25;
const POWERUP_DURATION_MS = 10000;
const POWERUP_LIFETIME_MS = 10000;

// Allow only 2 active timed power-ups at once; picking a third replaces the oldest.
const TIMED_POWER_TYPES = ['fastFire', 'pierce', 'speed'];
let timedPowerOrder = []; // oldest -> newest

function isTimedPowerActive(type, now) {
    if (type === 'fastFire') return now < fastFireUntil;
    if (type === 'pierce') return now < pierceUntil;
    if (type === 'speed') return now < speedUntil;
    return false;
}

function setTimedUntil(type, until) {
    if (type === 'fastFire') fastFireUntil = until;
    if (type === 'pierce') pierceUntil = until;
    if (type === 'speed') speedUntil = until;
}

function getTimedUntil(type) {
    if (type === 'fastFire') return fastFireUntil;
    if (type === 'pierce') return pierceUntil;
    if (type === 'speed') return speedUntil;
    return 0;
}

function cleanupTimedPowers(now) {
    for (const t of TIMED_POWER_TYPES) {
        if (getTimedUntil(t) > 0 && now >= getTimedUntil(t)) setTimedUntil(t, 0);
    }
    timedPowerOrder = timedPowerOrder.filter(t => isTimedPowerActive(t, now));
}

function activateTimedPower(type, now) {
    cleanupTimedPowers(now);
    const until = now + POWERUP_DURATION_MS;

    // Refresh if already active
    if (isTimedPowerActive(type, now)) {
        setTimedUntil(type, Math.max(getTimedUntil(type), until));
        // Treat refresh as newest
        timedPowerOrder = timedPowerOrder.filter(t => t !== type);
        timedPowerOrder.push(type);
        return;
    }

    if (timedPowerOrder.length >= 2) {
        const oldest = timedPowerOrder.shift();
        if (oldest) setTimedUntil(oldest, 0);
    }

    setTimedUntil(type, until);
    timedPowerOrder.push(type);
}

let fastFireUntil = 0;
let pierceUntil = 0;
let speedUntil = 0;

const POWERUP_TYPES = {
    fastFire: { label: 'F', color: 'orange' },
    pierce: { label: 'P', color: 'white' },
    speed: { label: 'S', color: 'cyan' },
    shield: { label: 'SH', color: 'yellow' },
    heart: { label: '♥', color: 'pink' }
};

function maybeDropPowerUp(x, y) {
    if (Math.random() > POWERUP_DROP_CHANCE) return;
    // Heart spawns are wave-based, not random drops
    const keys = ['fastFire', 'pierce', 'speed', 'shield'];
    const type = keys[Math.floor(Math.random() * keys.length)];
    const expiresAt = getGameNow() + POWERUP_LIFETIME_MS;
    powerUps.push({ x, y, type, expiresAt });

    if (powerUps.length > 60) powerUps.splice(0, powerUps.length - 60);
}

function forceDropPowerUp(x, y) {
    // Heart spawns are wave-based, not forced drops
    const keys = ['fastFire', 'pierce', 'speed', 'shield'];
    const type = keys[Math.floor(Math.random() * keys.length)];
    const expiresAt = getGameNow() + POWERUP_LIFETIME_MS;
    powerUps.push({ x, y, type, expiresAt });
    if (powerUps.length > 60) powerUps.splice(0, powerUps.length - 60);
}

function clampEnemyToArena(enemy) {
    const r = enemy.r;
    enemy.x = Math.max(r, Math.min(canvas.width - r, enemy.x));
    enemy.y = Math.max(r, Math.min(canvas.height - r, enemy.y));
}

function resolveCircleRect(cx, cy, cr, rect) {
    const closestX = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
    const closestY = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
    let dx = cx - closestX;
    let dy = cy - closestY;
    const d2 = dx * dx + dy * dy;

    // Not intersecting
    if (d2 >= cr * cr) return null;

    // Center is inside rectangle or exactly on edge; push toward nearest edge
    if (d2 < 0.000001) {
        const left = cx - rect.x;
        const right = (rect.x + rect.w) - cx;
        const top = cy - rect.y;
        const bottom = (rect.y + rect.h) - cy;
        const m = Math.min(left, right, top, bottom);
        if (m === left) { dx = -1; dy = 0; }
        else if (m === right) { dx = 1; dy = 0; }
        else if (m === top) { dx = 0; dy = -1; }
        else { dx = 0; dy = 1; }
        return { x: dx * (cr + 0.6), y: dy * (cr + 0.6) };
    }

    const d = Math.sqrt(d2);
    const push = (cr - d) + 0.6;
    return { x: (dx / d) * push, y: (dy / d) * push };
}

function resolveEnemyObstacles(enemy) {
    // A couple passes helps with stacked overlaps.
    for (let pass = 0; pass < 2; pass++) {
        let pushed = false;
        for (const o of obstacles) {
            const v = resolveCircleRect(enemy.x, enemy.y, enemy.r, o);
            if (!v) continue;
            enemy.x += v.x;
            enemy.y += v.y;
            pushed = true;
        }
        if (!pushed) break;
    }
}

function moveEnemy(enemy, vx, vy, dtMs, frameScale) {
    const oldX = enemy.x;
    const oldY = enemy.y;

    // Attempt move X then Y (sliding)
    let hit = false;
    enemy.x = oldX + vx;
    if (enemyIntersectsAnyObstacle(enemy)) {
        enemy.x = oldX;
        hit = true;
    }
    enemy.y = oldY + vy;
    if (enemyIntersectsAnyObstacle(enemy)) {
        enemy.y = oldY;
        hit = true;
    }

    // If we hit something, bias the next avoidance nudge sideways.
    if (hit) {
        const a = Math.atan2(vy, vx);
        const dir = (enemy.orbitDir ?? 1);
        enemy.avoidAngle = a + dir * (Math.PI / 2) + (Math.random() - 0.5) * 0.35;
    }

    clampEnemyToArena(enemy);
    resolveEnemyObstacles(enemy);

    // Extra escape if still embedded (rare but causes "stuck on wall" cases).
    if (enemyIntersectsAnyObstacle(enemy)) {
        const base = enemy.avoidAngle ?? (Math.random() * Math.PI * 2);
        const step = Math.max(2.5, enemy.r * 0.7);
        for (let k = 0; k < 10; k++) {
            const ang = base + (k * 0.6);
            const nx = Math.cos(ang) * step;
            const ny = Math.sin(ang) * step;
            enemy.x += nx;
            enemy.y += ny;
            clampEnemyToArena(enemy);
            resolveEnemyObstacles(enemy);
            if (!enemyIntersectsAnyObstacle(enemy)) break;
            enemy.x -= nx;
            enemy.y -= ny;
        }
    }

    // Anti-stuck: if barely moving for a while, nudge sideways.
    const moved = Math.hypot(enemy.x - oldX, enemy.y - oldY);
    if (!Number.isFinite(enemy.stuckMs)) enemy.stuckMs = 0;
    if (moved < 0.15 * Math.max(0.5, frameScale)) enemy.stuckMs += dtMs;
    else enemy.stuckMs = 0;

    if (enemy.stuckMs >= 420) {
        enemy.stuckMs = 0;
        const ang = (enemy.avoidAngle ?? (Math.random() * Math.PI * 2)) + (Math.random() - 0.5) * 1.2;
        enemy.avoidAngle = ang;
        const nudge = 1.2 * enemy.speed;
        const nx = Math.cos(ang) * nudge;
        const ny = Math.sin(ang) * nudge;
        enemy.x += nx;
        if (enemyIntersectsAnyObstacle(enemy)) enemy.x -= nx;
        enemy.y += ny;
        if (enemyIntersectsAnyObstacle(enemy)) enemy.y -= ny;
        clampEnemyToArena(enemy);
        resolveEnemyObstacles(enemy);
    }
}

function findSafeDropPointNear(x0, y0, maxDist, tries) {
    const pad = 26;
    for (let i = 0; i < tries; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.random() * maxDist;
        const x = Math.max(pad, Math.min(canvas.width - pad, x0 + Math.cos(a) * d));
        const y = Math.max(pad, Math.min(canvas.height - pad, y0 + Math.sin(a) * d));

        // Avoid bottom HUD bar
        if (y >= canvas.height - 90) continue;

        let blocked = false;
        for (const o of obstacles) {
            if (pointIntersectsObstacle(x, y, POWERUP_RADIUS + 2, o)) {
                blocked = true;
                break;
            }
        }
        if (!blocked) return { x, y };
    }
    return { x: Math.max(POWERUP_RADIUS + 2, Math.min(canvas.width - POWERUP_RADIUS - 2, x0)), y: Math.max(POWERUP_RADIUS + 2, Math.min(canvas.height - 100, y0)) };
}

function spawnHeartPowerUp() {
    const now = getGameNow();
    const pad = 30;
    for (let tries = 0; tries < 40; tries++) {
        const x = pad + Math.random() * (canvas.width - pad * 2);
        const y = pad + Math.random() * (canvas.height - pad * 2);

        // Avoid spawning inside walls or under the HUD box
        let blocked = false;
        for (const o of obstacles) {
            if (pointIntersectsObstacle(x, y, POWERUP_RADIUS + 2, o)) {
                blocked = true;
                break;
            }
        }
        // Avoid spawning under the bottom HUD bar
        if (!blocked && y < canvas.height - 90) {
            powerUps.push({ x, y, type: 'heart', expiresAt: now + POWERUP_LIFETIME_MS });
            return;
        }
    }

    // Fallback
    powerUps.push({ x: canvas.width / 2, y: canvas.height / 2, type: 'heart', expiresAt: now + POWERUP_LIFETIME_MS });
}

function applyPowerUp(type, now) {
    if (type === 'fastFire' || type === 'pierce' || type === 'speed') {
        activateTimedPower(type, now);
    }
    if (type === 'shield') shieldCharges = Math.min(2, shieldCharges + 1);
    if (type === 'heart') hearts = Math.min(maxHeartsCap, hearts + 1);
    sfxPowerUp();
}

function takeHit(now) {
    if (now < invincibleUntil || now < spawnInvincibleUntil) return;
    invincibleUntil = now + INVINCIBILITY_MS;

    hitFlashUntil = now + 130;
    triggerShake(7, 130, now);

    if (shieldCharges > 0) {
        shieldCharges--;
        sfxHurt();
        return;
    }

    hearts--;
    sfxHurt();
    if (hearts <= 0) {
        isGameOver = true;
        updateRecords();
    }
}

// ================= ENEMY SPAWN =================
function spawnBossForWave(w) {
    const now = getGameNow();
    const side = Math.floor(Math.random() * 4);

    const baseR = 30;
    const r = Math.round(baseR + Math.min(8, Math.floor(w * 0.6)));
    let x = 0;
    let y = 0;
    if (side === 0) { x = -r; y = Math.random() * canvas.height; }
    if (side === 1) { x = canvas.width + r; y = Math.random() * canvas.height; }
    if (side === 2) { x = Math.random() * canvas.width; y = -r; }
    if (side === 3) { x = Math.random() * canvas.width; y = canvas.height + r; }

    const hp = Math.round(7 + w * 3.2);
    const shootDelayMs = Math.max(520, 980 - w * 14);

    enemies.push({
        x,
        y,
        r,
        color: 'white',
        typeKey: 'big',
        hp,
        maxHp: hp,
        speed: BASE_ENEMY_SPEED * 0.95 * (1 + w * 0.03),
        kind: 'boss',
        shootDelayMs,
        nextShotAt: now + 650,
        orbitDir: Math.random() < 0.5 ? -1 : 1,
        stuckMs: 0,
        avoidAngle: Math.random() * Math.PI * 2,
        dashPending: false,
        dashWindupUntil: 0,
        dashUntil: 0,
        dashCooldownUntil: now + 1200,
        dashAngle: 0,
        dashVX: 0,
        dashVY: 0,
        phase2: false,
        phase2SoonShown: false
    });
}

function spawnEnemy(typeKeyOverride) {
    let x, y;
    const side = Math.floor(Math.random() * 4);

    const typeKey = typeKeyOverride ?? waveSpawnQueue.shift();
    const type = (typeKey && ENEMY_TYPES[typeKey]) ? ENEMY_TYPES[typeKey] : pickEnemyType(wave);
    const r = type.radius;
    const spriteKey = (typeKey === 'strafer' || typeKey === 'flanker') ? 'medium' : (typeKey === 'rusher' ? 'small' : (typeKey || getEnemyTypeKeyFromType(type)));

    if (side === 0) { x = -r; y = Math.random() * canvas.height; }
    if (side === 1) { x = canvas.width + r; y = Math.random() * canvas.height; }
    if (side === 2) { x = Math.random() * canvas.width; y = -r; }
    if (side === 3) { x = Math.random() * canvas.width; y = canvas.height + r; }

    enemies.push({
        x,
        y,
        r,
        color: type.color,
        typeKey: spriteKey,
        hp: type.hp,
        maxHp: type.hp,
        speed: BASE_ENEMY_SPEED * type.speedMul * (1 + wave * 0.04),
        kind: type.kind ?? 'chaser',
        shootDelayMs: type.shootDelayMs ?? 0,
        nextShotAt: getGameNow() + 350 + Math.random() * 650,
        orbitDir: Math.random() < 0.5 ? -1 : 1,
        stuckMs: 0,
        avoidAngle: Math.random() * Math.PI * 2,
        burstUntil: 0,
        burstCooldownUntil: 0,
        flankDir: Math.random() < 0.5 ? -1 : 1
    });
}

// ================= GAME LOOP =================
let lastFrameTime = null;
function update(now) {
    if (lastFrameTime === null) lastFrameTime = now;
    const dtMs = Math.min(50, now - lastFrameTime);
    lastFrameTime = now;

    // Normalize movement to a 60fps baseline so high-refresh/fullscreen doesn't speed up gameplay.
    const frameScale = dtMs / (1000 / 60);

    const gameNow = getGameNow(now);

    if (!hasStarted) {
        draw(gameNow);
        requestAnimationFrame(update);
        return;
    }

    if (!isGameOver && isPaused) {
        draw(gameNow);
        requestAnimationFrame(update);
        return;
    }

    now = gameNow;

    // Keep power-up state tidy
    cleanupTimedPowers(now);

    // Explosions
    updateExplosions(dtMs, frameScale);

    // Despawn dropped power-ups after 10s
    for (let i = powerUps.length - 1; i >= 0; i--) {
        const exp = powerUps[i].expiresAt;
        if (typeof exp === 'number' && now >= exp) {
            powerUps.splice(i, 1);
        }
    }

    if (isGameOver || isGameWon) {
        if (isGameOver) sfxGameOver();
        updateRecords();
        draw(now);
        requestAnimationFrame(update);
        return;
    }

    // Expire timers are just compared against `now`
    // Player movement (with obstacle collisions)
    const speedMul = now < speedUntil ? 1.45 : 1.0;
    const curSpeed = player.speed * speedMul * frameScale;
    let moveX = 0;
    let moveY = 0;
    if (keys['a']) moveX -= curSpeed;
    if (keys['d']) moveX += curSpeed;
    if (keys['w']) moveY -= curSpeed;
    if (keys['s']) moveY += curSpeed;

    if (mobileControlsEnabled && joystick.active) {
        moveX += joystick.dx * curSpeed;
        moveY += joystick.dy * curSpeed;
    }

    if (now < dashUntil) {
        moveX += dashVX * frameScale;
        moveY += dashVY * frameScale;
    }

    // Resolve X axis
    if (moveX !== 0) {
        player.x += moveX;
        const half = player.size / 2;
        player.x = Math.max(half, Math.min(canvas.width - half, player.x));
        for (const o of obstacles) {
            if (playerIntersectsObstacle(player.x, player.y, o)) {
                if (moveX > 0) player.x = o.x - half;
                else player.x = o.x + o.w + half;
            }
        }
    }

    // Resolve Y axis
    if (moveY !== 0) {
        player.y += moveY;
        const half = player.size / 2;
        player.y = Math.max(half, Math.min(canvas.height - half, player.y));
        for (const o of obstacles) {
            if (playerIntersectsObstacle(player.x, player.y, o)) {
                if (moveY > 0) player.y = o.y - half;
                else player.y = o.y + o.h + half;
            }
        }
    }

    // Keep player on screen (if no movement, still clamp)
    const half = player.size / 2;
    player.x = Math.max(half, Math.min(canvas.width - half, player.x));
    player.y = Math.max(half, Math.min(canvas.height - half, player.y));

    // Update bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
        bullets[i].x += bullets[i].dx * frameScale;
        bullets[i].y += bullets[i].dy * frameScale;

        // Bullet-wall collision
        let hitWall = false;
        for (const o of obstacles) {
            if (pointIntersectsObstacle(bullets[i].x, bullets[i].y, BULLET_SIZE, o)) {
                hitWall = true;
                break;
            }
        }
        if (hitWall) {
            bullets.splice(i, 1);
            continue;
        }

        if (
            bullets[i].x < 0 || bullets[i].x > canvas.width ||
            bullets[i].y < 0 || bullets[i].y > canvas.height
        ) {
            bullets.splice(i, 1);
        }
    }

    // Move enemies (roles + robust collision)
    for (const enemy of enemies) {
        const dx = player.x - enemy.x;
        const dy = player.y - enemy.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= 0.0001) continue;

        const ux = dx / dist;
        const uy = dy / dist;
        const px = -uy;
        const py = ux;

        if (enemy.kind === 'boss') {
            if (difficultyMode === 'hard' && !enemy.phase2 && !enemy.phase2SoonShown) {
                const frac = enemy.maxHp > 0 ? (enemy.hp / enemy.maxHp) : 1;
                if (frac <= 0.60 && frac >= 0.55) {
                    enemy.phase2SoonShown = true;
                    phase2SoonUntil = Math.max(phase2SoonUntil, now + 1100);
                }
            }

            // Difficult mode: boss phase 2 at 50% HP.
            if (difficultyMode === 'hard' && !enemy.phase2 && enemy.hp <= enemy.maxHp * 0.5) {
                enemy.phase2 = true;
            }

            // Boss shoot
            if (now >= (enemy.nextShotAt ?? 0)) {
                const phaseMul = (difficultyMode === 'hard' && enemy.phase2) ? 0.72 : 1.0;
                enemy.nextShotAt = now + Math.round((enemy.shootDelayMs || 850) * phaseMul);
                const sp = ENEMY_BULLET_SPEED * 1.25;

                // Difficult phase 2: 3-shot spread
                if (difficultyMode === 'hard' && enemy.phase2) {
                    const base = Math.atan2(uy, ux);
                    const spread = 0.22;
                    for (const off of [-spread, 0, spread]) {
                        const a = base + off;
                        pushEnemyBullet({
                            x: enemy.x,
                            y: enemy.y,
                            dx: Math.cos(a) * sp,
                            dy: Math.sin(a) * sp
                        });
                    }
                } else {
                    pushEnemyBullet({
                        x: enemy.x,
                        y: enemy.y,
                        dx: ux * sp,
                        dy: uy * sp
                    });
                }
            }

            // Boss dash (windup + dash)
            const phaseDash = (difficultyMode === 'hard' && enemy.phase2);
            const dashCooldown = Math.max(900, (Math.max(1400, 2600 - wave * 18)) * (phaseDash ? 0.62 : 1.0));
            const dashWindupMs = 260;
            const dashDurationMs = phaseDash ? 220 : 190;
            const dashSpeed = Math.max(10, (14 + wave * 0.14) * (phaseDash ? 1.25 : 1.0));

            if (!enemy.dashPending && now >= (enemy.dashCooldownUntil ?? 0) && now >= (enemy.dashUntil ?? 0)) {
                // Start windup only if boss is reasonably close (keeps it from dashing from offscreen)
                if (dist < 520) {
                    enemy.dashPending = true;
                    enemy.dashAngle = Math.atan2(dy, dx);
                    enemy.dashWindupUntil = now + dashWindupMs;
                }
            }

            if (enemy.dashPending && now >= (enemy.dashWindupUntil ?? 0)) {
                enemy.dashPending = false;
                enemy.dashUntil = now + dashDurationMs;
                enemy.dashCooldownUntil = enemy.dashUntil + dashCooldown;
                enemy.dashVX = Math.cos(enemy.dashAngle) * dashSpeed;
                enemy.dashVY = Math.sin(enemy.dashAngle) * dashSpeed;
            }

            if (now < (enemy.dashUntil ?? 0)) {
                const vx = (enemy.dashVX || 0) * frameScale;
                const vy = (enemy.dashVY || 0) * frameScale;
                moveEnemy(enemy, vx, vy, dtMs, frameScale);
                continue;
            }

            // Normal boss movement: keep mid range and orbit
            const desired = 240;
            const sign = dist > desired ? 1 : (dist < desired * 0.72 ? -1 : 0);
            const orbit = 0.85 * (enemy.orbitDir ?? 1);
            // During windup, slow down a bit (gives players a hint)
            const slow = enemy.dashPending ? 0.55 : 1.0;
            const vx = (ux * enemy.speed * sign + px * enemy.speed * orbit) * frameScale * slow;
            const vy = (uy * enemy.speed * sign + py * enemy.speed * orbit) * frameScale * slow;
            moveEnemy(enemy, vx, vy, dtMs, frameScale);
            continue;
        }

        if (enemy.kind === 'shooter') {
            // Keep distance and strafe slightly
            const desired = 280;
            const sign = dist > desired ? 1 : -1;
            const strafe = 0.55 * (enemy.orbitDir ?? 1);
            const vx = (ux * enemy.speed * sign + px * enemy.speed * strafe) * frameScale;
            const vy = (uy * enemy.speed * sign + py * enemy.speed * strafe) * frameScale;
            moveEnemy(enemy, vx, vy, dtMs, frameScale);

            if (now >= enemy.nextShotAt) {
                enemy.nextShotAt = now + (enemy.shootDelayMs || 900);
                pushEnemyBullet({
                    x: enemy.x,
                    y: enemy.y,
                    dx: ux * ENEMY_BULLET_SPEED,
                    dy: uy * ENEMY_BULLET_SPEED
                });
            }
            continue;
        }

        if (enemy.kind === 'strafer') {
            // Orbit the player and take pot-shots
            const desired = 190;
            const sign = dist > desired ? 1 : (dist < desired * 0.75 ? -1 : 0);
            const orbit = 1.05 * (enemy.orbitDir ?? 1);
            const vx = (ux * enemy.speed * sign + px * enemy.speed * orbit) * frameScale;
            const vy = (uy * enemy.speed * sign + py * enemy.speed * orbit) * frameScale;
            moveEnemy(enemy, vx, vy, dtMs, frameScale);

            if (now >= enemy.nextShotAt) {
                enemy.nextShotAt = now + (enemy.shootDelayMs || 1150);
                pushEnemyBullet({
                    x: enemy.x,
                    y: enemy.y,
                    dx: ux * ENEMY_BULLET_SPEED,
                    dy: uy * ENEMY_BULLET_SPEED
                });
            }
            continue;
        }

        if (enemy.kind === 'rusher') {
            // Burst toward the player when in range.
            const burstRange = 320;
            const burstDuration = 240;
            const burstCooldown = 1450;
            if (now >= (enemy.burstCooldownUntil ?? 0) && dist < burstRange) {
                enemy.burstUntil = now + burstDuration;
                enemy.burstCooldownUntil = now + burstCooldown;
            }

            const bursting = now < (enemy.burstUntil ?? 0);
            const spMul = bursting ? 2.2 : 1.0;
            const strafe = (bursting ? 0.25 : 0.55) * (enemy.orbitDir ?? 1);
            const vx = (ux * enemy.speed * spMul + px * enemy.speed * strafe) * frameScale;
            const vy = (uy * enemy.speed * spMul + py * enemy.speed * strafe) * frameScale;
            moveEnemy(enemy, vx, vy, dtMs, frameScale);
            continue;
        }

        if (enemy.kind === 'flanker') {
            // Approach from an angle (less straight-line wall-sticking than a pure chaser).
            const desired = 210;
            const sign = dist > desired ? 1 : (dist < desired * 0.75 ? -1 : 0);
            const flank = 0.9 * (enemy.flankDir ?? 1);
            const vx = (ux * enemy.speed * sign + px * enemy.speed * flank) * frameScale;
            const vy = (uy * enemy.speed * sign + py * enemy.speed * flank) * frameScale;
            moveEnemy(enemy, vx, vy, dtMs, frameScale);
            continue;
        }

        // Default: chaser / splitter
        const vx = ux * enemy.speed * frameScale;
        const vy = uy * enemy.speed * frameScale;
        moveEnemy(enemy, vx, vy, dtMs, frameScale);
    }

    // Update enemy bullets
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
        const b = enemyBullets[i];
        b.x += b.dx * frameScale;
        b.y += b.dy * frameScale;

        // Enemy bullet-wall collision
        let hitWall = false;
        for (const o of obstacles) {
            if (pointIntersectsObstacle(b.x, b.y, ENEMY_BULLET_SIZE, o)) {
                hitWall = true;
                break;
            }
        }
        if (hitWall) {
            enemyBullets.splice(i, 1);
            continue;
        }

        if (b.x < -30 || b.x > canvas.width + 30 || b.y < -30 || b.y > canvas.height + 30) {
            enemyBullets.splice(i, 1);
            continue;
        }

        const dx = player.x - b.x;
        const dy = player.y - b.y;
        const dist = Math.hypot(dx, dy);
        if (dist < player.size / 2 + ENEMY_BULLET_SIZE) {
            enemyBullets.splice(i, 1);
            takeHit(now);
        }
    }

    // Player ↔ Enemy collision (hearts + i-frames)
    const playerR = player.size / 2;
    for (let i = 0; i < enemies.length; i++) {
        const dx = player.x - enemies[i].x;
        const dy = player.y - enemies[i].y;
        const dist = Math.hypot(dx, dy);
        if (dist < playerR + enemies[i].r) {
            takeHit(now);
            break;
        }
    }

    // Bullet ↔ Enemy collision (pierce)
    for (let i = bullets.length - 1; i >= 0; i--) {
        for (let j = enemies.length - 1; j >= 0; j--) {
            const dx = bullets[i].x - enemies[j].x;
            const dy = bullets[i].y - enemies[j].y;
            const dist = Math.hypot(dx, dy);

            if (dist < enemies[j].r + BULLET_SIZE) {
                enemies[j].hp -= 1;

                sfxHit();

                if (bullets[i] && bullets[i].pierce > 0) {
                    bullets[i].pierce -= 1;
                } else {
                    bullets.splice(i, 1);
                }

                if (enemies[j].hp <= 0) {
                    const dead = enemies[j];
                    enemies.splice(j, 1);
                    score++;
                    killsThisWave++;
                    updateRecords();
                    sfxKill();
                    triggerShake(4, 90, now);
                    spawnExplosion(dead.x, dead.y, dead.color);

                    if (dead.kind === 'splitter') {
                        // Split into 2 fast smalls
                        for (let k = 0; k < 2; k++) {
                            enemies.push({
                                x: dead.x + (Math.random() - 0.5) * 10,
                                y: dead.y + (Math.random() - 0.5) * 10,
                                r: ENEMY_TYPES.small.radius,
                                color: ENEMY_TYPES.small.color,
                                typeKey: 'small',
                                hp: ENEMY_TYPES.small.hp,
                                maxHp: ENEMY_TYPES.small.hp,
                                speed: BASE_ENEMY_SPEED * ENEMY_TYPES.small.speedMul * (1 + wave * 0.04),
                                kind: 'chaser',
                                shootDelayMs: 0,
                                nextShotAt: now + 999999,
                                orbitDir: Math.random() < 0.5 ? -1 : 1,
                                stuckMs: 0,
                                avoidAngle: Math.random() * Math.PI * 2
                            });
                        }
                    }

                    const before = powerUps.length;
                    maybeDropPowerUp(dead.x, dead.y);
                    if (powerUps.length !== before) powerDroppedThisWave = true;

                    // Drop incentive: guarantee at least one non-heart power-up per wave.
                    if (!forcedDropThisWave && !powerDroppedThisWave) {
                        const guaranteeAfterKills = Math.max(7, 11 - Math.min(6, wave));
                        if (killsThisWave >= guaranteeAfterKills) {
                            forceDropPowerUp(dead.x, dead.y);
                            powerDroppedThisWave = true;
                            forcedDropThisWave = true;
                        }
                    }
                }

                break;
            }
        }
    }

    // Power-up pickup
    for (let i = powerUps.length - 1; i >= 0; i--) {
        const p = powerUps[i];
        const dx = player.x - p.x;
        const dy = player.y - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist < playerR + POWERUP_RADIUS) {
            applyPowerUp(p.type, now);
            powerUps.splice(i, 1);
        }
    }

    // Boss pressure: while a boss is alive, drip-feed small minions.
    // (Keeps the fight from becoming a pure circle-strafe forever.)
    const bossAlive = enemies.some(e => e.kind === 'boss');
    if (!isGameOver && !isPaused && hasStarted && bossAlive) {
        const maxBossAdds = Math.min(7, 2 + Math.floor(wave / 3));
        const bossAddsAlive = enemies.reduce((n, e) => n + (e.kind !== 'boss' ? 1 : 0), 0);
        const intervalMs = Math.max(950, 1750 - wave * 28);
        if (bossAddsAlive < maxBossAdds && bossAddsSpawnedThisWave < bossAddsTotalThisWave) {
            bossMinionSpawnAccumulatorMs += dtMs;
            while (
                bossMinionSpawnAccumulatorMs >= intervalMs &&
                enemies.reduce((n, e) => n + (e.kind !== 'boss' ? 1 : 0), 0) < maxBossAdds &&
                bossAddsSpawnedThisWave < bossAddsTotalThisWave
            ) {
                bossMinionSpawnAccumulatorMs -= intervalMs;
                spawnEnemy('small');
                bossAddsSpawnedThisWave++;
            }
        } else {
            bossMinionSpawnAccumulatorMs = 0;
        }
    }

    // Waves: 3s countdown, spawn a batch, then wait for clear
    if (now < waveCountdownUntil) {
        // Don't accumulate spawn time during countdown (prevents instant multi-spawn)
    } else if (enemiesSpawnedThisWave < enemiesToSpawnThisWave) {
        const maxEnemiesOnScreen = Math.min(34, 18 + Math.floor(wave * 1.5));
        spawnAccumulatorMs += dtMs;
        while (
            spawnAccumulatorMs >= spawnIntervalMs &&
            enemiesSpawnedThisWave < enemiesToSpawnThisWave &&
            enemies.length < maxEnemiesOnScreen
        ) {
            spawnAccumulatorMs -= spawnIntervalMs;
            spawnEnemy();
            enemiesSpawnedThisWave++;
        }
    } else if (enemies.length === 0) {
        // Boss spawns after all minions are spawned + defeated.
        if (!bossSpawnedThisWave) {
            bossSpawnedThisWave = true;
            bossIncomingUntil = now + BOSS_INCOMING_MS;
            spawnBossForWave(wave);
            if (difficultyMode === 'hard') {
                spawnBossForWave(wave);
            }
        } else {
        betweenWaveAccumulatorMs += dtMs;
        if (betweenWaveAccumulatorMs >= BETWEEN_WAVE_MS) {
            if (wave >= MAX_WAVE) {
                updateRecords();
                isGameWon = true;
                draw(now);
                requestAnimationFrame(update);
                return;
            }

            wave++;
            updateRecords();
            startWave();
        }
        // Drop incentive: wave-clear reward (1 per wave).
        if (betweenWaveAccumulatorMs > 0 && betweenWaveAccumulatorMs < BETWEEN_WAVE_MS) {
            if (!waveClearRewardDropped) {
                const pt = findSafeDropPointNear(player.x, player.y, 160, 34);
                forceDropPowerUp(pt.x, pt.y);
                waveClearRewardDropped = true;
                powerDroppedThisWave = true;
            }
        }
        }
    }

    // Short pause between waves (banner shows in draw())
    if (
        !isGameOver && !isPaused && hasStarted &&
        enemiesSpawnedThisWave >= enemiesToSpawnThisWave &&
        enemies.length === 0 &&
        now >= waveCountdownUntil &&
        betweenWaveAccumulatorMs > 0 && betweenWaveAccumulatorMs < BETWEEN_WAVE_MS
    ) {
        draw(now);
        requestAnimationFrame(update);
        return;
    }

    draw(now);
    requestAnimationFrame(update);
}

// ================= DRAW =================
function draw(now) {
    // Background floor
    if (!floorPattern && SPRITES.floor?.ready) {
        floorPattern = ctx.createPattern(SPRITES.floor.img, 'repeat');
    }
    ctx.fillStyle = floorPattern || '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Camera shake (applies to world objects, not UI)
    let sx = 0;
    let sy = 0;
    if (!isPaused && !isGameOver && shakeUntil > now) {
        sx = (Math.random() * 2 - 1) * shakeMag;
        sy = (Math.random() * 2 - 1) * shakeMag;
    } else if (shakeMag !== 0) {
        shakeMag = 0;
    }
    ctx.save();
    ctx.translate(sx, sy);

    // Obstacles
    if (!wallPattern && SPRITES.wall?.ready) {
        wallPattern = ctx.createPattern(SPRITES.wall.img, 'repeat');
    }
    obstacles.forEach(o => {
        ctx.fillStyle = wallPattern || 'saddlebrown';
        ctx.fillRect(o.x, o.y, o.w, o.h);
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 2;
        ctx.strokeRect(o.x, o.y, o.w, o.h);
    });

    // Enemies
    enemies.forEach(e => {
        const key = e.typeKey || (e.kind === 'shooter' ? 'shooter' : e.kind === 'splitter' ? 'splitter' : (e.maxHp >= 5 ? 'big' : e.maxHp >= 3 ? 'medium' : 'small'));
        const sprite = SPRITES.enemy[key];
        if (sprite?.ready) {
            ctx.save();
            ctx.translate(e.x, e.y);
            const bossScale = e.kind === 'boss' ? 1.18 : 1.0;
            ctx.drawImage(sprite.img, -e.r * bossScale, -e.r * bossScale, e.r * 2 * bossScale, e.r * 2 * bossScale);
            if (e.kind === 'boss') {
                // Simple tint/halo so the boss reads instantly.
                ctx.globalAlpha = 0.22;
                ctx.fillStyle = 'white';
                ctx.beginPath();
                ctx.arc(0, 0, e.r * 1.25, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1.0;
            }
            ctx.restore();
        } else {
            ctx.beginPath();
            ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
            ctx.fillStyle = e.color;
            ctx.fill();
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        // Tiny HP bar for multi-hit enemies
        if (e.maxHp > 1) {
            const w = e.kind === 'boss' ? e.r * 2.6 : e.r * 2;
            const h = e.kind === 'boss' ? 9 : 5;
            const x = e.x - w / 2;
            const y = e.y - e.r - (e.kind === 'boss' ? 18 : 10);
            ctx.fillStyle = 'rgba(0,0,0,0.65)';
            ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
            ctx.fillStyle = 'white';
            ctx.fillRect(x, y, w * (e.hp / e.maxHp), h);

            if (e.kind === 'boss') {
                ctx.save();
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                ctx.font = '16px Arial';
                ctx.fillStyle = 'white';
                ctx.fillText('BOSS', e.x, y - 6);
                ctx.restore();
            }
        }
    });

    // Enemy death explosions
    drawExplosions();

    // Shooter/Boss telegraph (brief aim line before firing / boss dash windup)
    ctx.save();
    ctx.lineWidth = 2;
    for (const e of enemies) {
        if (e.kind === 'shooter' || e.kind === 'boss') {
            const rem = (e.nextShotAt ?? 0) - now;
            if (rem > 0 && rem < 240) {
                const a = Math.min(1, (240 - rem) / 240);
                ctx.strokeStyle = `rgba(255,255,255,${0.15 + a * 0.35})`;
                ctx.beginPath();
                ctx.moveTo(e.x, e.y);
                ctx.lineTo(player.x, player.y);
                ctx.stroke();
            }
        }

        if (e.kind === 'boss' && e.dashPending) {
            const rem = (e.dashWindupUntil ?? 0) - now;
            if (rem > 0) {
                const a = Math.min(1, (260 - Math.min(260, rem)) / 260);
                const len = 120;
                const ang = e.dashAngle ?? Math.atan2(player.y - e.y, player.x - e.x);
                ctx.strokeStyle = `rgba(255,80,80,${0.15 + a * 0.55})`;
                ctx.beginPath();
                ctx.moveTo(e.x, e.y);
                ctx.lineTo(e.x + Math.cos(ang) * len, e.y + Math.sin(ang) * len);
                ctx.stroke();
            }
        }
    }
    ctx.restore();

    // Bullets (glow + short trail)
    ctx.save();
    ctx.lineWidth = 3;
    for (const b of bullets) {
        const len = Math.hypot(b.dx, b.dy) || 1;
        const nx = b.dx / len;
        const ny = b.dy / len;
        const tx = b.x - nx * 14;
        const ty = b.y - ny * 14;

        ctx.strokeStyle = 'rgba(255,80,80,0.55)';
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();

        const sprite = SPRITES.bullet;
        if (sprite?.ready) {
            const ang = Math.atan2(b.dy, b.dx);
            ctx.save();
            ctx.translate(b.x, b.y);
            ctx.rotate(ang);
            // sprite is 64x16, scale down for gameplay
            const w = 18;
            const h = 6;
            ctx.drawImage(sprite.img, -w * 0.55, -h / 2, w, h);
            ctx.restore();
        } else {
            ctx.fillStyle = 'red';
            ctx.fillRect(b.x - BULLET_SIZE, b.y - BULLET_SIZE, BULLET_SIZE * 2, BULLET_SIZE * 2);
        }
    }
    ctx.restore();

    // Enemy bullets
    ctx.fillStyle = 'white';
    enemyBullets.forEach(b => {
        ctx.beginPath();
        ctx.arc(b.x, b.y, ENEMY_BULLET_SIZE, 0, Math.PI * 2);
        ctx.fill();
    });

    // Power-ups
    powerUps.forEach(p => {
        const meta = POWERUP_TYPES[p.type];
        ctx.beginPath();
        ctx.arc(p.x, p.y, POWERUP_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = meta.color;
        ctx.fill();
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = 'black';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(meta.label, p.x, p.y);
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
    });

    // Player (draw last so it stays visible)
    ctx.save();
    ctx.translate(player.x, player.y);
    // Player sprite points "up" in the SVG, so rotate +90° to align with aim.
    ctx.rotate(player.angle + Math.PI / 2);
    const hitInv = now < invincibleUntil;
    const spawnInv = now < spawnInvincibleUntil;
    const w = player.size * 1.9;
    const h = player.size * 1.9;
    if (SPRITES.player.ready) {
        if (spawnInv) {
            const blinkOn = (Math.floor(now / 90) % 2) === 0;
            ctx.globalAlpha = blinkOn ? 0.25 : 1.0;
        } else {
            ctx.globalAlpha = hitInv ? 0.45 : 1.0;
        }
        ctx.drawImage(SPRITES.player.img, -w / 2, -h / 2, w, h);
        ctx.globalAlpha = 1.0;
    } else {
        if (spawnInv) {
            const blinkOn = (Math.floor(now / 90) % 2) === 0;
            ctx.fillStyle = blinkOn ? 'rgba(255,255,255,0.25)' : 'white';
        } else {
            ctx.fillStyle = hitInv ? 'rgba(255,255,255,0.4)' : 'white';
        }
        ctx.fillRect(-player.size / 2, -player.size / 2, player.size, player.size);
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 2;
        ctx.strokeRect(-player.size / 2, -player.size / 2, player.size, player.size);
    }
    ctx.restore();

    // End world transform (shake)
    ctx.restore();

    // Hit flash overlay
    if (!isPaused && !isGameOver && hitFlashUntil > now) {
        const t = Math.max(0, Math.min(1, (hitFlashUntil - now) / 130));
        ctx.fillStyle = `rgba(255,80,80,${0.35 * t})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Wave countdown overlay (before enemies spawn)
    if (!isGameOver && !isPaused && now < waveCountdownUntil) {
        const remaining = Math.max(0, waveCountdownUntil - now);
        const secs = Math.max(1, Math.ceil(remaining / 1000));
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;

        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'white';
        ctx.font = '44px Arial';
        ctx.fillText(`Wave ${wave}`, cx, cy - 38);
        ctx.font = '64px Arial';
        ctx.fillText(String(secs), cx, cy + 26);
        ctx.restore();
    }

    // Boss incoming banner
    if (!isGameOver && !isPaused && hasStarted && bossIncomingUntil > now) {
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const t = Math.max(0, Math.min(1, (bossIncomingUntil - now) / BOSS_INCOMING_MS));

        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = `rgba(255,255,255,${0.65 + 0.35 * (1 - t)})`;
        ctx.font = '52px Arial';
        ctx.fillText('BOSS INCOMING!', cx, cy);
        ctx.font = '18px Arial';
        ctx.fillText('Stay moving...', cx, cy + 46);
        ctx.restore();
    }

    // Boss phase warning (hard mode)
    if (!isGameOver && !isGameWon && !isPaused && hasStarted && phase2SoonUntil > now) {
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const t = Math.max(0, Math.min(1, (phase2SoonUntil - now) / 1100));

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = `rgba(255,255,255,${0.7 + 0.3 * (1 - t)})`;
        ctx.font = '44px Arial';
        ctx.fillText('PHASE 2 SOON...', cx, cy);
        ctx.font = '18px Arial';
        ctx.fillText('Boss is getting angry', cx, cy + 40);
        ctx.restore();
    }

    // Between-wave banner
    if (!isGameOver && !isPaused && hasStarted && enemiesSpawnedThisWave >= enemiesToSpawnThisWave && enemies.length === 0 && now >= waveCountdownUntil && betweenWaveAccumulatorMs > 0 && betweenWaveAccumulatorMs < BETWEEN_WAVE_MS) {
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'white';
        ctx.font = '44px Arial';
        ctx.fillText('WAVE CLEARED!', cx, cy);
        ctx.font = '18px Arial';
        ctx.fillText('Get ready...', cx, cy + 44);
        ctx.restore();
    }

    // Mobile joystick overlay
    if (mobileControlsEnabled && joystick.active) {
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 3;
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.beginPath();
        ctx.arc(joystick.ox, joystick.oy, joystick.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = 'rgba(255,255,255,0.28)';
        ctx.beginPath();
        ctx.arc(joystick.x, joystick.y, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    // HUD (draw on top of gameplay)
    ctx.font = '16px Arial';

    // Instructions stay at the top
    const hud1 = 'WASD to move • Mouse to aim • Click to shoot • Tab/Esc: Menu';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    const topBarH = 28;
    const topBarX = 64;
    const topBarW = Math.max(140, canvas.width - topBarX * 2);
    ctx.fillRect(topBarX, 6, topBarW, topBarH);
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(hud1, canvas.width / 2, 26);
    ctx.textAlign = 'start';

    // Stats move to the bottom
    const heartIcons = '♥'.repeat(Math.max(0, hearts));
    const shieldTxt = shieldCharges > 0 ? `  Shield:${shieldCharges}` : '';
    const modeTxt = difficultyMode === 'hard' ? 'Difficult' : 'Easy';
    const hud2 = `Score: ${score} (Best: ${bestScore})   Wave: ${wave} (Best: ${bestWave})   HP: ${heartIcons}${shieldTxt}   Mode: ${modeTxt}`;
    const cd = Math.max(0, (dashCooldownUntil - now) / 1000);
    const dashTxt = cd > 0 ? `Dash CD: ${cd.toFixed(1)}s` : 'Dash: ready';
    const pu = [];
    if (now < fastFireUntil) pu.push('FIRE');
    if (now < pierceUntil) pu.push('PIERCE');
    if (now < speedUntil) pu.push('SPEED');
    const puTxt = pu.length ? `Power: ${pu.join(' ')}` : '';

    const bottomBarH = 58;
    const bottomY = canvas.height - bottomBarH - 10;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(6, bottomY, canvas.width - 12, bottomBarH);
    ctx.fillStyle = 'white';
    ctx.fillText(hud2, 12, bottomY + 22);
    const bossAlive = enemies.some(e => e.kind === 'boss');
    if (bossAlive) {
        const addsLeft = Math.max(0, bossAddsTotalThisWave - bossAddsSpawnedThisWave);
        ctx.textAlign = 'right';
        ctx.fillText(`Adds left: ${addsLeft}`, canvas.width - 12, bottomY + 22);
        ctx.textAlign = 'start';
    }
    ctx.fillText(dashTxt, 12, bottomY + 44);
    if (puTxt) {
        ctx.textAlign = 'right';
        ctx.fillText(puTxt, canvas.width - 12, bottomY + 44);
        ctx.textAlign = 'start';
    }

    // Top buttons
    layoutButtons();

    ctx.fillStyle = 'white';
    ctx.fillRect(menuButton.x, menuButton.y, menuButton.w, menuButton.h);
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 2;
    ctx.strokeRect(menuButton.x, menuButton.y, menuButton.w, menuButton.h);
    drawMenuIcon(menuButton.x, menuButton.y, menuButton.w, menuButton.h);

    ctx.fillStyle = 'white';
    ctx.fillRect(fullscreenButton.x, fullscreenButton.y, fullscreenButton.w, fullscreenButton.h);
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 2;
    ctx.strokeRect(fullscreenButton.x, fullscreenButton.y, fullscreenButton.w, fullscreenButton.h);
    drawFullscreenIcon(fullscreenButton.x, fullscreenButton.y, fullscreenButton.w, fullscreenButton.h, isFullscreen());

    // START screen overlay (shown before any gameplay)
    if (!hasStarted) {
        layoutStartUi();
        layoutModeSelectUi();
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;

        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'white';
        ctx.font = '56px Arial';
        ctx.fillText('2D SHOOTER', cx, cy - 90);

        if (startPage === 'main') {
            ctx.font = '18px Arial';
            ctx.fillText('Press Play to start', cx, cy - 40);
        } else {
            ctx.font = '18px Arial';
            ctx.fillText('Choose your mode', cx, cy - 40);
        }
        ctx.font = '16px Arial';
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        const buttonsBottom = startPage === 'main'
            ? (playButton.y + playButton.h)
            : (practiceButton.y + practiceButton.h);
        const bestTextY = Math.round(buttonsBottom + 18);
        ctx.fillText(`Best Score: ${bestScore}   Best Wave: ${bestWave}`, cx, bestTextY);

        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.font = '15px Arial';
        ctx.fillText('WASD move • Mouse aim • Click shoot • Space dash', cx, bestTextY + 22);
        ctx.fillText('Esc/Tab menu • Touch: tap to shoot (optional joystick)', cx, bestTextY + 42);
        ctx.restore();

        if (startPage === 'main') {
            drawUiButton(playButton, 'Play');
        } else {
            drawUiButton(easyModeButton, 'Easy');
            drawUiButton(difficultModeButton, 'Difficult');

            const practiceLabel = (practiceStartWave === 1)
                ? 'Practice: Off'
                : `Practice: Start at Wave ${practiceStartWave}`;
            drawUiButton(practiceButton, practiceLabel);

            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgba(255,255,255,0.82)';
            ctx.font = '14px Arial';
            ctx.fillText('Difficult: 2 bosses + phase 2 at 50% HP', cx, practiceButton.y + practiceButton.h + 18);
            ctx.restore();
        }
        return;
    }

    // PAUSED overlay
    if (!isGameOver && isPaused) {
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;

        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'white';
        ctx.font = '52px Arial';
        ctx.fillText(pausePage === 'settings' ? 'SETTINGS' : 'PAUSED', cx, cy - 150);

        const btnW = 260;
        const btnH = 46;
        const gap = 14;
        const x = cx - btnW / 2;

        if (pausePage === 'menu') {
            const y0 = Math.round(cy - (btnH * 1.5 + gap));

            resumeButton.x = x;
            resumeButton.y = y0;
            resumeButton.w = btnW;
            resumeButton.h = btnH;

            pauseSettingsButton.x = x;
            pauseSettingsButton.y = y0 + (btnH + gap);
            pauseSettingsButton.w = btnW;
            pauseSettingsButton.h = btnH;

            pauseRestartButton.x = x;
            pauseRestartButton.y = y0 + (btnH + gap) * 2;
            pauseRestartButton.w = btnW;
            pauseRestartButton.h = btnH;

            drawUiButton(resumeButton, 'Resume');
            drawUiButton(pauseSettingsButton, 'Settings');
            drawUiButton(pauseRestartButton, 'Restart');

            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.font = '16px Arial';
            ctx.fillText('Press Esc/Tab to resume', cx, cy + 130);
        }

        if (pausePage === 'settings') {
            const y0 = cy - 50;

            settingsSoundButton.x = cx - 320 / 2;
            settingsSoundButton.y = y0;
            settingsSoundButton.w = 320;
            settingsSoundButton.h = btnH;

            settingsMusicButton.x = cx - 320 / 2;
            settingsMusicButton.y = y0 + (btnH + gap);
            settingsMusicButton.w = 320;
            settingsMusicButton.h = btnH;

            settingsMobileButton.x = cx - 320 / 2;
            settingsMobileButton.y = y0 + (btnH + gap) * 2;
            settingsMobileButton.w = 320;
            settingsMobileButton.h = btnH;

            settingsAimAssistButton.x = cx - 320 / 2;
            settingsAimAssistButton.y = y0 + (btnH + gap) * 3;
            settingsAimAssistButton.w = 320;
            settingsAimAssistButton.h = btnH;

            settingsResetRecordsButton.x = cx - 320 / 2;
            settingsResetRecordsButton.y = y0 + (btnH + gap) * 4;
            settingsResetRecordsButton.w = 320;
            settingsResetRecordsButton.h = btnH;

            pauseBackButton.x = cx - 220 / 2;
            pauseBackButton.y = y0 + (btnH + gap) * 5 + 8;
            pauseBackButton.w = 220;
            pauseBackButton.h = btnH;

            drawUiButton(settingsSoundButton, `Sound: ${soundEnabled ? 'On' : 'Off'}`);
            drawUiButton(settingsMusicButton, `Music: ${musicEnabled ? 'On' : 'Off'}`);
            drawUiButton(settingsMobileButton, `Mobile Controls: ${mobileControlsEnabled ? 'On' : 'Off'}`);
            drawUiButton(settingsAimAssistButton, `Aim Assist: ${aimAssistEnabled ? 'On' : 'Off'}`);
            drawUiButton(settingsResetRecordsButton, 'Reset Records');
            drawUiButton(pauseBackButton, 'Back');

            ctx.fillStyle = 'rgba(255,255,255,0.8)';
            ctx.font = '16px Arial';
            ctx.fillText('Mobile: joystick move + tap shoot', cx, cy + 190);
        }

        ctx.restore();
    }

    // End overlay (Game Over / Win)
    if (isGameOver || isGameWon) {
        const t = performance.now() / 1000;
        const pulse = 0.5 + 0.5 * Math.sin(t * 4);
        const size = 48 + pulse * 10;
        const alpha = 0.75 + pulse * 0.25;

        const cx = canvas.width / 2;
        const cy = canvas.height / 2;

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,0.75)';
        ctx.shadowBlur = 14;
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.font = `${Math.round(size)}px Arial`;
        ctx.fillText(isGameWon ? 'YOU WIN!' : 'GAME OVER', cx, cy);
        ctx.restore();

        const modeTxt = difficultyMode === 'hard' ? 'Difficult' : 'Easy';
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.font = '18px Arial';
        ctx.fillText(`Final Score: ${score}`, cx, cy + 46);
        ctx.fillText(`Final Wave: ${wave} / ${MAX_WAVE}   Mode: ${modeTxt}`, cx, cy + 70);
        ctx.restore();

        layoutGameOverUi();

        drawUiButton(restartButton, 'Restart');
        drawUiButton(modeButton, 'Mode');
    }
}

// ================= START =================
loadSettings();
loadRecords();
startWave();
requestAnimationFrame(update);
