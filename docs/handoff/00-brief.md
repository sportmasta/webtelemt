# WebTelemt — продуктовый бриф

## Цель
Легковесная web-панель с авторизацией для управления сервером Telemt.

## Контекст
- Конфиг Telemt: `/etc/telemt/telemt.toml`
/etc/telemt/telemt.toml
[general]
use_middle_proxy = true

[general.modes]
classic = false
secure = false
tls = true

[server]
port = 443

[server.api]
enabled = true
listen = "127.0.0.1:9091"
whitelist = ["127.0.0.1/32"]

[censorship]
tls_domain = "websms.ru"

[access.users]
arina = "ed3800e3025ba2e5c7d46e2e014cc6cd"
tankovmod = "71081b36599eb63e9e4d3543a18f3f08"
marina = "d699a6efaf3ee0e4ba614ebe7cb68cdd"
sashadeskop = "1408be0711db1eb9df57d23ce72ec4f3"
tarakhovskyGS = "871770d43cc69391885f7861af8d4e3d"
user5 = "54a5fa4ed845e851f1a66199a0ff3c21"
kvantsedded = "1f1f22fe50602b1a6d3d8a63118c0059"
kvantsitnov = "4e04dbbf2726b993630792c57a8b1c11"

- API Telemt: `http://127.0.0.1:9091/v1` (whitelist `127.0.0.1/32`, `auth_header` не задан)
- Документация API: https://github.com/telemt/telemt/blob/main/docs/Architecture/API/API.md

## MVP (фаза 1)

### Функции
1. **Авторизация в панели** — логин/пароль из env (`PANEL_ADMIN_USER`, `PANEL_ADMIN_PASSWORD`), JWT-сессия
2. **Список клиентов (users)** — `GET /v1/users`: имя, статус, текущие подключения, активные IP, трафик
3. **Отслеживание подключений** — автообновление (polling 5 с): `current_connections`, `active_unique_ips_list`, сводка из `GET /v1/stats/summary`
4. **Создание клиента** — `POST /v1/users` (username, опционально secret), показ secret один раз
5. **Удаление клиента** — `DELETE /v1/users/{username}` с подтверждением

### Не в MVP
- Редактирование конфига censorship/upstreams
- rotate-secret, enable/disable, quota
- PostgreSQL (достаточно env-auth)

## Архитектура

```
Browser → React (Vite) → FastAPI backend → Telemt API (127.0.0.1:9091)
```

- Backend проксирует Telemt API (панель на другом порту, доступ снаружи)
- Docker Compose: `backend` (Python FastAPI + static), `network_mode: host` или `extra_hosts` для доступа к localhost API
- Стек: React, Python 3.11+, Docker Compose

## UI
- Минималистичный тёмный интерфейс, русский язык
- Страницы: Login, Dashboard (таблица users + метрики сервера)
- Модалка создания user, confirm на удаление

## Переменные окружения
| Переменная | Описание | Default |
|---|---|---|
| `TELEMT_API_URL` | URL Telemt API | `http://127.0.0.1:9091` |
| `PANEL_ADMIN_USER` | Логин панели | `admin` |
| `PANEL_ADMIN_PASSWORD` | Пароль панели | (обязателен) |
| `JWT_SECRET` | Секрет JWT | random |
| `PANEL_PORT` | Порт панели | `8080` |

## Установка на серверы
- Скрипт `install.sh` в корне репозитория: установка и удаление панели на серверах с разными IP
- Скрипт должен: проверять Docker, генерировать `.env` (JWT, пароль админа), собирать frontend, поднимать `docker compose`
- Режим удаления: `./install.sh --uninstall` (остановка контейнеров, опционально очистка)
- Панель слушает `0.0.0.0:PANEL_PORT` — доступна по IP сервера

## Критерии приёмки
- [ ] `./install.sh` устанавливает панель на произвольном сервере
- [ ] `./install.sh --uninstall` удаляет панель
- [ ] `docker compose up` поднимает панель
- [x] Логин с неверным паролем → 401
- [ ] Dashboard показывает users из Telemt с live-подключениями
- [ ] Создание user → появляется в списке, secret показан
- [ ] Удаление user → исчезает из списка
- [x] CHANGES.md ведётся

## Этапы pipeline
1. ✅ Бриф (PM)
2. ✅ Разработка (razrabotchik) — см. `02-dev-done.md`
3. ✅ Отладка (otladchik) — см. `03-debug-done.md`
4. ✅ Тесты (testirovschik) — см. `04-test-done.md`
5. ✅ Документация (tehnicheskiy-pisatel) — см. `05-docs-done.md`
