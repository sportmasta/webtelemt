import importlib
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.telemt import TelemtClient


def test_docs_disabled_in_production(client: TestClient) -> None:
    assert client.get("/docs").status_code == 404
    assert client.get("/openapi.json").status_code == 404
    assert client.get("/redoc").status_code == 404


def test_security_headers_present(client: TestClient) -> None:
    # Use API route: static SPA is not built in pytest env (GET / → 404).
    response = client.get("/api/auth/me")
    assert response.status_code == 401
    assert response.headers.get("X-Frame-Options") == "DENY"
    assert response.headers.get("X-Content-Type-Options") == "nosniff"
    assert "Content-Security-Policy" in response.headers


def test_delete_invalid_username_returns_422(client: TestClient, auth_headers: dict[str, str]) -> None:
    response = client.delete("/api/users/invalid@user", headers=auth_headers)
    assert response.status_code == 422


async def _mock_delete(self: TelemtClient, method: str, path: str, **kwargs):
    if method == "DELETE" and path == "/v1/users/bob":
        return {"username": "bob", "in_runtime": False}
    raise AssertionError(f"Unexpected: {method} {path}")


def test_delete_valid_username(client: TestClient, auth_headers: dict[str, str]) -> None:
    with patch.object(TelemtClient, "request", _mock_delete):
        response = client.delete("/api/users/bob", headers=auth_headers)
    assert response.status_code == 200


def test_login_rate_limit(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LOGIN_RATE_LIMIT", "3")
    monkeypatch.setenv("LOGIN_RATE_WINDOW_SECONDS", "900")
    monkeypatch.setenv("JWT_SECRET", "test-jwt-secret-for-pytest-only-32chars!")
    monkeypatch.setenv("PANEL_ADMIN_PASSWORD", "testpass123")
    monkeypatch.setenv("PANEL_ENV", "production")
    from app.config import get_settings

    get_settings.cache_clear()
    import app.main as main_module
    import app.rate_limit as rate_limit

    rate_limit._attempts.clear()
    importlib.reload(main_module)

    with TestClient(main_module.create_app()) as client:
        for _ in range(3):
            response = client.post(
                "/api/auth/login",
                json={"username": "admin", "password": "wrong"},
            )
            assert response.status_code == 401
        blocked = client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "wrong"},
        )
        assert blocked.status_code == 429

    get_settings.cache_clear()


def test_weak_jwt_secret_blocks_startup(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PANEL_ENV", "production")
    monkeypatch.setenv("JWT_SECRET", "change-me-in-production")
    monkeypatch.setenv("PANEL_ADMIN_PASSWORD", "testpass123")
    from app.config import get_settings

    get_settings.cache_clear()
    import app.main as main_module

    importlib.reload(main_module)
    with pytest.raises(RuntimeError, match="JWT_SECRET"):
        with TestClient(main_module.create_app()) as _:
            pass
    get_settings.cache_clear()
