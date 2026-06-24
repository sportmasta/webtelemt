#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEV_DIR="${SCRIPT_DIR}/development"
ENV_FILE="${DEV_DIR}/.env"
COMPOSE_FILE="${DEV_DIR}/docker-compose.yml"

PURGE_ENV=0
PURGE_POSTGRES=0
UNINSTALL=0
PANEL_PORT="${PANEL_PORT:-8080}"
PANEL_ADMIN_USER="${PANEL_ADMIN_USER:-admin}"
PANEL_ADMIN_PASSWORD=""
NON_INTERACTIVE=0

usage() {
  cat <<'EOF'
WebTelemt — установка панели управления Telemt

Использование:
  ./install.sh                     Интерактивная установка
  ./install.sh --port 8080         Указать порт панели
  ./install.sh --password 'secret' Задать пароль админа
  ./install.sh --user admin        Задать логин админа
  ./install.sh --non-interactive   Без запросов (нужен --password)
  ./install.sh --uninstall         Остановить и удалить контейнеры
  ./install.sh --uninstall --purge Удалить также .env
  ./install.sh --uninstall --purge-postgres  Удалить volume PostgreSQL

Переменные окружения: PANEL_PORT, PANEL_ADMIN_USER, PANEL_ADMIN_PASSWORD
EOF
}

log() { echo "[webtelemt] $*"; }
err() { echo "[webtelemt] Ошибка: $*" >&2; exit 1; }

require_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    err "Docker не установлен. Установите Docker и повторите."
  fi
  if ! docker info >/dev/null 2>&1; then
    if [[ "${EUID:-$(id -u)}" -ne 0 ]] && ! groups 2>/dev/null | grep -q docker; then
      err "Нет доступа к Docker. Запустите от root или добавьте пользователя в группу docker."
    fi
    err "Docker daemon недоступен."
  fi
  if ! docker compose version >/dev/null 2>&1; then
    err "docker compose не найден. Установите Docker Compose plugin."
  fi
}

server_ip() {
  local ip=""
  ip="$(hostname -I 2>/dev/null | awk '{print $1}')" || true
  if [[ -z "$ip" ]]; then
    ip="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}')" || true
  fi
  if [[ -z "$ip" ]]; then
    ip="127.0.0.1"
  fi
  echo "$ip"
}

generate_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    head -c 32 /dev/urandom | xxd -p -c 64
  fi
}

generate_fernet_key() {
  if command -v python3 >/dev/null 2>&1; then
    python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
  elif command -v python >/dev/null 2>&1; then
    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
  else
    err "Для генерации BILLING_CREDENTIALS_ENCRYPTION_KEY нужен python3 с пакетом cryptography"
  fi
}

generate_postgres_password() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 16
  else
    head -c 16 /dev/urandom | xxd -p -c 32
  fi
}

prompt_password() {
  if [[ -n "$PANEL_ADMIN_PASSWORD" ]]; then
    return
  fi
  if [[ "$NON_INTERACTIVE" -eq 1 ]]; then
    err "Укажите пароль: --password или PANEL_ADMIN_PASSWORD"
  fi
  read -r -s -p "Пароль администратора панели: " PANEL_ADMIN_PASSWORD
  echo
  if [[ -z "$PANEL_ADMIN_PASSWORD" ]]; then
    err "Пароль не может быть пустым."
  fi
}

write_env() {
  local jwt_secret postgres_password fernet_key panel_ip
  jwt_secret="$(generate_secret)"
  postgres_password="$(generate_postgres_password)"
  fernet_key="$(generate_fernet_key)"
  panel_ip="$(server_ip)"
  cat >"$ENV_FILE" <<EOF
TELEMT_API_URL=http://127.0.0.1:9091
PANEL_ADMIN_USER=${PANEL_ADMIN_USER}
PANEL_ADMIN_PASSWORD=${PANEL_ADMIN_PASSWORD}
JWT_SECRET=${jwt_secret}
PANEL_PORT=${PANEL_PORT}
PANEL_ENV=production
LOGIN_RATE_LIMIT=5
LOGIN_RATE_WINDOW_SECONDS=900
USER_MAX_UNIQUE_IPS=1
POSTGRES_PASSWORD=${postgres_password}
DATABASE_URL=postgresql+asyncpg://webtelemt:${postgres_password}@127.0.0.1:5432/webtelemt
BILLING_CREDENTIALS_ENCRYPTION_KEY=${fernet_key}
BILLING_PLAN_NAME=Базовый
BILLING_PLAN_PRICE_RUB=299
BILLING_PLAN_PERIOD_DAYS=30
BILLING_ORDER_TTL_MINUTES=60
BILLING_ORDER_RATE_LIMIT=5
BILLING_ORDER_RATE_WINDOW_SECONDS=900
YOOKASSA_RETURN_URL=http://${panel_ip}:${PANEL_PORT}
YOOKASSA_SHOP_ID=
YOOKASSA_SECRET_KEY=
EOF
  chmod 600 "$ENV_FILE"
  log "Создан ${ENV_FILE}"
  log "Настройте ЮKassa: YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY в ${ENV_FILE}"
}

