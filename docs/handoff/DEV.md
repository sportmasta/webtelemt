# Отчёт разработчика — WebTelemt

## Фаза 3 — личный кабинет покупателя (2026-06-24)

### Сводка

Личный кабинет покупателя, связанный с биллингом: регистрация/вход по email+пароль, JWT customer, история заказов, live-профили Telemt (без secret), привязка заказов к аккаунту при покупке и постфактум по email.

### Изменённые и новые файлы

#### Backend
| Путь | Назначение |
|------|------------|
| `development/app/account/` | Регистрация, вход, me, orders, profiles |
| `development/app/account/passwords.py` | Хеширование паролей (Argon2 через pwdlib) |
| `development/app/auth.py` | Разделение admin/customer JWT, `get_current_admin`, `get_current_customer` |
| `development/app/billing/models.py` | Модель `Customer`, `orders.customer_id` |
| `development/app/billing/router.py` | Customer JWT при создании заказа, email обязателен без входа |
| `development/app/billing/service.py` | `customer_id`, нормализация email |
| `development/app/billing/schemas.py` | `customer_email` в публичном ответе заказа |
| `development/app/billing/database.py` | Запуск всех SQL-миграций по порядку |
| `development/app/main.py` | Подключение account router, admin deps |
| `development/migrations/002_customers.sql` | Таблица `customers`, FK `orders.customer_id` |
| `development/requirements.txt` | `pwdlib[argon2]` |
| `development/tests/test_account.py` | Тесты кабинета |
| `development/tests/test_billing.py` | Email в заказах (обязательное поле без JWT) |

#### Frontend
| Путь | Назначение |
|------|------------|
| `development/frontend/src/pages/AccountPage.tsx` | `/account` — профили и история |
| `development/frontend/src/pages/AccountLoginPage.tsx` | `/account/login` |
| `development/frontend/src/pages/AccountRegisterPage.tsx` | `/account/register` |
| `development/frontend/src/components/ConnectionLinks.tsx` | Shared QR/ссылки (из админки) |
| `development/frontend/src/pages/BuyPage.tsx` | Email обязателен / readonly, ссылки в кабинет |
| `development/frontend/src/pages/BuySuccessPage.tsx` | CTA регистрации/входа |
| `development/frontend/src/App.tsx` | Роутинг `/account/*`, рефактор connection links |
| `development/frontend/src/api.ts` | `customer_token`, `customerApi` |
| `development/frontend/src/styles.css` | Стили кабинета |

---

## Auth model: admin vs customer JWT

Оба типа токенов подписываются одним `JWT_SECRET`, но различаются payload и проверкой на endpoints.

| | Admin | Customer |
|---|-------|----------|
| **Получение** | `POST /api/auth/login` (username + env password) | `POST /api/account/register` или `/login` |
| **localStorage** | `webtelemt_token` | `customer_token` |
| **Payload** | `{"sub": "<admin_username>", "exp": ...}` | `{"sub": "<customer_uuid>", "role": "customer", "email": "...", "exp": ...}` |
| **Admin API** | ✅ (токены без `role` — обратная совместимость) | ❌ 403 |
| **Customer API** | ❌ 401 | ✅ |

Защита admin endpoints: `get_current_admin` — отклоняет `role: customer` с 403.  
Защита customer endpoints: `get_current_customer` — принимает только `role: customer`.

---

## Пароли и привязка заказов

### Пароли
- **Алгоритм:** Argon2 через библиотеку `pwdlib` (`PasswordHash.recommended()`).
- **Минимум:** 8 символов (валидация на backend и frontend).
- **Хранение:** только `password_hash` в таблице `customers`; пароли не логируются.

### Привязка заказов
1. **При покупке с customer JWT:** `POST /api/billing/orders` с заголовком `Authorization: Bearer <customer_token>` → `orders.customer_id` проставляется сразу; email берётся из профиля.
2. **Без входа:** email обязателен, сохраняется в `orders.customer_email` (lowercase, trim).
3. **Постфактум:** при регистрации или входе все заказы с тем же `customer_email` (case-insensitive) и `customer_id IS NULL` привязываются к аккаунту (`link_orders_by_email`).

---

## Как запустить

### Production (Docker)

```bash
./install.sh
# Заполните YOOKASSA_* в development/.env
cd development
docker compose up -d
```

- Панель: `http://<ip>:8080`
- Покупка: `http://<ip>:8080/buy`
- Кабинет: `http://<ip>:8080/account`

При обновлении с фазы 2 миграция `002_customers.sql` применится автоматически при старте backend.

### Локальная разработка

```bash
cd development
.venv\Scripts\activate          # Linux/macOS: source .venv/bin/activate
pip install -r requirements-dev.txt

docker compose up -d postgres
cp .env.example .env            # DATABASE_URL, YOOKASSA_*, BILLING_CREDENTIALS_ENCRYPTION_KEY

uvicorn app.main:app --reload --port 8080

cd frontend
npm install
npm run dev
```

### Тесты

```bash
cd development
.venv\Scripts\pytest -v         # Linux/macOS: .venv/bin/pytest -v
```

27 тестов: auth, security, billing, account. SQLite in-memory + MockYooKassa.

---

## API endpoints (фаза 3)

| Метод | Путь | Auth | Описание |
|-------|------|------|----------|
| POST | `/api/account/register` | — | Регистрация, JWT customer |
| POST | `/api/account/login` | — | Вход, JWT customer |
| GET | `/api/account/me` | customer | id, email |
| GET | `/api/account/orders` | customer | Заказы аккаунта |
| GET | `/api/account/profiles` | customer | Completed + live Telemt (без secret) |
| POST | `/api/billing/orders` | опционально customer JWT | Email обязателен без JWT |

Rate limit на register/login — тот же механизм, что на admin login (`LOGIN_RATE_LIMIT`).

---

## Фаза 2 — биллинг (кратко)

MVP биллинга: `/buy`, ЮKassa, one-time secret, PostgreSQL, админ-вкладка «Заказы».  
Подробности прежней реализации — в git history и `development/CHANGES.md`.

### Безопасность secret (без изменений)
- Fernet at-rest, one-time reveal, админка без secret.
- Кабинет показывает только ссылки подключения и флаг `credentials_viewed`.

---

## Открытые вопросы

- IP-whitelist для webhook ЮKassa в production?
- Фоновый cron для TTL pending-заказов?
- Восстановление пароля / подтверждение email — вне scope фазы 3.
