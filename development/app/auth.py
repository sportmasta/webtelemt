from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import secrets

import jwt
from jwt import PyJWTError
from pydantic import BaseModel

from app.config import Settings, get_settings

security = HTTPBearer(auto_error=False)


class TokenPayload(BaseModel):
    sub: str
    exp: int


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    token: str
    username: str


class MeResponse(BaseModel):
    username: str


def create_access_token(username: str, settings: Settings) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {"sub": username, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def verify_credentials(username: str, password: str, settings: Settings) -> bool:
    if not settings.panel_admin_password:
        return False
    return secrets.compare_digest(username, settings.panel_admin_user) and secrets.compare_digest(
        password, settings.panel_admin_password
    )


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> str:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Требуется авторизация")
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
        )
        username = payload.get("sub")
        if not username:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Недействительный токен")
        return username
    except PyJWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Недействительный токен")
