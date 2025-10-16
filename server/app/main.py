from fastapi import FastAPI

from .core.cache import get_cache
from .core.config import get_settings
from .routes import collections, explain, profiles


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name)

    @app.on_event('startup')
    async def startup_event():
        await get_cache()

    @app.get('/health')
    async def health():
        return {'status': 'ok'}

    app.include_router(explain.router)
    app.include_router(profiles.router)
    app.include_router(collections.router)
    return app


app = create_app()
