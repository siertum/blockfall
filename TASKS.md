# TASKS.md — живой Kanban Blockfall

Статусы: BACKLOG → READY → IN_PROGRESS → REVIEW → DONE (только после фактической проверки Lead'ом).

| ID | Название | Поток | Исполнитель | Зависимости | Статус | Результат | Файлы | Тесты |
|---|---|---|---|---|---|---|---|---|
| T-001 | Scaffold, контракты, main.ts, docs | Lead | Lead | — | DONE | контракты + оркестратор, интеграция завершена | src/shared/*, src/main.ts, index.html | tsc exit 0 |
| T-101 | Engine: board, pieces, SRS, kicks | Gameplay | SA1 | T-001 | DONE | board/pieces/SRS-кики y-down | src/engine/** | unit |
| T-102 | 7-bag seeded RNG, queue, hold, ghost | Gameplay | SA1 | T-001 | DONE | seeded bag, hold swap, ghost | src/engine/** | unit |
| T-103 | Lock delay, gravity, scoring, levels, game over | Gameplay | SA1 | T-101,T-102 | DONE | lock delay 500ms, force-lock 15, b2b, block-out/top-out | src/engine/** | unit |
| T-104 | Unit+integration tests engine | Gameplay | SA1 | T-103 | DONE | 49/49 зелёные (геометрию 3 тестов исправил Lead) | tests/unit/**, tests/integration/** | vitest 49 pass |
| T-201 | Canvas renderer: field, pieces, ghost, animations, particles | UI/Audio | SA2 | T-001 | DONE | canvas-рендер с анимациями | src/render/** | visual QA + e2e screenshot |
| T-202 | Экраны UI: menu/pause/gameover/settings/onboarding/orientation + HUD | UI/Audio | SA2 | T-001 | DONE | все экраны + data-testid | src/ui/** | e2e 14 pass |
| T-203 | Touch controls (drag/swipe/tap + кнопки) | UI/Audio | SA2 | T-202 | DONE | свайпы/тапы в portrait | src/ui/** | e2e |
| T-204 | Procedural audio + музыка, settings-aware | UI/Audio | SA2 | T-001 | DONE | WebAudio-синтез, settings gate | src/audio/** | e2e no console errors |
| T-301 | PlatformAdapter: Telegram lifecycle, haptics, cloud storage | Platform | SA3 | T-001 | DONE | lifecycle+haptics+CloudStorage mirror; cloud-вызовы ограничены isTelegram | src/platform/** | e2e mock |
| T-302 | E2E Playwright + telegram mock + viewport matrix | Platform | SA3 | T-301,T-202 | DONE | 14/14 pass; mock глушит реальный SDK через page.route | tests/e2e/**, playwright.config.ts | 14 pass |
| T-303 | Deploy (GitHub Pages workflow) + DEPLOYMENT.md | Platform | SA3 | T-302 | REVIEW | workflow написан, публикация ещё не выполнялась | .github/workflows/**, DEPLOYMENT.md | smoke pending |
| T-304 | Telegram bot wiring (scripts, вне репо токена) | Platform | SA3 | T-303 | REVIEW | getMe verified (Blockfall); setWebApp — после деплоя | scripts/telegram-setup.mjs | getMe pass |
| T-900 | Release audit + интеграция | Lead | Lead | все | IN_PROGRESS | локальный пайплайн зелёный: tsc 0, vitest 49, playwright 14, build 44.7KB | TEST_REPORT.md | полный прогон |
