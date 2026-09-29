// ============================================================================
// Store over localStorage + best-effort Telegram CloudStorage mirror.
// OWNED BY SA3 (Platform/QA).
// ============================================================================
import type { PlatformAdapter, Store } from '../shared/types';

function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    // quota exceeded / privacy mode / disabled storage
    return null;
  }
}

function writeLocal(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function createStore(platform: PlatformAdapter): Store {
  return {
    get<T>(key: string, fallback: T): T {
      const raw = readLocal(key) ?? platform.cloudGet(key);
      if (raw === null) return fallback;
      try {
        return JSON.parse(raw) as T;
      } catch {
        // Not JSON — if the fallback is a string, hand back the raw value.
        if (typeof fallback === 'string') return raw as unknown as T;
        return fallback;
      }
    },

    set(key: string, value: unknown): void {
      let raw: string;
      try {
        raw = JSON.stringify(value);
      } catch {
        return; // unserializable — nothing we can persist
      }
      const ok = writeLocal(key, raw);
      // Best-effort Telegram cloud mirror (fire & forget; cloudSet never
      // throws per PlatformAdapter contract). Also the fallback path when
      // localStorage is dead (quota/privacy mode).
      if (isTelegramKey(key) || !ok) {
        try {
          platform.cloudSet(key, raw);
        } catch {
          /* best effort */
        }
      }
    },
  };
}

/** Keys that belong in the cross-device cloud mirror (project: Blockfall). */
function isTelegramKey(key: string): boolean {
  return key.startsWith('blockfall:') || key.startsWith('tgcloud:');
}
