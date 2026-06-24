import time
from collections import defaultdict
from threading import Lock

from fastapi import HTTPException, Request, status

from app.config import Settings

_attempts: dict[str, list[float]] = defaultdict(list)
_lock = Lock()


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


def check_login_rate_limit(ip: str, settings: Settings) -> None:
    now = time.time()
    window = settings.login_rate_window_seconds
    limit = settings.login_rate_limit

    with _lock:
        recent = [t for t in _attempts[ip] if now - t < window]
        _attempts[ip] = recent
        if len(recent) >= limit:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Слишком много попыток входа. Повторите позже.",
            )


def record_failed_login(ip: str, settings: Settings) -> None:
    now = time.time()
    window = settings.login_rate_window_seconds

    with _lock:
        recent = [t for t in _attempts[ip] if now - t < window]
        recent.append(now)
        _attempts[ip] = recent


def clear_login_attempts(ip: str) -> None:
    with _lock:
        _attempts.pop(ip, None)
