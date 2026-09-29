// ============================================================================
// Blockfall — Telegram WebApp mock E2E. OWNED BY SA3.
// The app must boot identically inside the mocked Telegram container, drive
// the PlatformAdapter through ready/expand/haptics, and stay error-free.
// ============================================================================
import { expect, test, type Page } from '@playwright/test';
import { telegramMockInitScript } from './telegram-mock';

const SHOTS = 'tests/e2e/shots'; // relative to repo root (Playwright cwd)

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

/** Typed accessor for the mock's spy globals. */
interface MockWindow {
  __tgLog?: { name: string; args?: unknown[] }[];
  __tgFire?: (name: string, data?: unknown) => void;
  __tgClosingConfirmation?: () => boolean;
  Telegram?: {
    WebApp?: {
      initData?: string;
      CloudStorage?: { _store?: Record<string, string> };
    };
  };
}

async function gotoWithMock(page: Page): Promise<void> {
  // Replace the real telegram-web-app.js with our mock (the real SDK would
  // overwrite window.Telegram and crash without initParams in a plain browser).
  await page.route('**/telegram-web-app.js', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: '/* mocked via init script */' }),
  );
  await page.addInitScript(() => {
    localStorage.setItem(
      'blockfall:settings',
      JSON.stringify({ music: false, sfx: false, haptics: true, onboarded: true }),
    );
  });
  await page.addInitScript(telegramMockInitScript);
  await page.goto('/index.html');
  await expect(page.locator('#app')).toHaveAttribute('data-phase', /.+/, { timeout: 10_000 });
}

const logNames = (page: Page) =>
  page.evaluate(() => ((window as unknown as MockWindow).__tgLog ?? []).map((e) => e.name));

test.use({ viewport: { width: 390, height: 844 } });

test.describe('telegram container', () => {
  test('boots to menu with mock, no console errors', async ({ page }) => {
    const errors = watchErrors(page);
    await gotoWithMock(page);
    await expect(page.locator('#app')).toHaveAttribute('data-phase', /menu|onboarding/);
    expect(
      await page.evaluate(() => !!((window as unknown as MockWindow).Telegram?.WebApp?.initData ?? '')),
    ).toBe(true);
    await page.screenshot({ path: SHOTS + '/telegram-menu.png' });
    expect(errors).toEqual([]);
  });

  test('adapter init calls ready/expand/theme/vertical-swipes', async ({ page }) => {
    const errors = watchErrors(page);
    await gotoWithMock(page);
    await page.waitForTimeout(300); // let init settle
    const names = await logNames(page);
    expect(names).toContain('ready');
    expect(names).toContain('expand');
    expect(names).toContain('setColorScheme');
    expect(names).toContain('setHeaderColor');
    expect(names).toContain('disableVerticalSwipes');
    expect(names).toContain('screen.lockOrientation'); // platform ios → portrait lock
    expect(errors).toEqual([]);
  });

  test('haptics fire on hard drop', async ({ page }) => {
    const errors = watchErrors(page);
    await gotoWithMock(page);
    await page.getByTestId('btn-start').click();
    await expect(page.locator('#app')).toHaveAttribute('data-phase', 'playing');
    await page.keyboard.press('Space'); // hard drop → haptic
    await page.waitForTimeout(300);
    const hapticCalls = await page.evaluate(
      () => ((window as unknown as MockWindow).__tgLog ?? []).filter((e) => e.name.startsWith('HapticFeedback')).length,
    );
    expect(hapticCalls).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test('closing confirmation tracks the playing phase', async ({ page }) => {
    const errors = watchErrors(page);
    await gotoWithMock(page);
    expect(
      await page.evaluate(() => ((window as unknown as MockWindow).__tgClosingConfirmation ?? (() => undefined))()),
    ).toBeFalsy();
    await page.getByTestId('btn-start').click();
    await expect(page.locator('#app')).toHaveAttribute('data-phase', 'playing');
    await expect
      .poll(() =>
        page.evaluate(() => ((window as unknown as MockWindow).__tgClosingConfirmation ?? (() => false))()),
        { timeout: 3_000 },
      )
      .toBe(true);
    await page.getByTestId('btn-pause').click();
    // paused is not 'playing' → confirmation must be disabled again
    await expect
      .poll(() =>
        page.evaluate(() => ((window as unknown as MockWindow).__tgClosingConfirmation ?? (() => false))()),
        { timeout: 3_000 },
      )
      .toBe(false);
    expect(errors).toEqual([]);
  });

  test('cloud storage mirror is written for settings', async ({ page }) => {
    const errors = watchErrors(page);
    await gotoWithMock(page);
    await page.getByTestId('btn-settings').click();
    await page.getByTestId('toggle-sfx').click();
    await page.waitForTimeout(300);
    const cloudKeys = await page.evaluate(() =>
      Object.keys((window as unknown as MockWindow).Telegram?.WebApp?.CloudStorage?._store ?? {}),
    );
    expect(cloudKeys.some((k) => /settings/i.test(k))).toBe(true);
    expect(errors).toEqual([]);
  });

  test('visibility event (deactivated) pauses the game', async ({ page }) => {
    const errors = watchErrors(page);
    await gotoWithMock(page);
    await page.getByTestId('btn-start').click();
    await expect(page.locator('#app')).toHaveAttribute('data-phase', 'playing');
    await page.evaluate(() => ((window as unknown as MockWindow).__tgFire ?? (() => undefined))('deactivated'));
    await expect(page.locator('#app')).toHaveAttribute('data-phase', 'paused', { timeout: 3_000 });
    await page.evaluate(() => ((window as unknown as MockWindow).__tgFire ?? (() => undefined))('activated'));
    // app stays paused after activation (resume is user-driven per contract)
    await expect(page.locator('#app')).toHaveAttribute('data-phase', 'paused');
    expect(errors).toEqual([]);
  });
});
