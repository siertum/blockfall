// ============================================================================
// Blockfall — Canvas2D рендерер (src/render). Зона SA2.
// Стиль: тёмный сад-градиент, блоки — светящиеся «пузыри» (radial highlight +
// glow). Спрайты кешируются offscreen по (цвет, размер клетки): в кадровом
// цикле только drawImage, никаких градиентов/shadowBlur на каждый блок.
// Решение по объёму: next/hold-превью и HUD-цифры рисуются DOM-канвасами в
// src/ui/ui.ts — ЗДЕСЬ только поле, активная фигура, ghost и эффекты.
// render() не дёргает layout: размеры кэшированы в resize(); DOM read-back в
// render() отсутствует. Аллокации в цикле минимальны: частицы в типизированных
// массивах со swap-remove; diff board — переиспользуемый кэш prevBoard.
// ============================================================================
import type { Cell, GameEvent, GameStateSnapshot, PieceKind, Renderer } from '../shared/types';
import {
  BG_BOTTOM,
  BG_TOP,
  CLEAR_ANIM_MS,
  COLS,
  FIELD_TINT,
  GRID_LINE,
  PIECE_COLORS,
  PIECES,
  ROWS,
} from '../shared/constants';

let currentDpr = 1;

// ---------- sprite cache: ключ = kind + округлённый размер клетки ----------
interface Sprite {
  canvas: HTMLCanvasElement;
  pad: number; // ореол glow вокруг клетки, CSS-px
}
const spriteCache = new Map<string, Sprite>();

function makeSprite(size: number, kind: PieceKind): Sprite {
  const pad = Math.max(4, size * 0.45);
  const dim = Math.ceil(size + pad * 2);
  const dpr = currentDpr;
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.ceil(dim * dpr));
  c.height = Math.max(2, Math.ceil(dim * dpr));
  const ctx = c.getContext('2d')!;
  ctx.scale(dpr, dpr);
  const col = PIECE_COLORS[kind];
  const x = pad;
  const y = pad;
  const inset = size * 0.07;
  ctx.save();
  ctx.shadowColor = col.glow;
  ctx.shadowBlur = size * 0.55;
  const g = ctx.createRadialGradient(
    x + size * 0.35, y + size * 0.3, size * 0.06,
    x + size * 0.5, y + size * 0.56, size * 0.78,
  );
  g.addColorStop(0, col.hi);
  g.addColorStop(0.4, col.base);
  g.addColorStop(1, col.base);
  ctx.fillStyle = g;
  roundRect(ctx, x + inset, y + inset, size - inset * 2, size - inset * 2, size * 0.34);
  ctx.fill();
  ctx.restore();
  // блик-капля
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.ellipse(x + size * 0.33, y + size * 0.27, size * 0.15, size * 0.09, -0.6, 0, Math.PI * 2);
  ctx.fill();
  return { canvas: c, pad };
}

function getSprites(size: number, kind: PieceKind): Sprite {
  const key = kind + '@' + Math.round(size * 2);
  let s = spriteCache.get(key);
  if (!s) {
    s = makeSprite(size, kind);
    spriteCache.set(key, s);
  }
  return s;
}

