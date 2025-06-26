import columnStyleMap from "./ColumnStyleMap.json";

export type ColumnTrait = {
    header: string;
    traits: string[]; // e.g. ['header-blue', 'col-readonly']
    editable?: boolean;
    type?: "text" | "dropdown";
};

export const GetColumnTraits =(header:string): ColumnTrait => {
    const traits = Object.entries(columnStyleMap)
    .filter(([,group])=> group.headers.includes(header))
    .map(([trait])=> trait);

    return {
        header,
        traits,
        editable: traits.includes("col-editable"),
        type: traits.includes("col-dropdown")? "dropdown" : "text"
    }

}
