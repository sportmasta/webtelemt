# Задача разработчика — WebTelemt MVP

## Контекст
См. `00-brief.md`. Backend FastAPI частично готов в `development/`. Frontend — только конфиг Vite, без компонентов.

## Что сделать

### 1. Frontend (React + Vite + TypeScript)
Путь: `development/frontend/`

- `index.html`, `src/main.tsx`, `src/App.tsx`
- Страница **Login** — форма логин/пароль, POST `/api/auth/login`, хранение JWT в `localStorage`
- Страница **Dashboard** — таблица users (имя, статус, подключения, активные IP, трафик), метрики из `/api/stats/summary`
- Polling каждые 5 с для users и stats
- Модалка создания user (username), показ secret один раз после создания
- Confirm-диалог на удаление
- Тёмный минималистичный UI, русский язык
- CSS без тяжёлых UI-библиотек (чистый CSS или минимальные стили)

### 2. Docker
- `development/Dockerfile` — multi-stage: build frontend + Python runtime
- `development/docker-compose.yml` — `network_mode: host` для доступа к Telemt API на `127.0.0.1:9091`
- `.env.example` с переменными из брифа

### 3. install.sh (корень `webtelemt/`)
```bash
./install.sh              # установка
./install.sh --uninstall  # удаление
```

Скрипт должен:
- Требовать root или docker-группу
- Проверять наличие docker и docker compose
- Интерактивно или через флаги задавать: `PANEL_ADMIN_PASSWORD`, `PANEL_PORT` (default 8080)
- Генерировать `JWT_SECRET` (openssl rand)
- Копировать/создавать `.env` в `development/`
- Собирать образ и запускать `docker compose up -d`
- Выводить URL панели: `http://<server-ip>:<port>`
- `--uninstall`: `docker compose down`, удаление контейнеров/образа (не трогать `.env` без флага `--purge`)

### 4. Прочее
- `development/CHANGES.md` — журнал изменений
- `docs/handoff/02-dev-done.md` — отчёт: что сделано, как запустить, известные ограничения

## Существующий backend
Не переписывать без необходимости. API endpoints уже есть в `development/app/main.py`.

## Стек
React, Python 3.11+, Docker Compose, без PostgreSQL.

## Критерии готовности
Все чекбоксы из `00-brief.md` + рабочий frontend + install.sh.
