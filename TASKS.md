# TASKS.md — живой Kanban Bubble Grove

Статусы: BACKLOG → READY → IN_PROGRESS → REVIEW → DONE (только после фактической проверки Lead'ом).

| ID | Название | Поток | Исполнитель | Зависимости | Статус | Результат | Файлы | Тесты |
|---|---|---|---|---|---|---|---|---|
| T-001 | Scaffold, контракты, main.ts, docs | Lead | Lead | — | IN_PROGRESS | контракты + оркестратор написаны | src/shared/*, src/main.ts, index.html | typecheck baseline |
| T-101 | Engine: board, pieces, SRS, kicks | Gameplay | SA1 | T-001 | BACKLOG | | src/engine/** | unit |
| T-102 | 7-bag seeded RNG, queue, hold, ghost | Gameplay | SA1 | T-001 | BACKLOG | | src/engine/** | unit |
| T-103 | Lock delay, gravity, scoring, levels, game over | Gameplay | SA1 | T-101,T-102 | BACKLOG | | src/engine/** | unit |
| T-104 | Unit+integration tests engine | Gameplay | SA1 | T-103 | BACKLOG | | tests/unit/**, tests/integration/** | — |
| T-201 | Canvas renderer: field, pieces, ghost, animations, particles | UI/Audio | SA2 | T-001 | BACKLOG | | src/render/** | visual QA |
| T-202 | Экраны UI: menu/pause/gameover/settings/onboarding/orientation + HUD | UI/Audio | SA2 | T-001 | BACKLOG | | src/ui/** | e2e hooks (data-testid) |
| T-203 | Touch controls (drag/swipe/tap + кнопки) | UI/Audio | SA2 | T-202 | BACKLOG | | src/ui/** | e2e |
| T-204 | Procedural audio + музыка, settings-aware | UI/Audio | SA2 | T-001 | BACKLOG | | src/audio/** | e2e (no errors) |
| T-301 | PlatformAdapter: Telegram lifecycle, haptics, cloud storage | Platform | SA3 | T-001 | BACKLOG | | src/platform/** | e2e mock |
| T-302 | E2E Playwright + telegram mock + viewport matrix | Platform | SA3 | T-301,T-202 | BACKLOG | | tests/e2e/**, playwright.config.ts | — |
| T-303 | Deploy (GitHub Pages workflow) + DEPLOYMENT.md | Platform | SA3 | T-302 | BACKLOG | | .github/workflows/**, DEPLOYMENT.md | smoke |
| T-304 | Telegram bot wiring (scripts, вне репо токена) | Platform | SA3 | T-303 | BACKLOG | | scripts/telegram-setup.mjs | getMe/setMyCommands |
| T-900 | Release audit + интеграция | Lead | Lead | все | BACKLOG | | TEST_REPORT.md | полный прогон |
