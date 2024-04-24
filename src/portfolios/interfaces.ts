export type RawColumn = {
    id?: string | number;
    orgId?: string;
    contextId: string;
    columnId: string;
    colour?: string;
    columnName: string;
    order?: number;
};

export type GetResponse = {
    columns: RawColumn[];
};

export type ColumnItem = {
    orgId?: string;
    contextId: string;
    colour?: string;
    columnId: string;
    columnName: string;
    order?: number;
};
