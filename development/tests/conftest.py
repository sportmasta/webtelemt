import importlib

import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient


@pytest.fixture
def test_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PANEL_ADMIN_USER", "admin")
    monkeypatch.setenv("PANEL_ADMIN_PASSWORD", "testpass123")
    monkeypatch.setenv("JWT_SECRET", "test-jwt-secret-for-pytest-only-32chars!")
    monkeypatch.setenv("TELEMT_API_URL", "http://127.0.0.1:9091")
    monkeypatch.setenv("PANEL_ENV", "production")
    monkeypatch.setenv("LOGIN_RATE_LIMIT", "100")
    from app.config import get_settings

    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def client(test_env: None) -> TestClient:
    import app.main as main_module
    import app.rate_limit as rate_limit

    rate_limit._attempts.clear()
    rate_limit._billing_attempts.clear()
    importlib.reload(main_module)
    with TestClient(main_module.create_app()) as test_client:
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


@pytest.fixture
def billing_env(monkeypatch: pytest.MonkeyPatch) -> str:
    fernet_key = Fernet.generate_key().decode()
    monkeypatch.setenv("PANEL_ADMIN_USER", "admin")
    monkeypatch.setenv("PANEL_ADMIN_PASSWORD", "testpass123")
    monkeypatch.setenv("JWT_SECRET", "test-jwt-secret-for-pytest-only-32chars!")
    monkeypatch.setenv("TELEMT_API_URL", "http://127.0.0.1:9091")
    monkeypatch.setenv("PANEL_ENV", "production")
    monkeypatch.setenv("LOGIN_RATE_LIMIT", "100")
    monkeypatch.setenv("BILLING_ORDER_RATE_LIMIT", "100")
    monkeypatch.setenv("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
    monkeypatch.setenv("YOOKASSA_SHOP_ID", "test-shop")
    monkeypatch.setenv("YOOKASSA_SECRET_KEY", "test-secret")
    monkeypatch.setenv("YOOKASSA_RETURN_URL", "http://test/buy/success")
    monkeypatch.setenv("BILLING_CREDENTIALS_ENCRYPTION_KEY", fernet_key)
    monkeypatch.setenv("BILLING_PLAN_NAME", "Тест")
    monkeypatch.setenv("BILLING_PLAN_PRICE_RUB", "299")
    monkeypatch.setenv("BILLING_PLAN_PERIOD_DAYS", "30")
    from app.config import get_settings

    get_settings.cache_clear()
    yield fernet_key
    get_settings.cache_clear()


@pytest.fixture
def billing_client(billing_env: str) -> TestClient:
    import app.billing.deps as billing_deps
    import app.main as main_module
    import app.rate_limit as rate_limit
    from app.billing.crypto import SecretCipher
    from app.billing.service import BillingService
    from app.billing.yookassa import MockYooKassaClient
    from app.config import get_settings
    from app.telemt import TelemtClient

    rate_limit._attempts.clear()
    rate_limit._billing_attempts.clear()
    billing_deps.set_billing_service_override(None)
    importlib.reload(main_module)

    settings = get_settings()
    mock_yookassa = MockYooKassaClient()
    telemt = TelemtClient(settings)
    cipher = SecretCipher(billing_env)
    service = BillingService(settings, mock_yookassa, telemt, cipher)
    billing_deps.set_billing_service_override(service)

    with TestClient(main_module.create_app()) as test_client:
        test_client.mock_yookassa = mock_yookassa  # type: ignore[attr-defined]
        yield test_client

    billing_deps.set_billing_service_override(None)
    get_settings.cache_clear()
