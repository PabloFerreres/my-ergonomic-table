from fastapi import FastAPI, Query, Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
import logging
import asyncpg




from backend.db_to_hot_table import fetch_table_as_hotarray
from backend.api import router as api_router
from backend.settings.connection_points import DB_URL, project_id, views_to_show, DEBUG


app = FastAPI()

# CORS erlauben (Frontend ↔ Backend)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Im Deployment ggf. auf ["http://localhost:5173"] beschränken
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Globale Fehlerbehandlung
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logging.exception("❌ Unhandled exception:")
    if DEBUG:
        print(f"[DEBUG] Exception in {request.url}: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc)},
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    if DEBUG:
        print(f"[DEBUG] Validation error: {exc.errors()}")
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors()},
    )

# DB-Verbindungspool beim Start einrichten
@app.on_event("startup")
async def startup():
    app.state.db = await asyncpg.create_pool(dsn=DB_URL)
    if DEBUG:
        print(f"[DEBUG] Starte Backend mit project_id={project_id}")
        print(f"[DEBUG] views_to_show: {views_to_show}")

@app.on_event("shutdown")
async def shutdown():
    await app.state.db.close()
    if DEBUG:
        print("[DEBUG] DB-Pool wurde geschlossen.")

# Routen aktivieren
app.include_router(api_router)

# Tabelle als HotTable-kompatibel abrufen
@app.get("/api/tabledata")
async def get_tabledata(
    table: str = Query("materialized_spuellen_miniproject"),
    limit: int = Query(500)
):
    if DEBUG:
        print(f"[DEBUG] Abfrage tabledata für Tabelle: {table}, Limit: {limit}")
    headers, data = await fetch_table_as_hotarray(DB_URL, table, limit)
    return {"headers": headers, "data": data}
