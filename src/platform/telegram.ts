// ============================================================================
// Telegram WebApp platform adapter. OWNED BY SA3 (Platform/QA).
// All Telegram SDK access goes through optional chaining — the adapter must
// degrade silently to a no-op in a plain browser.
// ============================================================================
import type { HapticNotification, HapticStyle, PlatformAdapter } from '../shared/types';

// NOTE: project renamed to Blockfall. Storage keys are 'blockfall:settings' /
// 'blockfall:highscore' (src/shared/types.ts is Lead-owned; whatever keys main
// passes to Store/cloudSet are mirrored here by name, none are hardcoded).

// telegram-web-app.js is a classic script (see index.html); access via cast.
function tg(): WebApp | null {
  const t = (window as { Telegram?: { WebApp?: WebApp } }).Telegram;
  return t?.WebApp ?? null;
}

// ---------- Local typings of the subset of the Telegram WebApp SDK we use ----------
interface BackButtonLike {
  visible?: boolean;
  show(): void;
  hide(): void;
  onClick(cb: () => void): void;
  offClick?(cb: () => void): void;
}

interface HapticLike {
  impactOccurred?(style: string): void;
  notificationOccurred?(type: string): void;
  selectionChanged?(): void;
  // Legacy (pre-7.7) style-specific methods, kept as fallbacks:
  lightImpactOccurred?(): void;
  mediumImpactOccurred?(): void;
  heavyImpactOccurred?(): void;
  rigidImpactOccurred?(): void;
  softImpactOccurred?(): void;
  notificationVibration?(type: string): void;
}

interface CloudStorageLike {
  setItem?(key: string, value: string, cb?: (e: unknown, result?: boolean) => void): void;
  getItem?(key: string, cb: (e: unknown, result?: string | null) => void): void;
  getKeys?(cb: (e: unknown, result?: string[]) => void): void;
}

interface ThemeParamsLike {
  bg_color?: string;
  [k: string]: string | undefined;
}

interface WebApp {
  initData: string;
  platform?: string;
  colorScheme?: string;
  themeParams?: ThemeParamsLike;
  version?: string;
  isVersionSupported?(v: string): boolean;
  ready?(): void;
  expand?(): void;
  setColorScheme?(scheme: 'light' | 'dark'): void;
  setHeaderColor?(color: string): void;
  disableVerticalSwipes?(): void;
  enableClosingConfirmation?(): void;
  disableClosingConfirmation?(): void;
  onEvent?(name: string, cb: (data?: unknown) => void): void;
  offEvent?(name: string, cb: (data?: unknown) => void): void;
  HapticFeedback?: HapticLike;
  CloudStorage?: CloudStorageLike;
  BackButton?: BackButtonLike;
  screen?: { lockOrientation?(dir: string): unknown };
}

const CLOUD_PREFIX = 'tgcloud:';
/** Max CloudStorage keys to mirror into localStorage at boot. */
const CLOUD_MIRROR_LIMIT = 20;

const STYLE_TO_IMPACT: Record<HapticStyle['style'], 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'> = {
  light: 'light',
  medium: 'medium',
  heavy: 'heavy',
  rigid: 'rigid',
  soft: 'soft',
};

function isNotification(o: HapticStyle | HapticNotification): o is HapticNotification {
  return typeof (o as HapticNotification).type === 'string';
}

function callCbs(list: Array<(arg: boolean) => void>, arg: boolean): void {
  for (const cb of list.slice()) {
    try {
      cb(arg);
    } catch {
      /* consumer callback failed — platform must not break */
    }
  }
}

