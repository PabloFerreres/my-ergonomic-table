import { useEffect, useState } from "react";
import type { Project } from "./SesionParameters"; // Pfad ggf. anpassen
import config from "../../../config.json";
const API_PREFIX = config.BACKEND_URL;

export default function WelcomeScreen({
  onSelect,
}: {
  onSelect: (proj: Project) => void;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_PREFIX}/api/projects`)
      .then((res) => res.json())
      .then((data) => setProjects(data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ color: "#fff" }}>Lade Projekte…</div>;

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
      }}
    >
      <h1>Welcome!</h1>
      <p>Wähle ein Projekt:</p>
      <div style={{ display: "flex", gap: 20 }}>
        {projects.map((p) => (
          <button
            key={p.id}
            style={{
              padding: "1em 2em",
              fontSize: "1.2em",
              borderRadius: 8,
              border: "none",
              background: "#2170c4",
              color: "#fff",
              cursor: "pointer",
            }}
            onClick={() => onSelect(p)}
          >
            {p.name}
          </button>
        ))}
      </div>
    </div>
  );
}
