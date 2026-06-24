from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.account.schemas import (
    CustomerMeResponse,
    CustomerOrderResponse,
    CustomerProfileResponse,
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    normalize_email,
)
from app.account.service import AccountService
from app.auth import CustomerAuth, create_customer_token, get_current_customer
from app.billing.database import get_session
from app.config import Settings, get_settings
from app.rate_limit import check_login_rate_limit, clear_login_attempts, client_ip, record_failed_login
from app.telemt import TelemtClient

router = APIRouter(prefix="/api/account", tags=["account"])


def telemt_client(settings: Annotated[Settings, Depends(get_settings)]) -> TelemtClient:
    return TelemtClient(settings)


def account_service() -> AccountService:
    return AccountService()


@router.post("/register", response_model=TokenResponse)
async def register(
    request: Request,
    body: RegisterRequest,
    settings: Annotated[Settings, Depends(get_settings)],
    session: Annotated[AsyncSession, Depends(get_session)],
    service: Annotated[AccountService, Depends(account_service)],
) -> TokenResponse:
    if body.password != body.password_confirm:
        raise HTTPException(status_code=400, detail="Пароли не совпадают")
    ip = client_ip(request)
    check_login_rate_limit(ip, settings)
    try:
        customer = await service.register(
            session,
            email=str(body.email),
            password=body.password,
        )
    except HTTPException as exc:
        if exc.status_code == status.HTTP_409_CONFLICT:
            record_failed_login(ip, settings)
        raise
    clear_login_attempts(ip)
    token = create_customer_token(customer.id, customer.email, settings)
    return TokenResponse(token=token, email=customer.email)


@router.post("/login", response_model=TokenResponse)
async def login(
    request: Request,
    body: LoginRequest,
    settings: Annotated[Settings, Depends(get_settings)],
    session: Annotated[AsyncSession, Depends(get_session)],
    service: Annotated[AccountService, Depends(account_service)],
) -> TokenResponse:
    ip = client_ip(request)
    check_login_rate_limit(ip, settings)
    try:
        customer = await service.login(
            session,
            email=str(body.email),
            password=body.password,
        )
    except HTTPException:
        record_failed_login(ip, settings)
        raise
    clear_login_attempts(ip)
    token = create_customer_token(customer.id, customer.email, settings)
    return TokenResponse(token=token, email=customer.email)


@router.get("/me", response_model=CustomerMeResponse)
async def me(customer: Annotated[CustomerAuth, Depends(get_current_customer)]) -> CustomerMeResponse:
    return CustomerMeResponse(id=customer.id, email=customer.email)


@router.get("/orders", response_model=list[CustomerOrderResponse])
async def orders(
    customer: Annotated[CustomerAuth, Depends(get_current_customer)],
    session: Annotated[AsyncSession, Depends(get_session)],
    service: Annotated[AccountService, Depends(account_service)],
) -> list[CustomerOrderResponse]:
    rows = await service.list_orders(session, customer.id)
    return [
        CustomerOrderResponse(
            id=order.id,
            status=order.status,
            amount_kopecks=order.amount_kopecks,
            currency=order.currency,
            username_issued=order.username_issued,
            created_at=order.created_at,
            paid_at=order.paid_at,
            completed_at=order.completed_at,
        )
        for order in rows
    ]


@router.get("/profiles", response_model=list[CustomerProfileResponse])
async def profiles(
    customer: Annotated[CustomerAuth, Depends(get_current_customer)],
    session: Annotated[AsyncSession, Depends(get_session)],
    service: Annotated[AccountService, Depends(account_service)],
    telemt: Annotated[TelemtClient, Depends(telemt_client)],
) -> list[CustomerProfileResponse]:
    rows = await service.list_profiles(session, customer.id, telemt)
    return [
        CustomerProfileResponse(
            order_id=order.id,
            username=order.username_issued or "",
            order_status=order.status,
            completed_at=order.completed_at,
            credentials_viewed=order.credentials_viewed_at is not None,
            telemt=telemt_data,
        )
        for order, telemt_data in rows
    ]
