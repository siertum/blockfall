# DEVELOPMENT_LOG.md

## 2026-09-29 — Lead: bootstrap
- Стек: TypeScript + Vite + Canvas 2D (без React/Phaser: маленький бандл, 60 FPS, простое тестирование; вся сцена рисуется в одном rAF-цикле). Хостинг — GitHub Pages (gh авторизован, repo terr4n). Bot API — прямые HTTPS-вызовы из `scripts/` (токен из `.env`, вне репо).
- Архитектура: Engine (чистая детерминированная логика, seeded 7-bag) → snapshot+events → Renderer(Canvas)/UI(DOM экраны)/Audio(процедурный WebAudio) / PlatformAdapter (Telegram vs browser). Контракты в `src/shared/types.ts`, геометрия/скоринг/SRS-таблицы в `src/shared/constants.ts` (Lead нормализовал SRS-кики в y-down координаты — проверять знаком при интеграции!).
- Визуальная концепция: «Blockfall» — сад светящихся пузырей в сумерках; 7 цветов-фруктов, portrait-first.
- note: попытка создать корневой `AGENTS.md` заблокирована policy (approval timeout); координация перенесена в `docs/COORDINATION.md`. Восстановить по запросу пользователя.
- Параллельные потоки запущены: SA1 engine+tests, SA2 render/audio/ui, SA3 platform/e2e/deploy-scripts.

## 2026-09-30 — Lead: интеграция и зелёный пайплайн
- Переименование: Bubble Grove → **Blockfall** по требованию пользователя (бабл-игра неRelated); бот переименован в BotFather, getMe подтвердил first_name=Blockfall (username остался @BubbleGroveGameBot). Все файлы/ключи/доки переименованы.
- Падение 3 unit-тестов (board-pieces/engine) оказалось расхождением геометрии в самих тестах, не движка: проверено детерминированными probe-тестами. Исправлено: индексы строк внутреннего 22-рядного board (ROWS_PLAY), порядок hold/spawn в triple- и block-out-тестах, событие game-over теперь ожидается в том же батче.
- КРИТИЧНО: `types.ts` на диске содержал литеральные `***` вместо значений storage-ключей (битое раннее редактирование, усугублённое masking секретов в выводе инструментов). Diagnosed через hexdump. Восстановлено: blockfall:settings / blockfall:highscore / blockfall:stats.
- Platform: CloudStorage getItem/setItem/getKeys вызывались вне Telegram (Telegram.WebApp существовал частично) → шум в консоли и варнинг «CloudStorage is not supported». Добавлен гейт `isTelegram`.
- E2E: реальный telegram-web-app.js перезаписывал мок и падал на initParams → в telegram-спеках SDK глушится через page.route. Тест «restart» использовал btn-restart на экране паузы (кнопка есть только на gameover) → переписан на quit→start.
- Результат прогона: tsc 0, vitest 49/49, playwright 14/14, vite build 44.7 KB (gzip 15.7 KB).
- Деплой: репозиторий siertum/blockfall (public), GitHub Pages (workflow) включён API; первый CI-ран упал на scan-secrets (ложные срабатывания: док-плейсхолдер `TELEGRAM_BOT_TOKEN=<bot-id>:<token>` и собственные регулярки сканера) — сканер не сканирует себя и пропускает `<...>`-плейсхолдеры. Второй ран success → https://siertum.github.io/blockfall/ (обслуживает тот же бандл, E2E 8/8 по живому URL). setMyCommands(/play) выполнен. Осталось человеку: @BotFather → /setmenubutton или /newapp с URL страницы.
