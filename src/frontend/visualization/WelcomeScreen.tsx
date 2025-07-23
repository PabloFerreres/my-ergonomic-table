// src/frontend/visualization/WelcomeScreen.tsx
export default function WelcomeScreen({
  onSelect,
}: {
  onSelect: (proj: string) => void;
}) {
  // später dynamisch laden, jetzt einfach statisch
  const projects = ["ProjektA", "ProjektB"];

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
            key={p}
            style={{
              padding: "1em 2em",
              fontSize: "1.2em",
              borderRadius: 8,
              border: "none",
              background: "#2170c4",
              color: "#fff",
            }}
            onClick={() => onSelect(p)}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}
