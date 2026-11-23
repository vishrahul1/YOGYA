from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str
    supabase_url: str
    supabase_jwt_audience: str = "authenticated"
    app_env: str = "development"
    cors_allowed_origins: str = "http://localhost:3000"
    ai_provider: str = ""
    ai_api_key: str = ""
    ai_base_url: str = ""
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"
    gemini_base_url: str = "https://generativelanguage.googleapis.com/v1beta"
    gemini_timeout_seconds: float = 10.0

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    def allowed_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_allowed_origins.split(",") if origin.strip()]

    def allowed_origin_regex(self) -> str | None:
        """Allow loopback origins on changing dev-server ports in development only."""
        if self.app_env.lower() == "development":
            return r"^https?://(?:localhost|127\.0\.0\.1)(?::\d+)?$"
        return None


def get_settings() -> Settings:
    return Settings()
