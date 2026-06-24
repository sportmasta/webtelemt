# WebTelemt

Легковесная web-панель с авторизацией для управления сервером [Telemt](https://github.com/telemt/telemt). Панель проксирует Telemt API и предоставляет удобный интерфейс для просмотра клиентов, мониторинга подключений и создания/удаления пользователей.

## Возможности

- Авторизация в панели (логин/пароль из переменных окружения, JWT-сессия)
- Список клиентов Telemt: имя, статус, подключения, активные IP, трафик
- Автообновление данных каждые 5 секунд
- Создание клиента с однократным показом secret
- Удаление клиента с подтверждением
- Публичная покупка профиля через ЮKassa (`/buy`) — разовая оплата, автоматическое создание клиента Telemt
- Однократная выдача secret покупателю после оплаты
- Список заказов в админ-панели (без secret)

## Требования

- **Сервер:** Linux с Docker и Docker Compose plugin
- **Telemt:** запущенный экземпляр с включённым API (`[server.api] enabled = true`), доступный по `127.0.0.1:9091` на хосте
- **Для биллинга:** PostgreSQL (поднимается через `docker compose`), аккаунт [ЮKassa](https://yookassa.ru/)
- **Для локальной разработки:** Python 3.11+, Node.js 22+ (опционально — сборка через Docker)

> Docker использует `network_mode: host`, чтобы контейнер панели мог обращаться к Telemt API на localhost хоста. Целевая платформа — Linux-сервер.

## Быстрая установка

```bash
cd webtelemt
chmod +x install.sh
./install.sh
```

Интерактивно запросит пароль администратора, создаст `development/.env`, соберёт образ и запустит контейнер.

Неинтерактивная установка:

```bash
./install.sh --password 'your-secret' --port 8080 --non-interactive
```

После установки панель доступна по адресу `http://<IP-сервера>:8080`.

## Биллинг и оплата

После `./install.sh` в `development/.env` уже заданы `DATABASE_URL`, `BILLING_CREDENTIALS_ENCRYPTION_KEY` и параметры тарифа. Для приёма платежей заполните:

| Переменная | Описание |
|---|---|
| `YOOKASSA_SHOP_ID` | ID магазина в личном кабинете ЮKassa |
| `YOOKASSA_SECRET_KEY` | Секретный ключ API |

Перезапустите контейнеры после изменения `.env`:

```bash
cd development && docker compose up -d
```

- **Покупка:** `http://<IP-сервера>:8080/buy`
- **Успех / ошибка:** `/buy/success?order_id=...`, `/buy/fail`

### Webhook ЮKassa

В [личном кабинете ЮKassa](https://yookassa.ru/my) → Настройки → Уведомления укажите:

| Параметр | Значение |
|---|---|
| URL | `https://<ваш-домен>/api/billing/webhook/yookassa` |
| События | `payment.succeeded` |

> Для production нужен HTTPS и публичный домен. Backend дополнительно проверяет платёж через API ЮKassa, а не только тело webhook.

Подробная инструкция для покупателей и администраторов: [`docs/handoff/DOCS.md`](docs/handoff/DOCS.md).

### PostgreSQL

`docker compose` поднимает `postgres` (порт `127.0.0.1:5432`) и `webtelemt` (`network_mode: host`). Панель подключается к БД на localhost хоста.

Удаление с очисткой данных заказов:

```bash
./install.sh --uninstall --purge-postgres
```

## Удаление

```bash
./install.sh --uninstall
```

Остановить контейнеры и удалить локальный образ.

```bash
./install.sh --uninstall --purge
```

Дополнительно удалить файл `development/.env`.

## Переменные окружения

Файл `development/.env` создаётся скриптом `install.sh` или вручную из `development/.env.example`.

| Переменная | Описание | По умолчанию |
|---|---|---|
| `TELEMT_API_URL` | Базовый URL Telemt API | `http://127.0.0.1:9091` |
| `TELEMT_AUTH_HEADER` | Заголовок авторизации для Telemt API (если настроен) | — |
| `PANEL_ADMIN_USER` | Логин администратора панели | `admin` |
| `PANEL_ADMIN_PASSWORD` | Пароль администратора | **обязателен** |
| `JWT_SECRET` | Секрет для подписи JWT | генерируется при установке |
| `PANEL_PORT` | Порт, на котором слушает панель (`0.0.0.0`) | `8080` |
| `POSTGRES_PASSWORD` | Пароль PostgreSQL | `webtelemt` |
| `DATABASE_URL` | URL БД (`postgresql+asyncpg://...`) | генерируется при установке |
| `YOOKASSA_SHOP_ID` | ID магазина ЮKassa | — |
| `YOOKASSA_SECRET_KEY` | Секретный ключ ЮKassa | — |
| `YOOKASSA_RETURN_URL` | Базовый URL возврата после оплаты | `http://<IP>:8080` |
| `BILLING_PLAN_NAME` | Название тарифа | `Базовый` |
| `BILLING_PLAN_PRICE_RUB` | Цена в рублях | `299` |
| `BILLING_PLAN_PERIOD_DAYS` | Срок для UI (информационно) | `30` |
| `BILLING_ORDER_TTL_MINUTES` | TTL неоплаченного заказа | `60` |
| `BILLING_CREDENTIALS_ENCRYPTION_KEY` | Fernet-ключ для secret в БД | генерируется при установке |
| `BILLING_ORDER_RATE_LIMIT` | Лимит создания заказов с IP | `5` |
| `BILLING_ORDER_RATE_WINDOW_SECONDS` | Окно rate limit (сек) | `900` |

> Биллинг отключён (API `/api/billing/*` → 503), пока не заданы все переменные ЮKassa, `DATABASE_URL` и `BILLING_CREDENTIALS_ENCRYPTION_KEY`.

## Архитектура

```
Browser → React SPA → FastAPI → Telemt API (127.0.0.1:9091)
                              ↘ PostgreSQL (заказы, биллинг)
                              ↘ ЮKassa API (платежи)
```

### Компоненты

| Слой | Технологии | Расположение |
|---|---|---|
| Frontend | React, TypeScript, Vite | `development/frontend/` |
| Backend | Python 3.11, FastAPI, PyJWT, httpx | `development/app/` |
| Статика | Собранный SPA | `development/static/` |
| Контейнер | Docker multi-stage, `network_mode: host` | `development/Dockerfile`, `docker-compose.yml` |

Backend принимает запросы на `/api/*`, проверяет JWT и проксирует вызовы к Telemt API (`/v1/users`, `/v1/stats/summary` и др.). Все остальные маршруты отдают SPA (`index.html`).

### API панели

| Метод | Путь | Авторизация | Описание |
|---|---|---|---|
| `POST` | `/api/auth/login` | — | Вход, выдача JWT |
| `GET` | `/api/auth/me` | JWT | Текущий пользователь |
| `GET` | `/api/users` | JWT | Список клиентов Telemt |
| `POST` | `/api/users` | JWT | Создание клиента |
| `DELETE` | `/api/users/{username}` | JWT | Удаление клиента |
| `GET` | `/api/stats/summary` | JWT | Сводка статистики |
| `GET` | `/api/health` | — | Прокси health Telemt |
| `GET` | `/api/billing/plan` | — | Публичный тариф |
| `POST` | `/api/billing/orders` | — (rate limit) | Создать заказ, получить `confirmation_url` |
| `GET` | `/api/billing/orders/{id}` | — | Статус заказа |
| `GET` | `/api/billing/orders/{id}/credentials` | — | Однократная выдача username + secret |
| `POST` | `/api/billing/webhook/yookassa` | проверка через API ЮKassa | Webhook оплаты |
| `GET` | `/api/billing/orders` | JWT | Список заказов (админ) |

## Локальная разработка

```bash
cd development
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env   # задать PANEL_ADMIN_PASSWORD, DATABASE_URL, YOOKASSA_*, BILLING_CREDENTIALS_ENCRYPTION_KEY

# PostgreSQL
docker compose up -d postgres

uvicorn app.main:app --host 0.0.0.0 --port 8080
```

Frontend (отдельный терминал):

```bash
cd development/frontend
npm install
npm run dev    # http://localhost:5173, proxy /api → :8080
```

Сборка frontend в `development/static/`:

```bash
cd development/frontend
npm run build
```

## Тесты

```bash
cd development
source .venv/bin/activate
pip install -r requirements-dev.txt
pytest -v
```

## Структура репозитория

```
webtelemt/
├── install.sh              # Установка и удаление на сервере
├── README.md
├── development/
│   ├── app/                # FastAPI backend
│   ├── app/billing/        # Модуль биллинга
│   ├── migrations/         # SQL-миграции PostgreSQL
│   ├── frontend/           # React SPA
│   ├── static/             # Собранный frontend
│   ├── tests/              # pytest API-тесты
│   ├── docker-compose.yml
│   ├── Dockerfile
│   └── .env.example
└── docs/handoff/           # Отчёты pipeline
```

## Документация Telemt API

https://github.com/telemt/telemt/blob/main/docs/Architecture/API/API.md
