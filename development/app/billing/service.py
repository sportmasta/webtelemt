import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.billing.crypto import SecretCipher
from app.billing.models import Order, OrderSecret, OrderStatus
from app.billing.yookassa import YooKassaClientProtocol
from app.config import Settings
from app.telemt import TelemtClient


def generate_username() -> str:
    return f"user_{secrets.token_hex(4)}"


class BillingService:
    def __init__(
        self,
        settings: Settings,
        yookassa: YooKassaClientProtocol,
        telemt: TelemtClient,
        cipher: SecretCipher,
    ):
        self._settings = settings
        self._yookassa = yookassa
        self._telemt = telemt
        self._cipher = cipher

    @property
    def plan(self) -> dict[str, int | str]:
        return {
            "name": self._settings.billing_plan_name,
            "price_rub": self._settings.billing_plan_price_rub,
            "period_days": self._settings.billing_plan_period_days,
        }

    def _amount_kopecks(self) -> int:
        return self._settings.billing_plan_price_rub * 100

    def _return_url_for_order(self, order_id: uuid.UUID) -> str:
        base = self._settings.yookassa_return_url.rstrip("/")
        return f"{base}/buy/success?order_id={order_id}"

    async def _expire_if_needed(self, session: AsyncSession, order: Order) -> None:
        if order.status != OrderStatus.pending.value:
            return
        ttl = timedelta(minutes=self._settings.billing_order_ttl_minutes)
        created = order.created_at
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) - created > ttl:
            order.status = OrderStatus.expired.value
            await session.commit()

    async def create_order(
        self,
        session: AsyncSession,
        *,
        username: str | None,
        email: str | None,
        customer_id: uuid.UUID | None = None,
    ) -> tuple[Order, str]:
        order_id = uuid.uuid4()
        username_requested = username.strip() if username else None
        normalized_email = email.strip().lower() if email else None
        order = Order(
            id=order_id,
            status=OrderStatus.pending.value,
            amount_kopecks=self._amount_kopecks(),
            currency="RUB",
            username_requested=username_requested,
            customer_email=normalized_email,
            customer_id=customer_id,
        )
        session.add(order)
        await session.flush()

        payment = await self._yookassa.create_payment(
            amount_kopecks=order.amount_kopecks,
            description=f"{self._settings.billing_plan_name} — WebTelemt",
            return_url=self._return_url_for_order(order_id),
            metadata={"order_id": str(order_id)},
            idempotence_key=str(order_id),
        )
        order.yookassa_payment_id = payment["id"]
        await session.commit()
        await session.refresh(order)

        confirmation = payment.get("confirmation") or {}
        confirmation_url = confirmation.get("confirmation_url")
        if not confirmation_url:
            raise HTTPException(status_code=502, detail="ЮKassa не вернула ссылку на оплату")
        return order, confirmation_url

    async def get_order_public(self, session: AsyncSession, order_id: uuid.UUID) -> Order:
        order = await self._load_order(session, order_id)
        await self._expire_if_needed(session, order)
        await session.refresh(order)
        return order

    async def list_orders_admin(self, session: AsyncSession) -> list[Order]:
        result = await session.execute(select(Order).order_by(Order.created_at.desc()))
        return list(result.scalars().all())

    async def reveal_credentials(self, session: AsyncSession, order_id: uuid.UUID) -> tuple[str, str]:
        order = await self._load_order(session, order_id, with_secret=True, for_update=True)
        if order.status != OrderStatus.completed.value:
            raise HTTPException(status_code=404, detail="Заказ не завершён")
        if order.credentials_viewed_at is not None:
            raise HTTPException(status_code=410, detail="Учётные данные уже были показаны")
        if order.secret is None:
            raise HTTPException(status_code=410, detail="Учётные данные недоступны")

        secret = self._cipher.decrypt(order.secret.secret_encrypted)
        username = order.username_issued or ""
        order.credentials_viewed_at = datetime.now(timezone.utc)
        await session.delete(order.secret)
        await session.commit()
        return username, secret

    async def handle_webhook(
        self,
        session: AsyncSession,
        *,
        event: str,
        payment_id: str,
    ) -> None:
        if event != "payment.succeeded":
            return

        payment = await self._yookassa.get_payment(payment_id)
        if payment.get("status") != "succeeded":
            raise HTTPException(status_code=400, detail="Платёж не подтверждён")

        metadata = payment.get("metadata") or {}
        order_id_str = metadata.get("order_id")
        if not order_id_str:
            raise HTTPException(status_code=400, detail="order_id отсутствует в metadata")

        order_id = uuid.UUID(order_id_str)
        order = await self._load_order(session, order_id, with_secret=True, for_update=True)

        if order.status == OrderStatus.completed.value:
            await session.commit()
            return

        amount = payment.get("amount") or {}
        expected = f"{order.amount_kopecks / 100:.2f}"
        if amount.get("value") != expected or amount.get("currency") != order.currency:
            raise HTTPException(status_code=400, detail="Сумма платежа не совпадает")

        now = datetime.now(timezone.utc)
        if order.status == OrderStatus.pending.value:
            order.status = OrderStatus.paid.value
            order.paid_at = now
            order.yookassa_payment_id = payment_id
            await session.commit()
            await session.refresh(order)

        username = order.username_requested or generate_username()
        try:
            data = await self._telemt.post(
                "/v1/users",
                json={"username": username, "max_unique_ips": self._settings.user_max_unique_ips},
            )
        except HTTPException as exc:
            order.status = OrderStatus.failed.value
            order.error_message = str(exc.detail)
            await session.commit()
            return

        issued_username = username
        if isinstance(data, dict):
            user_obj = data.get("user") or {}
            issued_username = user_obj.get("username") or data.get("username") or username
            secret = data.get("secret")
        else:
            secret = None

        if not secret:
            order.status = OrderStatus.failed.value
            order.error_message = "Telemt не вернул secret"
            await session.commit()
            return

        order.username_issued = issued_username
        order.status = OrderStatus.completed.value
        order.completed_at = datetime.now(timezone.utc)

        if order.secret is not None:
            await session.delete(order.secret)
        session.add(
            OrderSecret(
                order_id=order.id,
                secret_encrypted=self._cipher.encrypt(secret),
            )
        )
        await session.commit()

    async def _load_order(
        self,
        session: AsyncSession,
        order_id: uuid.UUID,
        *,
        with_secret: bool = False,
        for_update: bool = False,
    ) -> Order:
        query = select(Order).where(Order.id == order_id)
        if with_secret:
            query = query.options(selectinload(Order.secret))
        if for_update:
            query = query.with_for_update()
        result = await session.execute(query)
        order = result.scalar_one_or_none()
        if order is None:
            raise HTTPException(status_code=404, detail="Заказ не найден")
        return order
