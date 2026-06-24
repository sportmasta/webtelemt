from app.config import Settings

_WEAK_JWT_SECRETS = frozenset(
    {
        "",
        "change-me-in-production",
        "change-me-generate-with-openssl-rand-hex-32",
    }
)


def validate_settings(settings: Settings) -> None:
    if not settings.is_production:
        return

    if settings.jwt_secret in _WEAK_JWT_SECRETS or len(settings.jwt_secret) < 32:
        raise RuntimeError(
            "JWT_SECRET не задан или слишком слабый. "
            "Укажите случайную строку ≥32 символов в development/.env"
        )

    if not settings.panel_admin_password:
        raise RuntimeError("PANEL_ADMIN_PASSWORD обязателен в production")

    if settings.database_url and not settings.billing_credentials_encryption_key:
        raise RuntimeError(
            "BILLING_CREDENTIALS_ENCRYPTION_KEY обязателен при включённом DATABASE_URL"
        )
