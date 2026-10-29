// game.js — 치이카와 합치기 (가로 10% 확장, 2개 미리보기, 교환 3회, 콤보, 개인기록, 타격감)
'use strict';

(function () {
  // ─── Matter.js 및 필수 데이터 로드 확인 ───────────────────
  if (typeof Matter === 'undefined') {
    console.error('Matter.js가 로드되지 않았습니다.');
    const errorEl = document.getElementById('load-error-msg');
    if (errorEl) {
      errorEl.textContent = '물리 엔진을 불러오지 못했습니다. 새로고침 해주세요.';
      errorEl.style.display = 'block';
    }
    return;
  }

  const CHAR_LIST = (typeof CHARACTERS !== 'undefined' && Array.isArray(CHARACTERS))
    ? CHARACTERS
    : [
        { level: 1, name: '우사기', radius: 18, color: '#F4A7B9', image: 'assets/usagi.png', soundPath: 'assets/audio/usagi.mp3', imgScale: 0.76, imgOffsetY: 0 },
        { level: 2, name: '하치와레', radius: 24, color: '#8EC6E6', image: 'assets/hachiware.png', soundPath: 'assets/audio/hachiware.mp3', imgScale: 0.80, imgOffsetY: 0 },
        { level: 3, name: '치이카와', radius: 32, color: '#FFD966', image: 'assets/chiikawa.png', soundPath: 'assets/audio/chiikawa.mp3', imgScale: 0.82, imgOffsetY: 0 }
      ];

  // ─── 맵 크기 및 경계 설정 (가로 10% 추가 확장) ─────────────
  // 변경 전: 내부 너비 = 414px, W = 460
  // 변경 후: 내부 너비 = 456px (+10.14%), W = 502, 세로 H = 720 (고정)
  const W = 502;
  const H = 720;
  const WALL_PHYSICS_T = 80;    // 바디 뚫림 방지용 물리 벽 두께
  const WALL_VIS_W = 23;        // 시각적 벽 두께 (좌우 각각 23px)
  const DROP_ZONE_H = 80;       // 상단 낙하 대기 영역 높이
  const DANGER_Y = 100;         // 위험선 Y
  const DANGER_DURATION = 2000; // 게임 오버까지 연속 위험 시간 ms
  const DROP_GRACE = 1000;      // 낙하 후 위험 판정 유예 ms
  const DROP_COOLDOWN = 500;
  const FIXED_DT = 1000 / 60;
  const MAX_DT = 200;
  const COMBO_TIMEOUT = 1500;   // 콤보 유효 시간 (활성 게임 시간 1.5초)
  const SPAWN_LEVELS = [1, 2, 3];
  const MERGE_SCORES = {
    2: 10,
    3: 20,
    4: 40,
    5: 80,
    6: 160,
    7: 320,
    8: 640,
    9: 1280,
    10: 2560,
  };
  const COMBO_BONUSES = {
    1: 0,
    2: 20,
    3: 50,
    4: 100,
    default: 200 // 5콤보 이상
  };
  const ANOC_MERGE_SCORE = 5120;
  const MAX_LEVEL = 10;
  const STORAGE_KEY = 'chiikawa_merge_highscore';
  const STATS_STORAGE_KEY = 'chiikawa_merge_stats';

  // 통일된 상자 내부 물리/표시 경계
  const BOX_LEFT = WALL_VIS_W;        // 23
  const BOX_RIGHT = W - WALL_VIS_W;   // 479 (내부 너비: 456px)
  const BOX_BOTTOM = H;               // 720

  // ─── Matter.js 별칭 ───────────────────────────────────────
  const { Engine, World, Bodies, Body, Events } = Matter;

  // ─── DOM 요소 ─────────────────────────────────────────────
  const canvas          = document.getElementById('canvas-main');
  const ctx             = canvas ? canvas.getContext('2d') : null;
  const cvNext1         = document.getElementById('cv-next1');
  const ctxNext1        = cvNext1 ? cvNext1.getContext('2d') : null;
  const cvNext2         = document.getElementById('cv-next2');
  const ctxNext2        = cvNext2 ? cvNext2.getContext('2d') : null;
  const btnSwap         = document.getElementById('btn-swap');
  const guideContainer  = document.getElementById('guide-container');
  const wrapper         = document.getElementById('game-wrapper');
  const scoreValueEl    = document.getElementById('score-value');
  const bestValueEl     = document.getElementById('best-value');
  const overlayStart    = document.getElementById('overlay-start');
  const overlayGameover = document.getElementById('overlay-gameover');
  const goScoreEl       = document.getElementById('go-score');
  const goRoundComboEl  = document.getElementById('go-round-combo');
  const goBestMergeEl   = document.getElementById('go-best-merge');
  const goHighscoreEl   = document.getElementById('go-highscore');
  const goMaxcomboEl    = document.getElementById('go-maxcombo');
  const goAnokocountEl  = document.getElementById('go-anokocount');
  const startHighscoreEl= document.getElementById('start-highscore');
  const startMaxcomboEl = document.getElementById('start-maxcombo');
  const startBestmergeEl= document.getElementById('start-bestmerge');
  const startAnokocountEl=document.getElementById('start-anokocount');
  const btnStart        = document.getElementById('btn-start');
  const btnRestart      = document.getElementById('btn-restart');
  const btnMute         = document.getElementById('btn-mute');
  const volSlider       = document.getElementById('vol-slider');

  // ─── 개인 기록 확장 관리자 (기존 최고점수 보존 + 추가 통계) ──
  let memoryHighScore = 0;
  const records = {
    maxCombo: 0,
    bestLevel: 0,
    anokoCount: 0
  };

  function loadAllRecords() {
    // 1. 기존 단일 최고 점수 로드
    try {
      const val = window.localStorage ? window.localStorage.getItem(STORAGE_KEY) : null;
      if (val !== null) {
        memoryHighScore = parseInt(val, 10) || 0;
      }
    } catch (_) {}
    if (bestValueEl) bestValueEl.textContent = memoryHighScore;

    // 2. 확장 통계 (최대 콤보, 최고 합성 단계, 아노코 먹기 누적 횟수)
    try {
      const statsVal = window.localStorage ? window.localStorage.getItem(STATS_STORAGE_KEY) : null;
      if (statsVal) {
        const parsed = JSON.parse(statsVal);
        if (parsed && typeof parsed === 'object') {
          records.maxCombo = parseInt(parsed.maxCombo, 10) || 0;
          records.bestLevel = parseInt(parsed.bestLevel, 10) || 0;
          records.anokoCount = parseInt(parsed.anokoCount, 10) || 0;
        }
      }
    } catch (_) {}

    updateStartScreenStats();
  }

  function saveHighScore(scoreToSave) {
    if (scoreToSave > memoryHighScore) {
      memoryHighScore = scoreToSave;
      if (bestValueEl) bestValueEl.textContent = memoryHighScore;
      try {
        if (window.localStorage) {
          window.localStorage.setItem(STORAGE_KEY, memoryHighScore.toString());
        }
      } catch (_) {}
    }
  }

  function saveRecords() {
    try {
      if (window.localStorage) {
        window.localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(records));
      }
    } catch (_) {}
    updateStartScreenStats();
  }

  function updateStartScreenStats() {
    if (startHighscoreEl) startHighscoreEl.textContent = `${memoryHighScore.toLocaleString()}점`;
    if (startMaxcomboEl) startMaxcomboEl.textContent = `${records.maxCombo} COMBO`;
    if (startBestmergeEl) {
      const char = charData(records.bestLevel);
      startBestmergeEl.textContent = records.bestLevel > 0 ? `${char.name} (${records.bestLevel}단계)` : '-';
    }
    if (startAnokocountEl) startAnokocountEl.textContent = `${records.anokoCount}회`;
  }

  // ─── 사운드 관리자 ───────────────────────────────────────
  const soundManager = {
    isMuted: false,
    volume: 0.3,
    voiceQueue: [],

    init() {
      if (btnMute) {
        btnMute.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggleMute();
        });
      }
      if (volSlider) {
        volSlider.addEventListener('input', (e) => {
          e.stopPropagation();
          this.setVolume(parseFloat(e.target.value));
        });
      }
      ['pointerdown', 'touchstart', 'click'].forEach(evt => {
        if (btnMute) btnMute.addEventListener(evt, e => e.stopPropagation());
        if (volSlider) volSlider.addEventListener(evt, e => e.stopPropagation());
      });
    },

    toggleMute() {
      this.isMuted = !this.isMuted;
      if (btnMute) btnMute.textContent = this.isMuted ? '🔇' : '🔊';
      this.voiceQueue.forEach(item => {
        try { item.audio.volume = this.isMuted ? 0 : this.volume; } catch (_) {}
      });
    },

    setVolume(val) {
      this.volume = Math.max(0, Math.min(1, val));
      if (this.isMuted && this.volume > 0) {
        this.isMuted = false;
        if (btnMute) btnMute.textContent = '🔊';
      }
      this.voiceQueue.forEach(item => {
        try { item.audio.volume = this.isMuted ? 0 : this.volume; } catch (_) {}
      });
    },

    playAudio(src, isVoice = true) {
      if (!src) return null;
      try {
        const audio = new Audio(src);
        audio.volume = this.isMuted ? 0 : this.volume;

        if (isVoice) {
          if (this.voiceQueue.length >= 2) {
            const oldest = this.voiceQueue.shift();
            try {
              oldest.audio.pause();
              oldest.audio.currentTime = 0;
            } catch (_) {}
          }
          this.voiceQueue.push({ audio, isVoice });
        }

        audio.addEventListener('ended', () => {
          this.voiceQueue = this.voiceQueue.filter(item => item.audio !== audio);
        });
        audio.addEventListener('error', () => {
          this.voiceQueue = this.voiceQueue.filter(item => item.audio !== audio);
        });

        const p = audio.play();
        if (p && typeof p.catch === 'function') {
          p.catch(() => {});
        }
        return audio;
      } catch (_) {
        return null;
      }
    },

    playLevelVoice(level) {
      const char = charData(level);
      const src = char.soundPath || 'assets/audio/merge.wav';
      this.playAudio(src, true);
    },

    playGulp() {
      this.playAudio('assets/audio/gulp.wav', false);
    },

    stopVoicesOnly() {
      this.voiceQueue.forEach(item => {
        try {
          item.audio.pause();
          item.audio.currentTime = 0;
        } catch (_) {}
      });
      this.voiceQueue = [];
    },

    stopAll() {
      this.stopVoicesOnly();
    }
  };

  // ─── 이미지 캐시 ─────────────────────────────────────────
  const imageCache = new Map();

  function initImageCache() {
    CHAR_LIST.forEach(char => {
      const img = new Image();
      img.src = char.image;
      img._loaded = false;
      img._failed = false;
      img.onload = () => {
        img._loaded = true;
        renderGuideBadges();
        updateUI();
      };
      img.onerror = () => {
        img._failed = true;
        renderGuideBadges();
        updateUI();
      };
      imageCache.set(char.level, img);
    });
  }

  // ─── 게임 상태 변수 ──────────────────────────────────────
  let gameState = 'idle'; // 'idle' | 'playing' | 'gameover'
  let engine, world;
  let nextBodyId = 0;
  let items = new Map();
  let mergeQueue = [];
  let mergeReserved = new Set();
  let score = 0;
  let dangerStart = null;
  let lastTimestamp = null;
  let accumulator = 0;
  let pointerDown = false;
  let pointerCancelled = false;
  let isStartingGame = false;

  // ─── 대기열 및 교환 (현재 1개 + 다음 2개) ────────────────
  let currentChar = null;
  let nextChar1 = null;
  let nextChar2 = null;
  let previewX = W / 2;
  let lastDropTime = 0;
  let swapCount = 3;

  // ─── 연쇄 합성 콤보 및 이번 판 기록 ──────────────────────
  let currentCombo = 0;
  let comboTimer = 0;
  let roundMaxCombo = 0;
  let roundBestMergeLevel = 0;

  // ─── 타격감: 화면 흔들림 ─────────────────────────────────
  let screenShakeUntil = 0;

  // ─── 아노코 먹기 연출 및 점수 팝업 ───────────────────────
  let eatingAnimations = [];
  let floatingTexts = [];

  function charData(level) {
    return CHAR_LIST.find(c => c.level === level) || CHAR_LIST[0];
  }

  function randomSpawnChar() {
    const lvl = SPAWN_LEVELS[Math.floor(Math.random() * SPAWN_LEVELS.length)];
    return charData(lvl);
  }

  function clampX(x, radius) {
    return Math.max(BOX_LEFT + radius, Math.min(BOX_RIGHT - radius, x));
  }

  function clampMergePos(x, y, radius) {
    const cx = Math.max(BOX_LEFT + radius, Math.min(BOX_RIGHT - radius, x));
    const cy = Math.max(DROP_ZONE_H + radius, Math.min(BOX_BOTTOM - radius, y));
    return { x: cx, y: cy };
  }

  // ─── 공통 캐릭터 원형 배지 렌더링 ────────────────────────
  function drawCharacterBadge(targetCtx, char, x, y, radius, angle = 0, isHighlighted = false, customScale = 1, alpha = 1) {
    if (!targetCtx) return;
    const img = imageCache.get(char.level);
    const hasImage = img && img._loaded && !img._failed;

    targetCtx.save();
    targetCtx.translate(x, y);
    if (angle) targetCtx.rotate(angle);
    if (customScale !== 1) targetCtx.scale(customScale, customScale);
    if (alpha !== 1) targetCtx.globalAlpha = Math.max(0, Math.min(1, alpha));

    // 1. 원형 배경 배지
    targetCtx.beginPath();
    targetCtx.arc(0, 0, radius, 0, Math.PI * 2);
    targetCtx.fillStyle = char.color || '#F4A7B9';
    targetCtx.fill();

    // 2. 캐릭터 이미지 (원형 클리핑)
    if (hasImage) {
      targetCtx.save();
      targetCtx.beginPath();
      targetCtx.arc(0, 0, Math.max(1, radius - 1), 0, Math.PI * 2);
      targetCtx.clip();

      const scaleRatio = char.imgScale !== undefined ? char.imgScale : 0.8;
      const targetBox = radius * 2 * scaleRatio;
      const nw = img.naturalWidth || 1;
      const nh = img.naturalHeight || 1;
      const imgAspect = nw / nh;
      let drawW, drawH;
      if (imgAspect >= 1) {
        drawW = targetBox;
        drawH = targetBox / imgAspect;
      } else {
        drawH = targetBox;
        drawW = targetBox * imgAspect;
      }

      const offsetY = (char.imgOffsetY || 0) * radius;
      targetCtx.drawImage(img, -drawW / 2, -drawH / 2 + offsetY, drawW, drawH);
      targetCtx.restore();
    } else {
      // 대체 텍스트
      targetCtx.fillStyle = '#443328';
      const fontSize = Math.max(7, Math.floor(radius * 0.42));
      targetCtx.font = `bold ${fontSize}px sans-serif`;
      targetCtx.textAlign = 'center';
      targetCtx.textBaseline = 'middle';
      const name = char.name || '';
      const label = name.length > 3 ? name.slice(0, 2) : name;
      targetCtx.fillText(label, 0, 0);
    }

    // 3. 외곽선
    targetCtx.beginPath();
    targetCtx.arc(0, 0, radius, 0, Math.PI * 2);
    if (isHighlighted) {
      targetCtx.strokeStyle = '#ffffff';
      targetCtx.lineWidth = Math.max(3, radius * 0.12);
    } else {
      targetCtx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
      targetCtx.lineWidth = Math.max(1.5, radius * 0.05);
    }
    targetCtx.stroke();

    targetCtx.restore();
  }

  // ─── UI 및 교환 버튼 갱신 ────────────────────────────────
  function updateUI() {
    if (scoreValueEl) scoreValueEl.textContent = score;

    // 다음 첫 번째 미리보기 (더 크게: 38x38 캔버스, r=16)
    if (ctxNext1) {
      ctxNext1.clearRect(0, 0, 38, 38);
      if (nextChar1) {
        drawCharacterBadge(ctxNext1, nextChar1, 19, 19, 16);
      }
    }

    // 다음 두 번째 미리보기 (더 작게: 28x28 캔버스, r=11)
    if (ctxNext2) {
      ctxNext2.clearRect(0, 0, 28, 28);
      if (nextChar2) {
        drawCharacterBadge(ctxNext2, nextChar2, 14, 14, 11);
      }
    }

    updateSwapButton();
  }

  function updateSwapButton() {
    if (!btnSwap) return;
    btnSwap.textContent = `교환 ${swapCount}/3`;
    const canSwap = gameState === 'playing' && swapCount > 0 && eatingAnimations.length === 0;
    btnSwap.disabled = !canSwap;
  }

  // ─── 현재 캐릭터와 다음 1번째 캐릭터 교환 ────────────────
  function swapCharacter(e) {
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
    if (gameState !== 'playing' || swapCount <= 0 || eatingAnimations.length > 0) return;

    const temp = currentChar;
    currentChar = nextChar1;
    nextChar1 = temp;
    // nextChar2는 유지

    swapCount--;
    previewX = clampX(previewX, currentChar.radius);

    updateUI();
  }

  // ─── 하단 가이드 ─────────────────────────────────────────
  function initGuideContainer() {
    if (!guideContainer) return;
    guideContainer.innerHTML = '';
    CHAR_LIST.forEach((char, idx) => {
      const itemEl = document.createElement('div');
      itemEl.className = 'guide-item';

      const boxEl = document.createElement('div');
      boxEl.className = 'guide-badge-box';

      const cv = document.createElement('canvas');
      cv.className = 'guide-canvas';
      cv.width = 26;
      cv.height = 26;
      cv.id = `guide-cv-${char.level}`;

      const nameEl = document.createElement('span');
      nameEl.className = 'guide-name';
      nameEl.textContent = char.name;

      boxEl.appendChild(cv);
      boxEl.appendChild(nameEl);
      itemEl.appendChild(boxEl);

      if (idx < CHAR_LIST.length - 1) {
        const arrowEl = document.createElement('span');
        arrowEl.className = 'guide-arrow';
        arrowEl.textContent = '›';
        itemEl.appendChild(arrowEl);
      }

      guideContainer.appendChild(itemEl);
    });
    renderGuideBadges();
  }

  function renderGuideBadges() {
    CHAR_LIST.forEach(char => {
      const cv = document.getElementById(`guide-cv-${char.level}`);
      if (!cv) return;
      const gctx = cv.getContext('2d');
      if (gctx) {
        gctx.clearRect(0, 0, 26, 26);
        drawCharacterBadge(gctx, char, 13, 13, 11);
      }
    });
  }

  // ─── 물리 초기화 (가로 확장된 통일 경계 적용) ─────────────
  function initPhysics() {
    engine = Engine.create({ gravity: { x: 0, y: 1.5 } });
    world = engine.world;

    const opts = { isStatic: true, friction: 0.5, restitution: 0.05, label: 'wall' };
    const floor = Bodies.rectangle(W / 2, BOX_BOTTOM + WALL_PHYSICS_T / 2, W * 2, WALL_PHYSICS_T, opts);
    const wallL = Bodies.rectangle(BOX_LEFT - WALL_PHYSICS_T / 2, H / 2, WALL_PHYSICS_T, H * 2, opts);
    const wallR = Bodies.rectangle(BOX_RIGHT + WALL_PHYSICS_T / 2, H / 2, WALL_PHYSICS_T, H * 2, opts);
    World.add(world, [floor, wallL, wallR]);

    Events.on(engine, 'collisionStart', onCollision);
  }

  function createCharBody(level, x, y, isDropped, isMerged = false) {
    const char = charData(level);
    const id = nextBodyId++;
    const body = Bodies.circle(x, y, char.radius, {
      restitution: 0.2,
      friction: 0.5,
      frictionAir: 0.01,
      density: 0.002,
      label: `char_${id}`,
    });
    body._gameId = id;
    World.add(world, body);

    const now = performance.now();
    items.set(id, {
      body,
      level,
      dropTime: isDropped ? now : null,
      highlightUntil: isMerged ? now + 160 : 0,
      popUntil: isMerged ? now + 150 : 0, // 150ms 팝업 스케일 타격감
    });
    return id;
  }

  function dropCharacter() {
    if (gameState !== 'playing' || eatingAnimations.length > 0) return;
    const now = performance.now();
    if (now - lastDropTime < DROP_COOLDOWN) return;
    lastDropTime = now;

    // 사용자가 다음 캐릭터를 떨어뜨리면 이전 콤보 종료
    currentCombo = 0;
    comboTimer = 0;

    const char = currentChar;
    const x = clampX(previewX, char.radius);
    const y = DROP_ZONE_H - char.radius - 4;
    createCharBody(char.level, x, y, true, false);

    // 대기열 이동: current <- next1 <- next2 <- random
    currentChar = nextChar1;
    nextChar1 = nextChar2;
    nextChar2 = randomSpawnChar();
    previewX = clampX(previewX, currentChar.radius);

    updateUI();
  }

  function onCollision(event) {
    if (gameState !== 'playing') return;
    for (const pair of event.pairs) {
      const bA = pair.bodyA;
      const bB = pair.bodyB;
      if (bA._gameId === undefined || bB._gameId === undefined) continue;

      const idA = bA._gameId;
      const idB = bB._gameId;
      const itA = items.get(idA);
      const itB = items.get(idB);
      if (!itA || !itB) continue;
      if (itA.level !== itB.level) continue;

      mergeQueue.push({ idA, idB });
    }
  }

  function processMergeQueue() {
    if (mergeQueue.length === 0) return;

    mergeReserved.clear();
    const toProcess = mergeQueue;
    mergeQueue = [];

    for (const { idA, idB } of toProcess) {
      if (mergeReserved.has(idA) || mergeReserved.has(idB)) continue;
      if (!items.has(idA) || !items.has(idB)) continue;

      const itA = items.get(idA);
      const itB = items.get(idB);

      if (itA.level !== itB.level) continue;

      // ─── 10단계 아노코 둘의 합성 (먹기 연출 & 소멸) ───
      if (itA.level === MAX_LEVEL) {
        mergeReserved.add(idA);
        mergeReserved.add(idB);

        soundManager.stopVoicesOnly();

        const isA_Eater = itA.body.position.y <= itB.body.position.y;
        const eaterItem = isA_Eater ? itA : itB;
        const victimItem = isA_Eater ? itB : itA;

        eatingAnimations.push({
          id: `${idA}_${idB}`,
          char: charData(MAX_LEVEL),
          eater: {
            x: eaterItem.body.position.x,
            y: eaterItem.body.position.y,
            angle: eaterItem.body.angle,
          },
          victim: {
            x: victimItem.body.position.x,
            y: victimItem.body.position.y,
            startX: victimItem.body.position.x,
            startY: victimItem.body.position.y,
            angle: victimItem.body.angle,
          },
          elapsed: 0,
          duration: 0.9,
          gulpPlayed: false,
          scoreAwarded: false,
          finished: false,
          text: '',
        });

        World.remove(world, itA.body);
        World.remove(world, itB.body);
        items.delete(idA);
        items.delete(idB);

        if (MAX_LEVEL > roundBestMergeLevel) roundBestMergeLevel = MAX_LEVEL;
        if (MAX_LEVEL > records.bestLevel) {
          records.bestLevel = MAX_LEVEL;
          saveRecords();
        }

        updateSwapButton();
        continue;
      }

      // ─── 일반 1~9단계 합성 ───
      mergeReserved.add(idA);
      mergeReserved.add(idB);

      const newLevel = itA.level + 1;
      const mx = (itA.body.position.x + itB.body.position.x) / 2;
      const my = (itA.body.position.y + itB.body.position.y) / 2;
      const newChar = charData(newLevel);
      const pos = clampMergePos(mx, my, newChar.radius);

      World.remove(world, itA.body);
      World.remove(world, itB.body);
      items.delete(idA);
      items.delete(idB);

      // 새 바디 생성 (isMerged = true 로 popUntil 150ms 부여)
      const newId = createCharBody(newLevel, pos.x, pos.y, false, true);
      const newBody = items.get(newId).body;
      const vx = Math.max(-5, Math.min(5, (itA.body.velocity.x + itB.body.velocity.x) / 2));
      const vy = Math.max(-5, Math.min(5, (itA.body.velocity.y + itB.body.velocity.y) / 2));
      Body.setVelocity(newBody, { x: vx, y: vy });
      Body.setAngularVelocity(newBody, 0);

      // 타격감: 7단계 이상 합성 시 약한 화면 흔들림 (100ms, 덮어쓰기)
      if (newLevel >= 7) {
        screenShakeUntil = performance.now() + 100;
      }

      // 새 캐릭터 음성 재생
      soundManager.playLevelVoice(newLevel);

      // ─── 콤보 판정 및 보너스 계산 ───
      if (currentCombo > 0 && comboTimer <= COMBO_TIMEOUT) {
        currentCombo++;
      } else {
        currentCombo = 1;
      }
      comboTimer = 0; // 콤보 타이머 리셋

      if (currentCombo > roundMaxCombo) roundMaxCombo = currentCombo;
      if (currentCombo > records.maxCombo) {
        records.maxCombo = currentCombo;
        saveRecords();
      }

      const comboBonus = (currentCombo in COMBO_BONUSES)
        ? COMBO_BONUSES[currentCombo]
        : (currentCombo >= 5 ? COMBO_BONUSES.default : 0);

      const baseScore = MERGE_SCORES[newLevel] || 0;
      const totalAward = baseScore + comboBonus;
      score += totalAward;

      if (newLevel > roundBestMergeLevel) roundBestMergeLevel = newLevel;
      if (newLevel > records.bestLevel) {
        records.bestLevel = newLevel;
        saveRecords();
      }

      saveHighScore(score);

      // 합성 위치 플로팅 텍스트
      const popupText = comboBonus > 0
        ? `+${baseScore}\n${currentCombo} COMBO! +${comboBonus}`
        : `+${baseScore}`;

      floatingTexts.push({
        text: popupText,
        x: pos.x,
        y: pos.y - newChar.radius - 8,
        elapsed: 0,
        duration: 0.9,
      });

      updateUI();
    }
  }

  // ─── 아노코 먹기 연출 갱신 ───────────────────────────────
  function updateEatingAnimations(dtSec) {
    if (eatingAnimations.length === 0) return;

    for (let i = eatingAnimations.length - 1; i >= 0; i--) {
      const anim = eatingAnimations[i];
      anim.elapsed += dtSec;
      const t = anim.elapsed;
      const char = anim.char;
      const r = char.radius;

      const mRel = char.mouthPos || { x: 0, y: 0.15 };
      const cosA = Math.cos(anim.eater.angle);
      const sinA = Math.sin(anim.eater.angle);
      const mouthOffsetX = (mRel.x * cosA - mRel.y * sinA) * r;
      const mouthOffsetY = (mRel.x * sinA + mRel.y * cosA) * r;
      const mouthX = anim.eater.x + mouthOffsetX;
      const mouthY = anim.eater.y + mouthOffsetY;

      if (t >= 0.15 && t <= 0.5) {
        const prog = (t - 0.15) / 0.35;
        anim.victim.x = anim.victim.startX + (mouthX - anim.victim.startX) * prog;
        anim.victim.y = anim.victim.startY + (mouthY - anim.victim.startY) * prog;
        anim.text = '와앙!';
      } else if (t > 0.5) {
        anim.text = '꿀꺽!';
      }

      if (t >= 0.5 && !anim.gulpPlayed) {
        anim.gulpPlayed = true;
        soundManager.playGulp();
      }

      if (t >= anim.duration) {
        if (!anim.scoreAwarded) {
          anim.scoreAwarded = true;
          // 아노코 꿀꺽은 콤보 제외, 단일 5,120점 지급
          score += ANOC_MERGE_SCORE;
          saveHighScore(score);

          // 아노코 누적 완료 횟수 1회 증가 및 저장
          records.anokoCount++;
          saveRecords();

          updateUI();
          floatingTexts.push({
            text: `+${ANOC_MERGE_SCORE.toLocaleString()}`,
            x: anim.eater.x,
            y: anim.eater.y - 40,
            elapsed: 0,
            duration: 1.1,
          });
        }
        anim.finished = true;
        eatingAnimations.splice(i, 1);
        updateSwapButton();
      }
    }
  }

  // ─── 먹기 연출 렌더링 ────────────────────────────────────
  function drawEatingAnimations() {
    if (!ctx) return;
    eatingAnimations.forEach(anim => {
      const t = anim.elapsed;
      const char = anim.char;
      const r = char.radius;

      let eaterScale = 1.0;
      let eaterAngle = anim.eater.angle;
      let eaterStretchX = 1.0;
      let eaterStretchY = 1.0;
      let eaterAlpha = 1.0;

      if (t <= 0.15) {
        const p = t / 0.15;
        eaterScale = 1.0 + 0.1 * p;
        eaterAngle -= 0.12 * p;
      } else if (t <= 0.5) {
        eaterScale = 1.1;
        eaterAngle -= 0.12;
      } else {
        const p = (t - 0.5) / 0.4;
        const wobble = Math.sin(p * Math.PI * 4);
        eaterStretchX = 1.0 + 0.12 * wobble;
        eaterStretchY = 1.0 - 0.08 * wobble;
        if (t >= 0.7) {
          const fadeP = (t - 0.7) / 0.2;
          eaterScale = Math.max(0, 1.1 * (1 - fadeP));
          eaterAlpha = Math.max(0, 1 - fadeP);
        } else {
          eaterScale = 1.1;
        }
      }

      if (t < 0.5) {
        let victimScale = 1.0;
        if (t >= 0.15) {
          const p = (t - 0.15) / 0.35;
          victimScale = Math.max(0, 1.0 - p);
        }
        if (victimScale > 0.01) {
          drawCharacterBadge(
            ctx,
            char,
            anim.victim.x,
            anim.victim.y,
            r,
            anim.victim.angle,
            false,
            victimScale,
            1.0
          );
        }
      }

      ctx.save();
      ctx.translate(anim.eater.x, anim.eater.y);
      ctx.rotate(eaterAngle);
      ctx.scale(eaterStretchX * eaterScale, eaterStretchY * eaterScale);
      ctx.globalAlpha = eaterAlpha;

      drawCharacterBadge(ctx, char, 0, 0, r, 0, false, 1.0, 1.0);

      if (t <= 0.5) {
        const mRel = char.mouthPos || { x: 0, y: 0.15 };
        const mx = mRel.x * r;
        const my = mRel.y * r;
        const openProg = Math.min(1, t / 0.15);
        ctx.beginPath();
        ctx.ellipse(mx, my, 14 * openProg, 10 * openProg, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#2a1a1e';
        ctx.fill();
        ctx.strokeStyle = '#c06070';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.restore();

      if (anim.text && eaterAlpha > 0.1) {
        ctx.save();
        ctx.fillStyle = '#e03050';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 6;
        ctx.fillText(anim.text, anim.eater.x, anim.eater.y - r * 0.7);
        ctx.restore();
      }
    });
  }

  // ─── 점수/콤보 팝업 렌더링 (줄바꿈 지원) ──────────────────
  function updateAndDrawFloatingTexts(dtSec) {
    if (!ctx) return;
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
      const ft = floatingTexts[i];
      ft.elapsed += dtSec;
      ft.y -= 25 * dtSec;
      const alpha = Math.max(0, 1 - ft.elapsed / ft.duration);

      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(255, 255, 255, 0.95)';
      ctx.shadowBlur = 6;

      const lines = ft.text.split('\n');
      lines.forEach((line, lIdx) => {
        if (line.includes('COMBO')) {
          ctx.fillStyle = `rgba(255, 80, 50, ${alpha})`;
          ctx.font = 'bold 18px sans-serif';
        } else {
          ctx.fillStyle = `rgba(224, 60, 90, ${alpha})`;
          ctx.font = 'bold 22px sans-serif';
        }
        ctx.fillText(line, ft.x, ft.y + lIdx * 20);
      });
      ctx.restore();

      if (ft.elapsed >= ft.duration) {
        floatingTexts.splice(i, 1);
      }
    }
  }

  function checkDanger(now) {
    let anyDanger = false;
    for (const [, item] of items) {
      const top = item.body.position.y - charData(item.level).radius;
      if (top >= DANGER_Y) continue;
      if (item.dropTime !== null && (now - item.dropTime) < DROP_GRACE) continue;

      anyDanger = true;
      break;
    }

    if (anyDanger) {
      if (dangerStart === null) dangerStart = now;
      if (now - dangerStart >= DANGER_DURATION) {
        triggerGameOver();
      }
    } else {
      dangerStart = null;
    }
  }

  function triggerGameOver() {
    gameState = 'gameover';
    soundManager.stopAll();
    saveHighScore(score);

    const roundBestChar = charData(roundBestMergeLevel);

    if (goScoreEl) goScoreEl.textContent = `최종 점수: ${score.toLocaleString()}점`;
    if (goRoundComboEl) goRoundComboEl.textContent = `최대 콤보: ${roundMaxCombo} COMBO`;
    if (goBestMergeEl) {
      goBestMergeEl.textContent = roundBestMergeLevel > 0
        ? `최고 합성: ${roundBestChar.name} (${roundBestMergeLevel}단계)`
        : '합성 없음';
    }

    if (goHighscoreEl) goHighscoreEl.textContent = `역대 최고 점수: ${memoryHighScore.toLocaleString()}점`;
    if (goMaxcomboEl) goMaxcomboEl.textContent = `역대 최대 콤보: ${records.maxCombo} COMBO`;
    if (goAnokocountEl) goAnokocountEl.textContent = `아노코 꿀꺽 누적: ${records.anokoCount}회`;

    if (overlayGameover) overlayGameover.style.display = 'flex';
    updateSwapButton();
  }

  // ─── 렌더링 ──────────────────────────────────────────────
  function drawPreview() {
    if (!ctx || !currentChar || gameState !== 'playing' || eatingAnimations.length > 0) return;
    const char = currentChar;
    const x = clampX(previewX, char.radius);
    const y = DROP_ZONE_H - char.radius - 4;

    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(224, 109, 126, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, DROP_ZONE_H);
    ctx.lineTo(x, H);
    ctx.stroke();
    ctx.restore();

    drawCharacterBadge(ctx, char, x, y, char.radius);
  }

  function drawDangerLine(now) {
    if (!ctx) return;
    const isDanger = dangerStart !== null;
    const blink = isDanger && Math.floor(now / 300) % 2 === 0;
    ctx.save();
    ctx.strokeStyle = blink ? '#ff3b30' : 'rgba(255, 99, 71, 0.55)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(BOX_LEFT, DANGER_Y);
    ctx.lineTo(BOX_RIGHT, DANGER_Y);
    ctx.stroke();
    ctx.setLineDash([]);

    if (isDanger) {
      const remain = Math.max(0, DANGER_DURATION - (now - dangerStart));
      const sec = (remain / 1000).toFixed(1);
      ctx.fillStyle = '#ff3b30';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`위험! ${sec}s`, BOX_RIGHT - 6, DANGER_Y - 4);
    }
    ctx.restore();
  }

  function render(now, dtSec) {
    if (!ctx) return;

    ctx.save();

    // 7단계 이상 합성 시 화면 약한 흔들림 적용 (최대 2~3px)
    if (now < screenShakeUntil) {
      const shakeX = (Math.random() - 0.5) * 5;
      const shakeY = (Math.random() - 0.5) * 5;
      ctx.translate(shakeX, shakeY);
    }

    ctx.fillStyle = '#fdf6ec';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#faefe0';
    ctx.fillRect(0, 0, W, DROP_ZONE_H);

    ctx.strokeStyle = '#ecd6c4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, DROP_ZONE_H);
    ctx.lineTo(W, DROP_ZONE_H);
    ctx.stroke();

    drawDangerLine(now);
    drawPreview();

    for (const [, item] of items) {
      const char = charData(item.level);
      const isHigh = now < item.highlightUntil;

      // 타격감 팝업 스케일 (150ms 동안 1.12배에서 1.0배로 복귀)
      let customScale = 1.0;
      if (item.popUntil && now < item.popUntil) {
        const p = (item.popUntil - now) / 150;
        customScale = 1.0 + 0.12 * Math.max(0, Math.min(1, p));
      }

      drawCharacterBadge(
        ctx,
        char,
        item.body.position.x,
        item.body.position.y,
        char.radius,
        item.body.angle,
        isHigh,
        customScale
      );
    }

    drawEatingAnimations();
    updateAndDrawFloatingTexts(dtSec);

    // 좌우 벽 시각 표시 (BOX_LEFT, BOX_RIGHT 경계와 일치)
    ctx.fillStyle = '#e8d2c0';
    ctx.fillRect(0, DROP_ZONE_H, BOX_LEFT, H - DROP_ZONE_H);
    ctx.fillRect(BOX_RIGHT, DROP_ZONE_H, W - BOX_RIGHT, H - DROP_ZONE_H);

    ctx.restore();
  }

  function loop(timestamp) {
    requestAnimationFrame(loop);

    if (lastTimestamp === null) {
      lastTimestamp = timestamp;
      render(timestamp, 0);
      return;
    }

    let dt = timestamp - lastTimestamp;
    lastTimestamp = timestamp;
    if (dt > MAX_DT) dt = FIXED_DT;
    const dtSec = dt / 1000;

    if (gameState === 'playing') {
      if (eatingAnimations.length > 0) {
        updateEatingAnimations(dtSec);
      } else {
        // 활성 게임 시간 누적으로 콤보 타이머 갱신 (1.5초 경과 시 콤보 종료)
        if (currentCombo > 0) {
          comboTimer += dt;
          if (comboTimer > COMBO_TIMEOUT) {
            currentCombo = 0;
          }
        }

        accumulator += dt;
        while (accumulator >= FIXED_DT) {
          Engine.update(engine, FIXED_DT);
          processMergeQueue();
          accumulator -= FIXED_DT;
        }
        checkDanger(timestamp);
      }
    }

    render(timestamp, dtSec);
  }

  // ─── 시작 / 재시작 ───────────────────────────────────────
  function startGame(e) {
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
    if (isStartingGame) return;
    isStartingGame = true;

    try {
      if (overlayStart) overlayStart.style.display = 'none';
      if (overlayGameover) overlayGameover.style.display = 'none';
      gameState = 'playing';

      try {
        soundManager.stopAll();
      } catch (_) {}

      try {
        for (const [, item] of items) {
          World.remove(world, item.body);
        }
      } catch (_) {}
      items.clear();
      mergeQueue = [];
      mergeReserved.clear();
      eatingAnimations = [];
      floatingTexts = [];

      score = 0;
      dangerStart = null;
      lastDropTime = 0;
      swapCount = 3;

      // 콤보 및 이번 판 기록 초기화
      currentCombo = 0;
      comboTimer = 0;
      roundMaxCombo = 0;
      roundBestMergeLevel = 0;
      screenShakeUntil = 0;

      // 현재 대기 캐릭터 + 다음 2개 캐릭터 추첨
      currentChar = randomSpawnChar();
      nextChar1   = randomSpawnChar();
      nextChar2   = randomSpawnChar();
      previewX = W / 2;

      updateUI();

      lastTimestamp = null;
      accumulator = 0;

      try {
        soundManager.playAudio('assets/audio/usagi.mp3', true);
      } catch (_) {}
    } catch (err) {
      console.error('게임 시작 오류:', err);
      if (overlayStart) overlayStart.style.display = 'none';
      gameState = 'playing';
    } finally {
      setTimeout(() => {
        isStartingGame = false;
      }, 300);
    }
  }

  // ─── 화면 반응형 스케일 ──────────────────────────────────
  function scaleWrapper() {
    if (!wrapper) return;
    const fullHeight = wrapper.offsetHeight || 880;
    const scaleX = (window.innerWidth - 12) / W;
    const scaleY = (window.innerHeight - 12) / fullHeight;
    const scale = Math.min(scaleX, scaleY, 1);
    wrapper.style.transform = `scale(${scale})`;
    const offsetY = Math.max(0, (window.innerHeight - fullHeight * scale) / 2);
    wrapper.style.marginTop = `${offsetY}px`;
  }

  // ─── 포인터 입력 (논리 좌표 변환) ────────────────────────
  function toCanvasCoords(e) {
    if (!canvas) return { x: previewX, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
    const clientY = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
    return {
      x: (clientX - rect.left) * (W / rect.width),
      y: (clientY - rect.top)  * (H / rect.height),
    };
  }

  function isInsideGame(cx, cy) {
    return cx >= 0 && cx <= W && cy >= 0 && cy <= H;
  }

  function onPointerMove(e) {
    e.preventDefault();
    const { x } = toCanvasCoords(e);
    previewX = x;
  }

  function onPointerDown(e) {
    if (e.target !== canvas) return;
    e.preventDefault();
    const { x, y } = toCanvasCoords(e);
    if (!isInsideGame(x, y)) return;
    pointerDown = true;
    pointerCancelled = false;
    previewX = x;
  }

  function onPointerUp(e) {
    if (!pointerDown || pointerCancelled) {
      pointerDown = false;
      return;
    }
    pointerDown = false;
    const { x, y } = toCanvasCoords(e);
    if (isInsideGame(x, y)) dropCharacter();
  }

  function onPointerCancel() {
    pointerDown = false;
    pointerCancelled = true;
  }

  function onVisibilityChange() {
    if (document.hidden) {
      lastTimestamp = null;
      soundManager.stopAll();
      if (dangerStart !== null) dangerStart = null;
    }
  }

  function bindButtonEvents(btnElement, handler) {
    if (!btnElement) return;
    let handledByTouch = false;

    btnElement.addEventListener('pointerup', (e) => {
      e.preventDefault();
      handledByTouch = true;
      handler(e);
      setTimeout(() => { handledByTouch = false; }, 350);
    }, { passive: false });

    btnElement.addEventListener('click', (e) => {
      if (handledByTouch) return;
      e.preventDefault();
      handler(e);
    });
  }

  // ─── 초기화 ──────────────────────────────────────────────
  function init() {
    try {
      soundManager.init();
      loadAllRecords();
      initImageCache();
      initPhysics();
      initGuideContainer();

      if (canvas) {
        canvas.addEventListener('pointermove',   onPointerMove,   { passive: false });
        canvas.addEventListener('pointerdown',   onPointerDown,   { passive: false });
        canvas.addEventListener('pointerup',     onPointerUp,     { passive: false });
        canvas.addEventListener('pointercancel', onPointerCancel, { passive: false });
      }

      document.addEventListener('visibilitychange', onVisibilityChange);
      window.addEventListener('resize', scaleWrapper);

      // 시작, 재시작, 교환 버튼 바인딩
      bindButtonEvents(btnStart, startGame);
      bindButtonEvents(btnRestart, startGame);
      if (btnSwap) {
        bindButtonEvents(btnSwap, swapCharacter);
        ['pointerdown', 'touchstart'].forEach(evt => {
          btnSwap.addEventListener(evt, e => e.stopPropagation(), { passive: false });
        });
      }

      scaleWrapper();
      requestAnimationFrame(loop);
    } catch (err) {
      console.error('초기화 중 오류 발생:', err);
      const errorEl = document.getElementById('load-error-msg');
      if (errorEl) {
        errorEl.textContent = '게임 준비 중 오류가 발생했습니다. 새로고침 해주세요.';
        errorEl.style.display = 'block';
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
