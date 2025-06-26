import { useEffect, useRef } from "react";

type ConsoleLog = {
  text: string;
  time: string;
};

export function ConsolePanel({ logs }: { logs: ConsoleLog[] }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs]);

  return (
    <div
      className="console-scroll"
      style={{
        backgroundColor: "#000",
        color: "#fff",
        borderRadius: "0.5rem",
        padding: "1rem",
        boxShadow: "0 0 10px rgba(255,255,255,0.1)",
        width: "400px",
        height: "90px",
        overflowY: "auto",
        fontFamily: "monospace",
        fontSize: "0.85rem",
      }}
      ref={containerRef}
    >
      <div
        style={{ fontWeight: "bold", marginBottom: "0.5rem", color: "#0f0" }}
      >
        🖥 Console
      </div>
      {logs.map((log, idx) => (
        <div
          key={idx}
          style={{
            whiteSpace: "pre-wrap",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>{"> " + log.text}</span>
          <span style={{ color: "#888" }}>[{log.time}]</span>
        </div>
      ))}
    </div>
  );
}
