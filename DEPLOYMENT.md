# DEPLOYMENT — Blockfall

Windows/bash-команды ниже выполняются из корня репозитория.

## 1. GitHub Pages (статический хостинг сборки)

Workflow: `.github/workflows/deploy.yml` (push в `main` → `npm ci` → `node scripts/scan-secrets.mjs` → `npm run build` → upload `dist` → deploy Pages). Сам workflow Pages **не включает** — сделать это нужно один раз вручную:

```bash
# один раз: включить Pages с deploy workflow
gh api -X POST repos/{owner}/{repo}/pages -f build_type=workflow -f source_branch=main

# проверка статуса
gh api repos/{owner}/{repo}/pages --jq '.html_url, .status'
```

Либо через веб-интерфейс: Settings → Pages → Build and deployment → **Deploy from a workflow**.

После включения любой push в `main` деплоит автоматически; ручной запуск:

```bash
gh workflow run "Deploy to GitHub Pages" --ref main
gh run list --workflow=deploy.yml --limit 5
```

Готовый URL: `https://<owner>.github.io/<repo>/` — он и есть **Web App URL** для Telegram.

## 2. Проверка деплоя

```bash
node scripts/scan-secrets.mjs        # exit 0, «no secrets found»
curl -sI https://<owner>.github.io/<repo>/index.html | head -1   # HTTP/2 200
```

Открыть URL в браузере: game стартует, консоль чистая. E2E против preview-сборки локально:

```bash
npm run build && npx playwright test
```

## 3. Настройка Telegram-бота (Blockfall Mini App)

### 3.1 Через @BotFather (делается руками в Telegram — скрипт это не может)

1. `/newbot` (если бота ещё нет) → получить токен.
2. `/newapp` — создать **Main Mini App** для бота: имя, описание, иконка; в поле **Web App URL** — URL из п.1.
   (Альтернатива без /newapp: `/setmenubutton` → URL того же билда — кнопка меню бота открывает игру.)
3. `/setdescription`, `/setabouttext` — по вкусу.
4. **Webhook не нужен** — это чистый Mini App, сервера нет.

Токен сохранить только в локальный `.env` (он в `.gitignore`):

```
TELEGRAM_BOT_TOKEN=<bot-id>:<secret-token>
WEB_APP_URL=https://<owner>.github.io/<repo>/
```

### 3.2 Программная часть — scripts/telegram-setup.mjs

Читает токен из `process.env.TELEGRAM_BOT_TOKEN` или `.env` (парсинг, не vite), **токен никогда не печатается**:

```bash
node scripts/telegram-setup.mjs --url "$WEB_APP_URL"
# + отправить себе кнопку «🎮 Играть»:
node scripts/telegram-setup.mjs --url "$WEB_APP_URL" --chat-id 123456789
```

Делает: `getMe` (печатает @username), `setMyCommands` (`/play — Играть в Blockfall`), опционально `sendMessage` с inline-кнопкой `web_app`.

### 3.3 Хранение

- Настройки/рекорды: `localStorage` (`blockfall:settings`, `blockfall:highscore`); в Telegram дополнительно зеркалятся в CloudStorage (`tgcloud:`-префикс зеркала).
- Секретов в репозитории нет и быть не должно; `scan-secrets.mjs` — guard (запускается и в CI).

## 4. Ограничения / заметки

- npm-скрипт `scan-secrets` в `package.json` не объявлялся (package.json — вне этой зоны); команда: `node scripts/scan-secrets.mjs`.
- Playwright-конфиг поднимает `vite preview` на порту 4173; перед прогоном обязателен `npm run build`.
