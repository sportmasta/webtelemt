from functools import lru_cache
from pathlib import Path

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


@lru_cache
def get_settings() -> Settings:
    return Settings()
