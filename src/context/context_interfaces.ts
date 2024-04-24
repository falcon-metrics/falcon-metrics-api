export enum ContextLevel {
    Portfolio = 1,
    Initiative = 2,
    Team = 3,
}

export type ContextItem = {
    id?: string;
    name?: string;
    level?: ContextLevel;
    positionInHierarchy?: string;
    rollingWindowPeriodInDays?: number;
    datasourceId?: string;
    contextAddress?: string;
    obeyaId?: string;
    cost?: number;
    projectId?: string;
};

export interface IContext {
    getAllExceptArchived(orgId: string): Promise<Array<ContextItem>>;
    get(orgId: string, id: string): Promise<ContextItem>;
    getContextBranch(orgId: string, id: string): Promise<Array<ContextItem>>;
    getWorkItemKeysForContextBranch(
        orgId: string,
        id: string,
    ): Promise<Array<string>>;
}
