/* ==========================================================================
 *  猫咪阳台大逃亡 2.0 - game.js
 *  --------------------------------------------------------------------------
 *  纯前端轻策略网页跑酷。Canvas 2D 绘制，Web Audio API 合成音效。
 *  单文件按模块组织，方便阅读与扩展。
 *
 *  模块组织（顺序）：
 *    1. Config           常量集中
 *    2. Utils            通用工具
 *    3. StorageManager   localStorage 包装
 *    4. AudioManager     Web Audio 音效合成
 *    5. InputManager     键盘 + 鼠标 + 触屏
 *    6. ParticleSystem   粒子（尘土/速度线/护盾碎片等）
 *    7. Background       多层视差 + 三层楼面
 *    8. Platform / PlatformManager  三层路线平台
 *    9. Obstacle / ObstacleManager   6 类基础障碍
 *   10. GameEvent / EventManager    6 类随机事件
 *   11. Collectible / CollectibleManager  鱼干/金鱼干/罐头
 *   12. CatStateSystem  6 种猫咪状态
 *   13. DogChaseSystem  狗追逐 + 危险度
 *   14. MissionSystem   短目标任务
 *   15. CollisionSystem 跨 lane 落地 + 碰撞
 *   16. Player          玩家
 *   17. UIManager       DOM HUD + 浮字 + 状态切换提示
 *   18. Game            主循环 + 状态机 + 装配
 *   19. bootstrap       DOMContentLoaded 启动
 *  --------------------------------------------------------------------------
 *  坐标系：960 × 540 逻辑分辨率，按窗口 letterbox 缩放。
 * ========================================================================== */

'use strict';

/* ==========================================================================
 *  1. Config
 * ========================================================================== */
const Config = Object.freeze({
  LOGIC_W: 960,
  LOGIC_H: 540,

  // 三层路线（猫可站立的 Y 坐标）
  LANE_Y: { upper: 290, middle: 420, lower: 500 },
  LANE_NAMES: ['upper', 'middle', 'lower'],

  // 玩家物理
  GRAVITY: 2400,
  JUMP_V: -840,      // 单跳高度 ≈ 147px（覆盖中层→上层 130px 差距）
  JUMP2_V: -760,     // 二段跳高度 ≈ 120px
  PLAYER_X: 170,
  PLAYER_W: 36,
  PLAYER_H: 48,
  PLAYER_SLIDE_H: 18,
  HITBOX_INSET: 4,

  // 速度曲线
  SPEED_START: 260,
  SPEED_MAX: 720,
  ACCEL_EARLY: 2.0,
  ACCEL_LATE: 4.5,
  EASY_DURATION: 12.0,    // 新手阶段 12 秒

  // 冲刺
  DASH_DURATION: 3.0,
  DASH_SPEED_MULT: 1.8,
  DASH_ENERGY: 100,
  DASH_DOG_BOOST: 30,
  DASH_MAGNET_RADIUS: 200,

  // 能量
  ENERGY_PER_FISH: 5,
  ENERGY_PER_GOLD: 20,
  ENERGY_MAX: 100,

  // Combo
  COMBO_WINDOW: 2.0,           // 2 秒内连续收
  COMBO_THRESHOLDS: [5, 10, 20, 30],  // 倍率跳变：1x → 1.2x → 1.5x → 2x → 3x
  COMBO_MULTIPLIERS: [1.2, 1.5, 2.0, 3.0],

  // 狗追逐 / 危险度
  DAMAGE_LIGHT: 12,            // 轻碰撞 +12%
  DAMAGE_HEAVY: 25,            // 重碰撞 +25%
  DAMAGE_DOGZONE: 20,          // 狗叫区 +20%
  DAMAGE_FLOWERPOT: 15,        // 掉落花盆 +15%
  DAMAGE_FALL: 100,            // 掉出屏幕立即 game over
  DOG_DECAY_FISH: 2,
  DOG_DECAY_GOLD: 5,
  DOG_DECAY_LANDING: 3,
  DOG_DECAY_DASH: 30,          // 冲刺期间

  // 状态
  STATE_DURATIONS: {
    normal: 999,
    bristling: 4.0,
    greedy: 5.0,
    agile: 5.0,
    shield: 999,        // 直至消耗
    dash: 3.0,
  },
  STATE_ICONS: {
    normal: '🐾',
    bristling: '😾',
    greedy: '😻',
    agile: '🐾',
    shield: '🛡️',
    dash: '⚡',
  },
  STATE_NAMES: {
    normal: '正常',
    bristling: '炸毛',
    greedy: '馋猫',
    agile: '灵巧',
    shield: '护盾',
    dash: '冲刺',
  },

  // 随机事件解锁距离
  EVENT_UNLOCK_DIST: {
    fallingFlowerpot: 150,
    extendingBroom: 200,
    swayingClothesline: 450,
    acWind: 500,
    dogZone: 800,
    closingWindow: 900,
  },
  EVENT_WARN_TIME: {
    fallingFlowerpot: 1.0,
    extendingBroom: 0.5,
    swayingClothesline: 1.5,
    acWind: 1.0,
    dogZone: 0,
    closingWindow: 1.5,
  },

  // 平台生成
  PLATFORM_MIN_GAP: 60,
  PLATFORM_WIDTH: { upper: [80, 160], middle: [120, 280], lower: [100, 220] },
  PLATFORM_GAP: { upper: [70, 180], middle: [60, 200], lower: [90, 240] },
  PLATFORM_GAP_NEAR: 80,       // 跨 lane 跳跃平台之间的距离

  // 任务
  MISSION_POOL_SIZE: 3,

  // 时间
  DT_CLAMP: 0.05,
  SLIDE_DURATION: 0.6,
  SHAKE_DURATION: 0.4,
  SHAKE_AMOUNT: 8,
  PERFECT_LANDING_WINDOW: 0.18, // 短按跳跃后立即按 = 完美落地奖励

  // 屏幕震动反馈强度
  SHAKE_DANGER: 3,    // 危险度警告时持续微震

  // 颜色
  COLORS: {
    cat: '#FF8A3D',
    catDark: '#D86A1F',
    catBelly: '#FFE0B8',
    catEye: '#2A2018',
    catBristle: '#FF5C5C',
    catShield: '#4FC3F7',
    catDash: '#A6E3F0',
    fish: '#FFC247',
    fishDark: '#E89A20',
    fishGold: '#FFD700',
    fishGoldDark: '#FFA500',
    can: '#FF7043',
    canDark: '#D14D1F',
    ground: '#9C7B5A',
    groundTop: '#7E6244',
    platform: '#D9B68A',
    platformTop: '#FFE5B0',
    platformDark: '#9C7B5A',
    buildingFar: '#D9BFA1',
    buildingMid: '#E8C9A0',
    buildingNear: '#C49A6C',
    ac: '#D8D8DC',
    windowFrame: '#6E4A2A',
    windowGlass: '#8FD0E8',
    plant: '#4CAF50',
    pot: '#B5713A',
    broom: '#A0522D',
    bucket: '#7E8A99',
    dogZone: '#FF5C5C',
    danger: '#F44336',
    warning: '#FFC107',
    safe: '#4CAF50',
  },
});

/* ==========================================================================
 *  2. Utils
 * ========================================================================== */
const Utils = {
  clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; },
  lerp(a, b, t) { return a + (b - a) * t; },
  rand(lo, hi) { return lo + Math.random() * (hi - lo); },
  randInt(lo, hi) { return Math.floor(this.rand(lo, hi + 1)); },
  pickWeighted(items) {
    let total = 0;
    for (const it of items) total += it.weight;
    let r = Math.random() * total;
    for (const it of items) {
      r -= it.weight;
      if (r <= 0) return it.value;
    }
    return items[items.length - 1].value;
  },
  aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x &&
           a.y < b.y + b.h && a.y + a.h > b.y;
  },
  circleHit(cx, cy, cr, x, y, w, h) {
    // 圆和矩形碰撞
    const nearX = Utils.clamp(cx, x, x + w);
    const nearY = Utils.clamp(cy, y, y + h);
    const dx = cx - nearX, dy = cy - nearY;
    return dx * dx + dy * dy <= cr * cr;
  },
  // 计算当前局分数
  calcScore(distance, fish, goldFish, comboMult, missionBonus) {
    const baseDist = Math.floor(distance / 10);
    const baseFish = fish * 5 + goldFish * 25;
    return Math.floor((baseDist + baseFish) * comboMult) + missionBonus;
  },
  // 计算 combo 倍率
  comboMult(combo) {
    const t = Config.COMBO_THRESHOLDS;
    const m = Config.COMBO_MULTIPLIERS;
    let mult = 1;
    for (let i = 0; i < t.length; i++) {
      if (combo >= t[i]) mult = m[i];
    }
    return mult;
  },
  // 在 [a, b] 区间内是否和 [c, d] 重叠
  rangeOverlap(a, b, c, d) {
    return Math.max(a, c) <= Math.min(b, d);
  },
  // 根据脚底 y 坐标判断所在 lane（用于落地与碰撞过滤）
  getLaneByY(feetY) {
    const u = Config.LANE_Y.upper, m = Config.LANE_Y.middle, l = Config.LANE_Y.lower;
    if (feetY < (u + m) / 2) return 'upper';   // < 355
    if (feetY < (m + l) / 2) return 'middle';  // < 460
    return 'lower';
  },
};

/* ==========================================================================
 *  3. StorageManager
 * ========================================================================== */
class StorageManager {
  static KEY_BEST = 'cat-escape-2-best';
  static KEY_TOTAL_FISH = 'cat-escape-2-total-fish';
  static KEY_TOTAL_RUNS = 'cat-escape-2-total-runs';
  static KEY_SKINS = 'cat-escape-2-skins';
  static KEY_MUTED = 'cat-escape-2-muted';

  static load(key, def = 0) {
    try {
      const v = localStorage.getItem(key);
      if (v === null) return def;
      return JSON.parse(v);
    } catch (e) { return def; }
  }
  static save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }
  static getBest() { return StorageManager.load(StorageManager.KEY_BEST, 0); }
  static setBest(v) { StorageManager.save(StorageManager.KEY_BEST, v); }
  static getTotalFish() { return StorageManager.load(StorageManager.KEY_TOTAL_FISH, 0); }
  static addTotalFish(n) {
    const cur = StorageManager.getTotalFish();
    StorageManager.save(StorageManager.KEY_TOTAL_FISH, cur + n);
  }
  static getTotalRuns() { return StorageManager.load(StorageManager.KEY_TOTAL_RUNS, 0); }
  static addRun() {
    const cur = StorageManager.getTotalRuns();
    StorageManager.save(StorageManager.KEY_TOTAL_RUNS, cur + 1);
  }
  static getMuted() { return StorageManager.load(StorageManager.KEY_MUTED, false); }
  static setMuted(v) { StorageManager.save(StorageManager.KEY_MUTED, !!v); }
}

/* ==========================================================================
 *  4. AudioManager - Web Audio API 合成
 * ========================================================================== */
