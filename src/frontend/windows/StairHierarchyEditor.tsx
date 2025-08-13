import { useEffect, useState } from "react";

type TreeNode = {
  id: number;
  name: string;
  sort_order: number;
  children: TreeNode[];
};

type Props = {
  projectId: number;
  apiPrefix: string;
};

export default function StairHierarchyEditor({ projectId, apiPrefix }: Props) {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [newName, setNewName] = useState("");
  const [selectedParentId, setSelectedParentId] = useState<number | null>(null);

  // Rename state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState("");

  // UI styles (compact)
  const UI = {
    root: {
      display: "flex",
      flexDirection: "column",
      height: "100%",
      minHeight: 0,
      color: "#fff",
    } as React.CSSProperties,
    header: {
      padding: "0rem",
      borderBottom: "1px solid #333",
    } as React.CSSProperties,
    scroll: {
      flex: 1,
      minHeight: 0,
      overflow: "auto",
      padding: "0rem",
    } as React.CSSProperties,
    footer: {
      padding: "0rem 1rem",
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
    inlineInput: {
      padding: "0.1rem 0.3rem",
      fontSize: "0.95rem",
    } as React.CSSProperties,
    nameClickable: {
      cursor: "text",
      userSelect: "text",
    } as React.CSSProperties,
  };

  // initial load
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

  // -------- Helpers --------
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

  // -------- CRUD / actions --------
  const handleInsert = async () => {
    if (!newName.trim()) return;

    const res = await fetch(`${apiPrefix}/api/stairhierarchy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName.trim(),
        parent_id: selectedParentId,
        project_id: selectedParentId === null ? projectId : null,
      }),
    });
    if (res.ok) {
      setNewName("");
      // keep selectedParentId
      await reloadTree();
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Eintrag wirklich löschen?")) return;

    // capture UI order before delete
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
      if (selectedParentId === id) setSelectedParentId(null);
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

  // -------- Tree render with numbering --------
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

          return (
            <li key={node.id}>
              <button onClick={() => setSelectedParentId(node.id)}>+</button>{" "}
              <button
                onClick={() => moveNode(node.id, -1)}
                style={{ marginLeft: "0.2rem" }}
              >
                ⬆
              </button>
              <button
                onClick={() => moveNode(node.id, 1)}
                style={{ marginLeft: "0.2rem" }}
              >
                ⬇
              </button>
              <button
                onClick={() => handleDelete(node.id)}
                style={{
                  color: "black",
                  marginLeft: "0.5rem",
                  marginRight: "0.5rem",
                }}
              >
                -
              </button>
              <span style={{ opacity: 0.9, marginRight: "0.5rem" }}>{num}</span>
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
                  {node.name}
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

  const selectedParentName = findNodeNameById(tree, selectedParentId);

  return (
    <div style={UI.root}>
      {/* Header (sticky) */}
      <div style={UI.header}>
        <h1>Stair Hierarchy Editor</h1>
        <button onClick={() => setSelectedParentId(null)} style={UI.btn}>
          🆕 Neuer Haupteintrag
        </button>
      </div>

      {/* Only the tree scrolls */}
      <div style={UI.scroll}>{renderTree(tree)}</div>

      {/* Footer (sticky) */}
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
          placeholder="Neues Element"
          style={{ flex: 0 }}
        />
        <button onClick={handleInsert} style={UI.btn}>
          Hinzufügen
        </button>

        {selectedParentId !== null && (
          <span>
            → als Kind von{" "}
            <strong>{selectedParentName ?? `ID ${selectedParentId}`}</strong>
          </span>
        )}
      </div>
    </div>
  );
}
