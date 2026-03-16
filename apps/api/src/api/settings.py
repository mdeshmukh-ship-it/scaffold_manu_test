from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[4]
DEFAULT_MANIFEST_PATH = REPO_ROOT / "APP_MANIFEST.yaml"


class AppSettings(BaseSettings):
    model_config = SettingsConfigDict(
        case_sensitive=False,
        extra="ignore",
        env_file=(str(REPO_ROOT / ".env"), str(REPO_ROOT / ".env.local")),
        env_file_encoding="utf-8",
    )

    app_env: str = "local"
    app_name: str = "Scaffold App"
    app_host: str = "127.0.0.1"
    app_port: int = 8001

    app_manifest_path: Path = Field(default=DEFAULT_MANIFEST_PATH)
    severity_level: str | None = None
    audience: str | None = None

    database_url: str = "postgresql+asyncpg://app:app@127.0.0.1:5432/scaffold"
    database_echo: bool = False

    cloud_sql_instance_connection_name: str | None = None
    cloud_sql_db_name: str = "scaffold"
    cloud_sql_db_user: str = "app"
    cloud_sql_db_password: str = "app"  # noqa: S105 - scaffold placeholder for local/bootstrap setup
    cloud_sql_iam_auth: bool = False

    session_cookie_name: str = "app_session"
    session_secret: str = "dev-only-change-me"  # noqa: S105 - local scaffold default only
    session_ttl_minutes: int = 720

    auth_code_ttl_minutes: int = 10
    auth_code_length: int = 6
    auth_max_verify_attempts: int = 5
    auth_provider: str = "console"
    auth_allowed_email_domains: str = "example.com"
    auth_allowed_emails: str = ""
    auth_email_max_requests_per_10m: int = 5
    auth_ip_max_requests_per_10m: int = 20
    auth_verify_max_attempts_per_10m: int = 10
    dev_auth_bypass: bool = False
    dev_user_email: str = "dev.user@example.com"
    dev_password_login_enabled: bool = False
    dev_password_login_username: str = "admin"  # noqa: S105 - local/test-only demo credential
    dev_password_login_password: str = "local-dev-password"  # noqa: S105 - local/test-only demo credential
    dev_password_login_email: str = "admin@example.com"  # noqa: S105 - local/test-only demo credential

    bot_protection_enabled: bool = False
    bot_provider: str = "turnstile"
    bot_secret_key: str = ""
    bot_verify_url: str = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

    llm_provider: str = "local_qwen"
    llm_model: str = "Qwen/Qwen3.5-2B"
    llm_local_base_url: str = "http://127.0.0.1:8002"
    llm_local_timeout_seconds: float = 600.0
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    llm_timeout_seconds: float = 20.0
    llm_max_retries: int = 2
    scheduler_shared_token: str = ""

    @property
    def manifest(self) -> dict[str, Any]:
        if not self.app_manifest_path.exists():
            return {}
        with self.app_manifest_path.open("r", encoding="utf-8") as manifest_file:
            parsed = yaml.safe_load(manifest_file) or {}
        if not isinstance(parsed, dict):
            return {}
        return parsed

    @staticmethod
    def _split_csv(value: str) -> set[str]:
        return {item.strip().lower() for item in value.split(",") if item.strip()}

    @property
    def allowed_email_domains(self) -> set[str]:
        return self._split_csv(self.auth_allowed_email_domains)

    @property
    def allowed_emails(self) -> set[str]:
        return self._split_csv(self.auth_allowed_emails)

    def manifest_slug(self) -> str:
        app_data = self.manifest.get("app", {})
        slug = str(app_data.get("slug", "scaffold-app"))
        return slug.strip().lower()

    @property
    def effective_severity_level(self) -> str:
        if self.severity_level:
            return self.severity_level
        severity = self.manifest.get("severity", {})
        if isinstance(severity, dict):
            return str(severity.get("level", "L1"))
        return "L1"

    @property
    def effective_audience(self) -> str:
        if self.audience:
            return self.audience
        severity = self.manifest.get("severity", {})
        if isinstance(severity, dict):
            return str(severity.get("audience", "internal"))
        return "internal"

    @property
    def session_cookie_secure(self) -> bool:
        return self.app_env in {"prod", "production", "staging"}

    @property
    def should_require_bot_protection(self) -> bool:
        return self.bot_protection_enabled and self.effective_severity_level == "L3"

    @property
    def can_use_dev_password_login(self) -> bool:
        return self.dev_password_login_enabled and self.app_env in {"local", "test"}

    def is_email_allowed(self, email: str) -> bool:
        normalized = email.strip().lower()
        if "@" not in normalized:
            return False

        domain = normalized.split("@", maxsplit=1)[1]
        if self.allowed_email_domains and domain not in self.allowed_email_domains:
            return False

        if self.allowed_emails and normalized not in self.allowed_emails:
            return False
        return True


@lru_cache(maxsize=1)
def get_settings() -> AppSettings:
    return AppSettings()


def clear_settings_cache() -> None:
    get_settings.cache_clear()
