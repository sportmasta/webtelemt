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

## 2026-06-24 — Hardening production

### Backend
- Отключены `/docs`, `/redoc`, `/openapi.json` в `PANEL_ENV=production`
- Rate limit на `POST /api/auth/login` (по IP)
- Security headers (CSP, X-Frame-Options, nosniff, …)
- Проверка `JWT_SECRET` при старте в production
- CORS: только явные origins из `PANEL_CORS_ORIGINS`, без `*` и credentials
- Валидация username при `DELETE /api/users/{username}`

### Тесты
- `tests/test_security.py`

## 2026-06-24 — Биллинг (фаза 2)

### Backend
- PostgreSQL: модели `orders`, `order_secrets`, SQL-миграция `migrations/001_orders.sql`
- Модуль `app/billing/`: ЮKassa-клиент, Fernet-шифрование secret, webhook `payment.succeeded`
- API: `/api/billing/plan`, `orders`, `orders/{id}`, `credentials`, webhook, admin list
- Rate limit на создание заказов, идемпотентный webhook
- Переменные: `DATABASE_URL`, `YOOKASSA_*`, `BILLING_*`

### Docker
- Сервис `postgres` в `docker-compose.yml` (порт `127.0.0.1:5432`)
- `webtelemt` сохраняет `network_mode: host`

### Frontend
- Страницы `/buy`, `/buy/success`, `/buy/fail` (react-router-dom)
- Вкладка «Заказы» в админ-панели

### Установка
- `install.sh`: генерация `DATABASE_URL`, `BILLING_CREDENTIALS_ENCRYPTION_KEY`, подсказки ЮKassa
- `--purge-postgres` при uninstall

### Тесты
- `tests/test_billing.py` с `MockYooKassaClient`

### Документация
- `README.md` — биллинг, PostgreSQL, webhook ЮKassa, env
- `docs/handoff/DOCS.md` — руководство для покупателя и администратора

## 2026-06-24 — Личный кабинет покупателя (фаза 3)

### Backend
- Таблица `customers`, миграция `002_customers.sql`, FK `orders.customer_id`
- Модуль `app/account/`: register, login, me, orders, profiles
- JWT customer (`role: customer`) отдельно от admin; `get_current_admin` / `get_current_customer`
- Пароли: Argon2 через `pwdlib`
- `POST /api/billing/orders`: опциональный customer JWT, email обязателен без входа
- Привязка старых заказов по `customer_email` при register/login

### Frontend
- `/account`, `/account/login`, `/account/register`
- `customer_token` в localStorage (отдельно от admin `webtelemt_token`)
- Кабинет: профили Telemt (polling 10 с), история заказов, QR/ссылки без secret
- `/buy`: email обязателен или readonly при входе; `/buy/success`: CTA кабинета
- Shared `components/ConnectionLinks.tsx`

### Тесты
- `tests/test_account.py` (8 тестов)
- Обновлён `tests/test_billing.py` (email в заказах)

### Документация
- `docs/handoff/DEV.md` — auth model, пароли, привязка заказов
