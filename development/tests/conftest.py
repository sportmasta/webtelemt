import os

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings


@pytest.fixture
def test_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PANEL_ADMIN_USER", "admin")
    monkeypatch.setenv("PANEL_ADMIN_PASSWORD", "testpass123")
    monkeypatch.setenv("JWT_SECRET", "test-jwt-secret-for-pytest")
    monkeypatch.setenv("TELEMT_API_URL", "http://127.0.0.1:9091")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def client(test_env: None) -> TestClient:
    from app.main import app

    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def auth_headers(client: TestClient) -> dict[str, str]:
    response = client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "testpass123"},
    )
    assert response.status_code == 200
    token = response.json()["token"]
    return {"Authorization": f"Bearer {token}"}
