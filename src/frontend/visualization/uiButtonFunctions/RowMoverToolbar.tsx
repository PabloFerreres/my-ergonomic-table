type Props = {
  selectedRows: number[];
  selectedCell: { row: number; col: number } | null;
  dataLength: number;
  onMoveUp: (rows: number[]) => void;
  onMoveDown: (rows: number[]) => void;
};

export function RowMoverToolbar({
  selectedRows = [],
  selectedCell,
  dataLength,
  onMoveUp,
  onMoveDown,
}: Props) {
  const getRowsToMove = () => {
    if (selectedRows.length > 0) return selectedRows;
    if (selectedCell) return [selectedCell.row];
    return [];
  };
  const rows = getRowsToMove();

  return (
    <div style={{ marginBottom: 12 }}>
      <button
        onClick={() => onMoveUp(rows)}
        disabled={rows.length === 0 || rows[0] === 0}
        style={{ marginRight: 8 }}
      >
        Move Up
      </button>
      <button
        onClick={() => onMoveDown(rows)}
        disabled={rows.length === 0 || rows[rows.length - 1] === dataLength - 1}
      >
        Move Down
      </button>
      {rows.length > 0 && (
        <span style={{ marginLeft: 16 }}>
          Selected row(s): {rows.map((i) => i + 1).join(", ")}
        </span>
      )}
    </div>
  );
}

export default RowMoverToolbar;
