from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    telemt_api_url: str = "http://127.0.0.1:9091"
    telemt_auth_header: str = ""
    panel_admin_user: str = "admin"
    panel_admin_password: str = ""
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24
    panel_port: int = 8080
    static_dir: Path = Path(__file__).resolve().parent.parent / "static"
    user_max_unique_ips: int = 1
    panel_env: str = "production"
    cors_origins: str = ""
    login_rate_limit: int = 5
    login_rate_window_seconds: int = 900
    security_hsts: bool = False

    database_url: str = ""
    yookassa_shop_id: str = ""
    yookassa_secret_key: str = ""
    yookassa_return_url: str = ""
    billing_plan_name: str = "Базовый"
    billing_plan_price_rub: int = 299
    billing_plan_period_days: int = 30
    billing_order_ttl_minutes: int = 60
    billing_credentials_encryption_key: str = ""
    billing_order_rate_limit: int = 5
    billing_order_rate_window_seconds: int = 900

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: object) -> str:
        if value is None:
            return ""
        return str(value).strip()

    @property
    def is_production(self) -> bool:
        return self.panel_env.lower() == "production"

    @property
    def cors_origin_list(self) -> list[str]:
        if not self.cors_origins:
            return []
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def billing_enabled(self) -> bool:
        return bool(
            self.database_url
            and self.yookassa_shop_id
            and self.yookassa_secret_key
            and self.yookassa_return_url
            and self.billing_credentials_encryption_key
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
