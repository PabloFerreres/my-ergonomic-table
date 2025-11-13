export type ColumnTrait = {
    header: string;
    color?: string; // hex color from backend
    editable?: boolean;
    type?: "text" | "dropdown" | "numeric";
};

let headerColorMap: Record<string, string> | null = null;

export async function fetchHeaderColorMap(): Promise<Record<string, string>> {
    if (headerColorMap !== null) return headerColorMap;
    const resp = await fetch("/api/column-header-colors");
    if (!resp.ok) throw new Error("Failed to fetch header color map");
    const data = await resp.json();
    headerColorMap = data && typeof data === 'object' ? data : {};
    return headerColorMap;
}

export const GetColumnTraits = async (header: string): Promise<ColumnTrait> => {
    const colorMap = await fetchHeaderColorMap();
    // Type logic (keep as before)
    let type: "text" | "dropdown" | "numeric" = "text";
    if (header === "EMSR No.") type = "numeric";
    // TODO: Add dropdown detection if needed (from backend or a static list)
    return {
        header,
        color: colorMap[header],
        type,
    };
};
