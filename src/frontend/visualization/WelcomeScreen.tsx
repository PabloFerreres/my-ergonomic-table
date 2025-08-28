import { useEffect, useState } from "react";
import type { Project } from "./SesionParameters";
import { createSheetApiCall } from "../utils/apiSync";
import config from "../../../config.json";
import "./WelcomeScreen.css";

const API_PREFIX = config.BACKEND_URL;

export default function WelcomeScreen({
  onSelect,
}: {
  onSelect: (p: Project) => void;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const [creating, setCreating] = useState(false);
  const [projName, setProjName] = useState("");
  const [sheetName, setSheetName] = useState("");
  const [baseViews, setBaseViews] = useState<{ id: number; name: string }[]>(
    []
  );
  const [baseViewId, setBaseViewId] = useState<number | null>(null);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);

  useEffect(() => {
    fetch(`${API_PREFIX}/api/projects`)
      .then((r) => r.json())
      .then((list) => setProjects(Array.isArray(list) ? list : []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!creating) return;
    fetch(`${API_PREFIX}/api/baseviews?project_id=1`)
      .then((r) => r.json())
      .then((list: { id: number; name: string }[]) =>
        setBaseViews(Array.isArray(list) ? list : [])
      )
      .catch(() => setBaseViews([]));
  }, [creating]);

  async function waitForSheets(projectId: number, tries = 20, delayMs = 250) {
    for (let i = 0; i < tries; i++) {
      try {
        const names: string[] = await fetch(
          `${API_PREFIX}/api/sheetnames?project_id=${projectId}`
        ).then((r) => r.json());
        if (Array.isArray(names) && names.length > 0) return names;
      } catch {}
      await new Promise((res) => setTimeout(res, delayMs));
    }
    return [];
  }

  async function openProject(proj: Project) {
    try {
      setBusy(true);
      await fetch(`${API_PREFIX}/api/rematerializeAll?project_id=${proj.id}`, {
        method: "POST",
      }).catch(() => null);
      await waitForSheets(proj.id);
      onSelect(proj);
    } finally {
      setBusy(false);
    }
  }

  async function softDelete(projectId: number) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(
        `${API_PREFIX}/api/projects/${projectId}?mode=soft`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setErr(j?.detail || "Löschen fehlgeschlagen.");
        return;
      }
      setProjects((p) => p.filter((x) => x.id !== projectId));
      if (selectedId === projectId) setSelectedId(null);
      setConfirmingId(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate() {
    const pn = projName.trim();
    const sn = sheetName.trim();
    if (!pn || !sn || baseViewId == null || busy) return;

    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`${API_PREFIX}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: pn }),
      });
      const proj = await res.json();
      if (!res.ok || !proj?.id) {
        setErr(proj?.error || "Projekt konnte nicht angelegt werden.");
        return;
      }

      const result = await createSheetApiCall({
        display_name: sn,
        base_view_id: baseViewId,
        project_id: proj.id,
      });
      if (!result.success) {
        setErr(result.error || "Sheet konnte nicht erstellt werden.");
        return;
      }

      await fetch(`${API_PREFIX}/api/rematerializeAll?project_id=${proj.id}`, {
        method: "POST",
      }).catch(() => null);
      await waitForSheets(proj.id);

      setProjects((p) =>
        [...p, proj].sort((a, b) => a.name.localeCompare(b.name))
      );
      onSelect(proj);
    } finally {
      setBusy(false);
      setCreating(false);
      setProjName("");
      setSheetName("");
      setBaseViewId(null);
      setConfirmingId(null);
    }
  }

  if (loading) return <div className="wel-root center">Lade Projekte…</div>;

  const selectedProject = selectedId
    ? projects.find((p) => p.id === selectedId) || null
    : null;

  return (
    <div className="wel-root">
      <h1 className="wel-title">Welcome!</h1>

      <div className="wel-card">
        <div className="wel-hero" />

        <div className="wel-body">
          {/* Linke Spalte: schwarzes Quadrat (Projektliste) */}
          <div className="wel-left">
            <div className="wel-label">Project:</div>
            <div className="wel-projects">
              {projects.map((p) => (
                <div
                  key={p.id}
                  className={`wel-item ${
                    selectedId === p.id ? "is-active" : ""
                  }`}
                  onClick={() => {
                    setSelectedId(p.id);
                    setConfirmingId(null);
                  }}
                  title={p.name}
                >
                  <span className="wel-name">{p.name}</span>
                  <button
                    className="wel-btn wel-btn--muted wel-btn--xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmingId(p.id);
                    }}
                    disabled={busy}
                  >
                    Löschen
                  </button>
                </div>
              ))}
            </div>

            {confirmingId && (
              <div className="wel-row" style={{ marginTop: 8 }}>
                <button
                  className="wel-btn wel-btn--danger wel-btn--sm"
                  onClick={() => softDelete(confirmingId)}
                  disabled={busy}
                >
                  Wirklich löschen
                </button>
                <button
                  className="wel-btn wel-btn--muted wel-btn--sm"
                  onClick={() => setConfirmingId(null)}
                  disabled={busy}
                >
                  Abbrechen
                </button>
              </div>
            )}

            {err && <div className="wel-err">{err}</div>}
          </div>

          {/* Rechte Spalte: Open + Create */}
          <div className="wel-actions">
            <button
              className="wel-btn wel-btn--primary"
              onClick={() => selectedProject && openProject(selectedProject)}
              disabled={!selectedProject || busy}
            >
              Open Project
            </button>

            {!creating ? (
              <button
                className="wel-btn wel-btn--muted"
                onClick={() => setCreating(true)}
                disabled={busy}
              >
                ➕ Neues Projekt
              </button>
            ) : (
              <div className="wel-create">
                <input
                  className="wel-input"
                  placeholder="Projektname"
                  value={projName}
                  onChange={(e) => setProjName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  autoFocus
                />
                <input
                  className="wel-input"
                  placeholder="Erstes Sheet (Anzeige)"
                  value={sheetName}
                  onChange={(e) => setSheetName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                />
                <select
                  className="wel-input"
                  value={baseViewId ?? ""}
                  onChange={(e) =>
                    setBaseViewId(
                      e.target.value === "" ? null : Number(e.target.value)
                    )
                  }
                >
                  <option value="" disabled>
                    — Typ wählen —
                  </option>
                  {baseViews.map((bv) => (
                    <option key={bv.id} value={bv.id}>
                      {bv.name}
                    </option>
                  ))}
                </select>

                <div className="wel-create-row">
                  <button
                    className="wel-btn wel-btn--primary"
                    onClick={handleCreate}
                    disabled={
                      !projName.trim() ||
                      !sheetName.trim() ||
                      baseViewId == null ||
                      busy
                    }
                  >
                    {busy ? "Anlegen…" : "Projekt erstellen"}
                  </button>
                  <button
                    className="wel-btn wel-btn--muted"
                    onClick={() => {
                      setCreating(false);
                      setErr(null);
                      setProjName("");
                      setSheetName("");
                      setBaseViewId(null);
                    }}
                    disabled={busy}
                  >
                    Abbrechen
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="wel-brand">Visto&Listo</div>
    </div>
  );
}
