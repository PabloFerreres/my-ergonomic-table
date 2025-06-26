import { getEdits } from "../editierung/EditMap";
import { buildVisualPositionMap } from "./BuildVisualPositionMap";
import type { HotTableClass } from "@handsontable/react";


export function buildFullPayload(
  sheetNames: string[],
  sheets: Record<string, { headers: string[]; data: (string | number)[][] }>,
  activeSheet: string,
  hotRef: React.RefObject<HotTableClass | null> | null
) {
  const edits = sheetNames.flatMap((sheet) => getEdits(sheet));

  const positions = sheetNames
    .map((name) => {
      if (name !== activeSheet) return null;
      return buildVisualPositionMap(
        name,
        hotRef?.current ?? null,
        sheets[name]?.headers ?? [],
        sheets[name]?.data ?? []
      );
    })
    .filter((e): e is NonNullable<typeof e> => !!e);

  return { edits, positions };
}
