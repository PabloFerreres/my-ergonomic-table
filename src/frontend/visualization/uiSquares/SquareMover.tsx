import MSquareContainer from "../uiSquares/MSquareContainer";
import MSquareButton from "./MSquareButton";

interface SquareMoverProps {
  selectedCell: { row: number; col: number } | null;
  dataLength: number;
  onMoveUp: (rows: number[], col: number) => void;
  onMoveDown: (rows: number[], col: number) => void;
}

const SquareMover: React.FC<SquareMoverProps> = ({
  selectedCell,
  dataLength,
  onMoveUp,
  onMoveDown,
}) => {
  const row = selectedCell?.row ?? 0;
  const col = selectedCell?.col ?? 0;
  const rows = selectedCell ? [row] : [];

  return (
    <MSquareContainer width="300px">
      <div
        style={{
          height: "30px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {rows.length > 0 ? (
          <span style={{ fontSize: "16px" }}>
            Selected row(s): {rows.map((i) => i + 1).join(", ")}
          </span>
        ) : (
          <span style={{ fontSize: "16px", color: "transparent" }}>
            placeholder
          </span>
        )}
      </div>

      <div
        style={{
          height: "40px",
          display: "flex",
          gap: "8px",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <MSquareButton
          onClick={() => onMoveUp(rows, col)}
          disabled={rows.length === 0 || rows[0] === 0}
        >
          Move Up
        </MSquareButton>
        <MSquareButton
          onClick={() => onMoveDown(rows, col)}
          disabled={
            rows.length === 0 || rows[rows.length - 1] === dataLength - 1
          }
        >
          Move Down
        </MSquareButton>
      </div>
    </MSquareContainer>
  );
};

export default SquareMover;
