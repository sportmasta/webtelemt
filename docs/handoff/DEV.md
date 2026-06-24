# Отчёт разработчика — биллинг WebTelemt (фаза 2)

## Сводка

Реализован MVP биллинга: публичная покупка тарифа через ЮKassa, автоматическое создание профиля Telemt после оплаты, однократная выдача secret покупателю, хранение заказов в PostgreSQL, список заказов в админ-панели.

## Изменённые и новые файлы

### Backend
| Путь | Назначение |
|------|------------|
| `development/app/billing/` | Модуль биллинга (models, database, service, router, yookassa, crypto, deps, schemas) |
| `development/app/config.py` | Переменные биллинга и `billing_enabled` |
| `development/app/main.py` | Lifespan БД, подключение billing router |
| `development/app/rate_limit.py` | Rate limit для `POST /api/billing/orders` |
| `development/app/startup.py` | Проверка encryption key при DATABASE_URL |
| `development/migrations/001_orders.sql` | SQL-миграция таблиц |

### Frontend
| Путь | Назначение |
|------|------------|
| `development/frontend/src/pages/BuyPage.tsx` | `/buy` |
| `development/frontend/src/pages/BuySuccessPage.tsx` | `/buy/success` |
| `development/frontend/src/pages/BuyFailPage.tsx` | `/buy/fail` |
| `development/frontend/src/App.tsx` | Роутинг, вкладка «Заказы» |
| `development/frontend/src/api.ts` | Billing API |
| `development/frontend/src/styles.css` | Стили покупки и заказов |

### Инфраструктура
| Путь | Назначение |
|------|------------|
| `development/docker-compose.yml` | Сервис `postgres` + `webtelemt` |
| `development/.env.example` | Новые переменные |
| `development/requirements.txt` | sqlalchemy, asyncpg, cryptography |
| `install.sh` | Генерация ключей, подсказки ЮKassa, `--purge-postgres` |
| `development/tests/test_billing.py` | Тесты с mock ЮKassa |

## Как запустить

### Production (Docker)

```bash
# Из корня репозитория
./install.sh
# Заполните YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY в development/.env
# Настройте webhook в личном кабинете ЮKassa:
#   POST https://<ваш-домен>/api/billing/webhook/yookassa
```

```bash
cd development
docker compose up -d
```

- Панель: `http://<ip>:8080`
- Покупка: `http://<ip>:8080/buy`
- PostgreSQL: `127.0.0.1:5432` (доступен с хоста; webtelemt подключается через `network_mode: host`)

### Локальная разработка

```bash
cd development
python3 -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt

# PostgreSQL (или только postgres из compose)
docker compose up -d postgres

cp .env.example .env
# Заполните DATABASE_URL, YOOKASSA_*, BILLING_CREDENTIALS_ENCRYPTION_KEY
# Fernet: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

# Backend
uvicorn app.main:app --reload --port 8080

# Frontend (отдельный терминал)
cd frontend
npm install
npm run dev
# Vite proxy или PANEL_CORS_ORIGINS=http://localhost:5173
```

### Тесты

```bash
cd development
.venv/bin/pytest -v   # Windows: .venv\Scripts\pytest -v
```

Тесты биллинга используют SQLite in-memory и `MockYooKassaClient` — реальные API не вызываются.

> **Примечание:** после fix гонки прогнать `pytest -v` локально (в среде агента Python может быть недоступен).

## API endpoints

| Метод | Путь | Auth |
|-------|------|------|
| GET | `/api/billing/plan` | — |
| POST | `/api/billing/orders` | — (rate limit) |
| GET | `/api/billing/orders/{id}` | — |
| GET | `/api/billing/orders/{id}/credentials` | — (one-time, 410 при повторе) |
| POST | `/api/billing/webhook/yookassa` | проверка через API ЮKassa |
| GET | `/api/billing/orders` | JWT admin |

## Безопасность secret

- **At-rest:** secret хранится в `order_secrets.secret_encrypted` (Fernet, ключ `BILLING_CREDENTIALS_ENCRYPTION_KEY`).
- **One-time reveal:** при первом `GET .../credentials` secret расшифровывается, `credentials_viewed_at` фиксируется, запись в `order_secrets` удаляется.
- **Админка:** secret не отображается, только флаг `credentials_viewed`.
- **Логи:** secret и ключи ЮKassa не логируются.

## Webhook ЮKassa

При `payment.succeeded` backend:
1. Запрашивает статус платежа через API ЮKassa (верификация, не только тело webhook).
2. Сверяет сумму и `metadata.order_id`.
3. Идемпотентно создаёт пользователя Telemt (повторный webhook не создаёт второго user).
4. Переводит заказ в `completed`.

## Fix: гонка webhook / credentials (code review)

**Проблема:** при параллельных webhook или параллельных `GET .../credentials` два запроса могли пройти проверку статуса до commit и создать двух Telemt users или дважды выдать secret.

**Исправление** (`development/app/billing/service.py`):
- `_load_order(..., for_update=False)` — при `for_update=True` добавляется `SELECT ... FOR UPDATE`.
- `handle_webhook` — загрузка заказа с `for_update=True`; если уже `completed` — `commit` и return (снятие блокировки).
- `reveal_credentials` — загрузка заказа с `for_update=True`.

Дополнительно: удалён неиспользуемый импорт `timezone` в `schemas.py`.

## Миграции

При старте приложения выполняется `migrations/001_orders.sql` (PostgreSQL). Для SQLite (тесты) — `Base.metadata.create_all`.

## Известные ограничения

- Один тариф из env, без UI редактирования.
- Email сохраняется, но не отправляется.
- Нет личного кабинета покупателя.
- TTL pending-заказов проверяется при чтении заказа (фоновый cron не реализован).
- ЮKassa webhook: IP-whitelist не реализован — полагаемся на повторный запрос статуса платежа через API.
- Биллинг отключён (`503`), если не заданы все переменные ЮKassa + DATABASE_URL + encryption key.

## Открытые вопросы

- Нужен ли IP-whitelist для webhook ЮKassa в production?
- URL fail-редиректа: сейчас покупатель попадает на `/buy/success` через `return_url`; для `/buy/fail` настроить в ЮKassa отдельно при необходимости.
