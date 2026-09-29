# COORDINATION — Bubble Grove (правила разработки)

(Lead не смог создать AGENTS.md — запрос подтверждения истёк; функциональный эквивалент здесь.)

## Стек
TypeScript + Vite + Canvas 2D. Unit/integration: Vitest. E2E: Playwright. Deploy: GitHub Pages (actions). Бэкенда нет.

## Ownership (субагенты правят ТОЛЬКО своими файлами)
- Lead: `src/main.ts`, `src/shared/*`, `index.html`, `vite.config.ts`, `tsconfig.json`, configs, доки
- SA1 Gameplay: `src/engine/**`, `tests/unit/**`, `tests/integration/**`
- SA2 UI/Audio: `src/render/**`, `src/audio/**`, `src/ui/**`
- SA3 Platform/QA: `src/platform/**`, `tests/e2e/**`, `playwright.config.ts`, `vitest.config.ts` только по согласованию, `scripts/**`, `DEPLOYMENT.md`

Никто, кроме Lead, не делает git-операций и не устанавливает пакеты.

## Контракты
Канон — `src/shared/types.ts`. Фабрики: `createEngine/createRenderer/createAudio/createUI/createPlatform/createStore` — точные имена экспорта. Типы `declare function` в types.ts — не копия API, а ориентир; реализация в своих файлах экспортирует те же имена.

## Правила
- `strict`, без `any` в публичных API, без @ts-ignore.
- Telegram API — только через PlatformAdapter, optional chaining, degrade в браузере.
- Секретов в коде нет; токен только в `.env` (в gitignore), скрипты читают из env.
- Перед завершением каждая зона: `npm run typecheck` + свои тесты зелёные.
- Renderer читает только GameStateSnapshot + GameEvent; Engine — ноль DOM.
- UI обязан дать e2e-крючки: `data-testid` на кнопках start/restart/resume/pause/settings toggles, data-phase на #app.

## Definition of Done
Игра играбельна portrait; engine-тесты покрывают collision/rotation/kicks/7bag/clear/score/hold/harddrop/gameover/levels; e2e проходят; build чистый; HTTPS deploy; Telegram открывает; visual QA; секрет-скан.
