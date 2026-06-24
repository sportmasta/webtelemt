from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class PlanResponse(BaseModel):
    name: str
    price_rub: int
    period_days: int


class CreateOrderRequest(BaseModel):
    username: str | None = Field(default=None, max_length=64, pattern=r"^[A-Za-z0-9_.-]+$")
    email: EmailStr | None = None


class CreateOrderResponse(BaseModel):
    order_id: UUID
    confirmation_url: str


class OrderPublicResponse(BaseModel):
    id: UUID
    status: str
    amount_kopecks: int
    currency: str
    username_issued: str | None
    customer_email: str | None = None
    credentials_available: bool
    created_at: datetime
    paid_at: datetime | None
    completed_at: datetime | None


class CredentialsResponse(BaseModel):
    username: str
    secret: str


class OrderAdminResponse(BaseModel):
    id: UUID
    status: str
    amount_kopecks: int
    currency: str
    username_requested: str | None
    username_issued: str | None
    customer_email: str | None
    credentials_viewed: bool
    created_at: datetime
    paid_at: datetime | None
    completed_at: datetime | None
    error_message: str | None
