import React, { useState } from "react";

type SheetCreateMenuProps = {
  open: boolean;
  baseViews: { id: number; name: string }[];
  onCreate: (newTableName: string, baseViewId: string) => void;
  onClose: () => void;
};

const SheetCreateMenu: React.FC<SheetCreateMenuProps> = ({
  open,
  baseViews,
  onCreate,
  onClose,
}) => {
  const [newTableName, setNewTableName] = useState("");
  const [baseViewId, setBaseViewId] = useState("");

  if (!open) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: "2.5rem",
        left: 0,
        background: "#333",
        color: "#fff",
        borderRadius: "8px",
        boxShadow: "0 4px 16px #0008",
        padding: "1rem",
        zIndex: 100,
        minWidth: "260px",
      }}
    >
      {/* Zeile 1 */}
      <div style={{ marginBottom: "0.7rem" }}>
        <label style={{ fontWeight: 500, marginRight: "0.5em" }}>
          new_table_name:
        </label>
        <input
          type="text"
          value={newTableName}
          onChange={(e) => setNewTableName(e.target.value)}
          style={{
            padding: "0.2rem 0.4rem",
            borderRadius: "4px",
            border: "1px solid #aaa",
            background: "#222",
            color: "#fff",
            width: "120px",
          }}
          autoFocus
        />
      </div>
      {/* Zeile 2 */}
      <div style={{ marginBottom: "0.7rem" }}>
        <label style={{ fontWeight: 500, marginRight: "0.5em" }}>
          base_view_id:
        </label>
        <select
          value={baseViewId}
          onChange={(e) => setBaseViewId(e.target.value)}
          style={{
            padding: "0.2rem 0.4rem",
            borderRadius: "4px",
            border: "1px solid #aaa",
            background: "#222",
            color: "#fff",
          }}
        >
          <option value="">Bitte wählen…</option>
          {baseViews.map((view) => (
            <option key={view.id} value={view.id}>
              {view.name}
            </option>
          ))}
        </select>
      </div>
      {/* Zeile 3 */}
      <div
        style={{ display: "flex", gap: "0.7rem", justifyContent: "flex-end" }}
      >
        <button
          style={{
            padding: "0.35rem 1.1rem",
            background: "#29874a",
            color: "#fff",
            border: "none",
            borderRadius: "4px",
            fontWeight: 600,
            cursor: "pointer",
          }}
          onClick={() => {
            onCreate(newTableName, baseViewId);
            setNewTableName("");
            setBaseViewId("");
          }}
          disabled={!newTableName || !baseViewId}
        >
          Sheet herstellen
        </button>
        <button
          style={{
            padding: "0.35rem 1.1rem",
            background: "#888",
            color: "#fff",
            border: "none",
            borderRadius: "4px",
            fontWeight: 600,
            cursor: "pointer",
          }}
          onClick={() => {
            setNewTableName("");
            setBaseViewId("");
            onClose();
          }}
        >
          Abbrechen
        </button>
      </div>
    </div>
  );
};

export default SheetCreateMenu;