class AudioManager {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.muted = StorageManager.getMuted();
    this.bgmOsc = null;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 0.5;
      this.masterGain.connect(this.ctx.destination);
    } catch (e) {
      console.warn('AudioContext 不可用', e);
    }
  }

  setMuted(v) {
    this.muted = !!v;
    if (this.masterGain) {
      this.masterGain.gain.value = this.muted ? 0 : 0.5;
    }
    StorageManager.setMuted(this.muted);
  }

  isMuted() { return this.muted; }

  _tone({ type = 'sine', freq = 440, freqEnd = null, dur = 0.15,
          attack = 0.005, decay = 0.05, sustain = 0.0, release = 0.1,
          peak = 0.4, filterFreq = null } = {}) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd !== null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
    }
    let lastNode = osc;
    if (filterFreq) {
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = filterFreq;
      lastNode.connect(filt);
      lastNode = filt;
    }
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(peak, t0 + attack);
    gain.gain.linearRampToValueAtTime(peak * (0.2 + sustain), t0 + attack + decay);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + release);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t0);
    osc.stop(t0 + dur + release + 0.05);
  }

  // ----- 游戏音效 -----
  playJump() {
    this._tone({ type: 'square', freq: 420, freqEnd: 780, dur: 0.08, attack: 0.005, decay: 0.02, peak: 0.18 });
  }
  playDoubleJump() {
    this._tone({ type: 'triangle', freq: 600, freqEnd: 950, dur: 0.1, attack: 0.005, decay: 0.03, peak: 0.18 });
  }
  playCoin() {
    if (!this.ctx) return;
    this._tone({ type: 'triangle', freq: 880, freqEnd: 1320, dur: 0.06, attack: 0.005, decay: 0.02, release: 0.06, peak: 0.22 });
    setTimeout(() => this._tone({ type: 'triangle', freq: 1320, freqEnd: 1760, dur: 0.06, attack: 0.005, decay: 0.02, release: 0.08, peak: 0.18 }), 70);
  }
  playGoldCoin() {
    if (!this.ctx) return;
    [880, 1320, 1760].forEach((f, i) => {
      setTimeout(() => this._tone({ type: 'sine', freq: f, dur: 0.08, attack: 0.005, decay: 0.02, release: 0.08, peak: 0.18 }), i * 60);
    });
  }
  playCan() {
    if (!this.ctx) return;
    this._tone({ type: 'square', freq: 220, freqEnd: 440, dur: 0.1, peak: 0.2 });
    setTimeout(() => this._tone({ type: 'square', freq: 440, freqEnd: 660, dur: 0.12, peak: 0.2 }), 100);
  }
  playHit() {
    this._tone({ type: 'sawtooth', freq: 220, freqEnd: 60, dur: 0.25, attack: 0.005, decay: 0.05, release: 0.3, peak: 0.3, filterFreq: 800 });
    setTimeout(() => this._tone({ type: 'square', freq: 110, freqEnd: 40, dur: 0.18, attack: 0.005, decay: 0.05, release: 0.2, peak: 0.18 }), 80);
  }
  playDogBark() {
    this._tone({ type: 'sawtooth', freq: 380, freqEnd: 200, dur: 0.12, peak: 0.25, filterFreq: 1200 });
    setTimeout(() => this._tone({ type: 'sawtooth', freq: 320, freqEnd: 180, dur: 0.12, peak: 0.25, filterFreq: 1200 }), 140);
  }
  playStart() {
    if (!this.ctx) return;
    [523.25, 659.25, 783.99].forEach((f, i) => {
      setTimeout(() => this._tone({ type: 'sine', freq: f, dur: 0.12, attack: 0.01, decay: 0.04, release: 0.12, peak: 0.22 }), i * 90);
    });
  }
  playDash() {
    if (!this.ctx) return;
    this._tone({ type: 'sawtooth', freq: 200, freqEnd: 1200, dur: 0.3, peak: 0.18, filterFreq: 2000 });
    setTimeout(() => this._tone({ type: 'triangle', freq: 600, freqEnd: 1400, dur: 0.2, peak: 0.16 }), 80);
  }
  playShield() {
    this._tone({ type: 'sine', freq: 700, freqEnd: 1200, dur: 0.15, peak: 0.2 });
  }
  playShieldBreak() {
    if (!this.ctx) return;
    this._tone({ type: 'square', freq: 800, freqEnd: 200, dur: 0.2, peak: 0.22 });
  }
  playPerfect() {
    if (!this.ctx) return;
    [880, 1100, 1320, 1760].forEach((f, i) => {
      setTimeout(() => this._tone({ type: 'sine', freq: f, dur: 0.1, attack: 0.005, decay: 0.02, release: 0.08, peak: 0.16 }), i * 50);
    });
  }
  playCombo(n) {
    if (!this.ctx) return;
    const f = 660 + Math.min(n, 30) * 20;
    this._tone({ type: 'triangle', freq: f, freqEnd: f * 1.5, dur: 0.08, peak: 0.2 });
  }
  playMission() {
    if (!this.ctx) return;
    [523, 659, 784, 1047].forEach((f, i) => {
      setTimeout(() => this._tone({ type: 'triangle', freq: f, dur: 0.15, attack: 0.005, decay: 0.04, release: 0.12, peak: 0.18 }), i * 80);
    });
  }
  playEventWarn() {
    this._tone({ type: 'sine', freq: 440, dur: 0.1, peak: 0.18 });
    setTimeout(() => this._tone({ type: 'sine', freq: 440, dur: 0.1, peak: 0.18 }), 200);
  }
  playBristle() {
    this._tone({ type: 'sawtooth', freq: 300, freqEnd: 500, dur: 0.15, peak: 0.2, filterFreq: 1500 });
  }
}

/* ==========================================================================
 *  5. InputManager
 * ========================================================================== */
class InputManager {
  constructor(game) {
    this.game = game;
    this.keys = {};
    this.justPressed = {};
    this.touchStartY = null;
    this.touchStartX = null;
    this.touchStartT = 0;
    this._bind();
  }

  _bind() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.code;
      this.keys[k] = true;
      this.justPressed[k] = true;
      this._handleKey(k);
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    const canvas = this.game.canvas;
    canvas.addEventListener('pointerdown', (e) => this._onPointerDown(e));
    canvas.addEventListener('pointerup', (e) => this._onPointerUp(e));
    canvas.addEventListener('pointercancel', () => this._resetTouch());
    canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    // 鼠标左键 = 跳跃（在 canvas 上）
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        if (this.game.state === 'ready' || this.game.state === 'gameOver') {
          this.game.start();
        } else if (this.game.state === 'playing') {
          this.justPressed['MouseLeft'] = true;
          this.justPressed['Space'] = true;  // 空格等价
        }
      }
    });
    window.addEventListener('blur', () => {
      if (this.game.state === 'playing') this.game.pause();
    });
  }

  clearJustPressed() { this.justPressed = {}; }
  consume(key) {
    const v = this.justPressed[key];
    if (v) this.justPressed[key] = false;
    return v;
  }
  isDown(key) { return !!this.keys[key]; }

  _handleKey(k) {
    const g = this.game;
    if (k === 'Space' || k === 'ArrowUp') {
      if (g.state === 'ready') g.start();
      else if (g.state === 'gameOver') g.start();
    } else if (k === 'KeyR') {
      if (g.state === 'playing' || g.state === 'paused' || g.state === 'gameOver') g.start();
    } else if (k === 'KeyP' || k === 'Escape') {
      if (g.state === 'playing') g.pause();
      else if (g.state === 'paused') g.resume();
    } else if (k === 'KeyM') {
      g.toggleMute();
    }
  }

  _onPointerDown(e) {
    if (e.target && e.target.closest && e.target.closest('button')) return;
    this.touchStartX = e.clientX;
    this.touchStartY = e.clientY;
    this.touchStartT = performance.now();
    const g = this.game;
    if (g.state === 'ready') {
      g.start();
      this.justPressed['TouchJump'] = true;
    } else if (g.state === 'gameOver') {
      g.start();
    } else if (g.state === 'playing') {
      this.justPressed['TouchJump'] = true;
      this.justPressed['Space'] = true;
    }
  }

  _onPointerUp(e) {
    if (this.touchStartY === null) return;
    const dy = e.clientY - this.touchStartY;
    const dt = performance.now() - this.touchStartT;
    const g = this.game;
    if (dy > 30 && dt < 500 && g.state === 'playing') {
      this.justPressed['TouchSlide'] = true;
      this.justPressed['ArrowDown'] = true;
    }
    this._resetTouch();
  }

  _resetTouch() {
    this.touchStartX = this.touchStartY = null;
  }
}

/* ==========================================================================
 *  6. ParticleSystem - 粒子池（尘土、速度线、护盾碎片等）
 * ========================================================================== */
class ParticleSystem {
  constructor() {
    this.particles = [];
    this.maxParticles = 80;
  }

  spawnDust(x, y, count = 4) {
    for (let i = 0; i < count && this.particles.length < this.maxParticles; i++) {
      this.particles.push({
        kind: 'dust',
        x: x + Utils.rand(-6, 6),
        y: y + Utils.rand(-2, 2),
        vx: Utils.rand(-50, 50),
        vy: Utils.rand(-120, -40),
        life: 0.4,
        maxLife: 0.4,
        size: Utils.rand(2, 4),
        color: 'rgba(220, 200, 170, 0.7)',
      });
    }
  }

  spawnSpark(x, y, count = 6, color = '#FFD93D') {
    for (let i = 0; i < count && this.particles.length < this.maxParticles; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = Utils.rand(80, 200);
      this.particles.push({
        kind: 'spark',
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.4,
        maxLife: 0.4,
        size: Utils.rand(2, 4),
        color,
      });
    }
  }

  spawnSpeedLine() {
    if (this.particles.length >= this.maxParticles) return;
    this.particles.push({
      kind: 'speedline',
      x: Utils.rand(0, Config.LOGIC_W),
      y: Utils.rand(0, Config.LOGIC_H),
      vx: Utils.rand(-300, -100),
      vy: 0,
      life: 0.3,
      maxLife: 0.3,
      size: Utils.rand(20, 50),
      color: 'rgba(166, 227, 240, 0.6)',
    });
  }

