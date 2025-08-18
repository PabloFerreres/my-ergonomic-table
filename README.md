# My‑Ergonomic‑Table

FastAPI + PostgreSQL backend with a React/TypeScript (Handsontable) frontend to browse, edit, and layout large “sheet-like” datasets per project.  
Key features: materialized per‑project tables, smart column/row layout estimation, dropdowns, search, row moving/undo, and batched draft updates.

## TL;DR

- **Backend:** FastAPI over PostgreSQL, builds/refreshes per‑project *materialized_* tables, exposes CRUD/utility APIs.
- **Frontend:** React + Handsontable grid with dropdowns, search, zoom, and layout calculation via backend.
- **Data model (essentials):** `projects`, `views`, `base_views`, `views_columns`, `columns`, `inserted_id_meta`, `inserted_rows`, `position_meta`, `meta_datas`, domain tables like `stair_element_einbauorte`, plus `draft_project_articles`.

---

## Tech stack

- **Backend:** Python, FastAPI, asyncpg, psycopg2, SQLAlchemy
- **DB:** PostgreSQL
- **Frontend:** React + TypeScript, Handsontable

---

## Repo layout

```
backend/
  main.py                   # FastAPI app + CORS + global exception handler
  api.py                    # API aggregator (mounts all routers, write ops)
  db_to_hot_table.py        # Query → Handsontable {headers, data} shape
  debug_config.py           # Toggle debug flags
  settings/connection_points.py
  layout/
    layout_estimation.py    # width/height estimators
    layout_optimizer.py     # total layout optimization API
  loading/
    create_materialized_tables.py  # per-project materialization
    rematerialize_control.py       # debounced rebuilds by sheet name
  routes/
    baseviews_routes.py     # GET /baseviews
    projects_routes.py      # GET /projects
    sheetnames_routes.py    # GET /sheetnames?project_id
    dropdown_contents.py    # GET /dropdownOptionsByHeaders
    layout_routes.py        # POST /layout/estimate
    new_sheet.py            # POST /views/create_sheet
    elektrik_routes.py      # POST /elektrik_update, /materialize_elektrik
    next_inserted_id.py     # GET /next_inserted_id
  utils/
    sheet_create_utils.py   # create sheet, welcome row, materialize, meta
    update_draft_articles.py# apply edits to draft rows
  zentral_managers/
    inserted_id_central_manager.py # negative ID allocation

src/
  frontend/visualization/App.tsx      # App shell: projects, sheets, panels
  frontend/visualization/TableGrid.tsx# Handsontable grid wrapper
  frontend/hooks/useDropdowns.ts      # dropdowns from backend
  ...
```

---

## How it works (high‑level)

