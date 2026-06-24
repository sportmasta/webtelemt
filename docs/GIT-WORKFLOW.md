# Git: от нуля до обновления на сервере

Инструкция для проекта **WebTelemt**.  
Репозиторий: https://github.com/sportmasta/webtelemt

---

## Полная схема

```
[1] GitHub     — создаёте пустой репозиторий (кода ещё нет)
       ↓
[2] Локально   — пишете код → git init → привязка remote → первый push
       ↓
[3] Сервер     — git clone → install.sh (первая установка)
       ↓
[4] Цикл       — правки локально → push → pull на сервере → пересборка Docker
```

**Важно:** `git pull` на сервере обновляет только **файлы на диске**.  
Панель в **Docker** — без `install.sh` / `docker compose build` новый код не заработает.

---

## Часть 1. GitHub — пустой репозиторий

1. Зайти на https://github.com/new
2. Имя: `webtelemt` (пример: `sportmasta/webtelemt`)
3. **Не** добавлять README, .gitignore, license через веб-интерфейс — или добавить только LICENSE, как было у нас
4. Создать репозиторий

На GitHub пока только заготовка (у нас был один файл `LICENSE`). **Кода проекта там нет.**

Скопировать URL:

- SSH: `git@github.com:sportmasta/webtelemt.git`
- HTTPS: `https://github.com/sportmasta/webtelemt.git`

---

## Часть 2. Локально — первый раз подключить код к репозиторию

У вас на диске уже есть папка с проектом (написали код, Cursor, копия файлов — не важно).  
Git в ней **ещё не настроен** или настроен без remote.

### 2.1. Перейти в корень проекта

Корень — где лежат `install.sh`, `README.md`, `development/`:

```bash
cd "/path/to/webtelemt"
ls
# install.sh  README.md  development/  docs/
```

### 2.2. Инициализировать git и ветку

```bash
git init -b main
```

### 2.3. Привязать удалённый репозиторий

```bash
git remote add origin git@github.com:sportmasta/webtelemt.git
git remote -v
```

### 2.4. Проверить .gitignore

В корне должен быть `.gitignore` — чтобы не залить секреты и мусор:

- `development/.env` — пароли
- `node_modules/`, `.venv/`, `development/static/`

```bash
cat .gitignore
```

### 2.5. Первый коммит

```bash
git status          # список файлов; .env быть не должно
git add .
git commit -m "Initial commit: WebTelemt panel MVP"
```

### 2.6. Первый push (если на GitHub уже что-то есть — LICENSE)

Если репозиторий на GitHub **не совсем пустой** (например, только `LICENSE`):

```bash
git pull origin main --allow-unrelated-histories --no-rebase --no-edit
git push -u origin main
```

Если репозиторий **полностью пустой**:

```bash
git push -u origin main
```

### 2.7. Проверка

```bash
git status    # up to date with 'origin/main'
git log --oneline -3
```

Открыть https://github.com/sportmasta/webtelemt — должны быть `install.sh`, `development/`, `README.md` и т.д.

**После этого части 2 повторять не нужно.** Дальше — только цикл из части 3 и 4.

---

## Часть 3. Локально — обычные правки (каждая фича)

```bash
cd /path/to/webtelemt

git pull origin main              # если работаете с нескольких машин
# ... правите код ...

git status
git diff                          # посмотреть изменения

git add .
git commit -m "Add connection link and QR code in user row"
git push origin main
```

Проверка: новый коммит на https://github.com/sportmasta/webtelemt/commits/main

**Не забыть `git push`.** Пока не push — на сервере `git pull` ничего нового не даст.

---

## Часть 4. Сервер — первая установка (код уже на GitHub)

На сервере репозитория **ещё нет** — только клонируем:

```bash
ssh user@46.22.213.86

cd /opt
git clone git@github.com:sportmasta/webtelemt.git
cd webtelemt

chmod +x install.sh
./install.sh
# или: ./install.sh --password 'secret' --port 8080 --non-interactive
```

Панель: `http://46.22.213.86:8080` (именно **http**, не https).

Если `git clone` от root, а потом работаете от другого пользователя — см. «dubious ownership» ниже.

---

## Часть 5. Сервер — обновление после правок

Когда на GitHub уже новый коммит (сделали push с локальной машины):

```bash
ssh user@46.22.213.86
cd /opt/webtelemt/webtelemt

git pull origin main
git log -1 --oneline              # тот же коммит, что на GitHub

./install.sh --non-interactive --password 'ваш-пароль'
```

Или только пересборка Docker (если `.env` не трогаем):

```bash
cd development
docker compose build --no-cache
docker compose up -d --force-recreate
```

Проверка:

```bash
docker compose ps
docker compose logs --tail 20
```

---

## Типичные ошибки

### `fatal: detected dubious ownership`

Клонировали от `root`, `git pull` делаете от обычного пользователя.

```bash
sudo chown -R $USER:$USER /opt/webtelemt/webtelemt
# или:
git config --global --add safe.directory /opt/webtelemt/webtelemt
```

Затем **снова** `git pull origin main`.

---

### `Already up to date`, но на GitHub код новее

Забыли `git push` на dev-машине:

```bash
git log origin/main..HEAD --oneline
git push origin main
```

---

### `git pull` прошёл, панель старая

Не пересобрали Docker:

```bash
cd /opt/webtelemt/webtelemt/development
docker compose build && docker compose up -d --force-recreate
```

---

### `error: remote origin already exists`

Remote уже добавлен:

```bash
git remote -v
git remote set-url origin git@github.com:sportmasta/webtelemt.git
```

---

## Шпаргалка

| Этап | Где | Команды |
|------|-----|---------|
| Пустой repo | GitHub | Создать через веб |
| Первый раз | Локально | `init` → `remote add` → `add` → `commit` → `push` |
| Фича | Локально | правки → `add` → `commit` → **`push`** |
| Первая установка | Сервер | `git clone` → `./install.sh` |
| Обновление | Сервер | `git pull` → `./install.sh` или `docker compose build` |

---

## Чеклист

**Первый выклад (один раз):**

- [ ] Репозиторий создан на GitHub
- [ ] Локально: `git init`, `remote add`, первый `commit`, `push`
- [ ] Код виден на GitHub
- [ ] Сервер: `git clone`, `./install.sh`
- [ ] Панель открывается в браузере

**Каждое обновление:**

- [ ] Локально: `commit` + **`push`**
- [ ] Сервер: `git pull`
- [ ] Сервер: пересборка Docker
- [ ] Проверка в браузере

---

## Данные проекта WebTelemt

```text
GitHub   https://github.com/sportmasta/webtelemt
Remote   git@github.com:sportmasta/webtelemt.git
Ветка    main
Сервер   /opt/webtelemt/webtelemt  (пример)
Панель   http://46.22.213.86:8080
```
