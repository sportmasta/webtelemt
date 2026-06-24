from unittest.mock import patch

from fastapi.testclient import TestClient

from app.telemt import TelemtClient


def _register(billing_client: TestClient, email: str = "buyer@example.com", password: str = "secretpass") -> str:
    response = billing_client.post(
        "/api/account/register",
        json={"email": email, "password": password, "password_confirm": password},
    )
    assert response.status_code == 200
    return response.json()["token"]


def test_register_and_login(billing_client: TestClient) -> None:
    token = _register(billing_client)
    assert token

    me = billing_client.get(
        "/api/account/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert me.status_code == 200
    assert me.json()["email"] == "buyer@example.com"

    login = billing_client.post(
        "/api/account/login",
        json={"email": "buyer@example.com", "password": "secretpass"},
    )
    assert login.status_code == 200
    assert login.json()["email"] == "buyer@example.com"


def test_login_wrong_password(billing_client: TestClient) -> None:
    _register(billing_client, email="wrong@example.com")
    response = billing_client.post(
        "/api/account/login",
        json={"email": "wrong@example.com", "password": "badpassword"},
    )
    assert response.status_code == 401


async def _mock_create_user(self: TelemtClient, method: str, path: str, **kwargs):
    if method == "POST" and path == "/v1/users":
        username = kwargs.get("json", {}).get("username", "user_test")
        return {
            "user": {"username": username, "max_unique_ips": 1},
            "secret": "s" * 32,
        }
    raise AssertionError(f"Unexpected: {method} {path}")


def test_create_order_with_customer_jwt_sets_customer_id(billing_client: TestClient) -> None:
    token = _register(billing_client, email="linked@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    response = billing_client.post("/api/billing/orders", json={"username": "cust_user"}, headers=headers)
    assert response.status_code == 200

    orders = billing_client.get("/api/account/orders", headers=headers)
    assert orders.status_code == 200
    data = orders.json()
    assert len(data) == 1
    assert data[0]["username_issued"] is None
    assert data[0]["status"] == "pending"


def test_link_orders_by_email_on_register(billing_client: TestClient) -> None:
    create = billing_client.post(
        "/api/billing/orders",
        json={"username": "old_order", "email": "Legacy@Example.COM"},
    )
    assert create.status_code == 200

    token = _register(billing_client, email="legacy@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    orders = billing_client.get("/api/account/orders", headers=headers)
    assert orders.status_code == 200
    assert len(orders.json()) == 1
    assert orders.json()[0]["status"] == "pending"


def test_account_orders_only_own(billing_client: TestClient) -> None:
    token_a = _register(billing_client, email="a@example.com")
    token_b = _register(billing_client, email="b@example.com")

    billing_client.post(
        "/api/billing/orders",
        json={"email": "a@example.com"},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    billing_client.post(
        "/api/billing/orders",
        json={"email": "b@example.com"},
        headers={"Authorization": f"Bearer {token_b}"},
    )

    orders_a = billing_client.get(
        "/api/account/orders",
        headers={"Authorization": f"Bearer {token_a}"},
    ).json()
    orders_b = billing_client.get(
        "/api/account/orders",
        headers={"Authorization": f"Bearer {token_b}"},
    ).json()

    assert len(orders_a) == 1
    assert len(orders_b) == 1
    assert orders_a[0]["id"] != orders_b[0]["id"]


def test_customer_token_on_admin_endpoint_forbidden(billing_client: TestClient) -> None:
    token = _register(billing_client)
    response = billing_client.get(
        "/api/billing/orders",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403


def test_create_order_requires_email_without_customer(billing_client: TestClient) -> None:
    response = billing_client.post("/api/billing/orders", json={"username": "no_mail"})
    assert response.status_code == 400


async def _mock_user_detail(self: TelemtClient, method: str, path: str, **kwargs):
    if method == "GET" and path.startswith("/v1/users/"):
        username = path.rsplit("/", 1)[-1]
        return {
            "username": username,
            "enabled": True,
            "current_connections": 1,
            "links": {"tls": [f"tg://proxy?server=1.2.3.4&user={username}"]},
        }
    if method == "POST" and path == "/v1/users":
        username = kwargs.get("json", {}).get("username", "gen")
        return {"user": {"username": username}, "secret": "x" * 32}
    raise AssertionError(f"Unexpected: {method} {path}")


def test_account_profiles_no_secret(billing_client: TestClient) -> None:
    token = _register(billing_client, email="profile@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    create = billing_client.post(
        "/api/billing/orders",
        json={"username": "profile_user", "email": "profile@example.com"},
        headers=headers,
    )
    order_id = create.json()["order_id"]
    mock_yookassa = billing_client.mock_yookassa
    payment_id = next(
        pid
        for pid, payment in mock_yookassa.payments.items()
        if payment["metadata"]["order_id"] == order_id
    )
    mock_yookassa.mark_succeeded(payment_id)

    with patch.object(TelemtClient, "request", _mock_user_detail):
        billing_client.post(
            "/api/billing/webhook/yookassa",
            json=mock_yookassa.build_webhook_payload(payment_id),
        )
        profiles = billing_client.get("/api/account/profiles", headers=headers)

    assert profiles.status_code == 200
    body = profiles.json()
    assert len(body) == 1
    assert body[0]["username"] == "profile_user"
    assert "secret" not in str(body).lower()
