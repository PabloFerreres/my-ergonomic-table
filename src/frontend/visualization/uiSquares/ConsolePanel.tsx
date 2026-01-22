import { useEffect, useRef } from "react";

type ConsoleLog = {
  text: string;
  time: string;
};

export function ConsolePanel({ logs }: { logs: ConsoleLog[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null); // ref for scrollable log area

  // Smooth scroll to bottom on new logs
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [logs]);

  // Attach wheel event once for less sensitive manual scrolling
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      el.scrollTop += e.deltaY * 0.1; // even less sensitive, more control
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  return (
    <div
      style={{
        // Removed position, top, right for embedding in a flex row
        width: 340,
        height: "150px", // responsive height
        background: "#222",
        borderRadius: 8,
        boxShadow: "0 2px 12px rgba(0,0,0,0.35)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        border: "1px solid #444",
        marginTop: 0, // ensure flush with parent top
      }}
      ref={containerRef}
    >
      {/* Console Header - fixed */}
      <div
        style={{
          background: "#222", // black
          color: "#4ade80", // green text
          fontWeight: 500,
          fontSize: "1.05em",
          padding: "8px 16px 4px 16px",
          borderTopLeftRadius: 8,
          borderTopRightRadius: 8,
          position: "sticky",
          top: 0,
          zIndex: 2,
          marginBottom: 0,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        Console🖥
        <span style={{ fontSize: "1.1em", marginLeft: 4 }}></span>
      </div>
      {/* Divider */}
      <div style={{ height: 1, background: "#444", margin: "0 12px" }} />
      {/* Console Outputs - scrollable, hide scrollbar */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "8px 16px 4px 16px",
          background: "#222",
          borderBottomLeftRadius: 8,
          borderBottomRightRadius: 8,
          marginBottom: 0,
          scrollbarWidth: "none",
          fontFamily: 'Consolas, "Courier New", monospace', // classic cmd font
        }}
        ref={scrollRef}
      >
        {logs.map((entry, idx) => {
          // Mark entries within 3 seconds of the latest as green, not bold, smaller text
          const latestTime = logs.length > 0 ? logs[logs.length - 1].time : "";
          const latestDate = latestTime
            ? new Date(`1970-01-01T${latestTime}`)
            : null;
          const entryDate = entry.time
            ? new Date(`1970-01-01T${entry.time}`)
            : null;
          let isRecent = false;
          if (latestDate && entryDate) {
            isRecent = latestDate.getTime() - entryDate.getTime() <= 3000;
          }
          return (
            <div key={idx} style={{ marginBottom: "0.5em" }}>
              <div
                style={{
                  color: isRecent ? "#4ade80" : "#f0e9dc",
                  fontWeight: 400,
                  fontSize: "0.92em",
                  whiteSpace: "pre-wrap",
                  textAlign: "left",
                  paddingLeft: 4,
                  fontFamily:
                    'VT323, "Share Tech Mono", "IBM Plex Mono", "Courier", monospace', // more retro font
                  letterSpacing: 1,
                }}
              >
                {`> ${entry.text} `}
                <span style={{ color: "#888" }}>{`[${entry.time}]`}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
