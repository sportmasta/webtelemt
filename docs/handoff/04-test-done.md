# Отчёт тестировщика — WebTelemt MVP

**Статус:** готово к документации (tehnicheskiy-pisatel)  
**Дата:** 2025-06-24  
**Вход:** `docs/handoff/03-debug-done.md`

## Что сделано

### API-тесты (`development/tests/`)

Стек: **pytest** + **FastAPI TestClient** (httpx). Telemt API мокируется через `unittest.mock.patch` на `TelemtClient.request`.

| Файл | Содержание |
|---|---|
| `conftest.py` | Фикстуры: env для тестов, `TestClient`, `auth_headers` |
| `test_auth_api.py` | 5 сценариев авторизации и защищённых эндпоинтов |
| `pytest.ini` | `testpaths = tests`, `pythonpath = .` |

### Зависимости

- `development/requirements-dev.txt` — `pytest>=8.0` + `-r requirements.txt`

## Результаты прогона

```bash
cd development
source .venv/bin/activate
pip install -r requirements-dev.txt
pytest -v
```

```
tests/test_auth_api.py::test_login_wrong_password PASSED
tests/test_auth_api.py::test_login_correct_returns_token PASSED
tests/test_auth_api.py::test_protected_endpoint_without_token PASSED
tests/test_auth_api.py::test_users_without_token PASSED
tests/test_auth_api.py::test_users_with_token_returns_mocked_data PASSED

======================== 5 passed in 0.05s ========================
```

| # | Сценарий | Ожидание | Результат |
|---|---|---|---|
| 1 | `POST /api/auth/login` — неверный пароль | 401 | **PASS** |
| 2 | `POST /api/auth/login` — верный пароль | 200 + JWT token | **PASS** |
| 3 | `GET /api/auth/me` без токена | 401 | **PASS** |
| 4 | `GET /api/users` без токена | 401 | **PASS** |
| 5 | `GET /api/users` с JWT + mock Telemt | 200 + список users | **PASS** |

## Покрытие критериев приёмки

| Критерий | Автотест | Примечание |
|---|---|---|
| Логин с неверным паролем → 401 | ✅ | `test_login_wrong_password` |
| Логин с верным паролем → JWT | ✅ | `test_login_correct_returns_token` |
| Защищённый эндпоинт без токена → 401 | ✅ | `test_protected_endpoint_without_token`, `test_users_without_token` |
| `./install.sh` | — | Требует сервер с Docker; smoke в `03-debug-done.md` |
| `docker compose up` | — | Smoke в `03-debug-done.md` |
| Dashboard / create / delete user | — | Требует реальный Telemt API (интеграция на сервере) |

## Известные ограничения

- Тесты не поднимают Telemt API — `/api/users` мокируется
- E2E сценарии (install.sh, dashboard, create/delete) остаются для ручной проверки на сервере с Telemt
- При прогоне на Python 3.14 — deprecation warnings от Starlette/FastAPI (не влияют на результат)

## Артефакты

- `development/tests/` — тесты
- `development/requirements-dev.txt` — dev-зависимости
- `development/pytest.ini` — конфигурация pytest

## Следующий этап

**tehnicheskiy-pisatel** — `README.md`, `docs/handoff/05-docs-done.md`.
