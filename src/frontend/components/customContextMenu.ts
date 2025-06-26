
type CustomMenuCallback = (
  _key: string,
  _selection: unknown,
  _event: unknown
) => void;

type CustomMenuItem = {
  key: string;
  name: string;
  callback: CustomMenuCallback;
};

// This is the correct type!
export const customContextMenu: (CustomMenuItem | string)[] = [
  {
    key: "insert_blank_row_above",
    name: "Insert Blank Row Above",
    callback: (_key, _selection, _event) => {
      alert("Insert Blank Row Above (not yet implemented)");
    },
  },
  {
    key: "insert_blank_row_below",
    name: "Insert Blank Row Below",
    callback: (_key, _selection, _event) => {
      alert("Insert Blank Row Below (not yet implemented)");
    },
  },
  {
    key: "insert_duplicate_below",
    name: "Insert Duplicate Below",
    callback: (_key, _selection, _event) => {
      alert("Insert Duplicate Below (not yet implemented)");
    },
  },
  "---------",
  "Copy",
  "Cut",
  "Paste",
];