  spawnShieldBreak(x, y) {
    for (let i = 0; i < 16 && this.particles.length < this.maxParticles; i++) {
      const a = (i / 16) * Math.PI * 2;
      const sp = Utils.rand(100, 200);
      this.particles.push({
        kind: 'shieldbreak',
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.6,
        maxLife: 0.6,
        size: Utils.rand(3, 6),
        color: '#4FC3F7',
      });
    }
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.vy += 600 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  draw(ctx) {
    for (const p of this.particles) {
      const a = p.life / p.maxLife;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      if (p.kind === 'speedline') {
        ctx.fillRect(p.x, p.y, p.size, 2);
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  clear() { this.particles.length = 0; }
}

/* ==========================================================================
 *  7. Background - 多层视差 + 三层楼面
 * ========================================================================== */
class Background {
  constructor() {
    this.farBuildings = [];
    for (let i = 0; i < 10; i++) {
      this.farBuildings.push({
        x: i * 200 + Math.random() * 50,
        h: 120 + Math.random() * 100,
        w: 140 + Math.random() * 60,
        color: `hsl(${30 + Math.random() * 20}, 35%, ${68 + Math.random() * 10}%)`,
      });
    }
    this.t = 0;
  }

  update(dt, worldX) {
    this.worldX = worldX;
    this.t += dt;
  }

  draw(ctx, worldX) {
    // 天空渐变
    const skyGrad = ctx.createLinearGradient(0, 0, 0, Config.LANE_Y.lower + 30);
    skyGrad.addColorStop(0, '#A6E3F0');
    skyGrad.addColorStop(0.55, '#FFE5A8');
    skyGrad.addColorStop(0.85, '#FFD9A0');
    skyGrad.addColorStop(1, '#C8A87E');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, Config.LOGIC_W, Config.LANE_Y.lower + 30);

    // 太阳
    const sunX = 720 - (worldX * 0.05) % Config.LOGIC_W;
    ctx.fillStyle = '#FFE066';
    ctx.beginPath();
    ctx.arc(sunX, 80, 38, 0, Math.PI * 2);
    ctx.fill();

    // 云
    this._drawClouds(ctx, worldX * 0.1);

    // 远楼
    this._drawFarBuildings(ctx, worldX * 0.2);

    // 中楼（按三 lane 标线）
    this._drawMidBuildings(ctx, worldX * 0.5);

    // 前景楼（最近）
    this._drawForeground(ctx, worldX * 0.85);

    // 地面装饰
    this._drawGroundDecor(ctx, worldX);
  }

  _drawClouds(ctx, scrollX) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    for (let i = 0; i < 5; i++) {
      const baseX = i * 280 - (scrollX % 1400);
      const x = ((baseX % 1400) + 1400) % 1400 - 140;
      const y = 60 + (i % 2) * 30;
      ctx.beginPath();
      ctx.arc(x, y, 18, 0, Math.PI * 2);
      ctx.arc(x + 22, y - 4, 22, 0, Math.PI * 2);
      ctx.arc(x + 48, y, 18, 0, Math.PI * 2);
      ctx.arc(x + 24, y + 8, 16, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawFarBuildings(ctx, scrollX) {
    for (const b of this.farBuildings) {
      const x = ((b.x - scrollX) % 2200 + 2200) % 2200 - 200;
      ctx.fillStyle = b.color;
      ctx.fillRect(x, Config.LANE_Y.lower + 30 - b.h, b.w, b.h);
      ctx.fillStyle = 'rgba(255, 220, 130, 0.4)';
      for (let wy = 10; wy < b.h - 20; wy += 30) {
        for (let wx = 12; wx < b.w - 12; wx += 28) {
          ctx.fillRect(x + wx, Config.LANE_Y.lower + 30 - b.h + wy, 8, 12);
        }
      }
    }
  }

  _drawMidBuildings(ctx, scrollX) {
    // 在 lane=middle (y=420) 附近绘制楼层
    const baseY = Config.LANE_Y.lower + 30;
    ctx.fillStyle = Config.COLORS.buildingMid;
    ctx.fillRect(0, baseY - 200, Config.LOGIC_W, 200);
    // 三层窗户带（对应 upper/middle/lower lane 视觉）
    // upper lane 带
    this._drawWindowBand(ctx, 0, Config.LANE_Y.upper - 50, Config.LOGIC_W, 50, scrollX, 'upper');
    // middle lane 带
    this._drawWindowBand(ctx, 0, Config.LANE_Y.middle - 50, Config.LOGIC_W, 50, scrollX, 'middle');
    // lower lane 带
    this._drawWindowBand(ctx, 0, Config.LANE_Y.lower - 30, Config.LOGIC_W, 30, scrollX, 'lower');
  }

  _drawWindowBand(ctx, x, y, w, h, scrollX, lane) {
    // 视差：不同 lane 不同滚动速度
    const parallax = lane === 'upper' ? 0.45 : lane === 'middle' ? 0.5 : 0.55;
    const sx = -((scrollX * parallax) % 100);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.fillStyle = Config.COLORS.buildingNear;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = lane === 'lower' ? '#A8784E' : '#9C7B5A';
    ctx.fillRect(x, y, w, 3);
    // 窗户阵列
    for (let i = -1; i < 12; i++) {
      const wx = sx + i * 100;
      const ww = 60, wh = h - 12;
      ctx.fillStyle = Config.COLORS.windowFrame;
      ctx.fillRect(wx, y + 6, ww, wh);
      ctx.fillStyle = lane === 'lower' ? '#A6D8E8' : '#8FD0E8';
      ctx.fillRect(wx + 2, y + 8, ww - 4, wh - 4);
      // 窗户条纹
      ctx.fillStyle = Config.COLORS.windowFrame;
      ctx.fillRect(wx + ww / 2 - 1, y + 8, 2, wh - 4);
      // 上层窗户常有晾衣杆
      if (lane === 'upper') {
        ctx.strokeStyle = '#5A4220';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(wx + 4, y + wh + 6);
        ctx.lineTo(wx + ww - 4, y + wh + 6);
        ctx.stroke();
      }
      // 下层窗户常挂空调
      if (lane === 'lower') {
        ctx.fillStyle = Config.COLORS.ac;
        ctx.fillRect(wx + ww - 18, y + wh + 4, 14, 8);
      }
    }
    ctx.restore();
  }

  _drawForeground(ctx, scrollX) {
    // 阳台栏杆装饰在 middle lane 附近
    const y = Config.LANE_Y.middle - 4;
    ctx.fillStyle = '#7E6244';
    ctx.fillRect(0, y - 4, Config.LOGIC_W, 4);
    ctx.fillStyle = '#5A4220';
    ctx.fillRect(0, y - 4, Config.LOGIC_W, 1);
  }

  _drawGroundDecor(ctx, worldX) {
    // 下层地面（lowest lane 之下）
    const g = ctx.createLinearGradient(0, Config.LANE_Y.lower, 0, Config.LOGIC_H);
    g.addColorStop(0, '#7E6244');
    g.addColorStop(0.2, '#9C7B5A');
    g.addColorStop(1, '#6B4F30');
    ctx.fillStyle = g;
    ctx.fillRect(0, Config.LANE_Y.lower, Config.LOGIC_W, Config.LOGIC_H - Config.LANE_Y.lower);
  }
}

/* ==========================================================================
 *  8. Platform / PlatformManager - 三层路线平台
 * ========================================================================== */

class Platform {
  constructor(lane, x, w) {
    this.lane = lane;            // 'upper' / 'middle' / 'lower'
    this.x = x;
    this.w = w;
    this.y = Config.LANE_Y[lane];
    this.h = 14;                  // 平台厚度
    this.dead = false;
    // 平台表面类型（视觉装饰差异）
    this.surface = ['plank', 'tile', 'metal'][Math.floor(Math.random() * 3)];
  }

  getHitbox() {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }

  update(dt, speed) {
    this.x -= speed * dt;
    if (this.x + this.w < -50) this.dead = true;
  }

  // 给玩家落地用的"地面 Y"：玩家站在平台顶面
  getTopY() { return this.y; }

  draw(ctx) {
    const colors = {
      plank: { top: '#FFE5B0', body: '#C49A6C', dark: '#8E6A48' },
      tile: { top: '#D9B68A', body: '#A8784E', dark: '#6B4F30' },
      metal: { top: '#C8D0D8', body: '#8A929A', dark: '#5A626A' },
    };
    const c = colors[this.surface];
    // 主体
    ctx.fillStyle = c.body;
    ctx.fillRect(this.x, this.y, this.w, this.h);
    // 顶面
    ctx.fillStyle = c.top;
    ctx.fillRect(this.x, this.y, this.w, 2);
    // 暗边
    ctx.fillStyle = c.dark;
    ctx.fillRect(this.x, this.y + this.h - 1, this.w, 1);
    // 装饰：木纹/瓷砖/铆钉
    if (this.surface === 'plank') {
      ctx.strokeStyle = c.dark;
      ctx.lineWidth = 0.6;
      for (let i = 16; i < this.w - 4; i += 16) {
        ctx.beginPath();
        ctx.moveTo(this.x + i, this.y + 2);
        ctx.lineTo(this.x + i, this.y + this.h);
        ctx.stroke();
      }
    } else if (this.surface === 'tile') {
      ctx.fillStyle = c.dark;
      for (let i = 4; i < this.w - 4; i += 12) {
        ctx.fillRect(this.x + i, this.y + 4, 1, this.h - 6);
      }
    } else if (this.surface === 'metal') {
      ctx.fillStyle = c.dark;
      for (let i = 4; i < this.w; i += 18) {
        ctx.fillRect(this.x + i, this.y + this.h - 3, 1.5, 2);
      }
    }
    // lane 标签：上层用暖色高亮、下层用冷色
    if (this.lane === 'upper') {
      ctx.fillStyle = 'rgba(255, 255, 200, 0.4)';
      ctx.fillRect(this.x, this.y, this.w, 1);
    } else if (this.lane === 'lower') {
      ctx.fillStyle = 'rgba(100, 130, 160, 0.4)';
      ctx.fillRect(this.x, this.y, this.w, 1);
    }
  }
}

class PlatformManager {
  constructor() {
    this.platforms = [];
    this.gaps = [];        // 真正的缺口（玩家会落下）
    this.nextXByLane = {
      upper: Config.LOGIC_W + 100,
      middle: Config.LOGIC_W + 100,
      lower: Config.LOGIC_W + 200,
    };
    // 启动时生成初始平台，确保玩家不会一开始掉下去
    this._initStartPlatforms();
  }

  _initStartPlatforms() {
    // 中层第一段要覆盖玩家起始位置
    this.platforms.push(new Platform('middle', 0, 500));
    this.platforms.push(new Platform('middle', 500, 360));
    // 上层第一段
    this.platforms.push(new Platform('upper', 200, 220));
    this.platforms.push(new Platform('upper', 600, 180));
    // 下层第一段
    this.platforms.push(new Platform('lower', 350, 200));
    this.nextXByLane = {
      upper: 780,
      middle: 860,
      lower: 550,
    };
  }

  reset() {
    this.platforms.length = 0;
    this.gaps.length = 0;
    this.nextXByLane = {
      upper: Config.LOGIC_W + 100,
      middle: Config.LOGIC_W + 100,
      lower: Config.LOGIC_W + 200,
    };
    this._initStartPlatforms();
  }

  update(dt, speed, worldX) {
    // 移动所有平台
    for (const p of this.platforms) p.update(dt, speed);
    for (const g of this.gaps) { g.x -= speed * dt; if (g.x + g.w < -50) g.dead = true; }
    // 移除已离开屏幕的
    for (let i = this.platforms.length - 1; i >= 0; i--) {
      if (this.platforms[i].dead) this.platforms.splice(i, 1);
    }
    for (let i = this.gaps.length - 1; i >= 0; i--) {
      if (this.gaps[i].dead) this.gaps.splice(i, 1);
    }
    // 按 lane 持续生成
    this._spawnLane('upper', worldX);
    this._spawnLane('middle', worldX);
    this._spawnLane('lower', worldX);
  }

  _spawnLane(lane, worldX) {
    const ahead = worldX + Config.LOGIC_W + 600;
    while (this.nextXByLane[lane] < ahead) {
      const [wMin, wMax] = Config.PLATFORM_WIDTH[lane];
      const [gMin, gMax] = Config.PLATFORM_GAP[lane];
      let w = Utils.rand(wMin, wMax);
      let gap = Utils.rand(gMin, gMax);
      // lower lane 在 distance > 400 时偶尔生成真实缺口
      if (lane === 'lower' && Math.random() < 0.06) {
        // 真实缺口：玩家无法站立
        this.gaps.push({ x: this.nextXByLane[lane], w: gap, y: Config.LANE_Y.lower, h: 14, lane, dead: false });
        this.nextXByLane[lane] += w + gap;
        continue;
      }
      this.platforms.push(new Platform(lane, this.nextXByLane[lane], w));
      this.nextXByLane[lane] += w + gap;
    }
  }

  // 返回玩家位置 X 处最近的平台顶面 Y（可能是 null 表示无地面）
  groundYAt(worldX) {
    let bestY = null;
    let bestDist = Infinity;
    for (const p of this.platforms) {
      if (worldX >= p.x - 8 && worldX <= p.x + p.w + 8) {
        const d = Math.abs(worldX - (p.x + p.w / 2));
        if (d < bestDist) { bestDist = d; bestY = p.getTopY(); }
      }
    }
    return bestY;
  }

  // 返回指定 lane 上玩家位置 X 处的平台顶面 Y（缺口处返回 null）
  groundYAtForLane(screenX, lane) {
    // 先检查是否在该 lane 的缺口内
    for (const g of this.gaps) {
      if (g.lane === lane && screenX >= g.x && screenX <= g.x + g.w) return null;
    }
    let bestY = null;
    let bestDist = Infinity;
    for (const p of this.platforms) {
      if (p.lane !== lane) continue;
      if (screenX >= p.x - 8 && screenX <= p.x + p.w + 8) {
        const d = Math.abs(screenX - (p.x + p.w / 2));
        if (d < bestDist) { bestDist = d; bestY = p.getTopY(); }
      }
    }
    return bestY;
  }

  // 玩家脚底 X 范围内是否有平台（用于落地判定）
  playerOverPlatform(playerXWorld, playerW) {
    const left = playerXWorld;
    const right = playerXWorld + playerW;
    for (const p of this.platforms) {
      if (Utils.rangeOverlap(left, right, p.x, p.x + p.w)) {
        return p;
      }
    }
    return null;
  }

  draw(ctx) {
    // 先画 lane=lower（背景），再 middle，再 upper（前景）
    for (const p of this.platforms) if (p.lane === 'lower') p.draw(ctx);
    for (const p of this.platforms) if (p.lane === 'middle') p.draw(ctx);
    for (const p of this.platforms) if (p.lane === 'upper') p.draw(ctx);
    // 缺口视觉：先画背景，再画边缘警示
    for (const g of this.gaps) {
      // 阴影底色
      ctx.fillStyle = '#3A2A1A';
      ctx.fillRect(g.x, g.y, g.w, g.h);
      // 锯齿/破损边缘
      ctx.fillStyle = '#7E6244';
      ctx.fillRect(g.x, g.y, g.w, 2);
      // 警示标
      ctx.strokeStyle = '#FF3B30';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(g.x, g.y - 2, g.w, g.h + 2);
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255, 60, 60, 0.7)';
      ctx.font = '11px sans-serif';
      ctx.fillText('⚠️', g.x + g.w / 2 - 6, g.y - 4);
    }
  }
}

// 工具：在 Game 中用到（worldX 推进到屏幕外的距离）
function worldX_Ahead(worldX) {
  return worldX + Config.LOGIC_W + 600;
}

/* ==========================================================================
 *  9. Obstacle / ObstacleManager - 基础障碍（6 类）
 *  --------------------------------------------------------------------------
 *  Obstacle 是常驻在平台上的固定障碍，区别于 EventManager 的瞬时事件。
 *  - broom / bucket / flowerpot / windowClosed：撞击增加危险度
 *  - dogZone：地面 = 进入增加危险度
 *  - brokenBalcony：缺口（视觉上平台被掏空，玩家踩上去会掉落）
 * ========================================================================== */

class Obstacle {
  constructor(type, lane, x, y, w, h) {
    this.type = type;
    this.lane = lane;
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.dead = false;
    this.t = 0;
    this.dmgHeavy = (type === 'dogZone');   // 狗区 = 重伤
  }

  getHitbox() {
    // 视情况留 hitboxInset
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }

  update(dt, speed) {
    this.x -= speed * dt;
    this.t += dt;
    if (this.x + this.w < -50) this.dead = true;
  }

  draw(ctx) {
    switch (this.type) {
      case 'broom':         this._drawBroom(ctx); break;
      case 'bucket':        this._drawBucket(ctx); break;
      case 'flowerpot':     this._drawFlowerpot(ctx); break;
      case 'windowClosed':  this._drawWindowClosed(ctx); break;
      case 'dogZone':       this._drawDogZone(ctx); break;
    }
  }

  _drawBroom(ctx) {
    // 倾斜的扫把
    ctx.save();
    ctx.translate(this.x + this.w / 2, this.y + this.h);
    ctx.rotate(-0.2);
    ctx.fillStyle = Config.COLORS.broom;
    ctx.fillRect(-2, -this.h + 8, 4, this.h - 8);    // 杆
    ctx.fillStyle = '#D9A55B';
    ctx.beginPath();
    ctx.moveTo(-7, 0);
    ctx.lineTo(7, 0);
    ctx.lineTo(3, 14);
    ctx.lineTo(-3, 14);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  _drawBucket(ctx) {
    // 水桶
    const c = Config.COLORS.bucket;
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(this.x + 2, this.y);
    ctx.lineTo(this.x + this.w - 2, this.y);
    ctx.lineTo(this.x + this.w - 6, this.y + this.h);
    ctx.lineTo(this.x + 6, this.y + this.h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#5A6470';
    ctx.fillRect(this.x + 2, this.y, this.w - 4, 3);     // 桶口
    // 水波
    ctx.fillStyle = '#A6D8E8';
    ctx.fillRect(this.x + 6, this.y + 4, this.w - 12, 3);
    // 把手
    ctx.strokeStyle = '#5A6470';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(this.x + this.w / 2, this.y, this.w / 2 + 2, Math.PI, 0);
    ctx.stroke();
  }

  _drawFlowerpot(ctx) {
    // 花盆 + 花
    const c = Config.COLORS.pot;
    ctx.fillStyle = c;
    ctx.fillRect(this.x + 2, this.y + 14, this.w - 4, this.h - 14);
    ctx.fillStyle = '#9C5E2A';
    ctx.fillRect(this.x, this.y + 12, this.w, 4);
    // 花
    ctx.fillStyle = '#FF6B9D';
    ctx.beginPath();
    ctx.arc(this.x + this.w / 2 - 4, this.y + 6, 4, 0, Math.PI * 2);
    ctx.arc(this.x + this.w / 2 + 4, this.y + 6, 4, 0, Math.PI * 2);
    ctx.arc(this.x + this.w / 2, this.y + 2, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = Config.COLORS.plant;
    ctx.fillRect(this.x + this.w / 2 - 1, this.y + 6, 2, 8);
  }

  _drawWindowClosed(ctx) {
    // 关窗（上 lane 的窗户关闭）
    ctx.fillStyle = Config.COLORS.windowFrame;
    ctx.fillRect(this.x, this.y, this.w, this.h);
    ctx.fillStyle = '#9DBED1';
    ctx.fillRect(this.x + 3, this.y + 3, this.w - 6, this.h - 6);
    ctx.fillStyle = Config.COLORS.windowFrame;
    ctx.fillRect(this.x + this.w / 2 - 1, this.y + 3, 2, this.h - 6);
    ctx.fillRect(this.x + 3, this.y + this.h / 2 - 1, this.w - 6, 2);
  }

  _drawDogZone(ctx) {
    // 危险区段（红色斜线区域）
    ctx.save();
    ctx.globalAlpha = 0.35 + Math.sin(this.t * 8) * 0.1;
    ctx.fillStyle = Config.COLORS.dogZone;
    ctx.fillRect(this.x, this.y, this.w, this.h);
    // 斜纹
    ctx.strokeStyle = 'rgba(255, 80, 80, 0.7)';
    ctx.lineWidth = 2;
    for (let i = -this.h; i < this.w; i += 14) {
      ctx.beginPath();
      ctx.moveTo(this.x + i, this.y);
      ctx.lineTo(this.x + i + this.h, this.y + this.h);
      ctx.stroke();
    }
    ctx.restore();
    // 狗爪印
    ctx.fillStyle = '#3A2010';
    ctx.font = '14px sans-serif';
    ctx.fillText('🐕', this.x + 4, this.y + 16);
    ctx.fillText('⚠️', this.x + this.w - 22, this.y + 16);
  }
}

class ObstacleManager {
  constructor() {
    this.obstacles = [];
    this._nextSpawn = { upper: 600, middle: 700, lower: 900 };
  }

  reset() {
    this.obstacles.length = 0;
    this._nextSpawn = { upper: 600, middle: 700, lower: 900 };
  }

  // 每帧生成检查
  update(dt, speed, worldX, distance) {
    for (const o of this.obstacles) o.update(dt, speed);
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      if (this.obstacles[i].dead) this.obstacles.splice(i, 1);
    }
    // 按 lane 生成
    this._spawnLane('upper', worldX, distance);
    this._spawnLane('middle', worldX, distance);
    this._spawnLane('lower', worldX, distance);
  }

  _spawnLane(lane, worldX, distance) {
    while (this._nextSpawn[lane] < worldX + Config.LOGIC_W + 300) {
      const obstacleType = this._pickObstacleType(lane, distance);
      if (!obstacleType) {
        this._nextSpawn[lane] += Utils.rand(180, 320);
        continue;
      }
      const o = this._build(obstacleType, this._nextSpawn[lane], lane);
      this.obstacles.push(o);
      // 间距
      const gap = this._gapFor(obstacleType, lane);
      this._nextSpawn[lane] += gap;
    }
  }

  _pickObstacleType(lane, distance) {
    // 距离越远，可解锁的事件越多
    const candidates = [];
    // 基础四类：所有 lane
    if (lane === 'middle' || lane === 'lower') candidates.push({ value: 'broom', weight: 2 });
    if (lane === 'middle' || lane === 'lower') candidates.push({ value: 'bucket', weight: 2 });
    if (lane === 'upper' || lane === 'lower') candidates.push({ value: 'flowerpot', weight: 2 });
    if (lane === 'upper') candidates.push({ value: 'windowClosed', weight: 1.5 });
    if (lane === 'middle') candidates.push({ value: 'dogZone', weight: distance > 800 ? 1.5 : 0 });
    return Utils.pickWeighted(candidates);
  }

  _gapFor(type, lane) {
    if (type === 'dogZone') return Utils.rand(220, 360);
    if (type === 'windowClosed') return Utils.rand(180, 260);
    return Utils.rand(160, 260);
  }

  _build(type, x, lane) {
    const y = Config.LANE_Y[lane];
    switch (type) {
      case 'broom':
        return new Obstacle(type, lane, x, y - 56, 8, 56);
      case 'bucket':
        return new Obstacle(type, lane, x, y - 40, 28, 40);
      case 'flowerpot':
        return new Obstacle(type, lane, x, y - 40, 26, 40);
      case 'windowClosed':
        return new Obstacle(type, lane, x, y - 60, 50, 60);
      case 'dogZone':
        return new Obstacle(type, lane, x, y - 70, 90, 70);
      default:
        return new Obstacle(type, lane, x, y - 40, 30, 40);
    }
  }

  draw(ctx) {
    // 按 y 排序：上面 lane 的先画（中层最前）
    const sorted = [...this.obstacles].sort((a, b) => a.y - b.y);
    for (const o of sorted) o.draw(ctx);
  }
}

/* ==========================================================================
 * 10. GameEvent / EventManager - 6 种随机事件
 *  --------------------------------------------------------------------------
 *  每种事件都有 warnTime 预警，事件触发前玩家能看到视觉警示。
 *  - fallingFlowerpot：1.0s 预警，从屏幕上方掉下
 *  - extendingBroom：0.5s 预警，横向扫过
 *  - swayingClothesline：1.5s 预警，踩上后 2.0s 断裂
 *  - acWind：1.0s 预警，把玩家向上推
 *  - dogZone：持续警告区（与基础 dogZone 区别：更宽更亮）
 *  - closingWindow：1.5s 预警，窗户缓慢关闭
 * ========================================================================== */

class GameEvent {
  constructor(type, worldX, lane) {
    this.type = type;
    this.lane = lane;
    this.x = worldX;
    this.y = Config.LANE_Y[lane];
    this.t = 0;
    this.warnTime = Config.EVENT_WARN_TIME[type] || 1.0;
    this.dead = false;
    this.triggered = false;
    this.w = this._defaultW();
    this.h = this._defaultH();
    this.dmgHeavy = false;
    this.active = false;   // 预警完成后进入触发态
  }

  _defaultW() {
    switch (this.type) {
      case 'fallingFlowerpot':   return 24;
      case 'extendingBroom':     return 80;
      case 'swayingClothesline': return 100;
      case 'acWind':             return 80;
      case 'dogZone':            return 120;
      case 'closingWindow':      return 50;
      default:                   return 60;
    }
  }

  _defaultH() {
    switch (this.type) {
      case 'fallingFlowerpot':   return 24;
      case 'extendingBroom':     return 8;
      case 'swayingClothesline': return 6;
      case 'acWind':             return 50;
      case 'dogZone':            return 70;
      case 'closingWindow':      return 60;
      default:                   return 40;
    }
  }

  // 是否已解锁（基于距离）
  static isUnlocked(type, distance) {
    return distance >= (Config.EVENT_UNLOCK_DIST[type] || 0);
  }

  update(dt, speed, distance) {
    this.x -= speed * dt;
    this.t += dt;
    if (!this.active && this.t >= this.warnTime) {
      this.active = true;
      this._onTrigger();
    }
    if (this.x + this.w < -50) this.dead = true;
    this._customUpdate(dt);
  }

  _customUpdate() {}

  _onTrigger() {}

  getHitbox() {
    if (!this.active) return null;
    return { x: this.x, y: this.y - this.h, w: this.w, h: this.h };
  }

  draw(ctx) {
    const alpha = this.active ? 1 : (0.5 + 0.5 * (1 - this.t / this.warnTime));
    ctx.globalAlpha = alpha;
    switch (this.type) {
      case 'fallingFlowerpot':   this._drawFallingFlowerpot(ctx); break;
      case 'extendingBroom':     this._drawExtendingBroom(ctx); break;
      case 'swayingClothesline': this._drawSwayingClothesline(ctx); break;
      case 'acWind':             this._drawAcWind(ctx); break;
      case 'dogZone':            this._drawDogZone(ctx); break;
      case 'closingWindow':      this._drawClosingWindow(ctx); break;
    }
    ctx.globalAlpha = 1;
  }

  _drawFallingFlowerpot(ctx) {
    // 顶部预警：阴影
    if (!this.active) {
      ctx.save();
      ctx.globalAlpha = (Math.sin(this.t * 20) + 1) * 0.3;
      ctx.fillStyle = 'rgba(60, 30, 10, 0.6)';
      ctx.beginPath();
      ctx.ellipse(this.x + this.w / 2, this.y + 2, this.w / 2 + 4, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // 花盆本体（从屏幕上方落下 y=-100 → this.y）
    const dropY = this.active ? (this.y - 30 + Math.sin(this.t * 4) * 4) : (-50 + this.t * 80);
    ctx.fillStyle = Config.COLORS.pot;
    ctx.fillRect(this.x + 4, dropY + 16, this.w - 8, 14);
    ctx.fillStyle = '#9C5E2A';
    ctx.fillRect(this.x + 2, dropY + 12, this.w - 4, 4);
    ctx.fillStyle = '#FF6B9D';
    ctx.beginPath();
    ctx.arc(this.x + this.w / 2 - 3, dropY + 6, 3, 0, Math.PI * 2);
    ctx.arc(this.x + this.w / 2 + 3, dropY + 6, 3, 0, Math.PI * 2);
    ctx.arc(this.x + this.w / 2, dropY + 2, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawExtendingBroom(ctx) {
    // 从右向左伸长的扫把
    const len = this.active ? this.w : (this.t / this.warnTime) * this.w;
    const x0 = this.x + this.w;
    ctx.fillStyle = Config.COLORS.broom;
    ctx.fillRect(x0 - len, this.y - this.h / 2 - 2, len, 4);
    // 把手在右边
    ctx.fillStyle = '#5A4220';
    ctx.fillRect(x0 + 4, this.y - this.h / 2 - 6, 4, 12);
  }

  _drawSwayingClothesline(ctx) {
    // 晃动的晾衣杆
    const sway = this.active ? Math.sin(this.t * 6) * 4 : Math.sin(this.t * 3) * 2;
    ctx.strokeStyle = '#5A4220';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.quadraticCurveTo(this.x + this.w / 2, this.y + sway, this.x + this.w, this.y);
    ctx.stroke();
    // 衣架
    ctx.fillStyle = '#C49A6C';
    for (let i = 0; i < 3; i++) {
      const cx = this.x + this.w * (i + 1) / 4;
      ctx.fillRect(cx - 2, this.y + sway - 4, 4, 4);
      ctx.fillStyle = i % 2 === 0 ? '#FF8A3D' : '#4FC3F7';
      ctx.fillRect(cx - 3, this.y + sway, 6, 10);
      ctx.fillStyle = '#C49A6C';
    }
  }

  _drawAcWind(ctx) {
    // 空调喷风
    ctx.save();
    ctx.fillStyle = 'rgba(174, 213, 230, 0.7)';
    ctx.beginPath();
    ctx.ellipse(this.x + this.w / 2, this.y - this.h / 2, this.w / 2, this.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    // 风线
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const off = (this.t * 200 + i * 30) % 80;
      ctx.globalAlpha = 1 - off / 80;
      ctx.beginPath();
      ctx.moveTo(this.x + 10 + i * 20, this.y - off * 0.5);
      ctx.quadraticCurveTo(this.x + 10 + i * 20, this.y - off * 0.5 - 8,
                           this.x + 30 + i * 20, this.y - off * 0.5);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawDogZone(ctx) {
    // 与基础 dogZone 类似，但更宽更亮
    ctx.save();
    ctx.globalAlpha = 0.4 + Math.sin(this.t * 6) * 0.15;
    ctx.fillStyle = '#FF3B30';
    ctx.fillRect(this.x, this.y - this.h, this.w, this.h);
    ctx.strokeStyle = 'rgba(255, 60, 60, 0.8)';
    ctx.lineWidth = 2;
    for (let i = -this.h; i < this.w; i += 12) {
      ctx.beginPath();
      ctx.moveTo(this.x + i, this.y - this.h);
      ctx.lineTo(this.x + i + this.h, this.y);
      ctx.stroke();
    }
    ctx.restore();
    ctx.font = '14px sans-serif';
    ctx.fillText('🐕⚠️', this.x + 4, this.y - 10);
  }

  _drawClosingWindow(ctx) {
    // 窗户缓慢关闭
    const open = this.active ? Math.max(0, 1 - (this.t - this.warnTime) * 1.5) : 1;
    ctx.fillStyle = Config.COLORS.windowFrame;
    ctx.fillRect(this.x, this.y - this.h, this.w, this.h);
    // 两扇窗叶
    const half = this.w / 2;
    const gap = open * half * 0.9;
    ctx.fillStyle = '#9DBED1';
    ctx.fillRect(this.x, this.y - this.h + 2, half - gap, this.h - 4);
    ctx.fillRect(this.x + half + gap, this.y - this.h + 2, half - gap, this.h - 4);
    ctx.fillStyle = Config.COLORS.windowFrame;
    ctx.fillRect(this.x + half - 1, this.y - this.h + 2, 2, this.h - 4);
  }
}

class EventManager {
  constructor() {
    this.events = [];
    this._nextTime = { upper: 4, middle: 3, lower: 5 };   // 距离开局多久后开始尝试生成
  }

  reset() {
    this.events.length = 0;
    this._nextTime = { upper: 4, middle: 3, lower: 5 };
  }

  update(dt, speed, distance) {
    for (const e of this.events) e.update(dt, speed, distance);
    for (let i = this.events.length - 1; i >= 0; i--) {
      if (this.events[i].dead) this.events.splice(i, 1);
    }
    // 尝试生成
    for (const lane of Config.LANE_NAMES) {
      this._trySpawn(lane, dt, distance);
    }
  }

  _trySpawn(lane, dt, distance) {
    this._nextTime[lane] -= dt;
    if (this._nextTime[lane] > 0) return;
    // 解锁的事件
    const candidates = [];
    for (const type of ['fallingFlowerpot', 'extendingBroom', 'swayingClothesline',
                       'acWind', 'dogZone', 'closingWindow']) {
      if (GameEvent.isUnlocked(type, distance)) {
        // lane 适配
        const compat = {
          fallingFlowerpot: ['upper'],
          extendingBroom: ['middle'],
          swayingClothesline: ['upper'],
          acWind: ['lower'],
          dogZone: ['middle'],
          closingWindow: ['upper'],
        };
        if (compat[type].includes(lane)) candidates.push({ value: type, weight: 1 });
      }
    }
    if (candidates.length === 0) {
      this._nextTime[lane] = 2;
      return;
    }
    const type = Utils.pickWeighted(candidates);
    const x = distance + Config.LOGIC_W + 100;  // 在屏幕右外
    this.events.push(new GameEvent(type, x, lane));
    this._nextTime[lane] = Utils.rand(4, 9);
  }

  draw(ctx) {
    for (const e of this.events) e.draw(ctx);
  }
}

/* ==========================================================================
 * 11. Collectible / CollectibleManager - 鱼干 / 金鱼干 / 罐头
 * ========================================================================== */

class Collectible {
  constructor(type, x, y) {
    this.type = type;        // 'fish' | 'fishGold' | 'can'
    this.x = x;
    this.y = y;
    this.w = 22;
    this.h = 22;
    this.t = 0;
    this.dead = false;
    this.swayOffset = Math.random() * Math.PI * 2;
  }

  getHitbox() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }

  update(dt, speed) {
    this.x -= speed * dt;
    this.t += dt;
    if (this.x + this.w < -30) this.dead = true;
  }

  draw(ctx) {
    const sway = Math.sin(this.t * 4 + this.swayOffset) * 4;
    const yy = this.y + sway;
    if (this.type === 'fish')        this._drawFish(ctx, this.x, yy, '#FFC247', '#E89A20');
    else if (this.type === 'fishGold') this._drawFish(ctx, this.x, yy, '#FFD700', '#FFA500');
    else if (this.type === 'can')    this._drawCan(ctx, this.x, yy);
  }

  _drawFish(ctx, x, y, c1, c2) {
    // 鱼身体
    ctx.fillStyle = c1;
    ctx.beginPath();
    ctx.ellipse(x + 11, y + 11, 11, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    // 鱼尾
    ctx.beginPath();
    ctx.moveTo(x + 22, y + 11);
    ctx.lineTo(x + 30, y + 4);
    ctx.lineTo(x + 30, y + 18);
    ctx.closePath();
    ctx.fillStyle = c2;
    ctx.fill();
    // 鱼眼
    ctx.fillStyle = '#2A2018';
    ctx.beginPath();
    ctx.arc(x + 6, y + 9, 1.8, 0, Math.PI * 2);
    ctx.fill();
    // 高光
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.beginPath();
    ctx.ellipse(x + 9, y + 8, 4, 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawCan(ctx, x, y) {
    // 罐头
    ctx.fillStyle = Config.COLORS.can;
    ctx.fillRect(x + 2, y + 2, 18, 18);
    ctx.fillStyle = Config.COLORS.canDark;
    ctx.fillRect(x + 2, y + 2, 18, 3);
    ctx.fillRect(x + 2, y + 17, 18, 3);
    // 标签
    ctx.fillStyle = '#FFE5B0';
    ctx.fillRect(x + 3, y + 7, 16, 7);
    ctx.fillStyle = '#2A2018';
    ctx.font = 'bold 8px sans-serif';
    ctx.fillText('🐟', x + 6, y + 14);
  }
}

class CollectibleManager {
  constructor() {
    this.collectibles = [];
    this._lastFishSpawn = { upper: 0, middle: 0, lower: 0 };
    this._lastCanSpawn = 0;
  }

  reset() {
    this.collectibles.length = 0;
    this._lastFishSpawn = { upper: 0, middle: 0, lower: 0 };
    this._lastCanSpawn = 0;
  }

  update(dt, speed, distance) {
    for (const c of this.collectibles) c.update(dt, speed);
    for (let i = this.collectibles.length - 1; i >= 0; i--) {
      if (this.collectibles[i].dead) this.collectibles.splice(i, 1);
    }
    // 自动生成鱼干
    for (const lane of Config.LANE_NAMES) {
      if (distance - this._lastFishSpawn[lane] > Utils.rand(8, 14)) {
        this._spawnFishGroup(lane, distance);
        this._lastFishSpawn[lane] = distance;
      }
    }
    // 罐头（每 30 秒约 1 个）
    if (distance - this._lastCanSpawn > 30 + Math.random() * 10) {
      this._spawnCan(distance);
      this._lastCanSpawn = distance;
    }
  }

  _spawnFishGroup(lane, distance) {
    const x = distance + Config.LOGIC_W + Utils.rand(40, 120);
    const y = Config.LANE_Y[lane] - Utils.rand(20, 60);
    const isUpper = lane === 'upper';
    // 50% 概率金鱼干在上层
    if (isUpper && Math.random() < 0.5) {
      this.collectibles.push(new Collectible('fishGold', x, y));
    } else {
      this.collectibles.push(new Collectible('fish', x, y));
      // 50% 概率再来一个
      if (Math.random() < 0.5) {
        this.collectibles.push(new Collectible('fish', x + 28, y + Utils.rand(-12, 12)));
      }
    }
  }

  _spawnCan(distance) {
    const lane = Utils.pickWeighted([
      { value: 'middle', weight: 1 },
      { value: 'lower', weight: 1 },
    ]);
    const x = distance + Config.LOGIC_W + 60;
    const y = Config.LANE_Y[lane] - 30;
    this.collectibles.push(new Collectible('can', x, y));
  }

  draw(ctx) {
    // y 排序（下方 lane 先画）
    const sorted = [...this.collectibles].sort((a, b) => b.y - a.y);
    for (const c of sorted) c.draw(ctx);
  }
}

/* ==========================================================================
 * 12. CatStateSystem - 6 种状态
 * ========================================================================== */

class CatStateSystem {
  constructor(game) {
    this.game = game;
    this.state = 'normal';
    this.timeLeft = 999;
    this._listeners = [];
  }

  setState(newState, duration = null) {
    // dash / shield 不被普通状态打断
    if ((this.state === 'dash' || this.state === 'shield') && newState !== 'shield') {
      // shield 可被覆盖
      if (this.state === 'shield' && newState === 'shield') {
        this.timeLeft = Math.max(this.timeLeft, duration || 999);
        return;
      }
      return;
    }
    this.state = newState;
    this.timeLeft = duration !== null ? duration : (Config.STATE_DURATIONS[newState] || 999);
    for (const l of this._listeners) l(newState, this.timeLeft);
  }

  consumeShield() {
    if (this.state === 'shield') {
      this.setState('normal');
      return true;
    }
    return false;
  }

  isDash() { return this.state === 'dash'; }
  isShield() { return this.state === 'shield'; }
  isBristling() { return this.state === 'bristling'; }
  isGreedy() { return this.state === 'greedy'; }
  isAgile() { return this.state === 'agile'; }

  // 当前状态对玩家属性的影响
  getJumpMult() { return this.isAgile() ? 1.3 : 1.0; }
  getSpeedMult() { return this.isDash() ? Config.DASH_SPEED_MULT : (this.isBristling() ? 1.1 : 1.0); }
  isInvincible() { return this.isDash(); }
  getMagnetRadius() { return this.isGreedy() ? 80 : 0; }

  onChange(fn) { this._listeners.push(fn); }

  update(dt) {
    if (this.state === 'normal' || this.state === 'shield') return;
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.setState('normal');
    }
  }
}

/* ==========================================================================
 * 13. DogChaseSystem - 狗追逐 + 危险度
 * ========================================================================== */

class DogChaseSystem {
  constructor(game) {
    this.game = game;
    this.danger = 0;     // 0-100
  }

  reset() { this.danger = 0; }

  add(amount, reason = '') {
    if (this.game.stateSystem && this.game.stateSystem.isInvincible()) {
      return;   // 冲刺无敌
    }
    if (this.game.stateSystem && this.game.stateSystem.consumeShield()) {
      this.game.audio.playShieldBreak();
      this.game.particles.spawnShieldBreak(this.game.player.x + this.game.player.w / 2, this.game.player.y);
      return;
    }
    this.danger = Utils.clamp(this.danger + amount, 0, 100);
    if (this.danger >= 100) {
      this.game.gameOver();
    }
  }

  decay(amount) {
    this.danger = Utils.clamp(this.danger - amount, 0, 100);
  }

  update(dt) {
    // 冲刺时狗被甩开（distance += DOG_DECAY_DASH）
    if (this.game.stateSystem && this.game.stateSystem.isDash()) {
      this.decay(Config.DOG_DECAY_DASH * dt / 3);  // 3s 内匀速减 30
    }
    // 狗画面震动（80%+ 时）
    if (this.danger >= 80) {
      this.game.shakeT = Math.max(this.game.shakeT, 0.08);
    }
  }
}

/* ==========================================================================
 * 14. MissionSystem - 短目标任务
 *  --------------------------------------------------------------------------
 *  10 个模板，每局随机抽 3 个
 * ========================================================================== */

const MISSION_TEMPLATES = [
  { id: 'collect_fish',    title: '收集鱼干', target: 12, reward: { type: 'score', value: 80 } },
  { id: 'collect_gold',    title: '收集金鱼干', target: 3, reward: { type: 'score', value: 100 } },
  { id: 'combo_8',         title: '达成 8 连击', target: 8, reward: { type: 'multiplier', value: 0.5 } },
  { id: 'distance_300',    title: '奔跑 300 米', target: 300, reward: { type: 'energy', value: 50 } },
  { id: 'distance_500',    title: '奔跑 500 米', target: 500, reward: { type: 'score', value: 200 } },
  { id: 'upper_lane_100',  title: '上层奔跑 100 米', target: 100, reward: { type: 'score', value: 100 } },
  { id: 'lower_lane_50',   title: '使用下层 50 米', target: 50, reward: { type: 'score', value: 80 } },
  { id: 'perfect_3',       title: '完美落地 3 次', target: 3, reward: { type: 'danger', value: -20 } },
  { id: 'dash_once',       title: '触发冲刺 1 次', target: 1, reward: { type: 'energy', value: 50 } },
  { id: 'dodge_flowerpot', title: '躲过 5 个花盆', target: 5, reward: { type: 'score', value: 80 } },
];

class Mission {
  constructor(template) {
    this.id = template.id;
    this.title = template.title;
    this.target = template.target;
    this.current = 0;
    this.completed = false;
    this.reward = template.reward;
  }

  progress() { return Math.min(this.current / this.target, 1); }

  add(n = 1) {
    if (this.completed) return;
    this.current = Math.min(this.current + n, this.target);
    if (this.current >= this.target) this.completed = true;
  }

  set(n) {
    if (this.completed) return;
    this.current = Utils.clamp(n, 0, this.target);
    if (this.current >= this.target) this.completed = true;
  }
}

class MissionSystem {
  constructor(game) {
    this.game = game;
    this.missions = [];
  }

  reset() {
    this.missions.length = 0;
    const pool = [...MISSION_TEMPLATES];
    // 抽 3 个不重复的
    for (let i = 0; i < Config.MISSION_POOL_SIZE && pool.length > 0; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      this.missions.push(new Mission(pool[idx]));
      pool.splice(idx, 1);
    }
  }

  update() {
    // 同步各任务的 current 值
    const p = this.game.player;
    const dist = this.game.distance;
    for (const m of this.missions) {
      if (m.completed) continue;
      switch (m.id) {
        case 'collect_fish':    m.set(this.game.fishCollected); break;
        case 'collect_gold':    m.set(this.game.goldCollected); break;
        case 'combo_8':         m.set(this.game.bestCombo); break;
        case 'distance_300':    m.set(dist >= 300 ? 300 : 0); break;
        case 'distance_500':    m.set(dist >= 500 ? 500 : 0); break;
        case 'upper_lane_100':  m.set(Math.floor(p.upperDistance)); break;
        case 'lower_lane_50':   m.set(Math.floor(p.lowerDistance)); break;
        case 'perfect_3':       m.set(this.game.perfectLandings); break;
        case 'dash_once':       m.set(this.game.dashCount > 0 ? 1 : 0); break;
        case 'dodge_flowerpot': m.set(this.game.flowerpotsDodged); break;
      }
    }
  }

  // 检查是否有任务刚完成，触发奖励
  checkComplete(onComplete) {
    for (const m of this.missions) {
      if (m.completed && !m._rewarded) {
        m._rewarded = true;
        onComplete(m);
      }
    }
  }
}

/* ==========================================================================
 * 15. CollisionSystem - 跨 lane 落地 + 实体碰撞 + 收集
 * ========================================================================== */

class CollisionSystem {
  constructor(game) {
    this.game = game;
  }

  // 检查玩家与平台/障碍/事件/收集物的交互
  update() {
    const p = this.game.player;
    // 遍历三层 lane，找玩家脚下的 ground（必须满足 vy >= 0 即下落状态）
    const sx = Config.PLAYER_X + p.w / 2;
    let groundY = null;
    let groundLane = p.lane;
    for (const lane of Config.LANE_NAMES) {
      const g = this.game.platforms.groundYAtForLane(sx, lane);
      if (g === null) continue;
      // 玩家脚底已到达或低于该 ground，且正在下落
      if (p.y + p.h >= g - 4 && p.vy >= 0) {
        if (groundY === null || g > groundY) {  // 选最高的 ground（最近脚下）
          groundY = g;
          groundLane = lane;
        }
      }
    }
    // 落地检测
    const wasInAir = p.vy > 0;
    if (groundY !== null) {
      if (wasInAir) {
        p.lane = groundLane;
        this._onLand(groundY);
      }
    } else if (p.y > Config.LOGIC_H + 50) {
      // 掉出屏幕
      this.game.gameOver();
    }
    // 实体碰撞（障碍 + 事件 + 收集物）
    this._checkEntities();
  }

  _onLand(groundY) {
    const p = this.game.player;
    p.y = groundY - p.h;
    p.vy = 0;
    p.onGround = true;
    if (p.justJumped) {
      // 完美落地
      const dt = p.t - p.lastJumpT;
      if (dt < Config.PERFECT_LANDING_WINDOW) {
        this.game.onPerfectLanding();
      }
      p.justJumped = false;
    }
    this.game.particles.spawnDust(Config.PLAYER_X + p.w / 2, p.y + p.h, 4);
    // 危险度衰减
    this.game.dog.decay(Config.DOG_DECAY_LANDING);
  }

  _checkEntities() {
    const p = this.game.player;
    const px = Config.PLAYER_X + Config.HITBOX_INSET;
    const py = p.y + Config.HITBOX_INSET;
    const pw = p.w - Config.HITBOX_INSET * 2;
    const ph = p.h - Config.HITBOX_INSET * 2;
    const playerBox = { x: px, y: py, w: pw, h: ph };

    // 障碍
    const playerLane = p.lane;
    for (const o of this.game.obstacles.obstacles) {
      if (o.dead || o.hit) continue;
      // 跨 lane 过滤：只碰撞与玩家同 lane 的障碍
      if (o.lane && o.lane !== playerLane) continue;
      const hb = o.getHitbox();
      if (Utils.aabb(playerBox, hb)) {
        o.hit = true;            // 标记已撞，后续帧跳过
        o.dead = true;           // 一次性：撞击后消失（视觉反馈 + 不重复扣血）
        const dmg = o.dmgHeavy ? Config.DAMAGE_HEAVY : Config.DAMAGE_LIGHT;
        this.game.dog.add(dmg, o.type);
        if (this.game.audio) this.game.audio.playHit();
        this.game.shakeT = Config.SHAKE_DURATION;
        if (o.type === 'dogZone') {
          this.game.stateSystem.setState('bristling');
          this.game.audio.playBristle();
        }
      }
    }

    // 事件
    for (const ev of this.game.events.events) {
      if (ev.dead || !ev.active) continue;
      const hb = ev.getHitbox();
      if (!hb) continue;
      if (Utils.aabb(playerBox, hb)) {
        switch (ev.type) {
          case 'fallingFlowerpot':
            this.game.dog.add(Config.DAMAGE_FLOWERPOT, 'fallingFlowerpot');
            this.game.audio.playHit();
            this.game.shakeT = Config.SHAKE_DURATION;
            ev.dead = true;
            break;
          case 'extendingBroom':
            this.game.dog.add(Config.DAMAGE_LIGHT, 'extendingBroom');
            this.game.audio.playHit();
            ev.dead = true;
            break;
          case 'swayingClothesline':
            // 踩上去额外受一次伤
            this.game.dog.add(Config.DAMAGE_LIGHT, 'clothesline');
            break;
          case 'acWind':
            // 把玩家向上推
            p.vy = Math.min(p.vy, -500);
            this.game.audio.playShield();
            break;
          case 'dogZone':
            this.game.dog.add(Config.DAMAGE_DOGZONE, 'dogZoneEvent');
            this.game.stateSystem.setState('bristling');
            this.game.audio.playBristle();
            this.game.audio.playDogBark();
            break;
          case 'closingWindow':
            this.game.dog.add(Config.DAMAGE_HEAVY, 'closingWindow');
            this.game.audio.playHit();
            this.game.shakeT = Config.SHAKE_DURATION;
            ev.dead = true;
            break;
        }
      }
    }

    // 收集物
    for (const c of this.game.collectibles.collectibles) {
      if (c.dead) continue;
      if (Utils.aabb(playerBox, c.getHitbox())) {
        c.dead = true;
        this._onCollect(c);
      }
    }
  }

  _onCollect(c) {
    const g = this.game;
    if (c.type === 'fish') {
      g.fishCollected++;
      g.score += 5;
      g.energy = Utils.clamp(g.energy + Config.ENERGY_PER_FISH, 0, Config.ENERGY_MAX);
      g.dog.decay(Config.DOG_DECAY_FISH);
      g.combo++;
      g.comboT = Config.COMBO_WINDOW;
      g.bestCombo = Math.max(g.bestCombo, g.combo);
      if (g.audio) g.audio.playCoin();
      g.ui.spawnFloater('+5', c.x + c.w / 2, c.y, '#FFC247');
      g.ui.spawnFloater('⚡+' + Config.ENERGY_PER_FISH, c.x + c.w / 2, c.y + 20, '#A6E3F0', 0.8);
    } else if (c.type === 'fishGold') {
      g.goldCollected++;
      g.score += 25;
      g.energy = Utils.clamp(g.energy + Config.ENERGY_PER_GOLD, 0, Config.ENERGY_MAX);
      g.dog.decay(Config.DOG_DECAY_GOLD);
      g.combo += 2;
      g.comboT = Config.COMBO_WINDOW;
      g.bestCombo = Math.max(g.bestCombo, g.combo);
      if (g.audio) g.audio.playGoldCoin();
      g.ui.spawnFloater('+25 🐟', c.x + c.w / 2, c.y, '#FFD700');
      g.ui.spawnFloater('⚡+' + Config.ENERGY_PER_GOLD, c.x + c.w / 2, c.y + 20, '#A6E3F0', 0.8);
    } else if (c.type === 'can') {
      g.cansCollected++;
      g.score += 10;
      // 罐头：直接获得护盾 5 秒
      g.stateSystem.setState('shield', 5);
      g.dog.decay(30);
      if (g.audio) g.audio.playCan();
      g.ui.spawnFloater('🛡️ 护盾', c.x + c.w / 2, c.y, '#4FC3F7');
    }
    // 8 连击 → 馋猫状态
    if (g.combo >= 8) {
      g.stateSystem.setState('greedy');
    }
    // combo 音效
    if (g.combo >= 3 && g.audio) g.audio.playCombo(g.combo);
    // combo 浮字
    if (g.combo >= 5) {
      const mult = Utils.comboMult(g.combo);
      if (mult > 1) g.ui.spawnFloater(`连击 x${mult.toFixed(1)}`, c.x + c.w / 2, c.y - 20, '#FF8A3D');
    }
  }
}

/* ==========================================================================
 * 16. Player
 * ========================================================================== */

class Player {
  constructor() {
    this.x = Config.PLAYER_X;     // 屏幕 X（不动）
    this.worldX = 0;              // 世界 X（推进）
    this.w = Config.PLAYER_W;
    this.h = Config.PLAYER_H;
    this.y = Config.LANE_Y.middle - this.h;
    this.vy = 0;
    this.onGround = true;
    this.jumpCount = 0;
    this.sliding = false;
    this.slideT = 0;
    this.lane = 'middle';         // 由脚底 y 坐标每帧更新
    this.t = 0;
    this.justJumped = false;
    this.lastJumpT = -10;
    this.upperDistance = 0;       // 上层奔跑累计米
    this.lowerDistance = 0;       // 下层奔跑累计米
    this.animPhase = 0;
  }

  jump(stateSystem) {
    if (this.onGround) {
      this.vy = Config.JUMP_V * (stateSystem && stateSystem.isAgile() ? stateSystem.getJumpMult() : 1);
      this.onGround = false;
      this.jumpCount = 1;
      this.justJumped = true;
      this.lastJumpT = this.t;
      return 'first';
    } else if (this.jumpCount < 2) {
      this.vy = Config.JUMP2_V * (stateSystem && stateSystem.isAgile() ? stateSystem.getJumpMult() : 1);
      this.jumpCount = 2;
      this.justJumped = true;
      this.lastJumpT = this.t;
      return 'double';
    }
    return null;
  }

  slideStart() {
    if (!this.onGround) return;
    this.sliding = true;
    this.slideT = Config.SLIDE_DURATION;
    this.h = Config.PLAYER_SLIDE_H;
  }

  slideUpdate(dt) {
    if (!this.sliding) return;
    this.slideT -= dt;
    if (this.slideT <= 0) {
      this.sliding = false;
      this.h = Config.PLAYER_H;
    }
  }

  update(dt, speed, stateSystem) {
    this.t += dt;
    this.worldX += speed * dt * (stateSystem ? stateSystem.getSpeedMult() : 1);
    // 重力
    this.vy += Config.GRAVITY * dt;
    this.y += this.vy * dt;
    // 滑动
    this.slideUpdate(dt);
    // 动画相位
    this.animPhase += dt * (this.onGround ? 12 : 6);
    // lane 由脚底 y 坐标驱动 —— 自动跨层
    this.lane = Utils.getLaneByY(this.y + this.h);
  }

  draw(ctx, stateSystem) {
    const state = stateSystem ? stateSystem.state : 'normal';
    const timeLeft = stateSystem ? stateSystem.timeLeft : 0;
    let bodyColor = Config.COLORS.cat;
    let dark = Config.COLORS.catDark;
    // 状态变色
    if (state === 'bristling') bodyColor = Config.COLORS.catBristle;
    if (state === 'dash')      bodyColor = Config.COLORS.catDash;
    if (state === 'shield') {
      // 蓝白光圈
      ctx.save();
      ctx.globalAlpha = 0.4 + Math.sin(this.t * 6) * 0.1;
      ctx.strokeStyle = Config.COLORS.catShield;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(this.x + this.w / 2, this.y + this.h / 2, this.w * 0.9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    if (state === 'dash') {
      // 残影
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = Config.COLORS.catDash;
      ctx.fillRect(this.x - 18, this.y, this.w, this.h);
      ctx.restore();
    }

    // 身体
    const x = this.x, y = this.y;
    if (this.sliding) {
      // 蹲伏：扁扁的身体
      ctx.fillStyle = bodyColor;
      ctx.fillRect(x + 4, y + 4, this.w - 8, this.h - 4);
      ctx.fillStyle = dark;
      ctx.fillRect(x + 4, y + this.h - 4, this.w - 8, 4);
      // 头
      ctx.fillStyle = bodyColor;
      ctx.beginPath();
      ctx.arc(x + this.w - 8, y + 6, 8, 0, Math.PI * 2);
      ctx.fill();
      // 耳朵
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.moveTo(x + this.w - 14, y + 1);
      ctx.lineTo(x + this.w - 10, y - 4);
      ctx.lineTo(x + this.w - 6, y + 1);
      ctx.closePath();
      ctx.fill();
      // 眼睛
      ctx.fillStyle = Config.COLORS.catEye;
      ctx.beginPath();
      ctx.arc(x + this.w - 10, y + 6, 1.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // 身体
      const bob = this.onGround ? Math.sin(this.animPhase) * 1.2 : 0;
      ctx.fillStyle = bodyColor;
      ctx.fillRect(x + 4, y + 12 + bob, this.w - 8, this.h - 14);
      // 头
      ctx.beginPath();
      ctx.arc(x + this.w / 2, y + 12 + bob, 11, 0, Math.PI * 2);
      ctx.fill();
      // 耳朵
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.moveTo(x + this.w / 2 - 10, y + 5 + bob);
      ctx.lineTo(x + this.w / 2 - 6, y - 2 + bob);
      ctx.lineTo(x + this.w / 2 - 2, y + 5 + bob);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + this.w / 2 + 2, y + 5 + bob);
      ctx.lineTo(x + this.w / 2 + 6, y - 2 + bob);
      ctx.lineTo(x + this.w / 2 + 10, y + 5 + bob);
      ctx.closePath();
      ctx.fill();
      // 眼睛
      ctx.fillStyle = Config.COLORS.catEye;
      ctx.beginPath();
      ctx.arc(x + this.w / 2 - 4, y + 11 + bob, 1.8, 0, Math.PI * 2);
      ctx.arc(x + this.w / 2 + 4, y + 11 + bob, 1.8, 0, Math.PI * 2);
      ctx.fill();
      // 鼻子
      ctx.fillStyle = '#FF6B9D';
      ctx.fillRect(x + this.w / 2 - 1, y + 14 + bob, 2, 1.5);
      // 肚子
      ctx.fillStyle = Config.COLORS.catBelly;
      ctx.fillRect(x + 8, y + 18 + bob, this.w - 16, this.h - 22);
      // 四腿（跑步摆动）
      if (this.onGround) {
        const legPhase = Math.sin(this.animPhase * 2);
        ctx.fillStyle = bodyColor;
        ctx.fillRect(x + 7, y + this.h - 8 + legPhase * 3, 5, 8);
        ctx.fillRect(x + this.w - 12, y + this.h - 8 - legPhase * 3, 5, 8);
      }
      // 尾巴
      ctx.strokeStyle = bodyColor;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x + 6, y + 20 + bob);
      const tailSway = Math.sin(this.animPhase * 2) * 6;
      ctx.quadraticCurveTo(x - 4, y + 14 + bob + tailSway, x - 2, y + 8 + bob + tailSway);
      ctx.stroke();
      // 炸毛时毛发
      if (state === 'bristling') {
        ctx.strokeStyle = Config.COLORS.catBristle;
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 6; i++) {
          const a = -Math.PI / 2 + (i - 2.5) * 0.25;
          ctx.beginPath();
          ctx.moveTo(x + this.w / 2 + Math.cos(a) * 11, y + 12 + bob + Math.sin(a) * 11);
          ctx.lineTo(x + this.w / 2 + Math.cos(a) * 16, y + 12 + bob + Math.sin(a) * 16);
          ctx.stroke();
        }
      }
      // 馋猫眼睛放光
      if (state === 'greedy') {
        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.arc(x + this.w / 2 - 4, y + 11 + bob, 3.2, 0, Math.PI * 2);
        ctx.arc(x + this.w / 2 + 4, y + 11 + bob, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

/* ==========================================================================
 * 17. UIManager - DOM HUD + 浮字 + 状态切换提示
 * ========================================================================== */

class UIManager {
  constructor(game) {
    this.game = game;
    this.elScore = document.getElementById('hud-score');
    this.elDistance = document.getElementById('hud-distance');
    this.elFish = document.getElementById('hud-fish');
    this.elCombo = document.getElementById('hud-combo');
    this.elEnergy = document.getElementById('energy-fill');
    this.elDangerFill = document.getElementById('danger-bar-fill');
    this.elDangerWarn = document.getElementById('danger-warn');
    this.elDangerOverlay = document.getElementById('danger-overlay');
    this.elStateBadge = document.getElementById('state-badge');
    this.elStateIcon = document.getElementById('state-icon');
    this.elStateName = document.getElementById('state-name');
    this.elFloaters = document.getElementById('floaters');
    this.elStateAnnounce = document.getElementById('state-announce');
    this.elMissionAnnounce = document.getElementById('mission-announce');
    this.elMissions = document.getElementById('missions');
    this.elMute = document.getElementById('btn-mute');
    this.elPause = document.getElementById('btn-pause');
    this.elReadyBest = document.getElementById('ready-best');
    this.elReadyTotalFish = document.getElementById('ready-total-fish');
    this.elGoScore = document.getElementById('go-score');
    this.elGoDistance = document.getElementById('go-distance');
    this.elGoFish = document.getElementById('go-fish');
    this.elGoCombo = document.getElementById('go-combo');
    this.elGoMissions = document.getElementById('go-missions');
    this.elGoBest = document.getElementById('go-best');
    this.elGoNewbest = document.getElementById('go-newbest');
    this.elPanelReady = document.getElementById('panel-ready');
    this.elPanelPaused = document.getElementById('panel-paused');
    this.elPanelGameover = document.getElementById('panel-gameover');
    this.elPanelLoading = document.getElementById('panel-loading');
    this.elHud = document.getElementById('hud');
    this._lastState = null;
    this._lastDanger = -1;
  }

  update() {
    const g = this.game;
    // HUD 数值
    if (this.elScore) this.elScore.textContent = g.score;
    if (this.elDistance) this.elDistance.textContent = Math.floor(g.distance) + 'm';
    if (this.elFish) this.elFish.textContent = g.fishCollected + g.goldCollected + g.cansCollected;
    if (this.elCombo) {
      const mult = Utils.comboMult(g.combo);
      this.elCombo.textContent = g.combo > 0 ? `x${mult.toFixed(1)} (${g.combo})` : 'x1';
    }
    if (this.elEnergy) {
      this.elEnergy.style.width = (g.energy / Config.ENERGY_MAX * 100) + '%';
      if (g.energy >= Config.ENERGY_MAX) this.elEnergy.classList.add('full');
      else this.elEnergy.classList.remove('full');
    }
    // 危险度
    const dangerPct = Math.floor(g.dog.danger);
    if (this.elDangerFill) this.elDangerFill.style.height = dangerPct + '%';
    if (Math.floor(g.dog.danger) !== this._lastDanger) {
      this._lastDanger = Math.floor(g.dog.danger);
      // 颜色
      let color = '#4CAF50';
      if (g.dog.danger >= 70) color = '#F44336';
      else if (g.dog.danger >= 40) color = '#FFC107';
      if (this.elDangerFill) this.elDangerFill.style.background = color;
      if (this.elDangerWarn) {
        if (g.dog.danger >= 50) this.elDangerWarn.classList.remove('hidden');
        else this.elDangerWarn.classList.add('hidden');
      }
      if (this.elDangerOverlay) {
        if (g.dog.danger >= 50) this.elDangerOverlay.classList.add('warn');
        else this.elDangerOverlay.classList.remove('warn');
      }
    }
    // 状态徽章
    if (g.stateSystem.state !== this._lastState) {
      this._lastState = g.stateSystem.state;
      this._updateStateBadge();
    }
    // 任务卡
    this._renderMissions();
    // 静音按钮
    if (this.elMute) {
      this.elMute.textContent = g.audio.isMuted() ? '🔇' : '🔊';
    }
  }

  _updateStateBadge() {
    const s = this.game.stateSystem.state;
    const icon = Config.STATE_ICONS[s] || '🐾';
    const name = Config.STATE_NAMES[s] || '正常';
    if (this.elStateIcon) this.elStateIcon.textContent = icon;
    if (this.elStateName) this.elStateName.textContent = name;
    if (this.elStateBadge) {
      if (s === 'normal') this.elStateBadge.classList.add('hidden');
      else this.elStateBadge.classList.remove('hidden');
      this.elStateBadge.dataset.state = s;
    }
    // 大字公告
    if (s !== 'normal') {
      this.announceState(name);
    }
  }

  _renderMissions() {
    if (!this.elMissions) return;
    const missions = this.game.missions.missions;
    let html = '';
    for (const m of missions) {
      const pct = Math.floor(m.progress() * 100);
      const done = m.completed;
      html += `<div class="mission-card ${done ? 'completed' : ''}">
        <div class="mission-title">${m.title}<span class="mission-check">✓</span></div>
        <div class="mission-progress"><div class="mission-progress-fill" style="width:${pct}%"></div></div>
        <div class="mission-text">${m.current}/${m.target}</div>
      </div>`;
    }
    this.elMissions.innerHTML = html;
  }

  spawnFloater(text, screenX, screenY, color = '#FFD93D', scale = 1) {
    if (!this.elFloaters) return;
    const el = document.createElement('div');
    el.className = 'floater';
    // 转换逻辑坐标 → 屏幕坐标
    const dpr = this.game._dpr || 1;
    const s = this.game._scale || 1;
    // canvas 在 body 中央居中，需要加上偏移
    const canvas = this.game.canvas;
    const rect = canvas.getBoundingClientRect();
    const offsetX = (window.innerWidth - rect.width) / 2;
    const offsetY = (window.innerHeight - rect.height) / 2;
    el.style.left = (offsetX + screenX * s) + 'px';
    el.style.top = (offsetY + screenY * s) + 'px';
    el.style.color = color;
    el.style.transform = `scale(${scale})`;
    el.textContent = text;
    this.elFloaters.appendChild(el);
    setTimeout(() => { el.classList.add('rise'); }, 10);
    setTimeout(() => { el.remove(); }, 1100);
  }

  announceState(name) {
    if (!this.elStateAnnounce) return;
    this.elStateAnnounce.textContent = name;
    this.elStateAnnounce.classList.remove('hidden');
    this.elStateAnnounce.classList.remove('show');
    void this.elStateAnnounce.offsetWidth;
    this.elStateAnnounce.classList.add('show');
    setTimeout(() => { this.elStateAnnounce.classList.add('hidden'); }, 1200);
  }

  announceMission(title) {
    if (!this.elMissionAnnounce) return;
    const textEl = this.elMissionAnnounce.querySelector('.ma-text');
    if (textEl) textEl.textContent = `任务完成 · ${title}`;
    this.elMissionAnnounce.classList.remove('hidden');
    this.elMissionAnnounce.classList.remove('show');
    void this.elMissionAnnounce.offsetWidth;
    this.elMissionAnnounce.classList.add('show');
    setTimeout(() => { this.elMissionAnnounce.classList.add('hidden'); }, 1600);
  }

  showPanel(name) {
    this.elPanelReady.classList.toggle('hidden', name !== 'ready');
    this.elPanelPaused.classList.toggle('hidden', name !== 'paused');
    this.elPanelGameover.classList.toggle('hidden', name !== 'gameOver');
    this.elPanelLoading.classList.toggle('hidden', name !== 'loading');
    if (name === 'playing') {
      this.elHud.classList.remove('hidden');
    } else {
      this.elHud.classList.add('hidden');
    }
  }

  setReadyStats() {
    if (this.elReadyBest) this.elReadyBest.textContent = StorageManager.getBest();
    if (this.elReadyTotalFish) this.elReadyTotalFish.textContent = StorageManager.getTotalFish();
  }

  setGameOverStats() {
    const g = this.game;
    if (this.elGoScore) this.elGoScore.textContent = g.score;
    if (this.elGoDistance) this.elGoDistance.textContent = Math.floor(g.distance) + 'm';
    if (this.elGoFish) this.elGoFish.textContent = g.fishCollected + g.goldCollected;
    if (this.elGoCombo) this.elGoCombo.textContent = g.bestCombo;
    if (this.elGoMissions) {
      const completed = g.missions.missions.filter(m => m.completed).length;
      this.elGoMissions.textContent = `${completed}/${g.missions.missions.length}`;
    }
    if (this.elGoBest) this.elGoBest.textContent = StorageManager.getBest();
    if (this.elGoNewbest) {
      if (g.score > StorageManager.getBest()) {
        this.elGoNewbest.classList.remove('hidden');
      } else {
        this.elGoNewbest.classList.add('hidden');
      }
    }
  }
}

/* ==========================================================================
 * 18. Game - 主循环 + 状态机
 * ========================================================================== */

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');
    this.state = 'loading';     // loading | ready | playing | paused | gameOver
    this.lastT = performance.now();
    this.worldX = 0;
    this.viewX = 0;             // 屏幕视差偏移
    this.distance = 0;          // 米
    this.speed = Config.SPEED_START;
    this.elapsed = 0;           // 本局用时
    this.score = 0;
    this.energy = 0;
    this.fishCollected = 0;
    this.goldCollected = 0;
    this.cansCollected = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.comboT = 0;
    this.dashCount = 0;
    this.perfectLandings = 0;
    this.flowerpotsDodged = 0;
    this.shakeT = 0;
    this.multiplier = 1;        // 任务奖励倍率
    this._lastDashTrigger = -999;

    this.audio = new AudioManager();
    this.input = new InputManager(this);
    this.particles = new ParticleSystem();
    this.background = new Background();
    this.platforms = new PlatformManager();
    this.obstacles = new ObstacleManager();
    this.events = new EventManager();
    this.collectibles = new CollectibleManager();
    this.player = new Player();
    this.stateSystem = new CatStateSystem(this);
    this.dog = new DogChaseSystem(this);
    this.missions = new MissionSystem(this);
    this.collisions = new CollisionSystem(this);
    this.ui = new UIManager(this);

    // DPR & 屏幕缩放
    this._dpr = 1;
    this._resize();
    // 桌面 resize + 移动端 visualViewport (iOS Safari 地址栏收起/展开)
    window.addEventListener('resize', () => this._resize());
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => this._resize());
      window.visualViewport.addEventListener('scroll', () => this._resize());
    }
    // 屏幕旋转延迟 100ms,等浏览器布局稳定
    window.addEventListener('orientationchange', () => {
      setTimeout(() => this._resize(), 100);
    });

    // 启动循环
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);

    // UI 事件绑定
    this._bindUI();

    // 显示 ready
    this._enterReady();
  }

  _resize() {
    const dpr = window.devicePixelRatio || 1;
    this._dpr = dpr;
    const w = Config.LOGIC_W, h = Config.LOGIC_H;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    // cover 模式:canvas CSS 尺寸填满视口,允许在竖屏轻微纵向拉伸以避免大幅 letterbox
    const aspect = w / h;  // 1.778
    const vw = window.innerWidth, vh = window.innerHeight;
    const vAspect = vw / vh;
    let cssW, cssH;
    if (vAspect > aspect) {
      // 视口更宽(横屏)→ 高填满,宽按比例
      cssH = vh;
      cssW = vh * aspect;
    } else {
      // 视口更窄(竖屏)→ 宽填满,高按比例
      cssW = vw;
      cssH = vw / aspect;
    }
    this.canvas.style.width = cssW + 'px';
    this.canvas.style.height = cssH + 'px';
    this._scale = cssW / w;  // 用于触屏坐标换算
  }

  _bindUI() {
    document.getElementById('btn-start').addEventListener('click', () => this.start());
    document.getElementById('btn-resume').addEventListener('click', () => this.resume());
    document.getElementById('btn-restart-paused').addEventListener('click', () => this.start());
    document.getElementById('btn-restart').addEventListener('click', () => this.start());
    document.getElementById('btn-mute').addEventListener('click', () => this.toggleMute());
    document.getElementById('btn-pause').addEventListener('click', () => {
      if (this.state === 'playing') this.pause();
      else if (this.state === 'paused') this.resume();
    });
  }

  // ----- 状态切换 -----
  _enterReady() {
    this.state = 'ready';
    this.ui.showPanel('ready');
    this.ui.setReadyStats();
  }

  start() {
    this.audio.unlock();
    this.audio.playStart();
    // 重置
    this.worldX = 0;
    this.viewX = 0;
    this.distance = 0;
    this.speed = Config.SPEED_START;
    this.elapsed = 0;
    this.score = 0;
    this.energy = 0;
    this.fishCollected = 0;
    this.goldCollected = 0;
    this.cansCollected = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.comboT = 0;
    this.dashCount = 0;
    this.perfectLandings = 0;
    this.flowerpotsDodged = 0;
    this.shakeT = 0;
    this.multiplier = 1;
    this.player = new Player();
    this.stateSystem = new CatStateSystem(this);
    this.platforms.reset();
    this.obstacles.reset();
    this.events.reset();
    this.collectibles.reset();
    this.particles.clear();
    this.dog.reset();
    this.missions.reset();
    this.state = 'playing';
    this.ui.showPanel('playing');
    StorageManager.addRun();
    this._lastT = performance.now();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.ui.showPanel('paused');
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.ui.showPanel('playing');
    this._lastT = performance.now();
  }

  gameOver() {
    if (this.state !== 'playing') return;
    this.audio.playDogBark();
    this.audio.playHit();
    this.state = 'gameOver';
    // 更新最高分
    const oldBest = StorageManager.getBest();
    if (this.score > oldBest) {
      StorageManager.setBest(this.score);
    }
    // 累计鱼干
    StorageManager.addTotalFish(this.fishCollected + this.goldCollected);
    this.ui.setGameOverStats();
    this.ui.showPanel('gameOver');
  }

  toggleMute() {
    const m = !this.audio.isMuted();
    this.audio.setMuted(m);
  }

  // ----- 主循环 -----
  _loop(now) {
    const dtRaw = (now - this._lastT) / 1000;
    this._lastT = now;
    const dt = Math.min(dtRaw, Config.DT_CLAMP);

    if (this.state === 'playing') {
      this._update(dt);
    }
    this._render();
    requestAnimationFrame(this._loop);
  }

  _update(dt) {
    this.elapsed += dt;
    // ----- 输入处理 -----
    this._handleInput();
    // 速度曲线
    const accel = this.elapsed < Config.EASY_DURATION ? Config.ACCEL_EARLY : Config.ACCEL_LATE;
    this.speed = Math.min(this.speed + accel * dt, Config.SPEED_MAX);
    // 推进世界
    this.worldX += this.speed * dt;
    this.distance = this.worldX / 32;  // 1 米 ≈ 32 像素
    // 玩家
    this.player.update(dt, this.speed, this.stateSystem);
    // 各管理器
    this.platforms.update(dt, this.speed, this.worldX);
    this.obstacles.update(dt, this.speed, this.worldX, this.distance);
    this.events.update(dt, this.speed, this.distance);
    this.collectibles.update(dt, this.speed, this.distance);
    this.particles.update(dt);
    // 状态、危险度
    this.stateSystem.update(dt);
    this.dog.update(dt);
    // combo 倒计时
    if (this.combo > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) this.combo = 0;
    }
    // 玩家距离统计（用 lane，仅在落地状态统计）
    if (this.player.onGround) {
      if (this.player.lane === 'upper') this.player.upperDistance += this.speed * dt / 32;
      if (this.player.lane === 'lower') this.player.lowerDistance += this.speed * dt / 32;
    }
    // 任务检查
    this.missions.update();
    this.missions.checkComplete(m => {
      this._grantMissionReward(m);
      this.ui.announceMission(m.title);
      this.audio.playMission();
    });
    // 碰撞
    this.collisions.update();
    // 冲刺期间生成速度线粒子
    if (this.stateSystem.isDash() && Math.random() < 0.5) {
      this.particles.spawnSpeedLine();
    }
    // 屏幕震动衰减
    if (this.shakeT > 0) this.shakeT -= dt;
    // 鱼干磁吸
    this._magnetCollect();
    // UI 更新
    this.ui.update();
  }

  _grantMissionReward(m) {
    const r = m.reward;
    switch (r.type) {
      case 'score':       this.score += r.value; break;
      case 'energy':      this.energy = Math.min(this.energy + r.value, Config.ENERGY_MAX); break;
      case 'danger':      this.dog.decay(Math.abs(r.value)); break;
      case 'multiplier':  this.multiplier += r.value; break;
      case 'shield':      this.stateSystem.setState('shield', r.value); break;
    }
  }

  _triggerDash() {
    this._lastDashTrigger = this.elapsed;
    this.dashCount++;
    this.stateSystem.setState('dash', Config.DASH_DURATION);
    this.energy = 0;
    this.dog.decay(Config.DASH_DOG_BOOST);
    this.audio.playDash();
  }

  _handleInput() {
    const inp = this.input;
    // 跳跃：空格 / ↑ / 触屏，绝不拦截为冲刺
    if (inp.consume('Space') || inp.consume('TouchJump')) {
      if (!this.stateSystem.isDash()) {
        const kind = this.player.jump(this.stateSystem);
        if (kind === 'first') {
          this.audio.playJump();
          this.particles.spawnDust(Config.PLAYER_X + this.player.w / 2, this.player.y + this.player.h, 3);
        } else if (kind === 'double') {
          this.audio.playDoubleJump();
          this.particles.spawnSpark(Config.PLAYER_X + this.player.w / 2, this.player.y + this.player.h, 5, '#FFD93D');
        }
      }
    }
    // 冲刺：X / Shift 独立按键（仅能量满时）
    const dashKey = inp.consume('KeyX') || inp.consume('KeyD') || inp.consume('ShiftLeft') || inp.consume('ShiftRight');
    if (dashKey
        && this.energy >= Config.DASH_ENERGY
        && !this.stateSystem.isDash()
        && this.elapsed - this._lastDashTrigger > 4) {
      this._triggerDash();
    }
    // 下滑
    if (inp.consume('ArrowDown') || inp.consume('TouchSlide')) {
      this.player.slideStart();
    }
    // 持续按住下滑
    if (inp.isDown('ArrowDown') || inp.isDown('KeyS')) {
      if (this.player.onGround) this.player.slideStart();
    }
  }

  _magnetCollect() {
    if (!this.stateSystem.isGreedy()) return;
    const p = this.player;
    const radius = 80;
    for (const c of this.collectibles.collectibles) {
      if (c.dead || c.type === 'can') continue;
      const dx = (c.x + c.w / 2) - (Config.PLAYER_X + p.w / 2);
      const dy = (c.y + c.h / 2) - (p.y + p.h / 2);
      const d2 = dx * dx + dy * dy;
      if (d2 < radius * radius) {
        const d = Math.sqrt(d2);
        if (d < 4) continue;
        const vx = -dx / d * 250;
        const vy = -dy / d * 250;
        c.x += vx * 0.016;
        c.y += vy * 0.016;
      }
    }
  }

  onPerfectLanding() {
    this.perfectLandings++;
    this.dog.decay(Config.DOG_DECAY_LANDING);
    this.ui.spawnFloater('完美!', Config.PLAYER_X + this.player.w / 2, this.player.y, '#FFD700');
    if (this.perfectLandings >= 3) {
      this.stateSystem.setState('agile');
    }
    if (this.audio) this.audio.playPerfect();
  }

  // ----- 渲染 -----
  _render() {
    const ctx = this.ctx;
    // 关键：每次 render 重置 transform，再应用 DPR + 屏幕震动
    ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
    // 清屏
    ctx.fillStyle = '#87CEEB';
    ctx.fillRect(0, 0, Config.LOGIC_W, Config.LOGIC_H);
    // 屏幕震动
    if (this.shakeT > 0) {
      const sx = (Math.random() - 0.5) * Config.SHAKE_AMOUNT;
      const sy = (Math.random() - 0.5) * Config.SHAKE_AMOUNT;
      ctx.translate(sx, sy);
    }
    // 背景
    this.background.draw(ctx, this.worldX);
    // 平台（按 lane 排序：lower → middle → upper）
    this.platforms.draw(ctx);
    // 收集物
    this.collectibles.draw(ctx);
    // 障碍
    this.obstacles.draw(ctx);
    // 事件
    this.events.draw(ctx);
    // 玩家
    this.player.draw(ctx, this.stateSystem);
    // 粒子
    this.particles.draw(ctx);
    // 防御性：再次重置 transform，防止累积
    ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
  }
}

/* ==========================================================================
 * 19. bootstrap
 * ========================================================================== */

window.addEventListener('DOMContentLoaded', () => {
  // 显示 loading 极短时间，然后切到 ready
  let game;
  try {
    game = new Game();
  } catch (e) {
    console.error('[猫咪阳台大逃亡] 初始化失败:', e);
    // 替换 ready 面板为错误信息
    const panel = document.getElementById('panel-ready');
    if (panel) {
      const card = panel.querySelector('.panel-card');
      if (card) {
        const msg = (e && e.message) ? e.message : String(e);
        card.innerHTML = `
          <div class="panel-emoji" aria-hidden="true">😿</div>
          <h2 class="panel-title-sm">游戏加载失败</h2>
          <p style="font-size:13px;color:#666;margin:8px 0;">浏览器或网络环境不支持 Web 游戏初始化。</p>
          <p style="font-size:11px;color:#999;word-break:break-all;text-align:left;background:#f5f5f5;padding:8px;border-radius:6px;">${msg}</p>
          <p style="font-size:11px;color:#aaa;margin-top:8px;">建议：刷新页面、关闭代理、换用 Chrome / Safari 最新版。</p>
        `;
      }
    }
    return;
  }
  setTimeout(() => {
    try { game._enterReady(); } catch (e) { console.error(e); }
  }, 200);
});