install_panel() {
  require_docker
  prompt_password

  if [[ -f "$ENV_FILE" ]]; then
    log "Файл .env уже существует — используется существующий."
    # Обновить порт/пароль если переданы флаги
    if [[ -n "${PANEL_ADMIN_PASSWORD}" ]]; then
      if grep -q '^PANEL_ADMIN_PASSWORD=' "$ENV_FILE"; then
        sed -i "s|^PANEL_ADMIN_PASSWORD=.*|PANEL_ADMIN_PASSWORD=${PANEL_ADMIN_PASSWORD}|" "$ENV_FILE"
      else
        echo "PANEL_ADMIN_PASSWORD=${PANEL_ADMIN_PASSWORD}" >>"$ENV_FILE"
      fi
    fi
    if grep -q '^PANEL_PORT=' "$ENV_FILE"; then
      sed -i "s|^PANEL_PORT=.*|PANEL_PORT=${PANEL_PORT}|" "$ENV_FILE"
    else
      echo "PANEL_PORT=${PANEL_PORT}" >>"$ENV_FILE"
    fi
  else
    write_env
  fi

  log "Сборка образа…"
  docker compose -f "$COMPOSE_FILE" --project-directory "$DEV_DIR" build

  log "Запуск контейнера…"
  docker compose -f "$COMPOSE_FILE" --project-directory "$DEV_DIR" up -d

  local ip port
  ip="$(server_ip)"
  # shellcheck disable=SC1090
  port="$(grep -E '^PANEL_PORT=' "$ENV_FILE" | cut -d= -f2-)"
  port="${port:-8080}"

  echo
  log "Панель установлена и запущена."
  echo "  URL:  http://${ip}:${port}"
  echo "  Логин: ${PANEL_ADMIN_USER}"
  echo "  Покупка: http://${ip}:${port}/buy"
  echo "  ЮKassa: укажите YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY в ${ENV_FILE}"
  echo "  Логи: docker compose -f ${COMPOSE_FILE} --project-directory ${DEV_DIR} logs -f"
}

uninstall_panel() {
  require_docker
  if [[ -f "$COMPOSE_FILE" ]]; then
    log "Остановка контейнеров…"
    if [[ "$PURGE_POSTGRES" -eq 1 ]]; then
      docker compose -f "$COMPOSE_FILE" --project-directory "$DEV_DIR" down --rmi local -v 2>/dev/null || \
        docker compose -f "$COMPOSE_FILE" --project-directory "$DEV_DIR" down -v 2>/dev/null || \
        docker compose -f "$COMPOSE_FILE" --project-directory "$DEV_DIR" down
    else
      docker compose -f "$COMPOSE_FILE" --project-directory "$DEV_DIR" down --rmi local 2>/dev/null || \
        docker compose -f "$COMPOSE_FILE" --project-directory "$DEV_DIR" down
    fi
  fi
  if [[ "$PURGE_ENV" -eq 1 && -f "$ENV_FILE" ]]; then
    rm -f "$ENV_FILE"
    log "Удалён ${ENV_FILE}"
  fi
  log "Панель удалена."
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --uninstall)
      UNINSTALL=1
      shift
      ;;
    --purge)
      PURGE_ENV=1
      shift
      ;;
    --purge-postgres)
      PURGE_POSTGRES=1
      shift
      ;;
    --port)
      PANEL_PORT="${2:?}"
      shift 2
      ;;
    --password)
      PANEL_ADMIN_PASSWORD="${2:?}"
      shift 2
      ;;
    --user)
      PANEL_ADMIN_USER="${2:?}"
      shift 2
      ;;
    --non-interactive)
      NON_INTERACTIVE=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      err "Неизвестный аргумент: $1 (используйте --help)"
      ;;
  esac
done

if [[ "$UNINSTALL" -eq 1 ]]; then
  uninstall_panel
else
  install_panel
fi
