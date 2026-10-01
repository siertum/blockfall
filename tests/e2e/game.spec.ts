// ============================================================================
// Blockfall — core gameplay E2E (plain browser, no Telegram). OWNED BY SA3.
// Prereq: `npm run build` (webServer in playwright.config.ts runs `vite preview`).
// UI hooks per docs/COORDINATION.md: data-testid buttons, data-phase on #app.
// ============================================================================
import { expect, test, type Page } from '@playwright/test';

const SHOTS = 'tests/e2e/shots'; // relative to repo root (Playwright cwd)

/** Collect console errors + page errors; assert empty at test end. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

const phase = (page: Page) => page.locator('#app').getAttribute('data-phase');

async function gotoApp(page: Page): Promise<void> {
  // Deterministic first-run state: skip onboarding gate, silence media for CI.
  await page.addInitScript(() => {
    if (localStorage.getItem('blockfall:settings') === null) {
      localStorage.setItem(
        'blockfall:settings',
        JSON.stringify({ music: false, sfx: false, haptics: false, onboarded: true }),
      );
    }
  });
  await page.goto('/index.html');
  await expect(page.locator('#app')).toHaveAttribute('data-phase', /.+/, { timeout: 10_000 });
}

async function startGame(page: Page): Promise<void> {
  await page.getByTestId('btn-start').click();
  await expect(phase(page)).resolves.toBe('playing');
}

/** Restart via hold-to-confirm button (press ≥2.2 s until it turns green). */
async function holdRestart(page: Page, testid = 'btn-restart'): Promise<void> {
  const btn = page.getByTestId(testid);
  const box = await btn.boundingBox();
  if (!box) throw new Error(`${testid} not visible`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(2300);
  await page.mouse.up();
}

async function currentScore(page: Page): Promise<number> {
  const raw = (await page.getByTestId('hud-score').innerText()).replace(/\s|\u00a0/g, '');
  return Number(raw);
}

test.describe('gameplay', () => {
  test('menu → start → playing', async ({ page }) => {
    const errors = watchErrors(page);
    await gotoApp(page);
    await expect(page.getByTestId('btn-start')).toBeVisible();
    await startGame(page);
    expect(errors).toEqual([]);
  });

  test('hard drop scores points', async ({ page }) => {
    const errors = watchErrors(page);
    await gotoApp(page);
    await startGame(page);
    const before = await currentScore(page);
    await page.keyboard.press('Space'); // hard drop
    await expect
      .poll(async () => currentScore(page), { message: 'score must rise after hard drop', timeout: 5_000 })
      .toBeGreaterThan(before);
    expect(errors).toEqual([]);
  });

  test('arrow movement and rotation do not break the game', async ({ page }) => {
    const errors = watchErrors(page);
    await gotoApp(page);
    await startGame(page);
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(40);
    }
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(40);
    }
    await page.keyboard.press('ArrowUp'); // rotate
    await page.keyboard.press('KeyX'); // rotate cw alias
    await page.waitForTimeout(100);
    await expect(phase(page)).resolves.toBe('playing');
    expect(errors).toEqual([]);
  });

  test('pause → resume → restart', async ({ page }) => {
    const errors = watchErrors(page);
    await gotoApp(page);
    await startGame(page);
    await page.getByTestId('btn-pause').click();
    await expect(phase(page)).resolves.toBe('paused');
    await expect(page.getByTestId('screen-pause')).toBeVisible();
    await page.screenshot({ path: SHOTS + '/pause.png' });
    await page.getByTestId('btn-resume').click();
    await expect(phase(page)).resolves.toBe('playing');
    // restart: quit to menu, start again
    await page.getByTestId('btn-pause').click();
    await expect(phase(page)).resolves.toBe('paused');
    await page.getByTestId('btn-quit').click();
    await expect(phase(page)).resolves.toBe('menu');
    await page.getByTestId('btn-start').click();
    await expect(phase(page)).resolves.toBe('playing');
    expect(errors).toEqual([]);
  });

  test('hold-to-restart: quick click does nothing, 2s hold restarts', async ({ page }) => {
    const errors = watchErrors(page);
    await gotoApp(page);
    await startGame(page);
    await page.getByTestId('btn-pause').click();
    await expect(phase(page)).resolves.toBe('paused');
    const btn = page.getByTestId('btn-restart-pause');
    const box = (await btn.boundingBox())!;
    // accidental tap → no restart
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(300);
    await expect(phase(page)).resolves.toBe('paused');
    // deliberate 2 s hold → restart into playing
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(2300);
    await page.mouse.up();
    await expect(phase(page)).resolves.toBe('playing');
    expect(errors).toEqual([]);
  });

  test('settings toggle-sfx persists across reload', async ({ page }) => {
    const errors = watchErrors(page);
    await gotoApp(page);
    await page.getByTestId('btn-settings').click();
    await page.screenshot({ path: SHOTS + '/settings.png' });
    const toggle = page.getByTestId('toggle-sfx');
    const wasOn = await toggle.evaluate((el) => el.getAttribute('aria-checked') !== 'false');
    await toggle.click();
    // localStorage must contain a settings object with sfx flipped
    const stored = await page.evaluate(() => {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)!;
        if (/settings/i.test(k)) return localStorage.getItem(k);
      }
      return null;
    });
    expect(stored).toBeTruthy();
    expect(JSON.parse(stored!).sfx).toBe(!wasOn);

    await page.reload();
    await gotoApp(page);
    await page.getByTestId('btn-settings').click();
    const after = await page
      .getByTestId('toggle-sfx')
      .evaluate((el) => el.getAttribute('aria-checked') !== 'false');
    expect(after).toBe(!wasOn);
    expect(errors).toEqual([]);
  });

  test('language row with flags: EN ↔ RU relabels the menu', async ({ page }) => {
    const errors = watchErrors(page);
    await gotoApp(page);
    // по умолчанию — английский, обе пилюли с флагами-картинками
    await expect(page.getByTestId('btn-start')).toHaveText('Play');
    await expect(page.getByTestId('lang-en')).toHaveCount(1);
    await expect(page.getByTestId('lang-ru')).toHaveCount(1);
    await expect(page.getByTestId('lang-en')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('lang-ru').click();
    await expect
      .poll(async () => (await page.getByTestId('btn-start').innerText()).trim(), {
        message: 'menu must switch to Russian',
      })
      .toBe('Играть');
    await page.getByTestId('lang-en').click();
    await expect
      .poll(async () => (await page.getByTestId('btn-start').innerText()).trim(), {
        message: 'menu must switch back to English',
      })
      .toBe('Play');
    expect(errors).toEqual([]);
  });

  test('no console errors during ~20s of play; game screenshot', async ({ page }) => {
    const errors = watchErrors(page);
    await gotoApp(page);
    await page.screenshot({ path: SHOTS + '/menu.png' });
    await startGame(page);
    // Play with hard-drop spam for up to 20 seconds, moving pieces around.
    const t0 = Date.now();
    let moves = 0;
    while (Date.now() - t0 < 20_000) {
      const p = await phase(page);
      if (p !== 'playing') {
        // died naturally — restart to keep the board busy
        const rb = page.getByTestId('btn-restart');
        if (await rb.isVisible().catch(() => false)) await holdRestart(page);
        else await page.getByTestId('btn-start').click();
      }
      await page.keyboard.press(moves % 3 === 0 ? 'ArrowLeft' : moves % 3 === 1 ? 'ArrowRight' : 'Space');
      moves++;
      await page.waitForTimeout(250);
    }
    await page.screenshot({ path: SHOTS + '/game.png' });
    expect(errors).toEqual([]);
  });

  test('narrow viewport 320×568 — no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    const errors = watchErrors(page);
    await gotoApp(page);
    await page.screenshot({ path: SHOTS + '/narrow-320.png' });
    const overflow = await page.evaluate(() => {
      const el = document.scrollingElement ?? document.documentElement;
      return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
    });
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
    expect(errors).toEqual([]);
  });

  test('large viewport 430×932 screenshot', async ({ page }) => {
    await page.setViewportSize({ width: 430, height: 932 });
    const errors = watchErrors(page);
    await gotoApp(page);
    await startGame(page);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: SHOTS + '/large-430.png' });
    expect(errors).toEqual([]);
  });
});
