from typing import Any, Protocol
from uuid import UUID

import httpx
from fastapi import HTTPException


class YooKassaClientProtocol(Protocol):
    async def create_payment(
        self,
        *,
        amount_kopecks: int,
        description: str,
        return_url: str,
        metadata: dict[str, str],
        idempotence_key: str,
    ) -> dict[str, Any]: ...

    async def get_payment(self, payment_id: str) -> dict[str, Any]: ...


class YooKassaClient:
    def __init__(self, shop_id: str, secret_key: str):
        self._auth = httpx.BasicAuth(shop_id, secret_key)
        self._base = "https://api.yookassa.ru/v3"

    async def create_payment(
        self,
        *,
        amount_kopecks: int,
        description: str,
        return_url: str,
        metadata: dict[str, str],
        idempotence_key: str,
    ) -> dict[str, Any]:
        rubles = f"{amount_kopecks / 100:.2f}"
        payload = {
            "amount": {"value": rubles, "currency": "RUB"},
            "confirmation": {"type": "redirect", "return_url": return_url},
            "capture": True,
            "description": description,
            "metadata": metadata,
        }
        return await self._request(
            "POST",
            "/payments",
            json=payload,
            headers={"Idempotence-Key": idempotence_key},
        )

    async def get_payment(self, payment_id: str) -> dict[str, Any]:
        return await self._request("GET", f"/payments/{payment_id}")

    async def _request(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        url = f"{self._base}{path}"
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.request(method, url, auth=self._auth, **kwargs)
        except httpx.RequestError as exc:
            raise HTTPException(status_code=502, detail="ЮKassa недоступна") from exc

        if response.status_code >= 400:
            raise HTTPException(status_code=502, detail="Ошибка ЮKassa")

        return response.json()


class MockYooKassaClient:
    def __init__(self) -> None:
        self.payments: dict[str, dict[str, Any]] = {}
        self.confirmation_urls: dict[str, str] = {}

    async def create_payment(
        self,
        *,
        amount_kopecks: int,
        description: str,
        return_url: str,
        metadata: dict[str, str],
        idempotence_key: str,
    ) -> dict[str, Any]:
        payment_id = f"mock-{idempotence_key[:8]}"
        order_id = metadata.get("order_id", "")
        confirmation_url = f"https://yookassa.test/pay/{payment_id}?return={return_url}"
        payment = {
            "id": payment_id,
            "status": "pending",
            "amount": {"value": f"{amount_kopecks / 100:.2f}", "currency": "RUB"},
            "metadata": metadata,
            "confirmation": {"type": "redirect", "confirmation_url": confirmation_url},
        }
        self.payments[payment_id] = payment
        self.confirmation_urls[payment_id] = confirmation_url
        return payment

    async def get_payment(self, payment_id: str) -> dict[str, Any]:
        payment = self.payments.get(payment_id)
        if payment is None:
            raise HTTPException(status_code=404, detail="Платёж не найден")
        return payment

    def mark_succeeded(self, payment_id: str) -> None:
        if payment_id in self.payments:
            self.payments[payment_id]["status"] = "succeeded"

    def build_webhook_payload(self, payment_id: str) -> dict[str, Any]:
        payment = self.payments[payment_id]
        return {
            "type": "notification",
            "event": "payment.succeeded",
            "object": payment,
        }
