import columnStyleMap from "./ColumnStyleMap.json";

export type ColumnTrait = {
    header: string;
    traits: string[]; // e.g. ['header-blue', 'col-readonly']
    editable?: boolean;
    type?: "text" | "dropdown" | "numeric";
};

export const GetColumnTraits = (header: string): ColumnTrait => {
    const traits = Object.entries(columnStyleMap)
        .filter(([, group]) => group.headers.includes(header))
        .map(([trait]) => trait);

    // → Typen entscheiden: Nur "EMSR No." ist numeric
    let type: "text" | "dropdown" | "numeric" = "text";
    if (header === "EMSR No.") type = "numeric";
    if (traits.includes("col-dropdown")) type = "dropdown";

    return {
        header,
        traits,
        editable: traits.includes("col-editable"),
        type,
    };
};
