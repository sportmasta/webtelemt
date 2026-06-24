# Журнал изменений — WebTelemt development

## 2025-06-24 — MVP (фаза 1)

### Frontend (`development/frontend/`)
- Добавлены `index.html`, `src/main.tsx`, `src/App.tsx`, `src/api.ts`, `src/styles.css`
- Страница входа (JWT в localStorage)
- Dashboard: таблица клиентов, сводка stats, polling 5 с
- Модалка создания клиента с однократным показом secret
- Подтверждение удаления клиента
- Тёмный минималистичный UI на русском языке

### Backend (`development/app/`)
- Исправлен `auth.py`: обработка `PyJWTError` вместо несуществующего `JWTError`

### Docker
- `Dockerfile` — multi-stage (Node build + Python 3.11)
- `docker-compose.yml` — `network_mode: host`
- `entrypoint.sh` — uvicorn на `0.0.0.0:${PANEL_PORT}`
- `.env.example`, `.dockerignore`

### Установка
- `install.sh` в корне репозитория: установка, `--uninstall`, `--purge`

### Документация
- `docs/handoff/02-dev-done.md` — отчёт разработчика
