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

  useEffect(() => {
    fetch(`${apiPrefix}/api/stairhierarchy?project_id=${projectId}`)
      .then((res) => res.json())
      .then(setTree)
      .catch((err) => console.error("❌ Hierarchy fetch failed", err));
  }, [projectId, apiPrefix]);

  const reloadTree = async () => {
    const updated = await fetch(
      `${apiPrefix}/api/stairhierarchy?project_id=${projectId}`
    ).then((r) => r.json());
    setTree(updated);
  };

  const findSiblings = (
    nodes: TreeNode[],
    parentId: number | null
  ): TreeNode[] => {
    if (parentId === null) return nodes;
    for (const node of nodes) {
      if (node.id === parentId) return node.children || [];
      const result = findSiblings(node.children || [], parentId);
      if (result.length > 0) return result;
    }
    return [];
  };

  const handleInsert = async () => {
    if (!newName) return;

    const siblings = findSiblings(tree, selectedParentId);
    const nextSortOrder =
      Math.max(0, ...siblings.map((n) => n.sort_order || 0)) + 1;

    const body = {
      name: newName,
      parent_id: selectedParentId,
      project_id: selectedParentId === null ? projectId : null,
      sort_order: nextSortOrder,
    };

    const res = await fetch(`${apiPrefix}/api/stairhierarchy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      setNewName("");
      setSelectedParentId(null);
      await reloadTree();
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Eintrag wirklich löschen?")) return;
    const res = await fetch(`${apiPrefix}/api/stairhierarchy/${id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      await reloadTree();
      setSelectedParentId(null);
    }
  };

  const moveNode = async (id: number, direction: -1 | 1) => {
    const res = await fetch(`${apiPrefix}/api/stairhierarchy/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, direction }),
    });
    if (res.ok) {
      await reloadTree();
    }
  };

  const renderTree = (nodes: TreeNode[], level = 0) => {
    if (!Array.isArray(nodes)) return null;

    return (
      <ul style={{ paddingLeft: level * 20 }}>
        {[...nodes]
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          .map((node) => (
            <li key={node.id}>
              <button onClick={() => setSelectedParentId(node.id)}>➕</button>{" "}
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
                  color: "red",
                  marginLeft: "0.5rem",
                  marginRight: "0.5rem",
                }}
              >
                🗑️
              </button>
              {node.name}
              {node.children && renderTree(node.children, level + 1)}
            </li>
          ))}
      </ul>
    );
  };

  return (
    <div style={{ padding: "1rem", color: "#fff" }}>
      <h3>Stair Hierarchy Editor</h3>

      <button
        onClick={() => setSelectedParentId(null)}
        style={{
          marginBottom: "1rem",
          padding: "0.3rem 0.6rem",
          background: "#444",
          color: "#fff",
          border: "1px solid #888",
          borderRadius: "4px",
          cursor: "pointer",
        }}
      >
        🆕 Neuer Haupteintrag
      </button>

      {renderTree(tree)}

      <div style={{ marginTop: "1rem" }}>
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Neues Element"
        />
        <button onClick={handleInsert}>Hinzufügen</button>
        {selectedParentId !== null && (
          <span> → als Kind von ID {selectedParentId}</span>
        )}
      </div>
    </div>
  );
}
