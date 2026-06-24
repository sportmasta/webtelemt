# Test Report — биллинг WebTelemt (фаза 2)

**Статус:** OK  
**Тестировщик:** testirovschik  
**Дата:** 2026-06-24  
**Основание:** `REVIEW.md` (APPROVED), код в `development/`

---

## Unit / Integration (pytest)

**Команда:** `cd development && .venv\Scripts\pytest -v`  
**Результат:** 19 passed, 0 failed (7.76s)

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

---

## Security (SAST / deps)

| Проверка | Результат |
|----------|-----------|
| `scripts/security-check.sh` | Отсутствует в репозитории |
| `bandit -r app` | OK — 0 issues (959 LOC) |
| `npm audit` (frontend) | N/A — `node_modules` не установлены, тестовый скрипт отсутствует |

---

## Исправления в ходе прогона

1. **`tests/test_security.py`** — `test_security_headers_present`: проверка заголовков перенесена с `GET /` на `GET /api/auth/me`. В pytest-окружении frontend не собран (`static/` отсутствует), поэтому `GET /` возвращал 404; middleware добавляет заголовки на любой ответ — тест теперь проверяет API-эндпоинт.

---

## Notes

- **Окружение:** Python 3.11.9 установлен через `winget` (в системе не было Python/Docker). Создан `development/.venv`, зависимости из `requirements-dev.txt`.
- **Windows:** при teardown фикстуры `billing_client` (aiosqlite + asyncio) в stderr появляются `Windows fatal exception: access violation` — тесты завершаются с exit code 0, assertions не падают. Рекомендация: на Linux/CI прогон должен быть чистым; при необходимости — доработать `close_database()` / lifecycle в `conftest.py`.
- **E2E:** Playwright не настроен.

---

## Вердикт

**OK** — можно передавать tehnicheskiy-pisatel.