export function createPlatform(): PlatformAdapter {
  const w = tg();
  const isTelegram = !!w?.initData;

  const visibilityCbs: Array<(visible: boolean) => void> = [];
  const orientationCbs: Array<(portrait: boolean) => void> = [];
  let backCb: (() => void) | null = null;
  let confirmEnabled: boolean | null = null;
  let inited = false;

  const emitOrientation = () => {
    callCbs(orientationCbs, window.innerHeight >= window.innerWidth);
  };

  const webAppEvent = (name: string, handler: (data?: unknown) => void) => {
    try {
      w?.onEvent?.(name, handler);
    } catch {
      /* SDK unavailable */
    }
  };

  /** Fill the localStorage mirror from CloudStorage without blocking the sync contract. */
  const cloudPrefetch = () => {
    const cs = isTelegram ? w?.CloudStorage : undefined;
    if (!cs?.getItem) return;
    try {
      cs.getKeys?.((eKeys, keys) => {
        if (eKeys || !Array.isArray(keys)) return;
        for (const k of keys.slice(0, CLOUD_MIRROR_LIMIT)) {
          try {
            cs.getItem!(k, (eGet, val) => {
              if (eGet || typeof val !== 'string') return;
              try {
                localStorage.setItem(CLOUD_PREFIX + k, val);
              } catch {
                /* quota/privacy mode */
              }
            });
          } catch {
            /* getItem unsupported for this key */
          }
        }
      });
    } catch {
      /* CloudStorage not callable */
    }
  };

  return {
    isTelegram,

    init(): void {
      if (inited) return;
      inited = true;
      if (!w) {
        // Browser fallback for lifecycle signals.
        try {
          document.addEventListener('visibilitychange', () =>
            callCbs(visibilityCbs, document.visibilityState === 'visible'),
          );
        } catch {
          /* no document */
        }
        return;
      }
      try {
        w.ready?.();
        w.expand?.();
        const scheme = w.colorScheme === 'dark' ? 'dark' : 'light';
        w.setColorScheme?.(scheme);
        const header =
          w.themeParams?.bg_color ??
          (typeof document !== 'undefined'
            ? document.querySelector('meta[name="theme-color"]')?.getAttribute('content') ?? '#12283a'
            : '#12283a');
        w.setHeaderColor?.(header);
        w.disableVerticalSwipes?.();
        // Closing confirmation starts off; confirmClose() toggles it when changed.
        confirmEnabled = false;
        w.disableClosingConfirmation?.();
        if (w.platform === 'ios') {
          try {
            w.screen?.lockOrientation?.('portrait');
          } catch {
            /* not supported on this client version */
          }
        }
      } catch {
        /* partial SDK — degrade */
      }

      webAppEvent('activated', () => callCbs(visibilityCbs, true));
      webAppEvent('deactivated', () => callCbs(visibilityCbs, false));
      webAppEvent('viewportChanged', () => emitOrientation());

      // Window fallbacks in addition to Telegram events (resize is idempotent-safe).
      try {
        window.addEventListener('resize', emitOrientation);
        if (!isTelegram) {
          document.addEventListener('visibilitychange', () =>
            callCbs(visibilityCbs, document.visibilityState === 'visible'),
          );
        }
      } catch {
        /* no window events */
      }

      // BackButton: register unconditionally when present (Lead's main decides
      // what the callback does per phase).
      try {
        if (w.BackButton) {
          w.BackButton.onClick(() => backCb?.());
          w.BackButton.show();
        }
      } catch {
        /* BackButton unavailable */
      }

      cloudPrefetch();
    },

    cloudSet(key: string, value: string): void {
      try {
        localStorage.setItem(CLOUD_PREFIX + key, value);
      } catch {
        /* quota/privacy mode */
      }
      // Fire & forget — never await, never throw. Real cloud write only inside
      // Telegram; outside it the localStorage mirror above is the whole store.
      try {
        if (isTelegram) w?.CloudStorage?.setItem?.(key, value, () => undefined);
      } catch {
        /* CloudStorage unavailable (web version) */
      }
    },

    cloudGet(key: string): string | null {
      try {
        return localStorage.getItem(CLOUD_PREFIX + key);
      } catch {
        return null;
      }
    },

    haptic(o: HapticStyle | HapticNotification): void {
      const hf = w?.HapticFeedback;
      if (!hf) return;
      try {
        if (isNotification(o)) {
          if (hf.notificationOccurred) hf.notificationOccurred(o.type);
          else hf.notificationVibration?.(o.type);
        } else {
          const style = STYLE_TO_IMPACT[o.style];
          if (hf.impactOccurred) {
            hf.impactOccurred(style);
          } else {
            // legacy SDK: method name per style
            const legacy = hf[`${style}ImpactOccurred` as keyof HapticLike];
            if (typeof legacy === 'function') (legacy as () => void).call(hf);
            else if (style === 'soft' || style === 'rigid') hf.selectionChanged?.();
          }
        }
      } catch {
        /* haptics are cosmetic */
      }
    },

    onVisibility(cb: (visible: boolean) => void): void {
      visibilityCbs.push(cb);
    },

    onOrientation(cb: (portrait: boolean) => void): void {
      orientationCbs.push(cb);
    },

    confirmClose(enabled: boolean, _message?: string): void {
      if (!w || !tg()) return;
      if (confirmEnabled === enabled) return; // only when changed
      confirmEnabled = enabled;
      try {
        if (enabled) w.enableClosingConfirmation?.();
        else w.disableClosingConfirmation?.();
      } catch {
        /* not supported */
      }
    },

    onBack(cb: () => void): void {
      backCb = cb;
    },

    theme(): 'light' | 'dark' {
      const s = w?.colorScheme;
      return s === 'light' || s === 'dark' ? s : 'dark';
    },
  };
}
