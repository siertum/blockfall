// ============================================================================
// Blockfall — DOM-корпус UI: экраны, HUD, кнопки, клавиатура, touch-жесты.
// Зона SA2. Строит весь DOM один раз в createUI(); show() только переключает
// класс .active. Превью hold/next — два маленьких canvas здесь, не в renderer.
// ============================================================================
import type {
  GameStateSnapshot,
  InputAction,
  PieceKind,
  ScreenName,
  Settings,
  UI,
  UIHandlers,
} from '../shared/types';
import { PIECES, PIECE_COLORS, NEXT_PREVIEW_SIZE } from '../shared/constants';
import { I18N, type Dict, type Lang } from './i18n';

// ---------- helpers ----------
const el = <T extends HTMLElement>(tag: string, cls?: string, testid?: string): T => {
  const n = document.createElement(tag) as T;
  if (cls) n.className = cls;
  if (testid) n.setAttribute('data-testid', testid);
  return n;
};

// --- язык: все подписи резолвятся через t() и применяются в applyLang() ---
let lang: Lang = 'ru';
const t = (k: keyof Dict): string => I18N[lang][k];

/** Нарисовать мини-фигуру в cell-координатах на canvas (внутренние px). */
function drawMiniPiece(
  ctx: CanvasRenderingContext2D,
  kind: PieceKind | null,
  cell: number,
  ox: number,
  oy: number,
): void {
  if (!kind) return;
  const cells = PIECES[kind][0];
  const col = PIECE_COLORS[kind];
  const r = cell * 0.32;
  for (const c of cells) {
    const x = ox + c.x * cell;
    const y = oy + c.y * cell;
    ctx.save();
    ctx.shadowColor = col.glow;
    ctx.shadowBlur = cell * 0.45;
    const g = ctx.createRadialGradient(
      x + cell * 0.35, y + cell * 0.3, cell * 0.08,
      x + cell * 0.5, y + cell * 0.5, cell * 0.62,
    );
    g.addColorStop(0, col.hi);
    g.addColorStop(0.45, col.base);
    g.addColorStop(1, col.base);
    ctx.fillStyle = g;
    roundRect(ctx, x + cell * 0.08, y + cell * 0.08, cell * 0.84, cell * 0.84, r);
    ctx.fill();
    ctx.restore();
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------- onboarding steps ----------
interface ObStep {
  title: keyof Dict;
  hint: keyof Dict;
  demoClass: string;
}
const OB_STEPS: ObStep[] = [
  { title: 'obSwipeTitle', hint: 'obSwipeHint', demoClass: 'swipe-right' },
  { title: 'obTapTitle', hint: 'obTapHint', demoClass: 'tap' },
  { title: 'ctlDrop', hint: 'obHardHint', demoClass: 'swipe-down' },
];

// touch tuning
const PX_PER_CELL = 24; // горизонтальный drag: 1 клетка / 24px
const TAP_SLOP = 12;
const TAP_MS = 260;
const SWIPE_UP_MIN = 70; // px вверх для hold
const HARD_SWIPE_DIST = PX_PER_CELL * 4.5; // > ~4 клеток вниз
const HARD_SWIPE_MS = 300;

export function createUI(root: HTMLElement, handlers: UIHandlers): UI {
  let screen: ScreenName = 'menu';
  let inputCb: ((a: InputAction) => void) | null = null;
  let settings: Settings = { music: true, sfx: true, haptics: true, onboarded: true, lang: undefined };

  const fire = (a: InputAction) => inputCb?.(a);
  const click = () => handlers.onUserGesture();

  // ======================= HUD (верх) =======================
  const hud = el<HTMLDivElement>('div', 'hud');
  hud.setAttribute('aria-hidden', 'false');

  const holdSlot = el<HTMLDivElement>('div', 'hold-slot', 'hold-slot');
  const holdLabel = el<HTMLDivElement>('div', 'slot-label');
  holdLabel.textContent = t('hudHold');
  const holdCanvas = el<HTMLCanvasElement>('canvas', undefined, 'hold-canvas');
  holdCanvas.width = 52 * 2;
  holdCanvas.height = 40 * 2;
  holdSlot.append(holdLabel, holdCanvas);

  const stats = el<HTMLDivElement>('div', 'hud-stats');
  const scoreBig = el<HTMLDivElement>('div');
  scoreBig.className = 'big';
  scoreBig.setAttribute('data-testid', 'hud-score');
  scoreBig.textContent = '0';
  const statRow = el<HTMLDivElement>('div', 'row');
  const statLabelKeys = new Map<HTMLElement, keyof Dict>();
  const mkStat = (testid: string, labelKey: keyof Dict): HTMLElement => {
    const s = el<HTMLSpanElement>('span');
    s.append(document.createTextNode(t(labelKey) + ' '));
    const b = el<HTMLSpanElement>('span');
    b.setAttribute('data-testid', testid);
    b.textContent = '0';
    s.append(b);
    statLabelKeys.set(s, labelKey);
    return s;
  };
  const highStat = mkStat('hud-high', 'hudRecord');
  const linesStat = mkStat('hud-lines', 'hudLines');
  const levelStat = mkStat('hud-level', 'hudLevel');
  statRow.append(highStat, linesStat, levelStat);
  stats.append(scoreBig, statRow);

  const nextQueue = el<HTMLDivElement>('div', 'next-queue', 'next-queue');
  const nextLabel = el<HTMLDivElement>('div', 'slot-label');
  nextLabel.textContent = t('hudNext');
  const nextCanvas = el<HTMLCanvasElement>('canvas', undefined, 'next-canvas');
  nextCanvas.width = 48 * 2;
  nextCanvas.height = 128 * 2;
  nextQueue.append(nextLabel, nextCanvas);

  hud.append(holdSlot, stats, nextQueue);
  root.append(hud);

  // ======================= touch-зона =======================
  const touchZone = el<HTMLDivElement>('div', undefined, 'touch-zone');
  touchZone.id = 'touch-zone';
  root.append(touchZone);

  // ======================= контролы (низ) =======================
  const controls = el<HTMLDivElement>('div', 'controls');
  const clusterL = el<HTMLDivElement>('div', 'ctl-cluster left');
  const clusterR = el<HTMLDivElement>('div', 'ctl-cluster right');

  const ctlHold = el<HTMLButtonElement>('button', 'ctl-btn', 'ctl-hold');
  ctlHold.innerHTML = '<span class="glyph">⇅</span>' + t('ctlSwap');
  ctlHold.setAttribute('aria-label', t('ctlSwap'));
  const ctlPause = el<HTMLButtonElement>('button', 'ctl-btn', 'btn-pause');
  ctlPause.innerHTML = '<span class="glyph">⏸</span>' + t('pause');
  ctlPause.setAttribute('aria-label', t('pause'));

  const ctlRotate = el<HTMLButtonElement>('button', 'ctl-btn');
  ctlRotate.innerHTML = '<span class="glyph">⟳</span>' + t('ctlRotate');
  ctlRotate.setAttribute('aria-label', t('ctlRotate'));
  const ctlHard = el<HTMLButtonElement>('button', 'ctl-btn hard');
  ctlHard.innerHTML = '<span class="glyph">⤓</span>' + t('ctlDrop');
  ctlHard.setAttribute('aria-label', t('ctlDrop'));

  clusterL.append(ctlHold, ctlPause);
  clusterR.append(ctlRotate, ctlHard);
  controls.append(clusterL, clusterR);
  root.append(controls);

  const ctlTap = (node: HTMLElement, fn: () => void): void => {
    node.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      click();
      fn();
    });
  };
  ctlTap(ctlHold, () => fire('hold'));
  ctlTap(ctlPause, () => handlers.onPause());
  ctlTap(ctlRotate, () => fire('rotate-cw'));
  ctlTap(ctlHard, () => fire('hard-drop'));

  // ======================= экраны =======================
  const screens = new Map<ScreenName, HTMLElement>();
  const mkScreen = (name: Exclude<ScreenName, 'game'>): HTMLElement => {
    const s = el<HTMLDivElement>('div', 'screen', 'screen-' + name);
    s.id = 'screen-' + name;
    root.append(s);
    screens.set(name, s);
    return s;
  };

  // --- menu ---
  const menu = mkScreen('menu');
  const logoWrap = el<HTMLDivElement>('div');
  logoWrap.style.position = 'relative';
  const bubbles = el<HTMLDivElement>('div', 'logo-bubbles');
  for (let i = 0; i < 5; i++) bubbles.append(el<HTMLSpanElement>('i'));
  const logo = el<HTMLHeadingElement>('h1', 'logo');
  logo.textContent = t('logo');
  logoWrap.append(bubbles, logo);
  const logoSub = el<HTMLDivElement>('div', 'logo-sub');
  logoSub.textContent = t('logoSub');
  const menuHigh = el<HTMLDivElement>('div', 'menu-high');
  menuHigh.innerHTML = t('menuHigh') + '<b data-testid="menu-high-value">0</b>';
  const btnStart = el<HTMLButtonElement>('button', 'btn primary', 'btn-start');
  btnStart.textContent = t('play');
  const btnSettings = el<HTMLButtonElement>('button', 'btn ghost', 'btn-settings');
  btnSettings.textContent = t('settings');
  // кнопка языка: одно нажатие — RU/EN (EN по умолчанию)
  const btnLang = el<HTMLButtonElement>('button', 'btn ghost lang-menu-btn', 'btn-lang');
  const LANG_LABELS: Record<Lang, string> = { en: 'English', ru: 'Русский' };
  btnLang.textContent = LANG_LABELS.en;
  btnLang.setAttribute('aria-label', 'Switch language / Сменить язык');
  const setLang = (l: Lang): void => {
    if (settings.lang === l) return;
    click();
    settings = { ...settings, lang: l };
    applyLang();
    handlers.onSettingsChanged({ ...settings });
  };
  btnLang.addEventListener('click', () => setLang(settings.lang === 'en' ? 'ru' : 'en'));
  const menuStack = el<HTMLDivElement>('div', 'menu-stack');
  menuStack.append(btnStart, btnSettings, btnLang);
  menu.append(logoWrap, logoSub, menuHigh, menuStack);
  btnStart.addEventListener('click', () => {
    click();
    handlers.onStart();
  });
  btnSettings.addEventListener('click', () => {
    click();
    show('settings');
  });

  // --- пауза + кнопка с защитой от случайного нажатия ---
  const HOLD_RESTART_MS = 2000;
  const bindHoldRestart = (node: HTMLElement): void => {
    let raf = 0;
    let t0 = 0;
    let fired = false;
    const reset = (): void => {
      cancelAnimationFrame(raf);
      raf = 0;
      if (!fired) node.classList.remove('holding');
      node.style.setProperty('--hold', '0');
    };
    const stop = (): void => reset();
    node.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (raf) return;
      fired = false;
      t0 = performance.now();
      node.classList.add('holding');
      node.classList.remove('done');
      const tick = (): void => {
        const p = Math.min(1, (performance.now() - t0) / HOLD_RESTART_MS);
        node.style.setProperty('--hold', String(p));
        if (p >= 1) {
          fired = true;
          node.classList.remove('holding');
          node.classList.add('done');
          click();
          handlers.onRestart();
          window.setTimeout(() => node.classList.remove('done'), 600);
          reset();
          return;
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) node.addEventListener(ev, stop);
  };

  // --- pause ---
  const pauseScr = mkScreen('pause');
  const pauseH = el<HTMLHeadingElement>('h2');
  pauseH.textContent = t('pause');
  const btnResume = el<HTMLButtonElement>('button', 'btn primary', 'btn-resume');
  btnResume.textContent = t('resume');
  const btnRestartPause = el<HTMLButtonElement>('button', 'btn ghost hold-restart', 'btn-restart-pause');
  btnRestartPause.textContent = t('restart');
  btnRestartPause.setAttribute('aria-label', t('restartHold'));
  bindHoldRestart(btnRestartPause);
  const btnPauseSettings = el<HTMLButtonElement>('button', 'btn ghost', 'btn-settings-pause');
  btnPauseSettings.textContent = t('settings');
  const btnQuit = el<HTMLButtonElement>('button', 'btn ghost', 'btn-quit');
  btnQuit.textContent = t('quitMenu');
  const pauseStack = el<HTMLDivElement>('div', 'menu-stack');
  pauseStack.append(btnResume, btnRestartPause, btnPauseSettings, btnQuit);
  pauseScr.append(pauseH, pauseStack);
  btnResume.addEventListener('click', () => {
    click();
    handlers.onResume();
  });
  btnPauseSettings.addEventListener('click', () => {
    click();
    show('settings');
  });
  btnQuit.addEventListener('click', () => {
    click();
    handlers.onQuitToMenu();
  });

  // --- gameover ---
  const overScr = mkScreen('gameover');
  const overH = el<HTMLHeadingElement>('h2');
  overH.textContent = t('gameOver');
  const overScore = el<HTMLDivElement>('div', 'score');
  overScore.setAttribute('data-testid', 'final-score');
  overScore.textContent = '0';
  const overStats = el<HTMLDivElement>('div', 'stat-lines');
  const overLines = el<HTMLDivElement>('div', undefined, 'final-lines');
  const overLevel = el<HTMLDivElement>('div', undefined, 'final-level');
  overScr.setAttribute('data-testid', 'screen-gameover');
  const newRec = el<HTMLDivElement>('div', 'new-record', 'new-record');
  newRec.textContent = t('newRecord');
  overStats.append(overScore, overLines, overLevel, newRec);
  const btnRestart = el<HTMLButtonElement>('button', 'btn primary hold-restart', 'btn-restart');
  btnRestart.textContent = t('restart');
  btnRestart.setAttribute('aria-label', t('restartHold'));
  bindHoldRestart(btnRestart);
  const btnQuit2 = el<HTMLButtonElement>('button', 'btn ghost');
  btnQuit2.setAttribute('data-testid', 'btn-quit-menu');
  btnQuit2.textContent = t('quitMenu');
  const overStack = el<HTMLDivElement>('div', 'menu-stack');
  overStack.append(btnRestart, btnQuit2);
  overScr.append(overH, overStats, overStack);
  btnQuit2.addEventListener('click', () => {
    click();
    handlers.onQuitToMenu();
  });

  // --- settings ---
  const setScr = mkScreen('settings');
  const setH = el<HTMLHeadingElement>('h2');
  setH.textContent = t('settings');
  const setList = el<HTMLDivElement>('div', 'settings-list');
  const rowLabelKeys = new Map<HTMLElement, keyof Dict>(); // подписи строк настроек
  const mkToggle = (labelKey: keyof Dict, key: keyof Settings, testid: string): HTMLElement => {
    const row = el<HTMLDivElement>('div', 'setting-row');
    const tg = el<HTMLButtonElement>('span', 'toggle', testid);
    tg.setAttribute('role', 'switch');
    const span = el<HTMLSpanElement>('span');
    span.textContent = t(labelKey);
    rowLabelKeys.set(span, labelKey);
    row.append(span, tg);
    tg.addEventListener('click', () => {
      click();
      settings = { ...settings, [key]: !settings[key] };
      syncToggles();
      handlers.onSettingsChanged({ ...settings });
    });
    return row;
  };
  const tgMusic = mkToggle('setMusic', 'music', 'toggle-music');
  const tgSfx = mkToggle('setSfx', 'sfx', 'toggle-sfx');
  const tgHaptics = mkToggle('setHaptics', 'haptics', 'toggle-haptics');
  setList.append(tgMusic, tgSfx, tgHaptics);
  const btnSetBack = el<HTMLButtonElement>('button', 'btn primary', 'btn-settings-back');
  btnSetBack.textContent = t('done');
  setScr.append(setH, setList, btnSetBack);
  btnSetBack.addEventListener('click', () => {
    click();
    // возврат туда, откуда пришли: при живой игре — pause, иначе menu
    show(lastNonSettings === 'game' ? 'pause' : lastNonSettings === 'onboarding' ? 'onboarding' : 'menu');
  });
  const toggleNodes = {
    music: tgMusic.querySelector('.toggle') as HTMLElement,
    sfx: tgSfx.querySelector('.toggle') as HTMLElement,
    haptics: tgHaptics.querySelector('.toggle') as HTMLElement,
  };
  const syncToggles = (): void => {
    toggleNodes.music.classList.toggle('on', !!settings.music);
    toggleNodes.sfx.classList.toggle('on', !!settings.sfx);
    toggleNodes.haptics.classList.toggle('on', !!settings.haptics);
    toggleNodes.music.setAttribute('aria-checked', String(!!settings.music));
    toggleNodes.sfx.setAttribute('aria-checked', String(!!settings.sfx));
    toggleNodes.haptics.setAttribute('aria-checked', String(!!settings.haptics));
  };

  // --- orientation ---
  const orientScr = mkScreen('orientation');
  const phone = el<HTMLDivElement>('div', 'phone');
  phone.textContent = '📱';
  const orientP = el<HTMLParagraphElement>('p');
  orientP.textContent = t('orientMsg');
  orientScr.append(phone, orientP);

  // --- onboarding ---
  const obScr = mkScreen('onboarding');
  const obTitle = el<HTMLHeadingElement>('h2', 'ob-title');
  const obHint = el<HTMLDivElement>('div', 'ob-hint');
  const obDemo = el<HTMLDivElement>('div', 'ob-demo');
  const obHand = el<HTMLDivElement>('div', 'ob-hand');
  obHand.textContent = '👆';
  obDemo.append(obHand);
  const obDots = el<HTMLDivElement>('div', 'ob-dots');
  const dotEls: HTMLSpanElement[] = [];
  for (let i = 0; i < OB_STEPS.length; i++) {
    const d = el<HTMLSpanElement>('i');
    dotEls.push(d);
    obDots.append(d);
  }
  const btnObNext = el<HTMLButtonElement>('button', 'btn primary', 'ob-next');
  btnObNext.textContent = t('obNext');
  const btnObSkip = el<HTMLButtonElement>('button', 'btn ghost', 'ob-skip');
  btnObSkip.textContent = t('obSkip');
  const obActions = el<HTMLDivElement>('div', 'ob-actions');
  obActions.append(btnObSkip, btnObNext);
  obScr.append(obDemo, obTitle, obHint, obDots, obActions);
  let obStep = 0;
  const renderOb = (): void => {
    const s = OB_STEPS[obStep];
    obTitle.textContent = t(s.title);
    obHint.textContent = t(s.hint);
    obDemo.className = 'ob-demo ' + s.demoClass;
    dotEls.forEach((d, i) => d.classList.toggle('on', i === obStep));
    btnObNext.textContent = obStep === OB_STEPS.length - 1 ? t('obStart') : t('obNext');
  };
  renderOb();
  btnObNext.addEventListener('click', () => {
    click();
    if (obStep < OB_STEPS.length - 1) {
      obStep++;
      renderOb();
    } else {
      obStep = 0;
      renderOb();
      handlers.onOnboardingDone();
    }
  });
  btnObSkip.addEventListener('click', () => {
    click();
    obStep = 0;
    renderOb();
    handlers.onOnboardingDone();
  });

  screens.set('game', hud); // 'game' не оверлей; управляется флагами ниже

  // ======================= show / current =======================
  let lastNonSettings: ScreenName = 'menu';

  function show(name: ScreenName): void {
    screen = name;
    for (const [n, node] of screens) {
      if (n === 'game' || n === 'settings') continue;
      node.classList.toggle('active', n === name);
    }
    if (name !== 'settings') lastNonSettings = name;
    const gameVisible = name === 'game' || name === 'pause';
    hud.classList.toggle('active', gameVisible);
    controls.classList.toggle('active', gameVisible);
    touchZone.classList.toggle('active', name === 'game');
    if (name === 'settings') {
      const target = screens.get('settings')!;
      for (const node of screens.values()) node.classList.remove('active');
      target.classList.add('active');
    } else {
      // уходим из настроек: их overlay цикл выше намеренно не трогает
      screens.get('settings')!.classList.remove('active');
    }
    root.setAttribute('data-phase', phaseFor(name));
  }

  const phaseFor = (name: ScreenName): string =>
    name === 'game' ? 'playing' : name === 'pause' ? 'paused' : name === 'gameover' ? 'gameover' : 'menu';

  // ======================= HUD update =======================
  const txt = (node: HTMLElement, v: string): void => {
    if (node.textContent !== v) node.textContent = v;
  };
  let lastQueueKey = '';
  let lastFinalKey = '';

  const holdCtx = holdCanvas.getContext('2d');
  const nextCtx = nextCanvas.getContext('2d');

  function drawPreviews(state: GameStateSnapshot): void {
    if (holdCtx) {
      holdCtx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
      const cell = 32;
      if (state.hold) {
        const cells = PIECES[state.hold][0];
        let minX = 9, maxX = -9;
        for (const c of cells) {
          if (c.x < minX) minX = c.x;
          if (c.x > maxX) maxX = c.x;
        }
        drawMiniPiece(holdCtx, state.hold, cell,
          (holdCanvas.width - (maxX - minX + 1) * cell) / 2 - minX * cell, 40);
      }
    }
    if (nextCtx) {
      nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
      const cell = 24;
      const slot = 50;
      const n = Math.min(NEXT_PREVIEW_SIZE, state.queue.length);
      for (let i = 0; i < n; i++) {
        const kind = state.queue[i];
        const cells = PIECES[kind][0];
        let minX = 9, maxX = -9, minY = 9, maxY = -9;
        for (const c of cells) {
          if (c.x < minX) minX = c.x;
          if (c.x > maxX) maxX = c.x;
          if (c.y < minY) minY = c.y;
          if (c.y > maxY) maxY = c.y;
        }
        const oy = i * slot + (slot - (maxY - minY + 1) * cell) / 2 - minY * cell + 12;
        drawMiniPiece(nextCtx, kind, cell,
          (nextCanvas.width - (maxX - minX + 1) * cell) / 2 - minX * cell, oy);
      }
    }
  }

  function updateHud(state: GameStateSnapshot): void {
    txt(scoreBig, String(state.score));
    const highV = menuHigh.querySelector('[data-testid="menu-high-value"]') as HTMLElement | null;
    if (highV) txt(highV, String(state.highScore));
    txt(highStat.querySelector('[data-testid="hud-high"]')!, String(state.highScore));
    txt(linesStat.querySelector('[data-testid="hud-lines"]')!, String(state.lines));
    txt(levelStat.querySelector('[data-testid="hud-level"]')!, String(state.level));
    holdSlot.classList.toggle('used', !state.canHold);

    const previewKey =
      (state.hold ?? '-') + (state.canHold ? '1' : '0') + '|' +
      state.queue.slice(0, NEXT_PREVIEW_SIZE).join(',');
    if (previewKey !== lastQueueKey) {
      lastQueueKey = previewKey;
      drawPreviews(state);
    }
    if (state.phase === 'gameover') {
      const fk = `${state.score}|${state.lines}|${state.level}|${state.score >= state.highScore && state.score > 0}`;
      if (fk !== lastFinalKey) {
        lastFinalKey = fk;
        txt(overScore, String(state.score));
        overLines.textContent = t('finalLines') + state.lines;
        overLevel.textContent = t('finalLevel') + state.level;
        newRec.classList.toggle('show', state.score > 0 && state.score >= state.highScore);
      }
    }
  }

  // ======================= keyboard =======================
  const KEY_MAP: Record<string, InputAction> = {
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ArrowDown: 'soft-drop',
    ArrowUp: 'rotate-cw',
    KeyX: 'rotate-cw',
    KeyZ: 'rotate-ccw',
    KeyA: 'rotate-ccw',
    KeyS: 'rotate-180',
    KeyC: 'hold',
    Space: 'hard-drop',
    Escape: 'pause',
    KeyP: 'pause',
  };
  window.addEventListener(
    'keydown',
    (e) => {
      const act = KEY_MAP[e.code];
      if (!act) return;
      e.preventDefault();
      click();
      if (act === 'pause') {
        if (screen === 'game') handlers.onPause();
        else if (screen === 'pause') handlers.onResume();
        return;
      }
      fire(act);
    },
    { passive: false },
  );

  // ======================= touch-жесты =======================
  // Схема (см. touch_scheme в отчёте): drag-x = движение (1 клетка / 24px),
  // drag-y медленный = soft-drop по хвосту свайпа, резкий вниз >4.5 кл. и
  // <300мс = hard-drop, тап = rotate-cw, свайп вверх = hold.
  interface Gesture {
    id: number;
    x0: number;
    y0: number;
    t0: number;
    lx: number;
    ly: number;
    accCells: number; // сколько клеток уже отправлено (со знаком)
    accDown: number; // сколько рядов soft-drop уже отправлено
    moved: boolean;
    downY: number;
    firedHard: boolean;
  }
  let gesture: Gesture | null = null;

  touchZone.addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      touchZone.setPointerCapture(e.pointerId);
      click();
      gesture = {
        id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: performance.now(),
        lx: e.clientX, ly: e.clientY, accCells: 0, accDown: 0, moved: false, downY: e.clientY, firedHard: false,
      };
    },
    { passive: true },
  );

  touchZone.addEventListener(
    'pointermove',
    (e) => {
      const g = gesture;
      if (!g || g.id !== e.pointerId) return;
      const dxTotal = e.clientX - g.x0;
      const dyTotal = e.clientY - g.y0;
      if (!g.moved && Math.hypot(dxTotal, dyTotal) > TAP_SLOP) g.moved = true;

      // горизонт: квантуем по клеткам, отправляем дельту
      const targetCells = Math.round(dxTotal / PX_PER_CELL);
      const sign = Math.sign(targetCells) || 0;
      if (sign !== 0 && Math.abs(targetCells) > Math.abs(g.accCells) && Math.sign(g.accCells || sign) === sign) {
        const steps = Math.abs(targetCells) - Math.abs(g.accCells);
        const act: InputAction = sign > 0 ? 'right' : 'left';
        for (let i = 0; i < steps; i++) fire(act);
        g.accCells = sign * Math.abs(targetCells);
      } else if (sign === 0) {
        g.accCells = 0;
      }

      // вертикаль: вниз = soft drop (1 клетка за PX_PER_CELL движения пальца)
      const downCells = Math.floor(dyTotal / PX_PER_CELL);
      if (downCells > g.accDown) {
        for (let i = 0; i < downCells - g.accDown; i++) fire('soft-drop');
        g.accDown = downCells;
      }
      g.lx = e.clientX;
      g.ly = e.clientY;

      // резкий длинный вниз = hard drop (кнопка HARD остаётся основным способом)
      if (!g.firedHard && dyTotal >= HARD_SWIPE_DIST && performance.now() - g.t0 <= HARD_SWIPE_MS) {
        g.firedHard = true;
        fire('hard-drop');
      }
    },
    { passive: true },
  );

  const endGesture = (e: PointerEvent): void => {
    const g = gesture;
    if (!g || g.id !== e.pointerId) return;
    gesture = null;
    const dt = performance.now() - g.t0;
    const dx = e.clientX - g.x0;
    const dy = e.clientY - g.y0;
    if (!g.moved && dt < TAP_MS) {
      fire('rotate-cw'); // тап = поворот
      return;
    }
    if (dy <= -SWIPE_UP_MIN && Math.abs(dy) > Math.abs(dx)) {
      fire('hold'); // свайп вверх = hold
    }
  };
  touchZone.addEventListener('pointerup', endGesture, { passive: true });
  touchZone.addEventListener('pointercancel', (e) => {
    if (gesture && gesture.id === e.pointerId) gesture = null;
  });

  // ======================= layout/resize =======================
  function layout(): void {
    // синхронизируем CSS-переменные фактических высот HUD/контролов
    const hudH = hud.getBoundingClientRect().height;
    const ctlH = controls.getBoundingClientRect().height;
    const rootStyle = root.ownerDocument!.documentElement.style;
    const hudPx = Math.max(104, Math.round(hudH));
    const ctlPx = Math.max(180, Math.round(ctlH));
    if (rootStyle.getPropertyValue('--hud-h') !== hudPx + 'px') rootStyle.setProperty('--hud-h', hudPx + 'px');
    if (rootStyle.getPropertyValue('--ctl-h') !== ctlPx + 'px') rootStyle.setProperty('--ctl-h', ctlPx + 'px');
  }
  window.addEventListener('resize', layout, { passive: true });
  window.addEventListener('orientationchange', layout, { passive: true });
  layout();

  // ======================= язык =======================
  // Применить текущий settings.lang ко всем узлам DOM (структура не меняется).
  // applySavedLang=false — не трогать DOM, пока реальный язык ещё не известен.
  function applyLang(applySavedLang = true): void {
    if (applySavedLang && settings.lang) lang = settings.lang;
    // HUD
    holdLabel.textContent = t('hudHold');
    nextLabel.textContent = t('hudNext');
    for (const [node, key] of statLabelKeys) {
      if (node.firstChild) node.firstChild.nodeValue = t(key) + ' ';
    }
    // контролы
    ctlHold.innerHTML = '<span class="glyph">⇅</span>' + t('ctlSwap');
    ctlHold.setAttribute('aria-label', t('ctlSwap'));
    ctlPause.innerHTML = '<span class="glyph">⏸</span>' + t('pause');
    ctlPause.setAttribute('aria-label', t('pause'));
    ctlRotate.innerHTML = '<span class="glyph">⟳</span>' + t('ctlRotate');
    ctlRotate.setAttribute('aria-label', t('ctlRotate'));
    ctlHard.innerHTML = '<span class="glyph">⤓</span>' + t('ctlDrop');
    ctlHard.setAttribute('aria-label', t('ctlDrop'));
    // меню (<b> с рекордом не пересоздаём — правим только текстовый префикс)
    logo.textContent = t('logo');
    logoSub.textContent = t('logoSub');
    if (menuHigh.firstChild) menuHigh.firstChild.nodeValue = t('menuHigh');
    btnStart.textContent = t('play');
    btnSettings.textContent = t('settings');
    // пауза
    pauseH.textContent = t('pause');
    btnResume.textContent = t('resume');
    btnRestartPause.textContent = t('restart');
    btnRestartPause.setAttribute('aria-label', t('restartHold'));
    btnPauseSettings.textContent = t('settings');
    btnQuit.textContent = t('quitMenu');
    // gameover
    overH.textContent = t('gameOver');
    newRec.textContent = t('newRecord');
    btnRestart.textContent = t('restart');
    btnRestart.setAttribute('aria-label', t('restartHold'));
    btnQuit2.textContent = t('quitMenu');
    lastFinalKey = ''; // финальные строки перепишет следующий updateHud
    // настройки
    setH.textContent = t('settings');
    for (const [node, key] of rowLabelKeys) node.textContent = t(key);
    btnSetBack.textContent = t('done');
    btnLang.textContent = LANG_LABELS[lang];
    // ориентация / onboarding
    orientP.textContent = t('orientMsg');
    renderOb();
  }
  applyLang();

  function setSettings(s: Settings): void {
    settings = { ...settings, ...s };
    syncToggles();
    if (s.lang) applyLang();
    // если игра живая — не прыгаем на экран настроек
    if (screen !== 'settings') show(screen);
  }

  // старт: экран меню покажет main; выставим phase корректно
  root.setAttribute('data-phase', 'menu');
  for (const node of screens.values()) node.classList.remove('active');

  const api: UI = {
    show,
    current: () => screen,
    updateHud,
    setSettings,
    bindInput(cb) {
      inputCb = cb;
    },
  };
  return api;
}
