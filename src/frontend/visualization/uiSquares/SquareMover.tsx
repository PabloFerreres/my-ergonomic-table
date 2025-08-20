import MSquareContainer from "../uiSquares/MSquareContainer";
import MSquareButton from "./MSquareButton";

interface SquareMoverProps {
  selectedCell: { row: number; col: number } | null;
  dataLength: number;
  onMoveUp: (rows: number[], col: number) => void;
  onMoveDown: (rows: number[], col: number) => void;
  blocked?: boolean; // neu
}

const SquareMover: React.FC<SquareMoverProps> = ({
  selectedCell,
  dataLength,
  onMoveUp,
  onMoveDown,
  blocked = false, // neu
}) => {
  const row = selectedCell?.row ?? 0;
  const col = selectedCell?.col ?? 0;
  const rows = selectedCell ? [row] : [];

  const disableUp = blocked || rows.length === 0 || rows[0] === 0;
  const disableDown =
    blocked || rows.length === 0 || rows[rows.length - 1] === dataLength - 1;

  return (
    <div title={blocked ? "Bewegen auf diesem Sheet blockiert" : undefined}>
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
            onClick={() => {
              if (!disableUp) onMoveUp(rows, col);
            }}
            disabled={disableUp}
          >
            Move Up
          </MSquareButton>
          <MSquareButton
            onClick={() => {
              if (!disableDown) onMoveDown(rows, col);
            }}
            disabled={disableDown}
          >
            Move Down
          </MSquareButton>
        </div>
      </MSquareContainer>
    </div>
  );
};

export default SquareMover;