function roundRect(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------- particles: пул в типизированных массивах, без new в кадре -------
const MAX_P = 480;
const pX = new Float32Array(MAX_P);
const pY = new Float32Array(MAX_P);
const pVX = new Float32Array(MAX_P);
const pVY = new Float32Array(MAX_P);
const pLife = new Float32Array(MAX_P); // сек
const pMax = new Float32Array(MAX_P);
const pSize = new Float32Array(MAX_P);
const pCol = new Uint8Array(MAX_P); // индекс в KIND_LIST
let pCount = 0;
const KIND_LIST: PieceKind[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
const PARTICLE_COLORS: string[] = KIND_LIST.map((k) => PIECE_COLORS[k].hi);

function spawn(x: number, y: number, vx: number, vy: number, life: number, col: number, size: number): void {
  if (pCount >= MAX_P) return;
  const i = pCount++;
  pX[i] = x; pY[i] = y; pVX[i] = vx; pVY[i] = vy;
  pLife[i] = life; pMax[i] = life; pSize[i] = size; pCol[i] = col;
}

function killParticle(i: number): void {
  pCount--;
  pX[i] = pX[pCount]; pY[i] = pY[pCount];
  pVX[i] = pVX[pCount]; pVY[i] = pVY[pCount];
  pLife[i] = pLife[pCount]; pMax[i] = pMax[pCount];
  pSize[i] = pSize[pCount]; pCol[i] = pCol[pCount];
}

// ---------- layout ----------
interface Layout {
  cell: number;
  ox: number;
  oy: number;
  w: number;
  h: number;
  cssW: number;
  cssH: number;
}

class FieldRenderer implements Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private L: Layout = { cell: 10, ox: 0, oy: 0, w: 0, h: 0, cssW: 0, cssH: 0 };

  // clear: flash + схлопывание строк за CLEAR_ANIM_MS
  private tClear = -1;
  private tFlash = -1;
  private clearRows: number[] = [];

  // hard-drop: squash приземления + трэйл падения
  private tSquash = -1;
  private tTrail = -1;
  private dropDist = 0;
  private dropTop = 0;    // верх bbox приземлившихся клеток, CSS px
  private dropBottom = 0; // низ bbox, CSS px
  private dropX0 = 0;     // левый край bbox, CSS px
  private dropX1 = 0;     // правый край bbox, CSS px
  private dropKind: PieceKind = 'O';
  private dropValid = false;

  // combo ring
  private tRing = -1;
  private ringY = 0;

  // level-up wave
  private tWave = -1;

  // game over fade
  private over = 0;
  private overTarget = 0;

  // board предыдущего кадра: hard-drop event несёт только число клеток,
  // геометрию приземления восстанавливаем diff'ом board прошлый vs текущий.
  private prevBoard: Cell[][] = [];
  private curBoard: Cell[][] | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Blockfall renderer: 2D context unavailable');
    this.ctx = ctx;
    this.resize();
  }

  resize(): void {
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    currentDpr = dpr;
    // layout read — только здесь (resize / смена фазы), никогда в render()
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    const bw = Math.max(2, Math.round(w * dpr));
    const bh = Math.max(2, Math.round(h * dpr));
    if (this.canvas.width !== bw || this.canvas.height !== bh) {
      this.canvas.width = bw;
      this.canvas.height = bh;
    }
    const cs = getComputedStyle(this.canvas.ownerDocument!.documentElement);
    const hudH = parseFloat(cs.getPropertyValue('--hud-h')) || 104;
    const ctlH = parseFloat(cs.getPropertyValue('--ctl-h')) || 180;
    const margin = Math.max(8, Math.min(16, w * 0.02));
    const availH = Math.max(140, h - hudH - ctlH - margin);
    const availW = Math.max(140, w - margin * 2);
    const cell = Math.max(8, Math.floor(Math.min(availW / COLS, availH / ROWS)));
    const fw = cell * COLS;
    const fh = cell * ROWS;
    this.L = {
      cell,
      ox: Math.round((w - fw) / 2),
      oy: Math.round(hudH + margin / 2 + (availH - fh) / 2),
      w: fw,
      h: fh,
      cssW: w,
      cssH: h,
    };
    spriteCache.clear(); // размер клетки поменялся — спрайты устарели
  }

  idle(): boolean {
    return (
      this.tClear < 0 && this.tFlash < 0 && this.tSquash < 0 &&
      this.tTrail < 0 && this.tRing < 0 && this.tWave < 0 && pCount === 0
    );
  }

  // ------------------------------------------------------------------ pulse
  pulse(events: GameEvent[]): void {
    const { cell, ox, oy } = this.L;
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      switch (e.type) {
        case 'line-clear': {
          this.clearRows = e.rows.slice();
          this.tClear = 0;
          this.tFlash = 0;
          // пузырьки вверх по всей чистимой линии
          for (let r = 0; r < e.rows.length; r++) {
            for (let c = 0; c < COLS; c++) {
              spawn(
                ox + (c + 0.5) * cell, oy + (e.rows[r] + 0.5) * cell,
                (Math.random() - 0.5) * cell * 5.5,
                -Math.random() * cell * 6 - cell * 1.5,
                0.45 + Math.random() * 0.4,
                (Math.random() * KIND_LIST.length) | 0,
                cell * (0.14 + Math.random() * 0.18),
              );
            }
          }
          if (e.count >= 4) {
            // tetris: радиальный всплеск
            const cy = oy + (e.rows[e.rows.length - 1] + 0.5) * cell;
            for (let k = 0; k < 54; k++) {
              const a = (k / 54) * Math.PI * 2;
              spawn(ox + this.L.w / 2, cy, Math.cos(a) * cell * 8, Math.sin(a) * cell * 8,
                0.65, 2, cell * 0.18);
            }
          }
          if (e.combo > 0) {
            // combo: ring particles + кольцо
            this.tRing = 0;
            this.ringY = oy + (e.rows[0] + 0.5) * cell;
            const rx = ox + this.L.w / 2;
            for (let k = 0; k < 24; k++) {
              const a = (k / 24) * Math.PI * 2;
              spawn(rx + Math.cos(a) * cell, this.ringY + Math.sin(a) * cell * 0.6,
                Math.cos(a) * cell * 4.5, Math.sin(a) * cell * 4.5,
                0.45, 1, cell * 0.14);
            }
          }
          break;
        }
        case 'hard-drop': {
          this.captureDrop(e.cells);
          if (this.dropValid) {
            this.tSquash = 0;
            if (e.cells > 1) this.tTrail = 0;
          }
          break;
        }
        case 'level-up': {
          this.tWave = 0;
          break;
        }
        case 'game-over': {
          this.overTarget = 1;
          break;
        }
        default:
          break;
      }
    }
  }

  /** bbox клеток приземления из diff'а board прошлый кадр vs текущий. */
  private captureDrop(cells: number): void {
    this.dropValid = false;
    const now = this.curBoard;
    if (!now || this.prevBoard.length !== ROWS) return;
    const { cell, ox, oy } = this.L;
    let minX = COLS, maxX = -1, minY = ROWS, maxY = -1;
    let kind: PieceKind = 'O';
    let found = false;
    for (let r = 0; r < ROWS; r++) {
      const prevRow = this.prevBoard[r];
      const nowRow = now[r];
      if (!nowRow) continue;
      for (let c = 0; c < COLS; c++) {
        const v = nowRow[c];
        if (v !== 0 && (!prevRow || prevRow[c] === 0)) {
          found = true;
          kind = v;
          if (c < minX) minX = c;
          if (c > maxX) maxX = c;
          if (r < minY) minY = r;
          if (r > maxY) maxY = r;
        }
      }
    }
    if (!found) return;
    this.dropValid = true;
    this.dropKind = kind;
    this.dropDist = cells;
    this.dropX0 = ox + minX * cell;
    this.dropX1 = ox + (maxX + 1) * cell;
    this.dropTop = oy + Math.max(0, minY) * cell;
    this.dropBottom = oy + (maxY + 1) * cell;
  }

  // ----------------------------------------------------------------- render
  render(state: GameStateSnapshot, dtMs: number): void {
    const dt = Math.min(50, Math.max(0, dtMs));
    const { cell, ox, oy, w, h, cssW, cssH } = this.L;
    const ctx = this.ctx;
    const dpr = currentDpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // фон: вертикальный градиент + мягкие «капельные» vignette
    const bg = ctx.createLinearGradient(0, 0, 0, cssH);
    bg.addColorStop(0, BG_TOP);
    bg.addColorStop(1, BG_BOTTOM);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, cssW, cssH);
    this.drawVignettes(ctx, cssW, cssH);

    // рамка поля
    ctx.fillStyle = FIELD_TINT;
    roundRect(ctx, ox - 6, oy - 6, w + 12, h + 12, 14);
    ctx.fill();

    // flash клира
    let flashK = 0;
    if (this.tFlash >= 0) {
      this.tFlash += dt;
      flashK = Math.max(0, 1 - this.tFlash / 180);
      if (this.tFlash >= 180) this.tFlash = -1;
    }
    if (flashK > 0) {
      ctx.fillStyle = 'rgba(235,255,244,' + (0.2 * flashK).toFixed(3) + ')';
      ctx.fillRect(ox, oy, w, h);
    }

    // сетка — едва заметная
    ctx.strokeStyle = GRID_LINE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let c = 1; c < COLS; c++) {
      const x = Math.round(ox + c * cell) + 0.5;
      ctx.moveTo(x, oy);
      ctx.lineTo(x, oy + h);
    }
    for (let r = 1; r < ROWS; r++) {
      const y = Math.round(oy + r * cell) + 0.5;
      ctx.moveTo(ox, y);
      ctx.lineTo(ox + w, y);
    }
    ctx.stroke();

    // clear-анимация: flash + collapse 320ms строк из снимка pulse.
    let clearK = -1;
    if (this.tClear >= 0) {
      this.tClear += dt;
      clearK = Math.min(1, this.tClear / CLEAR_ANIM_MS);
      if (this.tClear >= CLEAR_ANIM_MS) {
        this.tClear = -1;
        this.clearRows = [];
      }
    }
    const clearing = this.tClear >= 0 ? this.clearRows : null;

    // board
    this.curBoard = state.board;
    for (let r = 0; r < ROWS; r++) {
      const row = state.board[r];
      if (!row) continue;
      if (clearing !== null && clearing.indexOf(r) >= 0) {
        const sq = Math.max(0.02, 1 - clearK);
        const cy = oy + (r + 0.5) * cell;
        ctx.save();
        ctx.globalAlpha = 1 - clearK;
        ctx.translate(0, cy);
        ctx.scale(1 + (1 - sq) * 0.25, sq);
        ctx.translate(0, -cy);
        this.drawRow(ctx, row, r);
        ctx.restore();
      } else {
        this.drawRow(ctx, row, r);
      }
    }

    // ghost — контурный пузырь 35% alpha
    if (state.active && state.ghost && state.phase === 'playing') {
      this.drawPiece(ctx, state.ghost.kind, state.ghost.pos.x, state.ghost.pos.y, state.ghost.rot, 0.35, true);
    }

    // active
    if (state.active && state.phase === 'playing') {
      this.drawPiece(ctx, state.active.kind, state.active.pos.x, state.active.pos.y, state.active.rot, 1, false);
    }

    // hard-drop trail: световая полоса по пути падения
    if (this.tTrail >= 0) {
      this.tTrail += dt;
      const k = this.tTrail / 240;
      if (k >= 1) this.tTrail = -1;
      else {
        const top = Math.max(oy, this.dropTop - this.dropDist * cell);
        const g = ctx.createLinearGradient(0, top, 0, this.dropTop);
        const a = 0.3 * (1 - k);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(1, 'rgba(255,255,255,' + a.toFixed(3) + ')');
        ctx.save();
        ctx.beginPath();
        ctx.rect(ox, oy, w, h);
        ctx.clip();
        ctx.fillStyle = g;
        ctx.fillRect(this.dropX0 + cell * 0.15, top, this.dropX1 - this.dropX0 - cell * 0.3, this.dropTop - top);
        ctx.restore();
      }
    }

    // landing squash: приземлившиеся блоки «шлёпаются» (сплюснутый блин)
    if (this.tSquash >= 0) {
      this.tSquash += dt;
      const k = this.tSquash / 220;
      if (k >= 1) this.tSquash = -1;
      else if (this.dropValid) {
        const spr = getSprites(cell, this.dropKind);
        const sy = 1 - 0.3 * Math.sin(Math.PI * Math.min(1, k * 1.1)) * (1 - k * 0.4);
        const sx = 1 + (1 - sy) * 0.8;
        ctx.save();
        ctx.globalAlpha = 0.55 * (1 - k);
        const r0 = Math.max(0, Math.floor((this.dropTop - oy) / cell));
        const r1 = Math.min(ROWS - 1, Math.floor((this.dropBottom - oy) / cell));
        const c0 = Math.max(0, Math.floor((this.dropX0 - ox) / cell));
        const c1 = Math.min(COLS - 1, Math.floor((this.dropX1 - ox) / cell) - 1);
        for (let r = r0; r <= r1; r++) {
          const row = state.board[r];
          if (!row) continue;
          const y = oy + r * cell;
          for (let c = c0; c <= c1; c++) {
            if (row[c] !== this.dropKind) continue;
            const x = ox + c * cell;
            const pcx = x + cell / 2;
            const pcy = y + cell * 0.9;
            ctx.save();
            ctx.translate(pcx, pcy);
            ctx.scale(sx, sy);
            ctx.translate(-pcx, -pcy);
            ctx.drawImage(spr.canvas, x - spr.pad, y - spr.pad, cell + spr.pad * 2, cell + spr.pad * 2);
            ctx.restore();
          }
        }
        ctx.restore();
      }
    }

    // combo ring: расходящееся кольцо
    if (this.tRing >= 0) {
      this.tRing += dt;
      const k = this.tRing / 420;
      if (k >= 1) this.tRing = -1;
      else {
        ctx.save();
        ctx.globalAlpha = 0.55 * (1 - k);
        ctx.strokeStyle = PIECE_COLORS.O.hi;
        ctx.lineWidth = 3 * (1 - k) + 1;
        ctx.beginPath();
        ctx.ellipse(ox + w / 2, this.ringY, cell * 1.5 + k * w * 0.62, cell + k * w * 0.42, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // level-up: мягкая волна снизу вверх
    if (this.tWave >= 0) {
      this.tWave += dt;
      const k = this.tWave / 750;
      if (k >= 1) this.tWave = -1;
      else {
        ctx.save();
        ctx.globalAlpha = 0.4 * (1 - k);
        const edge = oy + h * (1 - k);
        const g = ctx.createLinearGradient(0, edge - h * 0.25, 0, edge);
        g.addColorStop(0, 'rgba(215,255,225,0)');
        g.addColorStop(1, 'rgba(215,255,225,0.9)');
        ctx.fillStyle = g;
        ctx.fillRect(ox, edge - h * 0.25, w, h * 0.25);
        ctx.restore();
      }
    }

    // particles
    this.stepParticles(ctx, dt / 1000, dpr);

    // game over: desaturate + затемнение
    this.overTarget = state.over || state.phase === 'gameover' ? 1 : 0;
    this.over += (this.overTarget - this.over) * Math.min(1, dt / 450);
    if (this.over > 0.02) {
      ctx.save();
      ctx.globalCompositeOperation = 'saturation';
      ctx.globalAlpha = Math.min(1, this.over * 1.2);
      ctx.fillStyle = 'rgb(128,128,128)';
      ctx.fillRect(0, 0, cssW, cssH);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(4,11,13,' + (0.38 * this.over).toFixed(3) + ')';
      ctx.fillRect(0, 0, cssW, cssH);
      ctx.restore();
    }

    // запоминаем board для diff'а (pulse hard-drop приходит после render'а тика)
    this.snapshotBoard(state.board);
  }

  private snapshotBoard(board: Cell[][]): void {
    if (this.prevBoard.length !== ROWS) {
      this.prevBoard = new Array(ROWS);
      for (let r = 0; r < ROWS; r++) this.prevBoard[r] = new Array(COLS).fill(0);
    }
    for (let r = 0; r < ROWS; r++) {
      const dst = this.prevBoard[r];
      const src = board[r];
      for (let c = 0; c < COLS; c++) dst[c] = src ? src[c] : 0;
    }
  }

  private drawRow(ctx: CanvasRenderingContext2D, row: Cell[], r: number): void {
    const { cell, ox, oy } = this.L;
    const y = oy + r * cell;
    for (let c = 0; c < COLS; c++) {
      const kind = row[c];
      if (kind === 0) continue;
      const s = getSprites(cell, kind);
      const x = ox + c * cell;
      ctx.drawImage(s.canvas, x - s.pad, y - s.pad, cell + s.pad * 2, cell + s.pad * 2);
    }
  }

  private drawPiece(
    ctx: CanvasRenderingContext2D, kind: PieceKind, x: number, y: number, rot: number,
    alpha: number, outline: boolean,
  ): void {
    const { cell, ox, oy } = this.L;
    const cells = PIECES[kind][rot & 3];
    ctx.save();
    ctx.globalAlpha = alpha;
    for (let i = 0; i < cells.length; i++) {
      const gy = y + cells[i].y;
      if (gy < -1) continue; // спавн выше видимого поля
      const bx = ox + (x + cells[i].x) * cell;
      const by = oy + gy * cell;
      if (outline) {
        const col = PIECE_COLORS[kind];
        roundRect(ctx, bx + cell * 0.12, by + cell * 0.12, cell * 0.76, cell * 0.76, cell * 0.3);
        ctx.fillStyle = col.glow;
        ctx.fill();
        ctx.strokeStyle = col.base;
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        const s = getSprites(cell, kind);
        ctx.drawImage(s.canvas, bx - s.pad, by - s.pad, cell + s.pad * 2, cell + s.pad * 2);
      }
    }
    ctx.restore();
  }

  private drawVignettes(ctx: CanvasRenderingContext2D, cw: number, ch: number): void {
    const g1 = ctx.createRadialGradient(cw * 0.18, ch * 0.06, 8, cw * 0.18, ch * 0.06, cw * 0.55);
    g1.addColorStop(0, 'rgba(95,212,208,0.10)');
    g1.addColorStop(1, 'rgba(95,212,208,0)');
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, cw, ch);
    const g2 = ctx.createRadialGradient(cw * 0.85, ch * 0.92, 8, cw * 0.85, ch * 0.92, cw * 0.6);
    g2.addColorStop(0, 'rgba(181,123,238,0.10)');
    g2.addColorStop(1, 'rgba(181,123,238,0)');
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, cw, ch);
    const gv = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.45, cw / 2, ch / 2, Math.max(cw, ch) * 0.8);
    gv.addColorStop(0, 'rgba(0,0,0,0)');
    gv.addColorStop(1, 'rgba(0,0,0,0.4)');
    ctx.fillStyle = gv;
    ctx.fillRect(0, 0, cw, ch);
  }

  private stepParticles(ctx: CanvasRenderingContext2D, dtSec: number, dpr: number): void {
    if (pCount === 0) return;
    const grav = 11 * this.L.cell;
    ctx.save();
    let i = 0;
    while (i < pCount) {
      pLife[i] -= dtSec;
      if (pLife[i] <= 0) {
        killParticle(i);
        continue;
      }
      pVY[i] += grav * dtSec;
      pX[i] += pVX[i] * dtSec;
      pY[i] += pVY[i] * dtSec;
      const k = pLife[i] / pMax[i];
      ctx.globalAlpha = 0.9 * k;
      ctx.fillStyle = PARTICLE_COLORS[pCol[i]];
      ctx.beginPath();
      ctx.arc(pX[i], pY[i], pSize[i] * (0.5 + 0.5 * k), 0, Math.PI * 2);
      ctx.fill();
      i++;
    }
    ctx.restore();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}

export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  return new FieldRenderer(canvas);
}
