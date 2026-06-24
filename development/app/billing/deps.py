from app.billing.crypto import SecretCipher
from app.billing.service import BillingService
from app.billing.yookassa import YooKassaClient
from app.config import Settings
from app.telemt import TelemtClient

_billing_service_override: BillingService | None = None


def get_billing_service(settings: Settings) -> BillingService:
    if _billing_service_override is not None:
        return _billing_service_override
    yookassa = YooKassaClient(settings.yookassa_shop_id, settings.yookassa_secret_key)
    telemt = TelemtClient(settings)
    cipher = SecretCipher(settings.billing_credentials_encryption_key)
    return BillingService(settings, yookassa, telemt, cipher)


def set_billing_service_override(service: BillingService | None) -> None:
    global _billing_service_override
    _billing_service_override = service
