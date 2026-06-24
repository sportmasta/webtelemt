from pathlib import Path
from typing import Annotated, Any

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from app.auth import (
    LoginRequest,
    LoginResponse,
    MeResponse,
    create_access_token,
    get_current_user,
    verify_credentials,
)
from app.config import Settings, get_settings
from app.telemt import TelemtClient

app = FastAPI(title="WebTelemt", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def telemt_client(settings: Annotated[Settings, Depends(get_settings)]) -> TelemtClient:
    return TelemtClient(settings)


class CreateUserBody(BaseModel):
    username: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_.-]+$")


@app.post("/api/auth/login", response_model=LoginResponse)
def login(body: LoginRequest, settings: Annotated[Settings, Depends(get_settings)]) -> LoginResponse:
    if not verify_credentials(body.username, body.password, settings):
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")
    token = create_access_token(body.username, settings)
    return LoginResponse(token=token, username=body.username)


@app.get("/api/auth/me", response_model=MeResponse)
def me(username: Annotated[str, Depends(get_current_user)]) -> MeResponse:
    return MeResponse(username=username)


@app.get("/api/health")
async def health(client: Annotated[TelemtClient, Depends(telemt_client)]) -> Any:
    return await client.get("/v1/health")


@app.get("/api/system/info")
async def system_info(
    _: Annotated[str, Depends(get_current_user)],
    client: Annotated[TelemtClient, Depends(telemt_client)],
) -> Any:
    return await client.get("/v1/system/info")


@app.get("/api/stats/summary")
async def stats_summary(
    _: Annotated[str, Depends(get_current_user)],
    client: Annotated[TelemtClient, Depends(telemt_client)],
) -> Any:
    return await client.get("/v1/stats/summary")


@app.get("/api/users")
async def list_users(
    _: Annotated[str, Depends(get_current_user)],
    client: Annotated[TelemtClient, Depends(telemt_client)],
) -> Any:
    return await client.get("/v1/users")


@app.post("/api/users", status_code=201)
async def create_user(
    body: CreateUserBody,
    settings: Annotated[Settings, Depends(get_settings)],
    _: Annotated[str, Depends(get_current_user)],
    client: Annotated[TelemtClient, Depends(telemt_client)],
) -> Any:
    return await client.post(
        "/v1/users",
        json={
            "username": body.username,
            "max_unique_ips": settings.user_max_unique_ips,
        },
    )


@app.delete("/api/users/{username}")
async def delete_user(
    username: str,
    _: Annotated[str, Depends(get_current_user)],
    client: Annotated[TelemtClient, Depends(telemt_client)],
) -> Any:
    return await client.delete(f"/v1/users/{username}")


def _mount_static(settings: Settings) -> None:
    static_dir = settings.static_dir
    if not static_dir.is_dir():
        return
    assets_dir = static_dir / "assets"
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    index_file = static_dir / "index.html"

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str) -> FileResponse:
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404)
        if index_file.is_file():
            return FileResponse(index_file)
        raise HTTPException(status_code=404, detail="Frontend не собран")


@app.on_event("startup")
def on_startup() -> None:
    _mount_static(get_settings())
