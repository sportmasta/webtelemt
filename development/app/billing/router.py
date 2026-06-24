from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import CustomerAuth, get_current_admin, get_optional_customer
from app.billing.database import get_session
from app.billing.deps import get_billing_service as resolve_billing_service
from app.billing.schemas import (
    CreateOrderRequest,
    CreateOrderResponse,
    CredentialsResponse,
    OrderAdminResponse,
    OrderPublicResponse,
    PlanResponse,
)
from app.billing.service import BillingService
from app.config import Settings, get_settings
from app.rate_limit import check_billing_rate_limit, client_ip, record_billing_attempt

router = APIRouter(prefix="/api/billing", tags=["billing"])


def billing_service_dep(
    settings: Annotated[Settings, Depends(get_settings)],
) -> BillingService:
    return resolve_billing_service(settings)


def _order_public(order) -> OrderPublicResponse:
    credentials_available = (
        order.status == "completed" and order.credentials_viewed_at is None
    )
    return OrderPublicResponse(
        id=order.id,
        status=order.status,
        amount_kopecks=order.amount_kopecks,
        currency=order.currency,
        username_issued=order.username_issued,
        customer_email=order.customer_email,
        credentials_available=credentials_available,
        created_at=order.created_at,
        paid_at=order.paid_at,
        completed_at=order.completed_at,
    )


def _order_admin(order) -> OrderAdminResponse:
    return OrderAdminResponse(
        id=order.id,
        status=order.status,
        amount_kopecks=order.amount_kopecks,
        currency=order.currency,
        username_requested=order.username_requested,
        username_issued=order.username_issued,
        customer_email=order.customer_email,
        credentials_viewed=order.credentials_viewed_at is not None,
        created_at=order.created_at,
        paid_at=order.paid_at,
        completed_at=order.completed_at,
        error_message=order.error_message,
    )


@router.get("/plan", response_model=PlanResponse)
async def get_plan(service: Annotated[BillingService, Depends(billing_service_dep)]) -> PlanResponse:
    plan = service.plan
    return PlanResponse(
        name=str(plan["name"]),
        price_rub=int(plan["price_rub"]),
        period_days=int(plan["period_days"]),
    )


@router.post("/orders", response_model=CreateOrderResponse)
async def create_order(
    request: Request,
    body: CreateOrderRequest,
    settings: Annotated[Settings, Depends(get_settings)],
    service: Annotated[BillingService, Depends(billing_service_dep)],
    session: Annotated[AsyncSession, Depends(get_session)],
    customer: Annotated[CustomerAuth | None, Depends(get_optional_customer)] = None,
) -> CreateOrderResponse:
    if not settings.billing_enabled:
        raise HTTPException(status_code=503, detail="Оплата временно недоступна")
    ip = client_ip(request)
    check_billing_rate_limit(ip, settings)

    customer_id = None
    email = str(body.email) if body.email else None
    if customer is not None:
        customer_id = customer.id
        email = customer.email
    elif not email:
        raise HTTPException(status_code=400, detail="Укажите email")

    try:
        order, confirmation_url = await service.create_order(
            session,
            username=body.username,
            email=email,
            customer_id=customer_id,
        )
    except HTTPException:
        record_billing_attempt(ip, settings)
        raise
    return CreateOrderResponse(order_id=order.id, confirmation_url=confirmation_url)


@router.get("/orders", response_model=list[OrderAdminResponse])
async def list_orders_admin(
    _: Annotated[str, Depends(get_current_admin)],
    service: Annotated[BillingService, Depends(billing_service_dep)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[OrderAdminResponse]:
    orders = await service.list_orders_admin(session)
    return [_order_admin(order) for order in orders]


@router.get("/orders/{order_id}", response_model=OrderPublicResponse)
async def get_order(
    order_id: UUID,
    service: Annotated[BillingService, Depends(billing_service_dep)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> OrderPublicResponse:
    order = await service.get_order_public(session, order_id)
    return _order_public(order)


@router.get("/orders/{order_id}/credentials", response_model=CredentialsResponse)
async def get_credentials(
    order_id: UUID,
    service: Annotated[BillingService, Depends(billing_service_dep)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> CredentialsResponse:
    username, secret = await service.reveal_credentials(session, order_id)
    return CredentialsResponse(username=username, secret=secret)


@router.post("/webhook/yookassa")
async def yookassa_webhook(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
    service: Annotated[BillingService, Depends(billing_service_dep)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, str]:
    if not settings.billing_enabled:
        raise HTTPException(status_code=503, detail="Биллинг отключён")

    body = await request.json()
    event = body.get("event", "")
    payment_object = body.get("object") or {}
    payment_id = payment_object.get("id")
    if not payment_id:
        raise HTTPException(status_code=400, detail="Некорректное уведомление")

    await service.handle_webhook(session, event=event, payment_id=payment_id)
    return {"status": "ok"}
