from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "LinguaLens API"
    openai_base_url: str = "https://api.openai.com/v1"
    openai_model_quick: str = "gpt-4o-mini"
    openai_model_deep: str = "gpt-4o"
    openai_api_key: str | None = None
    langgraph_api_key: str | None = None
    redis_url: str = "redis://localhost:6379/0"
    quick_cache_ttl: int = 60 * 30
    deep_cache_ttl: int = 60 * 60 * 6
    vector_store_path: str = "./data/vector"
    enable_online_sources: bool = True

    class Config:
        env_file = ".env"
        env_prefix = "LINGUALENS_"


@lru_cache(1)
def get_settings() -> Settings:
    return Settings()
