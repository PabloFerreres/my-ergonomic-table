import { useEffect, useRef, useState } from "react";

type ConsoleLog = {
  text: string;
  time: string;
};

export function ConsolePanel({ logs }: { logs: ConsoleLog[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null); // ref for scrollable log area
  const [animatedLines, setAnimatedLines] = useState<string[]>([]);
  const [animating, setAnimating] = useState(false);

  // Animate only new log lines (not previously shown)
  useEffect(() => {
    if (!logs.length) return;
    if (animating) return;
    setAnimating(true);
    // Find how many lines are already in animatedLines and fully shown
    let prevCount = 0;
    for (let i = 0; i < animatedLines.length; i++) {
      if (animatedLines[i] === `> ${logs[i]?.text} [${logs[i]?.time}]`) {
        prevCount++;
      } else {
        break;
      }
    }
    let i = prevCount;
    let j = 0;
    // Fill previous lines instantly
    let newLines = logs
      .slice(0, prevCount)
      .map((l) => `> ${l.text} [${l.time}]`);
    // Fill animated lines with empty string initially
    for (let k = prevCount; k < logs.length; k++) newLines.push("");
    function animateLine() {
      if (i >= logs.length) {
        setAnimating(false);
        return;
      }
      const fullLine = `> ${logs[i].text} [${logs[i].time}]`;
      if (!newLines[i]) newLines[i] = "";
      if (j <= fullLine.length) {
        newLines[i] = fullLine.slice(0, j);
        setAnimatedLines([...newLines]);
        j++;
        setTimeout(animateLine, 12); // speed: 12ms per char (adjust as needed)
      } else {
        i++;
        j = 0;
        animateLine();
      }
    }
    animateLine();
    // eslint-disable-next-line
  }, [logs]);

  // Smooth scroll to bottom on new logs
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [animatedLines]);

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
        {animatedLines.map((line, idx) => (
          <div key={idx} style={{ marginBottom: "0.5em" }}>
            <div
              style={{
                color: "#f0e9dc",
                fontWeight: 400,
                fontSize: "0.92em",
                whiteSpace: "pre-wrap",
                textAlign: "left",
                paddingLeft: 4,
                fontFamily:
                  'VT323, "Share Tech Mono", "IBM Plex Mono", "Courier", monospace',
                letterSpacing: 1,
              }}
            >
              {line}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
