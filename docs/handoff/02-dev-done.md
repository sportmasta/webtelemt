# Отчёт разработчика — WebTelemt MVP

**Статус:** готово к отладке (otladchik)  
**Дата:** 2025-06-24

## Что сделано

### Frontend (React + Vite + TypeScript)
- `development/frontend/index.html`
- `development/frontend/src/main.tsx`, `App.tsx`, `api.ts`, `styles.css`, `vite-env.d.ts`
- Login → JWT в `localStorage`
- Dashboard: users + stats summary, автообновление 5 с
- Создание / удаление клиентов с модалками

### Backend
- Существующий FastAPI backend использован без переписывания
- Исправлен баг в `auth.py` (`PyJWTError`)
- Статика из `development/static/` (результат `npm run build`)
- SPA fallback для всех не-API маршрутов

### Docker
- `development/Dockerfile` — multi-stage
- `development/docker-compose.yml` — `network_mode: host`
- `development/entrypoint.sh` — bind `0.0.0.0:PANEL_PORT`
- `development/.env.example`

### Установка
- `install.sh` — установка и `--uninstall` / `--purge`

## Как запустить

### Быстрая установка на сервере
```bash
cd webtelemt
chmod +x install.sh
./install.sh
# или неинтерактивно:
./install.sh --password 'your-secret' --port 8080 --non-interactive
```

Удаление:
```bash
./install.sh --uninstall
./install.sh --uninstall --purge   # также удалить .env
```

### Локальная разработка (без Docker)
```bash
cd development

# Backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # задать PANEL_ADMIN_PASSWORD
export PANEL_PORT=8080
uvicorn app.main:app --host 0.0.0.0 --port 8080

# Frontend (отдельный терминал)
cd frontend
npm install
npm run dev    # http://localhost:5173, proxy /api → :8080
```

### Сборка frontend в static
```bash
cd development/frontend
npm install
npm run build    # → development/static/
```

### Docker вручную
```bash
cd development
cp .env.example .env   # настроить
docker compose build
docker compose up -d
```

Панель: `http://<IP-сервера>:8080` (порт из `PANEL_PORT`).

## Переменные окружения

| Переменная | Описание |
|---|---|
| `TELEMT_API_URL` | URL Telemt API (default `http://127.0.0.1:9091`) |
| `PANEL_ADMIN_USER` | Логин панели (default `admin`) |
| `PANEL_ADMIN_PASSWORD` | Пароль (обязателен) |
| `JWT_SECRET` | Секрет JWT |
| `PANEL_PORT` | Порт (default `8080`) |

## Известные ограничения

- Telemt API должен быть доступен на хосте (`127.0.0.1:9091`); при Docker используется `network_mode: host`
- Структура полей users/stats зависит от версии Telemt API — frontend отображает доступные поля с fallback
- Редактирование конфига, rotate-secret, quota — не в MVP
- PostgreSQL не используется

## Артефакты

- `development/CHANGES.md` — журнал изменений
- Критерии приёмки: см. `docs/handoff/00-brief.md`

## Следующий этап

**otladchik** — проверка на сервере с реальным Telemt API, сценарии login/users/create/delete.
