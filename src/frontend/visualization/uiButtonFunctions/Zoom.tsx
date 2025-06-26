import { useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import MSquareButton from "../uiSquares/MSquareButton";

type ZoomProps = {
  children: (zoom: number, controls: ReactNode) => ReactNode;
};

const Zoom = ({ children }: ZoomProps) => {
  const [zoom, setZoom] = useState<number>(1.0);
  const MIN_ZOOM = 0.3;
  const MAX_ZOOM = 3.0;
  const STEP = 0.1;

  const handleZoom = useCallback(
    (delta: number) => {
      const newZoom = Math.min(
        MAX_ZOOM,
        Math.max(MIN_ZOOM, +(zoom + delta).toFixed(2))
      );
      setZoom(newZoom);
    },
    [zoom]
  );

  const resetZoom = () => setZoom(1.0);

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const direction = Math.sign(e.deltaY);
        handleZoom(-direction * STEP);
      }
    };

    window.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      window.removeEventListener("wheel", handleWheel);
    };
  }, [handleZoom]);

  const controls = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        backgroundColor: "rgba(0, 0, 0, 0.6)",
        padding: "0.5rem 0.75rem",
        borderRadius: "8px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
      }}
    >
      <MSquareButton onClick={() => handleZoom(-STEP)} width="40px">
        -
      </MSquareButton>
      <MSquareButton onClick={() => handleZoom(STEP)} width="40px">
        +
      </MSquareButton>
      <MSquareButton onClick={resetZoom}>Reset</MSquareButton>
      <span style={{ fontSize: "0.85rem" }}>
        Zoom: {(zoom * 100).toFixed(0)}%
      </span>
    </div>
  );

  return <>{children(zoom, controls)}</>;
};

export default Zoom;
