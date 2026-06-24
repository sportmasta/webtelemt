from unittest.mock import patch

from fastapi.testclient import TestClient

from app.telemt import TelemtClient


def test_get_plan(billing_client: TestClient) -> None:
    response = billing_client.get("/api/billing/plan")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Тест"
    assert data["price_rub"] == 299
    assert data["period_days"] == 30


async def _mock_create_user(self: TelemtClient, method: str, path: str, **kwargs):
    if method == "POST" and path == "/v1/users":
        username = kwargs.get("json", {}).get("username", "user_test")
        return {
            "user": {"username": username, "max_unique_ips": 1},
            "secret": "s" * 32,
        }
    raise AssertionError(f"Unexpected: {method} {path}")


def test_create_order_returns_confirmation_url(billing_client: TestClient) -> None:
    response = billing_client.post(
        "/api/billing/orders",
        json={"username": "buyer1", "email": "buyer1@example.com"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "order_id" in data
    assert "confirmation_url" in data
    assert data["confirmation_url"].startswith("https://yookassa.test/")


def test_webhook_completes_order_and_credentials_one_time(billing_client: TestClient) -> None:
    create = billing_client.post(
        "/api/billing/orders",
        json={"username": "paid_user", "email": "paid@example.com"},
    )
    assert create.status_code == 200
    order_id = create.json()["order_id"]

    mock_yookassa = billing_client.mock_yookassa
    payment_id = None
    for pid, payment in mock_yookassa.payments.items():
        if payment["metadata"]["order_id"] == order_id:
            payment_id = pid
            break
    assert payment_id is not None
    mock_yookassa.mark_succeeded(payment_id)

    with patch.object(TelemtClient, "request", _mock_create_user):
        webhook = billing_client.post(
            "/api/billing/webhook/yookassa",
            json=mock_yookassa.build_webhook_payload(payment_id),
        )
    assert webhook.status_code == 200

    status = billing_client.get(f"/api/billing/orders/{order_id}")
    assert status.status_code == 200
    assert status.json()["status"] == "completed"
    assert status.json()["credentials_available"] is True

    creds = billing_client.get(f"/api/billing/orders/{order_id}/credentials")
    assert creds.status_code == 200
    body = creds.json()
    assert body["username"] == "paid_user"
    assert body["secret"] == "s" * 32

    again = billing_client.get(f"/api/billing/orders/{order_id}/credentials")
    assert again.status_code == 410


def test_webhook_idempotent(billing_client: TestClient) -> None:
    create = billing_client.post(
        "/api/billing/orders",
        json={"email": "idem@example.com"},
    )
    order_id = create.json()["order_id"]
    mock_yookassa = billing_client.mock_yookassa
    payment_id = next(iter(mock_yookassa.payments))
    mock_yookassa.mark_succeeded(payment_id)
    payload = mock_yookassa.build_webhook_payload(payment_id)

    call_count = 0

    async def counting_mock(self: TelemtClient, method: str, path: str, **kwargs):
        nonlocal call_count
        if method == "POST" and path == "/v1/users":
            call_count += 1
            username = kwargs.get("json", {}).get("username", "gen")
            return {"user": {"username": username}, "secret": "x" * 32}
        raise AssertionError(f"Unexpected: {method} {path}")

    with patch.object(TelemtClient, "request", counting_mock):
        billing_client.post("/api/billing/webhook/yookassa", json=payload)
        billing_client.post("/api/billing/webhook/yookassa", json=payload)

    assert call_count == 1


def test_admin_orders_list_no_secret(billing_client: TestClient, auth_headers: dict[str, str]) -> None:
    billing_client.post(
        "/api/billing/orders",
        json={"username": "admin_view", "email": "admin_view@example.com"},
    )
    response = billing_client.get("/api/billing/orders", headers=auth_headers)
    assert response.status_code == 200
    orders = response.json()
    assert isinstance(orders, list)
    assert len(orders) >= 1
    for order in orders:
        assert "secret" not in order
        assert "username_issued" in order or order.get("username_issued") is None


def test_admin_orders_requires_auth(billing_client: TestClient) -> None:
    response = billing_client.get("/api/billing/orders")
    assert response.status_code == 401
