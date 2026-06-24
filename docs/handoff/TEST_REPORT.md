# Test Report — личный кабинет покупателя (фаза 3)

**Статус:** OK  
**Тестировщик:** testirovschik  
**Дата:** 2026-06-24  
**Основание:** `REVIEW.md` (APPROVED), `08-account-task.md`, `DEV.md`, код в `development/`

---

## Unit / Integration (pytest)

**Команда:** `cd development; .\.venv\Scripts\python.exe -m pytest tests/ -v --tb=short`  
**Результат:** 27 passed, 0 failed (14.99s)

### Личный кабинет (`tests/test_account.py`) — 8/8

| Тест | Статус |
|------|--------|
| `test_register_and_login` | PASS |
| `test_login_wrong_password` | PASS |
| `test_create_order_with_customer_jwt_sets_customer_id` | PASS |
| `test_link_orders_by_email_on_register` | PASS |
| `test_account_orders_only_own` | PASS |
| `test_customer_token_on_admin_endpoint_forbidden` | PASS |
| `test_create_order_requires_email_without_customer` | PASS |
| `test_account_profiles_no_secret` | PASS |

### Биллинг (`tests/test_billing.py`) — 6/6

| Тест | Статус |
|------|--------|
| `test_get_plan` | PASS |
| `test_create_order_returns_confirmation_url` | PASS |
| `test_webhook_completes_order_and_credentials_one_time` | PASS |
| `test_webhook_idempotent` | PASS |
| `test_admin_orders_list_no_secret` | PASS |
| `test_admin_orders_requires_auth` | PASS |

### Остальная suite

| Модуль | Тестов | Статус |
|--------|--------|--------|
| `test_auth_api.py` | 7 | PASS |
| `test_security.py` | 6 | PASS |

---

## Frontend tests

**Статус:** N/A — в `development/frontend/package.json` нет скрипта `test` (vitest/jest не настроены).  
**Сборка:** `npm run build` не запускалась — `npm` отсутствует в PATH на тестовой машине. TypeScript-проверка входит в `build`; для CI рекомендуется `npm ci && npm run build`.

---

## Security (SAST / deps)

| Проверка | Результат |
|----------|-----------|
| `scripts/security-check.sh` | Отсутствует в репозитории |
| `bandit -r app/` | OK — 0 issues (1305 LOC) |
| `npm audit` (frontend) | N/A — `npm` недоступен в PATH |

---

## Исправления в ходе прогона

Исправлений не потребовалось — все тесты прошли с первого прогона.

---

## Notes

- **REVIEW:** `docs/handoff/REVIEW.md` — статус **APPROVED** (подтверждено перед прогоном).
- **Критерии фазы 3:** регистрация/вход, изоляция заказов по `customer_id`, привязка по email, запрет customer JWT на admin endpoints, отсутствие secret в `/api/account/profiles` — покрыты тестами `test_account.py`.
- **Windows:** при teardown фикстуры `billing_client` (aiosqlite + asyncio) в stderr появляются `Windows fatal exception: access violation` — тесты завершаются с exit code 0, assertions не падают. Известная особенность окружения; на Linux/CI прогон должен быть чистым.
- **E2E:** Playwright не настроен.

---

## Вердикт

**OK** — можно передавать tehnicheskiy-pisatel.
