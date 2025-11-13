import columnStyleMap from "./ColumnStyleMap.json";

export type ColumnTrait = {
    header: string;
    color?: string; // hex color from static map
    colorName?: string; // color class name from static map
    editable?: boolean;
    type?: "text" | "dropdown" | "numeric";
};

type StyleMapEntry = {
    color: string;
    headers: string[];
    used_for?: string[];
};

const styleMap = columnStyleMap as Record<string, StyleMapEntry>;

export const GetColumnTraits = (header: string): ColumnTrait => {
    let color: string | undefined = undefined;
    let colorName: string | undefined = undefined;
    for (const [className, entry] of Object.entries(styleMap)) {
        if (entry.headers && entry.headers.includes(header)) {
            color = entry.color;
            colorName = className;
            break;
        }
    }
    let type: "text" | "dropdown" | "numeric" = "text";
    if (header === "EMSR No.") type = "numeric";
    return {
        header,
        color,
        colorName,
        type,
    };
};
