import { useEffect, useState } from "react";
import type { Project } from "./SesionParameters";
import { createSheetApiCall } from "../utils/apiSync";
import config from "../../../config.json";
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

  // NEU: Soft-Delete Bestätigung
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

  // --- Helper: warte bis sheetnames > 0 (Polling, kurz & weich) ---
  async function waitForSheets(
    projectId: number,
    tries = 20,
    delayMs = 250
  ): Promise<string[]> {
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

  // Öffnen bestehendes Projekt: rematerializeAll -> warten -> öffnen
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

  // NEU: Soft-Delete (zweite Bestätigung)
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
      setConfirmingId(null);
    } finally {
      setBusy(false);
    }
  }

  // Neues Projekt + erstes Sheet anlegen, rematerialisieren, warten, öffnen
  async function handleCreate() {
    const pn = projName.trim();
    const sn = sheetName.trim();
    if (!pn || !sn || baseViewId == null || busy) return;

    setBusy(true);
    setErr(null);
    try {
      // 1) Projekt
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

      // 2) Erstes Sheet
      const result = await createSheetApiCall({
        display_name: sn,
        base_view_id: baseViewId,
        project_id: proj.id,
      });
      if (!result.success) {
        setErr(result.error || "Sheet konnte nicht erstellt werden.");
        return;
      }

      // 3) Rematerialisieren + warten
      await fetch(`${API_PREFIX}/api/rematerializeAll?project_id=${proj.id}`, {
        method: "POST",
      }).catch(() => null);
      await waitForSheets(proj.id);

      // 4) Öffnen
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

  if (loading) return <div style={{ color: "#fff" }}>Lade Projekte…</div>;

  const btn = {
    padding: "1em 2em",
    fontSize: "1.1em",
    borderRadius: 8,
    border: "none",
    background: "#2170c4",
    color: "#fff",
    cursor: "pointer",
  } as const;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "#222",
        color: "#fff",
        gap: 16,
      }}
    >
      <h1>Welcome!</h1>
      <p>Wähle ein Projekt:</p>

      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        {!creating ? (
          <button style={btn} onClick={() => setCreating(true)} disabled={busy}>
            ➕ Neues Projekt
          </button>
        ) : (
          <>
            <input
              placeholder="Projektname"
              value={projName}
              onChange={(e) => setProjName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              autoFocus
              style={{
                padding: "0.8em 1em",
                borderRadius: 8,
                border: "1px solid #555",
                background: "#111",
                color: "#fff",
              }}
            />
            <input
              placeholder="Erstes Sheet (Anzeige)"
              value={sheetName}
              onChange={(e) => setSheetName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              style={{
                padding: "0.8em 1em",
                borderRadius: 8,
                border: "1px solid #555",
                background: "#111",
                color: "#fff",
              }}
            />
            <select
              value={baseViewId ?? ""}
              onChange={(e) =>
                setBaseViewId(
                  e.target.value === "" ? null : Number(e.target.value)
                )
              }
              style={{
                padding: "0.8em 1em",
                borderRadius: 8,
                border: "1px solid #555",
                background: "#111",
                color: "#fff",
              }}
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

            <button
              style={{
                ...btn,
                opacity:
                  projName.trim() && sheetName.trim() && baseViewId != null
                    ? 1
                    : 0.6,
                cursor:
                  projName.trim() && sheetName.trim() && baseViewId != null
                    ? "pointer"
                    : "not-allowed",
              }}
              disabled={
                !projName.trim() ||
                !sheetName.trim() ||
                baseViewId == null ||
                busy
              }
              onClick={handleCreate}
            >
              {busy ? "Anlegen…" : "Projekt erstellen"}
            </button>
            <button
              style={{ ...btn, background: "#444" }}
              onClick={() => {
                setCreating(false);
                setErr(null);
                setProjName("");
                setSheetName("");
                setBaseViewId(null);
                setConfirmingId(null);
              }}
            >
              Abbrechen
            </button>
          </>
        )}
      </div>

      {err && <div style={{ color: "#ff8a8a" }}>{err}</div>}

      <div
        style={{
          display: "flex",
          gap: 12,
          flexDirection: "column",
          flexWrap: "nowrap",
          justifyContent: "center",
        }}
      >
        {projects.map((p) => (
          <div
            key={p.id}
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <button
              style={btn}
              onClick={() => openProject(p)}
              disabled={busy}
              title="Projekt öffnen"
            >
              {p.name}
            </button>

            {confirmingId === p.id ? (
              <>
                <button
                  style={{ ...btn, background: "#b00020" }}
                  onClick={() => softDelete(p.id)}
                  disabled={busy}
                  title="Endgültig als gelöscht markieren (Soft-Delete)"
                >
                  Wirklich löschen
                </button>
                <button
                  style={{ ...btn, background: "#444" }}
                  onClick={() => setConfirmingId(null)}
                  disabled={busy}
                >
                  Abbrechen
                </button>
              </>
            ) : (
              <button
                style={{ ...btn, background: "#7a2c2c" }}
                onClick={() => setConfirmingId(p.id)}
                disabled={busy}
                title="Löschen (Soft-Delete) – zweite Bestätigung nötig"
              >
                Löschen
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
