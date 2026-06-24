# Задача: личный кабинет покупателя (фаза 3)

## Контекст

Биллинг MVP готов (см. `07-billing-task.md`, `DEV.md`): покупка через `/buy`, ЮKassa, однократная выдача secret, заказы в PostgreSQL, админ-вкладка «Заказы».

В фазе 2 **не было** личного кабинета с повторным входом. Покупатель после оплаты видит credentials один раз и больше не может вернуться к своим данным.

## Цель (фаза 3 — Customer Account)

Личный кабинет покупателя, **связанный с биллингом**: регистрация/вход, история заказов, статус профиля Telemt, ссылки для подключения (без повторной выдачи secret).

## Не в scope

- Email-рассылка (подтверждение почты, восстановление пароля).
- OAuth (Google, Telegram).
- Подписки с автопродлением.
- Редактирование тарифов.
- Смена Telemt secret из кабинета (rotate-secret).
- Объединение админ- и customer-логина в один UI.

## Пользовательские сценарии

### Регистрация и вход
1. `/account/register` — email + пароль (мин. 8 символов), подтверждение пароля.
2. `/account/login` — email + пароль → JWT customer.
3. Ссылки «Личный кабинет» на `/buy` и после покупки.

### Покупка с привязкой к аккаунту
1. Если customer залогинен — заказ автоматически привязывается к `customer_id`.
2. Email на `/buy` **обязателен**, если пользователь не залогинен (для возможности привязки постфактум).
3. Если залогинен — email подставляется из профиля, поле readonly.

### Привязка старых заказов
1. После регистрации/входа: заказы с тем же `customer_email` (case-insensitive), у которых `customer_id IS NULL`, привязываются к аккаунту.
2. На success-странице (`/buy/success`): если не залогинен и заказ имеет email — CTA «Создать кабинет» / «Войти», чтобы увидеть профиль позже.

### Кабинет `/account`
1. Шапка: email, кнопка «Выйти», ссылка «Купить ещё» → `/buy`.
2. Блок **«Мои профили»** — по каждому `completed` заказу с `username_issued`:
   - username, дата выдачи, статус заказа;
   - live-данные из Telemt API (`GET /v1/users/{username}`): статус, TCP, IP, трафик;
   - ссылки подключения (как в админке, QR) — **без secret**;
   - пометка, если secret уже был просмотрен (нельзя показать снова).
3. Блок **«История заказов»** — все заказы аккаунта: дата, сумма, статус, username.
4. Polling Telemt-данных каждые 10 с (как в админке).

### Администратор
- Без изменений: админ JWT отдельно, Dashboard как сейчас.
- В списке заказов (опционально): колонка `customer_email` уже есть; `customer_id` в админке не обязателен.

## Backend API

### Авторизация customer (отдельно от admin)

JWT payload: `{"sub": "<customer_uuid>", "role": "customer", "email": "...", "exp": ...}`

| Метод | Путь | Auth | Описание |
|---|---|---|---|
| `POST` | `/api/account/register` | — | Регистрация, вернуть token |
| `POST` | `/api/account/login` | — | Вход, вернуть token |
| `GET` | `/api/account/me` | customer JWT | Профиль (id, email) |
| `GET` | `/api/account/orders` | customer JWT | Заказы текущего customer |
| `GET` | `/api/account/profiles` | customer JWT | Completed заказы + live Telemt stats по username_issued |

Admin endpoints (`/api/auth/login`, `/api/billing/orders` list) — проверять `role: admin` или отсутствие role + совпадение с `PANEL_ADMIN_USER` (обратная совместимость: старые admin-токены без role считать admin).

Customer endpoints — только `role: customer`.

### Изменения billing

- `POST /api/billing/orders` — опциональный заголовок `Authorization: Bearer <customer_token>` → проставить `customer_id`.
- `orders.customer_id` — FK на `customers`.

Rate limit на register/login как на admin login.

## PostgreSQL

Миграция `002_customers.sql`:

```sql
CREATE TABLE customers (
    id UUID PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE orders ADD COLUMN customer_id UUID REFERENCES customers(id);
CREATE INDEX idx_orders_customer_id ON orders (customer_id);
```

Пароли: `bcrypt` или `argon2` (предпочтительно argon2 через `passlib` / `pwdlib` — зафиксировать в DEV.md).

## Frontend

| Путь | Описание |
|---|---|
| `/account` | Кабинет (защищён) |
| `/account/login` | Вход |
| `/account/register` | Регистрация |

- Отдельный token в `localStorage`: `customer_token` (не путать с admin `token`).
- Роутинг в `App.tsx`: `/account/*` отдельно от `/buy` и admin.
- Стили — существующий тёмный UI, русский язык.
- Переиспользовать компоненты connection links / QR из админки (вынести в shared при необходимости).

## Безопасность

- Customer не может видеть чужие заказы.
- Secret **не** отдавать повторно через кабинет (только флаг `credentials_viewed`).
- Customer JWT не даёт доступ к admin API.
- Не логировать пароли.
- Email нормализовать (lowercase, trim) при регистрации и привязке.

## Тесты

- Регистрация, логин, неверный пароль → 401.
- Создание заказа с customer JWT → `customer_id` установлен.
- Привязка заказов по email при регистрации.
- `GET /api/account/orders` — только свои заказы.
- Customer token на admin endpoint → 403.
- pytest + обновить `scripts/security-check.sh` при необходимости.

## Критерии приёмки

- [ ] Регистрация и вход customer работают
- [ ] Кабинет показывает заказы и Telemt-профили (без secret)
- [ ] Покупка привязывается к аккаунту
- [ ] Старые заказы привязываются по email
- [ ] Admin-панель не сломана
- [ ] pytest проходит
- [ ] `docs/handoff/DEV.md` обновлён

## Артефакты

- Код: `development/app/account/` (или `customer/`), миграция, frontend pages
- `docs/handoff/DEV.md`
- `development/CHANGES.md`
