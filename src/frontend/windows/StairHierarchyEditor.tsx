import { useEffect, useState } from "react";

type TreeNode = {
  id: number;
  name: string;
  sort_order: number;
  children: TreeNode[];
  full_name?: string;
  leaf_id?: number;
};

type Props = {
  projectId: number;
  apiPrefix: string;
};

export default function StairHierarchyEditor({ projectId, apiPrefix }: Props) {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [newName, setNewName] = useState("");

  // Auswahl (ersetzt frühere per-Row-Buttons)
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Rename state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState("");

  // Drag state
  const [draggingId, setDraggingId] = useState<number | null>(null);

  // UI styles (kompakt, minimal angepasst)
  const UI = {
    root: {
      display: "flex",
      flexDirection: "column",
      height: "100%",
      minHeight: 0,
      color: "#fff",
    } as React.CSSProperties,
    header: {
      padding: "0rem 1rem",
      borderBottom: "1px solid #333",
      display: "flex",
      gap: "0.5rem",
      alignItems: "center",
      position: "sticky",
      top: 0,
      background: "transparent",
      zIndex: 1,
    } as React.CSSProperties,
    scroll: {
      flex: 1,
      minHeight: 0,
      overflow: "auto",
      padding: "0rem 0.5rem",
    } as React.CSSProperties,
    footer: {
      padding: "0.5rem 1rem",
      borderTop: "2px solid #333",
      display: "flex",
      gap: "0.5rem",
      alignItems: "center",
    } as React.CSSProperties,
    btn: {
      padding: "0.3rem 0.6rem",
      background: "#444",
      color: "#fff",
      border: "1px solid #888",
      borderRadius: "4px",
      cursor: "pointer",
    } as React.CSSProperties,
    btnDisabled: {
      padding: "0.3rem 0.6rem",
      background: "#333",
      color: "#888",
      border: "1px solid #555",
      borderRadius: "4px",
      cursor: "not-allowed",
    } as React.CSSProperties,
    inlineInput: {
      padding: "0.1rem 0.3rem",
      fontSize: "0.95rem",
    } as React.CSSProperties,
    nameClickable: {
      cursor: "text",
      userSelect: "text",
    } as React.CSSProperties,
    selectBtn: {
      padding: "0.1rem 0.35rem",
      background: "#555",
      color: "#fff",
      border: "1px solid #777",
      borderRadius: "4px",
      cursor: "grab",
      marginRight: "0.4rem",
    } as React.CSSProperties,
    li: (isSelected: boolean) =>
      ({
        padding: "0.15rem 0.25rem",
        borderRadius: "4px",
        background: isSelected ? "rgba(100, 150, 255, 0.15)" : "transparent",
      } as React.CSSProperties),
    num: { opacity: 0.9, marginRight: "0.5rem" } as React.CSSProperties,
  };

  // ---------- Initial Load ----------
  useEffect(() => {
    fetch(`${apiPrefix}/api/stairhierarchy?project_id=${projectId}`)
      .then((r) => r.json())
      .then(setTree);
  }, [projectId, apiPrefix]);

  const reloadTree = async () => {
    const data = await fetch(
      `${apiPrefix}/api/stairhierarchy?project_id=${projectId}`
    ).then((r) => r.json());
    setTree(data);
  };

  // ---------- Helpers ----------
  const findParentId = (
    nodes: TreeNode[],
    targetId: number,
    parentId: number | null = null
  ): number | null => {
    for (const n of nodes) {
      if (n.id === targetId) return parentId;
      const hit = findParentId(n.children || [], targetId, n.id);
      if (hit !== null) return hit;
    }
    return null;
  };

  const collectSiblingsInUiOrder = (
    nodes: TreeNode[],
    parentId: number | null
  ): TreeNode[] => {
    if (parentId === null) {
      return [...nodes].sort(
        (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
      );
    }
    for (const n of nodes) {
      if (n.id === parentId) {
        return [...(n.children || [])].sort(
          (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
        );
      }
      const hit = collectSiblingsInUiOrder(n.children || [], parentId);
      if (hit.length) return hit;
    }
    return [];
  };

  const findNodeNameById = (
    nodes: TreeNode[],
    id: number | null
  ): string | null => {
    if (id === null) return null;
    for (const n of nodes) {
      if (n.id === id) return n.name;
      const hit = findNodeNameById(n.children || [], id);
      if (hit) return hit;
    }
    return null;
  };

  const sendReorder = async (parentId: number | null, orderedIds: number[]) => {
    await fetch(`${apiPrefix}/api/stairhierarchy/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: projectId,
        parent_id: parentId,
        ordered_ids: orderedIds,
      }),
    });
  };

  // ---------- CRUD / Actions ----------
  const handleInsert = async () => {
    if (!newName.trim()) return;

    const res = await fetch(`${apiPrefix}/api/stairhierarchy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName.trim(),
        parent_id: selectedId, // Auswahl = Elternknoten
        project_id: selectedId === null ? projectId : null,
      }),
    });
    if (res.ok) {
      setNewName("");
      await reloadTree();
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Eintrag wirklich löschen?")) return;

    const parentId = findParentId(tree, id);
    const siblingsAfterDelete = collectSiblingsInUiOrder(tree, parentId).filter(
      (n) => n.id !== id
    );
    const orderedIds = siblingsAfterDelete.map((n) => n.id);

    const res = await fetch(`${apiPrefix}/api/stairhierarchy/${id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      await sendReorder(parentId, orderedIds);
      await reloadTree();
      if (selectedId === id) setSelectedId(null);
    }
  };

  const moveNode = async (id: number, direction: -1 | 1) => {
    const parentId = findParentId(tree, id);
    const siblings = collectSiblingsInUiOrder(tree, parentId);

    const idx = siblings.findIndex((s) => s.id === id);
    const newIdx = idx + direction;
    if (idx < 0 || newIdx < 0 || newIdx >= siblings.length) return;

    const reordered = [...siblings];
    [reordered[idx], reordered[newIdx]] = [reordered[newIdx], reordered[idx]];

    await sendReorder(
      parentId,
      reordered.map((n) => n.id)
    );
    await reloadTree();
  };

  // rename flow
  const startRename = (node: TreeNode) => {
    setEditingId(node.id);
    setEditingValue(node.name);
  };

  const submitRename = async () => {
    if (editingId == null) return;
    const label = editingValue.trim();
    if (!label) {
      setEditingId(null);
      return;
    }
    const res = await fetch(`${apiPrefix}/api/stairhierarchy/${editingId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: label }),
    });
    if (res.ok) await reloadTree();
    setEditingId(null);
  };

  // ---------- Drag & Drop (gleicher Parent) ----------
  const onDragStart = (e: React.DragEvent, nodeId: number) => {
    setDraggingId(nodeId);
    e.dataTransfer.setData("text/plain", String(nodeId));
    e.dataTransfer.effectAllowed = "move";
  };

  const onDragOver = (e: React.DragEvent, targetId: number) => {
    if (draggingId == null) return;
    const dragParent = findParentId(tree, draggingId);
    const targetParent = findParentId(tree, targetId);
    if (dragParent === targetParent) {
      e.preventDefault(); // allow drop
      e.dataTransfer.dropEffect = "move";
    }
  };

  const onDrop = async (_e: React.DragEvent, targetId: number) => {
    if (draggingId == null || draggingId === targetId) return;
    const parentId = findParentId(tree, draggingId);
    const targetParent = findParentId(tree, targetId);
    if (parentId !== targetParent) {
      setDraggingId(null);
      return; // nur innerhalb gleicher Ebene
    }

    const siblings = collectSiblingsInUiOrder(tree, parentId);
    const filtered = siblings.filter((s) => s.id !== draggingId);
    const targetIdx = filtered.findIndex((s) => s.id === targetId);
    const insertIdx = Math.max(0, targetIdx);

    const before = filtered.slice(0, insertIdx);
    const after = filtered.slice(insertIdx);
    const reordered = [...before, { id: draggingId } as TreeNode, ...after];

    await sendReorder(
      parentId,
      reordered.map((n) => n.id)
    );
    await reloadTree();
    setDraggingId(null);
  };

  const clearSelection = () => setSelectedId(null);

  // ---------- Tree render with numbering ----------
  const renderTree = (nodes: TreeNode[], prefix = "", level = 0) => {
    if (!Array.isArray(nodes)) return null;

    const sorted = [...nodes].sort(
      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
    );

    return (
      <ul style={{ paddingLeft: level * 20 }}>
        {sorted.map((node, idx) => {
          const num = prefix ? `${prefix}.${idx + 1}` : `${idx + 1}`;
          const isEditing = editingId === node.id;
          const isSelected = selectedId === node.id;
          // Show both full_name and id for leaves
          const isLeaf = !node.children || node.children.length === 0;
          return (
            <li key={node.id} style={UI.li(isSelected)}>
              <button
                draggable
                onDragStart={(e) => onDragStart(e, node.id)}
                onDragOver={(e) => onDragOver(e, node.id)}
                onDrop={(e) => onDrop(e, node.id)}
                onClick={() =>
                  setSelectedId((prev) => (prev === node.id ? null : node.id))
                }
                title="Selektieren (Klick) • Verschieben (Drag & Drop)"
                aria-pressed={isSelected}
                style={{
                  ...UI.selectBtn,
                  outline: isSelected ? "2px solid #7aa2ff" : "none",
                  cursor: "grab",
                }}
              >
                ◧
              </button>

              <span style={UI.num}>{num}</span>

              {isEditing ? (
                <input
                  autoFocus
                  value={editingValue}
                  onChange={(e) => setEditingValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      submitRename();
                    } else if (e.key === "Escape") setEditingId(null);
                  }}
                  onBlur={submitRename}
                  style={UI.inlineInput}
                />
              ) : (
                <span
                  onClick={() => startRename(node)}
                  title="Zum Umbenennen klicken"
                  style={UI.nameClickable}
                >
                  {isLeaf ? (
                    <>
                      {node.name}{" "}
                      <span style={{ opacity: 0.7 }}>[ID: {node.id}]</span>
                    </>
                  ) : (
                    node.name
                  )}
                </span>
              )}

              {node.children &&
                node.children.length > 0 &&
                renderTree(node.children, num, level + 1)}
            </li>
          );
        })}
      </ul>
    );
  };

  const selectedName = findNodeNameById(tree, selectedId);

  return (
    <div style={UI.root}>
      {/* Header mit globalen Aktionen */}
      <div style={UI.header}>
        <h1 style={{ marginRight: "auto" }}>Stair Hierarchy Editor</h1>

        <button
          onClick={clearSelection}
          style={selectedId == null ? UI.btnDisabled : UI.btn}
          disabled={selectedId == null}
          title="Auswahl zurücksetzen"
        >
          Clear
        </button>

        <button
          onClick={() => selectedId != null && moveNode(selectedId, -1)}
          style={selectedId == null ? UI.btnDisabled : UI.btn}
          disabled={selectedId == null}
          title="Ausgewählten Eintrag nach oben"
        >
          ⬆ Move Up
        </button>

        <button
          onClick={() => selectedId != null && moveNode(selectedId, 1)}
          style={selectedId == null ? UI.btnDisabled : UI.btn}
          disabled={selectedId == null}
          title="Ausgewählten Eintrag nach unten"
        >
          ⬇ Move Down
        </button>

        <button
          onClick={() => selectedId != null && handleDelete(selectedId)}
          style={selectedId == null ? UI.btnDisabled : UI.btn}
          disabled={selectedId == null}
          title="Ausgewählten Eintrag löschen"
        >
          🗑 Delete
        </button>
      </div>

      {/* Tree */}
      <div style={UI.scroll}>{renderTree(tree)}</div>

      {/* Footer: Hinzufügen nutzt aktuelle Auswahl als Parent */}
      <div style={UI.footer}>
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleInsert();
            }
          }}
          placeholder={
            selectedId == null
              ? "Neuer Haupteintrag"
              : `Neues Kind von: ${selectedName ?? `ID ${selectedId}`}`
          }
          style={{ flex: 0 }}
        />
        <button
          onClick={handleInsert}
          style={UI.btn}
          title="Eintrag hinzufügen"
        >
          Hinzufügen
        </button>

        {selectedId !== null && (
          <span>
            → als Kind von <strong>{selectedName ?? `ID ${selectedId}`}</strong>
          </span>
        )}
      </div>
    </div>
  );
}
