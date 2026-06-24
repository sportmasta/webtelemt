from datetime import datetime, timedelta, timezone
from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import secrets

import jwt
from jwt import PyJWTError
from pydantic import BaseModel

from app.config import Settings, get_settings

security = HTTPBearer(auto_error=False)

ROLE_ADMIN = "admin"
ROLE_CUSTOMER = "customer"


class TokenPayload(BaseModel):
    sub: str
    exp: int
    role: str | None = None
    email: str | None = None


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    token: str
    username: str


class MeResponse(BaseModel):
    username: str


class CustomerAuth(BaseModel):
    id: UUID
    email: str


def _decode_token(credentials: HTTPAuthorizationCredentials, settings: Settings) -> dict:
    try:
        return jwt.decode(
            credentials.credentials,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
        )
    except PyJWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Недействительный токен")


def create_access_token(username: str, settings: Settings) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {"sub": username, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_customer_token(customer_id: UUID, email: str, settings: Settings) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {
        "sub": str(customer_id),
        "role": ROLE_CUSTOMER,
        "email": email,
        "exp": expire,
    }
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
    return get_current_admin(credentials, settings)


def get_current_admin(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> str:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Требуется авторизация")
    payload = _decode_token(credentials, settings)
    role = payload.get("role")
    if role == ROLE_CUSTOMER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")
    if role is not None and role != ROLE_ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")
    username = payload.get("sub")
    if not username:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Недействительный токен")
    return username


def get_current_customer(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> CustomerAuth:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Требуется авторизация")
    payload = _decode_token(credentials, settings)
    if payload.get("role") != ROLE_CUSTOMER:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Требуется авторизация покупателя")
    sub = payload.get("sub")
    email = payload.get("email")
    if not sub or not email:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Недействительный токен")
    try:
        customer_id = UUID(sub)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Недействительный токен")
    return CustomerAuth(id=customer_id, email=email)


def get_optional_customer(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> CustomerAuth | None:
    if credentials is None:
        return None
    payload = _decode_token(credentials, settings)
    if payload.get("role") != ROLE_CUSTOMER:
        return None
    sub = payload.get("sub")
    email = payload.get("email")
    if not sub or not email:
        return None
    try:
        customer_id = UUID(sub)
    except ValueError:
        return None
    return CustomerAuth(id=customer_id, email=email)
