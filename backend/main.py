from fastapi import FastAPI, Query, Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
import logging
import asyncpg

from backend.db_to_hot_table import fetch_table_as_hotarray
from backend.api import router as api_router
from backend.settings.connection_points import DB_URL

app = FastAPI()

# Datenbank-URL (für Pool und fetch)

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
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc)},
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors()},
    )

# DB-Verbindungspool beim Start einrichten
@app.on_event("startup")
async def startup():
    app.state.db = await asyncpg.create_pool(dsn=DB_URL)

@app.on_event("shutdown")
async def shutdown():
    await app.state.db.close()

# Routen aktivieren
app.include_router(api_router)

# Tabelle als HotTable-kompatibel abrufen
@app.get("/api/tabledata")
async def get_tabledata(
    table: str = Query("materialized_spuellen_miniproject"),
    limit: int = Query(500)
):
    headers, data = await fetch_table_as_hotarray(DB_URL, table, limit)
    return {"headers": headers, "data": data}
