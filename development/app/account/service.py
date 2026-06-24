import uuid

from fastapi import HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.account.passwords import hash_password, verify_password
from app.account.schemas import normalize_email
from app.billing.models import Customer, Order, OrderStatus
from app.telemt import TelemtClient


class AccountService:
    async def register(
        self,
        session: AsyncSession,
        *,
        email: str,
        password: str,
    ) -> Customer:
        normalized = normalize_email(email)
        existing = await session.execute(
            select(Customer).where(func.lower(Customer.email) == normalized)
        )
        if existing.scalar_one_or_none() is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email уже зарегистрирован")

        customer = Customer(
            id=uuid.uuid4(),
            email=normalized,
            password_hash=hash_password(password),
        )
        session.add(customer)
        await session.flush()
        await self.link_orders_by_email(session, customer.id, normalized)
        await session.commit()
        await session.refresh(customer)
        return customer

    async def login(
        self,
        session: AsyncSession,
        *,
        email: str,
        password: str,
    ) -> Customer:
        normalized = normalize_email(email)
        result = await session.execute(
            select(Customer).where(func.lower(Customer.email) == normalized)
        )
        customer = result.scalar_one_or_none()
        if customer is None or not verify_password(password, customer.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Неверный email или пароль",
            )
        await self.link_orders_by_email(session, customer.id, normalized)
        await session.commit()
        return customer

    async def link_orders_by_email(
        self,
        session: AsyncSession,
        customer_id: uuid.UUID,
        email: str,
    ) -> None:
        normalized = normalize_email(email)
        await session.execute(
            update(Order)
            .where(
                Order.customer_id.is_(None),
                func.lower(Order.customer_email) == normalized,
            )
            .values(customer_id=customer_id)
        )

    async def list_orders(self, session: AsyncSession, customer_id: uuid.UUID) -> list[Order]:
        result = await session.execute(
            select(Order)
            .where(Order.customer_id == customer_id)
            .order_by(Order.created_at.desc())
        )
        return list(result.scalars().all())

    async def list_profiles(
        self,
        session: AsyncSession,
        customer_id: uuid.UUID,
        telemt: TelemtClient,
    ) -> list[tuple[Order, dict | None]]:
        result = await session.execute(
            select(Order)
            .where(
                Order.customer_id == customer_id,
                Order.status == OrderStatus.completed.value,
                Order.username_issued.is_not(None),
            )
            .order_by(Order.completed_at.desc())
        )
        orders = list(result.scalars().all())
        profiles: list[tuple[Order, dict | None]] = []
        for order in orders:
            username = order.username_issued or ""
            telemt_data = None
            try:
                telemt_data = await telemt.get(f"/v1/users/{username}")
            except HTTPException:
                telemt_data = None
            profiles.append((order, telemt_data))
        return profiles