1. **Projects & views:** Each project has views (based on a base view). Backend can create a new view/sheet and immediately **materialize** it into a physical table named `materialized_{view}_{project}`.
2. **Data to grid:** `fetch_table_as_hotarray()` returns `(headers, data)` for Handsontable.
3. **Layout:** Frontend calls `/layout/estimate` which runs `layout_optimizer` + `layout_estimation` to compute **column widths** and **row heights** considering wrapped text and rotated headers.
4. **Editing:** Draft/bulk edits are applied via `update_draft_articles.apply_edits_to_draft()`; new negative IDs are coordinated centrally so inserts/updates are consistent (`inserted_id_meta`).
5. **Rematerialization:** Position changes and edits can trigger a **debounced** rematerialization per sheet (`rematerialize_control.debounce_rematerialize(sheet_name, project_id, delay=2.0)`.

---

## API (selected)

- `GET  /projects` → `[{ id, name }]`
- `GET  /baseviews` → base views selectable for new sheets
- `POST /views/create_sheet` `{ display_name, base_view_id, project_id }`
- `GET  /sheetnames?project_id=…` → `["materialized_…"]` for that project
- `GET  /dropdownOptionsByHeaders?project_id=…&header=…` → `{ header: [values] }`
- `POST /layout/estimate` `{ headers: string[], data: (string|number)[][] }` → `{ columnWidths, rowHeights }`
- `GET  /next_inserted_id` → `{ next_id: -N }`
- Domain:
  - `POST /elektrik_update` `{ project_id }` → refresh active article IDs
  - `POST /materialize_elektrik` `{ project_id }` → build elek. materialized tables

> Note: Additional write endpoints (saving row positions, applying edits, etc.) are mounted in `backend/api.py`.

---

## Essential functions (what to know)

**Backend core**
- `backend/db_to_hot_table.fetch_table_as_hotarray(db_url, table_name, limit=500, project_id=None)`
- `backend/layout/layout_estimation.py`
  - `estimate_rotated_header_width(text)`
  - `estimate_wrapped_cell_width(text, row_height, header)`
  - `estimate_row_height_for_cells(cells, max_row_height=200)`
- `backend/layout/layout_optimizer.optimize_table_layout(headers, data, max_row_height=200)`
- `backend/loading/create_materialized_tables.py`
  - `create_materialized_table(project_id, view_id, base_view_id)`
  - `refresh_all_materialized(project_id)` *(used by api)*
- `backend/loading/rematerialize_control.debounce_rematerialize(sheet_name, project_id, delay=2.0)`
- `backend/utils/sheet_create_utils.create_sheet_full(display_name, base_view_id, project_id)`
- `backend/utils/update_draft_articles.apply_edits_to_draft(conn, edits)`
- `backend/central_managers/inserted_id_central_manager.get_and_decrement_last_id(cursor)`

**Frontend essentials**
- `src/frontend/visualization/TableGrid.tsx`: Handsontable setup, filters, undo/redo, row move hooks.
- `src/frontend/hooks/useDropdowns.ts`: `useDropdownOptions(projectId, headers)` to hydrate dropdowns.
- `src/frontend/visualization/uiButtonFunctions/TriggerLayoutCalculation.ts`: calls `/layout/estimate`.
- `src/frontend/visualization/uiButtonFunctions/useSearchFunctions.ts`: grid search utilities.
- `src/frontend/visualization/uiSquares/*`: panels (search, console, etc.).

---

## Configuration

Create a `config.json` at the **repo root** (both backend & frontend expect it):

```json
{
  "DB_URL": "postgresql+psycopg2://USER:PASS@localhost:5432/DBNAME",
  "BACKEND_URL": "http://localhost:8000"
}
```

> `backend/settings/connection_points.py` reads `../config.json`.  
> Frontend imports `config.json` for `BACKEND_URL`.

---

## Prerequisites

- Python 3.11+
- PostgreSQL 13+ (with the tables mentioned above)
- Node.js 18+ (for building/running the React frontend; add your own `package.json` if not present)

> **DB schema:** The code references (at minimum):  
`projects`, `views`, `base_views`, `views_columns`, `columns`,  
`inserted_id_meta`, `inserted_rows`, `position_meta`, `meta_datas`,  
`stair_element_einbauorte`, `draft_project_articles`, and domain‑specific tables.  
Ensure these exist and have the expected columns/relations.

---

## Run (dev)

**1) Backend**

```bash
# create venv + install
python -m venv .venv && source .venv/bin/activate
pip install fastapi uvicorn asyncpg psycopg2-binary sqlalchemy

# start API
uvicorn backend.main:app --reload --port 8000
```

**2) Frontend**

This repo contains the `src/` app (React + Handsontable).  
If your project doesn’t include a `package.json`, initialize one and add typical Vite/React tooling:

```bash
# once (example using Vite)
npm create vite@latest frontend -- --template react-ts
# move/merge this repo's src/ into your Vite app, or point Vite to ./src
npm i
npm run dev
```

Set `BACKEND_URL` in `config.json` to match the backend (default `http://localhost:8000`).

---

## Notes & conventions

- **Negative IDs for inserts:** central manager decrements `inserted_id_meta.last_id` to allocate temporary IDs safely.
- **Debounced rebuilds:** position or content changes can trigger a delayed rematerialization of the materialized table for the affected sheet.
- **Layout exceptions:** specific headers (e.g., `"Bestellbezeichnung"`) have capped widths in `layout_estimation.py`.

---

## Contributing

- Keep changes minimal and focused.
- Prefer extending routes in `backend/routes/` and reuse the utilities in `backend/utils/` & `backend/loading/`.
- For layout logic, touch `layout_estimation.py`/`layout_optimizer.py` only as needed.

---

## License

Add your license here (e.g., MIT).
