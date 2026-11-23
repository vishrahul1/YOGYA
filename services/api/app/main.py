from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.errors import register_error_handlers
from app.routers.access import router as access_router
from app.routers.admin_schemes import router as admin_schemes_router
from app.routers.admin_verification import router as admin_verification_router
from app.routers.ai import router as ai_router
from app.routers.eligibility import router as eligibility_router
from app.routers.schemes import router as schemes_router
from app.routers.student_tracking import router as student_tracking_router


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="YOGYA API")
    register_error_handlers(app)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins_list(),
        allow_origin_regex=settings.allowed_origin_regex(),
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )
    app.include_router(access_router)
    app.include_router(schemes_router)
    app.include_router(admin_schemes_router)
    app.include_router(admin_verification_router)
    app.include_router(eligibility_router)
    app.include_router(ai_router)
    app.include_router(student_tracking_router)

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
