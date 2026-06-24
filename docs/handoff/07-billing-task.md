# Задача: биллинг — приём платежей и выдача профилей Telemt

## Контекст

WebTelemt — панель управления Telemt (MVP готов, см. `00-brief.md`, `02-dev-done.md`).  
Сейчас профили создаёт только администратор вручную. Нужен **публичный поток оплаты**: клиент платит → автоматически получает профиль (username + secret).

Стек pipeline: React (`development/frontend/`), Python 3 FastAPI (`development/app/`), Docker Compose, **PostgreSQL** (новое).

## Цель (фаза 2 — Billing MVP)

1. Публичная страница покупки тарифа (без авторизации админа).
2. Приём оплаты через **ЮKassa** (YooKassa).
3. После успешной оплаты — автоматическое создание пользователя в Telemt API и **однократный показ secret** покупателю.
4. Хранение заказов и статусов в PostgreSQL.
5. Расширение админ-панели: список заказов, статусы, выданные username.

## Не в scope (фаза 2)

- Подписки с автопродлением (только разовая оплата за профиль).
- Email-рассылка credentials (опционально заглушка/поле email без отправки).
- Несколько платёжных провайдеров.
- Личный кабинет покупателя с повторным входом.
- Редактирование тарифов через UI (тарифы из env/конфига).

## Тарифы

Один тариф на MVP, параметры из env:

| Переменная | Описание | Пример |
|---|---|---|
| `BILLING_PLAN_NAME` | Название тарифа | `Базовый` |
| `BILLING_PLAN_PRICE_RUB` | Цена в рублях | `299` |
| `BILLING_PLAN_PERIOD_DAYS` | Срок действия (информационно, для UI) | `30` |

Цена передаётся в ЮKassa в копейках (`amount * 100`).

## Пользовательские сценарии

### Покупатель
1. Открывает `/buy` — видит тариф, цену, кнопку «Оплатить».
2. Опционально вводит желаемый username (валидация как в панели: `^[A-Za-z0-9_.-]+$`, 1–64 символа). Если пусто — backend генерирует `user_<random>`.
3. Нажимает «Оплатить» → редирект на страницу ЮKassa.
4. После оплаты возвращается на `/buy/success?order_id=...` — видит username и secret **один раз** (если заказ `completed`).
5. При отмене/ошибке — `/buy/fail` с понятным сообщением.

### Администратор
1. В Dashboard — новая вкладка/секция «Заказы»: id, дата, сумма, статус, username, email (если был).
2. Secret в админке **не показывать** (только факт выдачи).

### Webhook ЮKassa
1. `POST /api/billing/webhook/yookassa` — без JWT, проверка подписи/IP по документации ЮKassa.
2. При `payment.succeeded` — идемпотентно: если заказ уже `completed`, не создавать user повторно.
3. Создать user в Telemt (`POST /v1/users`), сохранить username и secret в БД (secret зашифровать at-rest или хранить только до первого просмотра покупателем — выбрать безопасный вариант и описать в DEV.md).

## Статусы заказа

`pending` → `paid` → `completed` | `failed` | `expired`

- `pending` — создан, ожидает оплаты
- `paid` — webhook получен, создаётся профиль
- `completed` — профиль выдан, secret доступен покупателю один раз
- `failed` — ошибка создания профиля или платёж отменён
- `expired` — не оплачен в течение TTL (например 1 час)

## Backend API (новые endpoints)

| Метод | Путь | Auth | Описание |
|---|---|---|---|
| `GET` | `/api/billing/plan` | — | Публичный тариф (name, price, period) |
| `POST` | `/api/billing/orders` | — | Создать заказ + payment в ЮKassa, вернуть `confirmation_url` |
| `GET` | `/api/billing/orders/{id}` | — | Статус заказа (без secret, кроме флага `credentials_available`) |
| `GET` | `/api/billing/orders/{id}/credentials` | — | Однократная выдача username+secret если `completed` и ещё не просмотрено |
| `POST` | `/api/billing/webhook/yookassa` | подпись | Webhook ЮKassa |
| `GET` | `/api/billing/orders` | JWT admin | Список заказов для админки |

## PostgreSQL

Добавить сервис `postgres` в `docker-compose.yml` (не `network_mode: host` для postgres — webtelemt подключается по внутренней сети или `127.0.0.1` с проброшенным портом; **сохранить** `network_mode: host` для webtelemt если нужен доступ к Telemt API — postgres на `127.0.0.1:5432`).

Таблицы (минимум):
- `orders` — id (UUID), status, amount_kopecks, currency, username_requested, username_issued, yookassa_payment_id, created_at, paid_at, completed_at, credentials_viewed_at, customer_email (nullable)
- `order_secrets` — order_id, secret_encrypted (или отдельная логика one-time reveal)

Миграции: Alembic или SQL-скрипт при старте — на выбор разработчика, зафиксировать в DEV.md.

## Переменные окружения (дополнить `.env.example`)

| Переменная | Описание |
|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://...` |
| `YOOKASSA_SHOP_ID` | ID магазина |
| `YOOKASSA_SECRET_KEY` | Секретный ключ |
| `YOOKASSA_RETURN_URL` | URL возврата после оплаты (база, без order_id — backend подставит) |
| `BILLING_PLAN_NAME` | Название тарифа |
| `BILLING_PLAN_PRICE_RUB` | Цена |
| `BILLING_PLAN_PERIOD_DAYS` | Период для UI |
| `BILLING_ORDER_TTL_MINUTES` | TTL pending-заказа (default 60) |
| `BILLING_CREDENTIALS_ENCRYPTION_KEY` | Ключ Fernet для secret at-rest (генерировать при install) |

## Frontend

- `/buy` — страница покупки (публичная).
- `/buy/success`, `/buy/fail` — результат оплаты.
- Dashboard: секция «Заказы» (только для залогиненного админа).
- Стиль — как существующий тёмный UI, русский язык.

## Безопасность

- Rate limit на `POST /api/billing/orders` (как login).
- Webhook: проверка подлинности уведомлений ЮKassa.
- Secret показывается один раз; после просмотра endpoint credentials возвращает 410 Gone.
- Не логировать secret и ключи ЮKassa.

## install.sh

- Добавить генерацию `DATABASE_URL`, `BILLING_CREDENTIALS_ENCRYPTION_KEY`.
- Подсказки по настройке ЮKassa (shop_id, secret_key, return_url).
- При `--uninstall` — опция очистки volume postgres.

## Тесты

- Unit/integration: создание заказа, mock webhook succeeded → user created, credentials one-time.
- Mock ЮKassa client в тестах (без реальных API-вызовов).
- Обновить `scripts/security-check.sh` при необходимости.

## Критерии приёмки

- [ ] `docker compose up` поднимает webtelemt + postgres
- [ ] `/buy` показывает тариф и создаёт заказ (mock/real ЮKassa в dev)
- [ ] Webhook `payment.succeeded` создаёт Telemt user и переводит заказ в `completed`
- [ ] Покупатель видит secret один раз на success-странице
- [ ] Повторный запрос credentials → 410
- [ ] Админ видит список заказов без secret
- [ ] Идемпотентность webhook (двойной вызов не создаёт второго user)
- [ ] pytest проходит
- [ ] `docs/handoff/DEV.md` — отчёт разработчика

## Артефакты

- Код: `development/app/billing/`, миграции, frontend страницы
- `docs/handoff/DEV.md` — по завершении razrabotchik
- Обновить `development/CHANGES.md`

## Ссылки

- ЮKassa API: https://yookassa.ru/developers/api
- Telemt API users: `POST /v1/users` (см. README, `development/app/telemt.py`)
