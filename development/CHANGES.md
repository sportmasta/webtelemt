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

## 2026-06-24 — Ссылка подключения и QR-код

### Frontend
- Раскрывающаяся карточка клиента по клику на строку таблицы
- Ссылка `tg://proxy` из `links.tls` (API `/v1/users`)
- QR-код для основной ссылки, кнопка «Копировать»
- Зависимость `qrcode.react`

## 2026-06-24 — Метрики подключений

### Frontend
- Колонка «Подключения» → «TCP-сессии»
- Активные IP: жирный счётчик + список адресов
- Верхние карточки: текущие TCP и уникальные IP из `/v1/users` (не `connections_total`)

## 2026-06-24 — Лимит IP при создании пользователя

### Backend
- `POST /api/users` передаёт `max_unique_ips: 1` в Telemt API → `[access.user_max_unique_ips]` в telemt.toml
- Настройка `USER_MAX_UNIQUE_IPS` (default `1`) в `.env`
- Удаление пользователя через Telemt API убирает запись из конфига вместе с профилем

### Frontend
- Подсказка в модалке создания, лимит IP в раскрытой карточке пользователя

### Тесты
- `test_create_user_sets_max_unique_ips`, `test_delete_user_calls_telemt_api`

### Документация
- `docs/handoff/02-dev-done.md` — отчёт разработчика
