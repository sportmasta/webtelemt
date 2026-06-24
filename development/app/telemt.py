from typing import Any

import httpx
from fastapi import HTTPException

from app.config import Settings


class TelemtClient:
    def __init__(self, settings: Settings):
        self._base = settings.telemt_api_url.rstrip("/")
        self._auth_header = settings.telemt_auth_header

    def _headers(self) -> dict[str, str]:
        if self._auth_header:
            return {"Authorization": self._auth_header}
        return {}

    async def request(self, method: str, path: str, **kwargs: Any) -> Any:
        url = f"{self._base}{path}"
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.request(method, url, headers=self._headers(), **kwargs)
        except httpx.RequestError as exc:
            raise HTTPException(status_code=502, detail=f"Telemt API недоступен: {exc}") from exc

        if response.status_code >= 400:
            detail = "Ошибка Telemt API"
            try:
                body = response.json()
                if not body.get("ok") and body.get("error"):
                    detail = body["error"].get("message", detail)
            except Exception:
                detail = response.text or detail
            raise HTTPException(status_code=response.status_code, detail=detail)

        body = response.json()
        if not body.get("ok"):
            error = body.get("error", {})
            raise HTTPException(
                status_code=response.status_code,
                detail=error.get("message", "Ошибка Telemt API"),
            )
        return body.get("data")

    async def get(self, path: str) -> Any:
        return await self.request("GET", path)

    async def post(self, path: str, json: dict | None = None) -> Any:
        return await self.request("POST", path, json=json or {})

    async def delete(self, path: str) -> Any:
        return await self.request("DELETE", path)
