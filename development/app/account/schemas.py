from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


def normalize_email(email: str) -> str:
    return email.strip().lower()


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    password_confirm: str = Field(min_length=8)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    token: str
    email: str


class CustomerMeResponse(BaseModel):
    id: UUID
    email: str


class CustomerOrderResponse(BaseModel):
    id: UUID
    status: str
    amount_kopecks: int
    currency: str
    username_issued: str | None
    created_at: datetime
    paid_at: datetime | None
    completed_at: datetime | None


class CustomerProfileResponse(BaseModel):
    order_id: UUID
    username: str
    order_status: str
    completed_at: datetime | None
    credentials_viewed: bool
    telemt: dict | None = None
