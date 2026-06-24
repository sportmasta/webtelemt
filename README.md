# WebTelemt

Легковесная web-панель с авторизацией для управления сервером [Telemt](https://github.com/telemt/telemt). Панель проксирует Telemt API и предоставляет удобный интерфейс для просмотра клиентов, мониторинга подключений и создания/удаления пользователей.

## Возможности (MVP)

- Авторизация в панели (логин/пароль из переменных окружения, JWT-сессия)
- Список клиентов Telemt: имя, статус, подключения, активные IP, трафик
- Автообновление данных каждые 5 секунд
- Создание клиента с однократным показом secret
- Удаление клиента с подтверждением

## Требования

- **Сервер:** Linux с Docker и Docker Compose plugin
- **Telemt:** запущенный экземпляр с включённым API (`[server.api] enabled = true`), доступный по `127.0.0.1:9091` на хосте
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

## Архитектура

```
Browser → React (Vite SPA) → FastAPI backend → Telemt API (127.0.0.1:9091)
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

## Локальная разработка

```bash
cd development
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # задать PANEL_ADMIN_PASSWORD
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
