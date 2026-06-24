from unittest.mock import patch

from fastapi.testclient import TestClient

from app.telemt import TelemtClient


def test_login_wrong_password(client: TestClient) -> None:
    response = client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "wrong"},
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Неверный логин или пароль"


def test_login_correct_returns_token(client: TestClient) -> None:
    response = client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "testpass123"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "token" in data
    assert isinstance(data["token"], str)
    assert len(data["token"]) > 0
    assert data["username"] == "admin"


def test_protected_endpoint_without_token(client: TestClient) -> None:
    response = client.get("/api/auth/me")
    assert response.status_code == 401
    assert response.json()["detail"] == "Требуется авторизация"


def test_users_without_token(client: TestClient) -> None:
    response = client.get("/api/users")
    assert response.status_code == 401
    assert response.json()["detail"] == "Требуется авторизация"


async def _mock_users_request(self: TelemtClient, method: str, path: str, **kwargs):
    if method == "GET" and path == "/v1/users":
        return [
            {
                "username": "alice",
                "enabled": True,
                "current_connections": 2,
                "active_unique_ips_list": ["10.0.0.1"],
            }
        ]
    raise AssertionError(f"Unexpected Telemt call: {method} {path}")


def test_users_with_token_returns_mocked_data(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    with patch.object(TelemtClient, "request", _mock_users_request):
        response = client.get("/api/users", headers=auth_headers)
    assert response.status_code == 200
    users = response.json()
    assert isinstance(users, list)
    assert len(users) == 1
    assert users[0]["username"] == "alice"
    assert users[0]["current_connections"] == 2
