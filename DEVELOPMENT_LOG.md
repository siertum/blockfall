# DEVELOPMENT_LOG.md

## 2026-09-29 — Lead: bootstrap
- Стек: TypeScript + Vite + Canvas 2D (без React/Phaser: маленький бандл, 60 FPS, простое тестирование; вся сцена рисуется в одном rAF-цикле). Хостинг — GitHub Pages (gh авторизован, repo terr4n). Bot API — прямые HTTPS-вызовы из `scripts/` (токен из `.env`, вне репо).
- Архитектура: Engine (чистая детерминированная логика, seeded 7-bag) → snapshot+events → Renderer(Canvas)/UI(DOM экраны)/Audio(процедурный WebAudio) / PlatformAdapter (Telegram vs browser). Контракты в `src/shared/types.ts`, геометрия/скоринг/SRS-таблицы в `src/shared/constants.ts` (Lead нормализовал SRS-кики в y-down координаты — проверять знаком при интеграции!).
- Визуальная концепция: «Bubble Grove» — сад светящихся пузырей в сумерках; 7 цветов-фруктов, portrait-first.
- note: попытка создать корневой `AGENTS.md` заблокирована policy (approval timeout); координация перенесена в `docs/COORDINATION.md`. Восстановить по запросу пользователя.
- Параллельные потоки запущены: SA1 engine+tests, SA2 render/audio/ui, SA3 platform/e2e/deploy-scripts.
