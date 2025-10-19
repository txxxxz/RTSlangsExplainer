from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .core.cache import get_cache
from .core.config import get_settings
from .routes import api_v1, collections, explain, profiles


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name)

    # Configure CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # 在生产环境中，应该限制为具体的域名
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.on_event('startup')
    async def startup_event():
        await get_cache()

    @app.get('/health')
    async def health():
        return {'status': 'ok'}

    app.include_router(explain.router)
    app.include_router(profiles.router)
    app.include_router(collections.router)
    app.include_router(api_v1.router)
    return app


app = create_app()
