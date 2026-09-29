// ============================================================================
// Telegram WebApp mock — Playwright init script (runs before page scripts).
// OWNED BY SA3. Mirrors the subset of telegram-web-app.js that Blockfall's
// PlatformAdapter touches, and records every call into window.__tgLog so
// specs can assert on SDK usage.
// ============================================================================

/** Text of the init script (string, not a function — avoids closure issues). */
export const telegramMockInitScript = `(() => {
  const log = [];
  window.__tgLog = log;
  const rec = (name) => (...args) => {
    log.push({ name, args });
    if (name === 'HapticFeedback.impactOccurred' || name === 'HapticFeedback.notificationOccurred') {
      log.push({ name: 'haptic', args });
    }
  };
  const handlers = {};
  window.__tgFire = (name, data) => {
    (handlers[name] || []).forEach((cb) => { try { cb(data); } catch (e) {} });
  };

  let closingConfirmation = false;

  const webApp = {
    initData:
      'web_app_id=123456&hash=ABCDEF&auth_date=' + Math.floor(Date.now() / 1000) +
      '&query_id=AAHeE9sEAQ&user=%7B%22id%22%3A111%2C%22first_name%22%3A%22QA%22%2C%22username%22%3A%22qabot_test%22%2C%22language_code%22%3A%22ru%22%7D',
    platform: 'ios',
    colorScheme: 'dark',
    themeParams: {
      bg_color: '#12283a',
      text_color: '#f2f6ff',
      hint_color: '#93a4b8',
      button_color: '#5fd4d0',
      button_text_color: '#0d1b26',
    },
    version: '8.0',
    isVersionSupported: () => true,
    ready: rec('ready'),
    expand: rec('expand'),
    setColorScheme: rec('setColorScheme'),
    setHeaderColor: rec('setHeaderColor'),
    disableVerticalSwipes: rec('disableVerticalSwipes'),
    enableClosingConfirmation: () => { closingConfirmation = true; rec('enableClosingConfirmation')(); },
    disableClosingConfirmation: () => { closingConfirmation = false; rec('disableClosingConfirmation')(); },
    onEvent(name, cb) {
      (handlers[name] = handlers[name] || []).push(cb);
      log.push({ name: 'onEvent', args: [name] });
    },
    offEvent(name, cb) {
      handlers[name] = (handlers[name] || []).filter((f) => f !== cb);
    },
    HapticFeedback: {
      impactOccurred: rec('HapticFeedback.impactOccurred'),
      notificationOccurred: rec('HapticFeedback.notificationOccurred'),
      selectionChanged: rec('HapticFeedback.selectionChanged'),
    },
    CloudStorage: {
      // in-memory cloud backing store
      _store: {},
      setItem(key, value, cb) {
        log.push({ name: 'CloudStorage.setItem', args: [key, value] });
        webApp.CloudStorage._store[key] = String(value);
        if (cb) cb(null, true);
      },
      getItem(key, cb) {
        log.push({ name: 'CloudStorage.getItem', args: [key] });
        if (cb) cb(null, Object.prototype.hasOwnProperty.call(webApp.CloudStorage._store, key) ? webApp.CloudStorage._store[key] : null);
      },
      getKeys(cb) {
        log.push({ name: 'CloudStorage.getKeys', args: [] });
        if (cb) cb(null, Object.keys(webApp.CloudStorage._store));
      },
    },
    BackButton: {
      visible: false,
      _cbs: [],
      show() { this.visible = true; log.push({ name: 'BackButton.show' }); },
      hide() { this.visible = false; log.push({ name: 'BackButton.hide' }); },
      onClick(cb) { this._cbs.push(cb); log.push({ name: 'BackButton.onClick' }); },
      offClick(cb) { this._cbs = this._cbs.filter((f) => f !== cb); },
      _fire() { this._cbs.forEach((cb) => cb()); },
    },
    screen: {
      lockOrientation: rec('screen.lockOrientation'),
      unlockOrientation: rec('screen.unlockOrientation'),
    },
  };

  window.__tgClosingConfirmation = () => closingConfirmation;
  window.Telegram = Object.freeze({ WebApp: webApp });
})();`;

export default telegramMockInitScript;
