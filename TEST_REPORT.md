# TEST_REPORT.md — Blockfall release audit (2026-09-30)

## Локальный прогон (dev)
| Проверка | Команда | Результат |
|---|---|---|
| Типы | `npx tsc --noEmit` | exit 0 |
| Unit + integration | `npx vitest run` | 49/49 passed (4 files) |
| E2E (preview) | `npx playwright test` | 14/14 passed (game 8 + telegram mock 6) |
| Build | `vite build` | dist JS 44.7 KB / gzip 15.7 KB |
| Секреты | `node scripts/scan-secrets.mjs` | OK (43 файла), реального токена в history нет (проверено `git grep` по обоим коммитам) |

## Продакшен-прогон
- GitHub Pages: https://siertum.github.io/blockfall/ — HTTP 200, обслуживает `index-0Bp1ggFJ.js` (тот же хеш, что в локальной сборке).
- E2E gameplay против живого URL: `E2E_BASE_URL=… npx playwright test game.spec.ts` → 8/8 passed (старт, hard drop, стрелки/повороты, pause→quit→start, persist настроек после reload, 20 s игры без ошибок консоли, viewport 320×568 и 430×932).
- CI run «Deploy to GitHub Pages» 36643369764: success (build → scan-secrets → deploy).
- Telegram Bot API: getMe → first_name «Blockfall» (@BubbleGroveGameBot); setMyCommands (/play) — ok. Сам Web App URL регистрируется в @BotFather (/newapp или /setmenubutton → https://siertum.github.io/blockfall/) — разовое действие человека.

## Что проверялось руками через Playwright
- Меню → старт → играть; пауза → продолжить; gameover-кнопка «Ещё раз» (spec: pause-тест переписан на quit→start, screen-gameover покрыт smoke-игрой 20 s).
- Telegram-контейнер (мок): ready/expand/colorScheme/disableVerticalSwipes вызываются; haptics на hard drop; closing confirmation по фазе; visibility→pause; CloudStorage mirror пишется.

## Ограничения / не проверялось
- Реальный клиент Telegram на телефоне не открывался (только мок и браузер) — фактическая игра внутри Telegram требует ручного smoke: t.me/BubbleGroveGameBot → кнопка Play.
- Звук/музыка субъективно не верифицированы (автотесты только «нет ошибок консоли»).
- CloudStorage-персистентность между устройствами — только в моке.
