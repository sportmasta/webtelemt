# Отчёт отладчика — WebTelemt MVP

**Статус:** готово к тестированию (testirovschik)  
**Дата:** 2025-06-24  
**Вход:** `docs/handoff/02-dev-done.md`

## Результаты проверок

| # | Проверка | Результат | Примечание |
|---|----------|-----------|------------|
| 1 | Frontend build (`npm run build`) | **PASS** | `npm` на хосте отсутствует; сборка через `node:22-alpine` Docker. `tsc --noEmit` + `vite build` без ошибок → `development/static/` |
| 2 | Python imports (`from app.main import app`) | **PASS** | `.venv` создан, `pip install -r requirements.txt`, импорт `WebTelemt` OK |
| 3 | `install.sh` syntax (`bash -n`) | **PASS** | Синтаксических ошибок нет |
| 4 | Code review (`auth.py`, `main.py`, `App.tsx`, `api.ts`) | **PASS** | Критических багов не найдено; 2 мелких UX-правки внесены (см. ниже) |
| 5 | Backend login (wrong password → 401) | **PASS** | `POST /api/auth/login` с неверным паролем → `401 {"detail":"Неверный логин или пароль"}`; верный пароль → `200` + JWT |
| 6 | Docker (`docker compose build` + run) | **PASS** | Multi-stage образ собирается; контейнер отдаёт SPA (`/`) и login API |

### Дополнительные smoke-тесты

| Проверка | Результат |
|----------|-----------|
| `GET /api/auth/me` без токена | **PASS** → 401 |
| `GET /api/health` без Telemt | **PASS** → 502 (ожидаемо) |
| SPA `/` и `/assets/*` при наличии `static/` | **PASS** → 200 (после сборки frontend и перезапуска uvicorn) |
| `PyJWTError` import / JWT encode | **PASS** |

## Что тестировалось

### 1. Frontend build
```bash
cd development
docker run --rm -v "$(pwd):/build" -w /build/frontend node:22-alpine \
  sh -c "npm ci 2>/dev/null || npm install && npm run build"
```
Артефакты: `development/static/index.html`, `development/static/assets/*`.

### 2. Python backend
```bash
cd development
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -c "from app.main import app"
PANEL_ADMIN_PASSWORD=testpass123 uvicorn app.main:app --host 127.0.0.1 --port 18081
```

### 3. Login endpoint
```bash
curl -X POST http://127.0.0.1:18081/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"wrong"}'
# → 401

curl -X POST http://127.0.0.1:18081/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"testpass123"}'
# → 200 + token
```

### 4. Docker
```bash
cd development && docker compose build
docker run --rm -d -p 18082:18082 \
  -e PANEL_ADMIN_PASSWORD=testpass -e PANEL_PORT=18082 development-webtelemt
```

### 5. install.sh
```bash
bash -n install.sh
```

## Code review — замечания

### auth.py — OK
- `PyJWTError` корректен для PyJWT 2.x
- `secrets.compare_digest` для логина/пароля
- `HTTPBearer(auto_error=False)` + явная 401 при отсутствии токена

### main.py — OK с оговорками
- API-маршруты регистрируются до SPA fallback на `startup` — порядок корректен
- `_mount_static` не монтирует SPA, если `static/` отсутствует при старте (нужна пересборка + рестарт)
- `CORSMiddleware`: `allow_origins=["*"]` + `allow_credentials=True` — несовместимая комбинация по спецификации CORS; на практике не мешает (используется Bearer header, не cookies)
- `/api/health` публичный (без JWT) — проксирует Telemt; потенциальная утечка статуса Telemt

### App.tsx — OK
- Auth flow: loading → login/dashboard
- Polling 5 с, 401 → logout
- Модалки create/delete работают логически корректно

### api.ts — исправлено
- Добавлен `formatErrorDetail()` для читаемых сообщений при validation errors FastAPI (массив `detail`)

### docker-compose.yml / Dockerfile — OK
- Multi-stage: Node build → `COPY --from=frontend-build /build/static` (путь совпадает с `outDir: ../static` в vite.config)
- `network_mode: host` — корректно для доступа к Telemt на `127.0.0.1:9091` на Linux-сервере
- `entrypoint.sh` — uvicorn на `0.0.0.0:${PANEL_PORT}`
- `.dockerignore` исключает `static`, `node_modules`, `.env` — OK

## Исправленные баги

| Файл | Проблема | Исправление |
|------|----------|-------------|
| `frontend/src/api.ts` | Ошибки валидации FastAPI (`detail` как массив) показывались как сырой JSON | Функция `formatErrorDetail()` извлекает `msg` из элементов |
| `frontend/src/App.tsx` | Избыточное выражение `(res as { secret?: string }).secret` | Упрощено до `res.secret ?? "—"` |

## Оставшиеся вопросы для testirovschik

### Обязательные сценарии (нужен реальный Telemt API)
1. **`./install.sh`** на сервере с Docker — полный цикл установки
2. **`./install.sh --uninstall`** и **`--uninstall --purge`**
3. **Login** с верным паролем из `.env` → dashboard
4. **Dashboard** — список users из `GET /v1/users`, stats из `GET /v1/stats/summary`, автообновление 5 с
5. **Создание user** — появление в списке, однократный показ secret
6. **Удаление user** — исчезновение из списка

### Известные ограничения / edge cases
- **Telemt недоступен** → `/api/health`, `/api/users` и др. возвращают 502; UI показывает ошибку
- **Формат ответа Telemt** — backend возвращает `data` из envelope `{ok, data}`; frontend ожидает массив users — проверить на реальном API
- **`install.sh` + пароль со спецсимволами** (`|`, `&`) — `sed -i` может сломаться при обновлении `.env`
- **`network_mode: host`** — не работает на Docker Desktop (Mac/Windows); целевая платформа — Linux-сервер
- **SPA без static** — если backend запущен до `npm run build`, маршруты SPA не регистрируются; нужен рестарт после сборки
- **`npm` на хосте** — может отсутствовать; сборка через Docker (как в Dockerfile)
- **Права на `static/`** — при сборке через Docker файлы могут быть `root:root` на хосте

### Не блокирует MVP
- Редактирование конфига, rotate-secret, quota — вне scope
- PostgreSQL не используется

## Артефакты

- `docs/handoff/03-debug-done.md` — этот отчёт
- `development/static/` — собранный frontend (после отладки)
- `development/.venv/` — локальное venv для проверок

## Следующий этап

**testirovschik** — интеграционные тесты на сервере с Telemt API (`127.0.0.1:9091`), сценарии из `00-brief.md` (критерии приёмки).
