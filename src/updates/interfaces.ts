export type UpdateItem = {
    id?: string | number;
    orgId: string;
    initiativeId: string;
    userId: string;
    username: string;
    feedType: string;
    updateType: string;
    updateMetadata: string;
    updateText: string;
    updatedAt: string;
    deletedAt: string;
    createdAt: string;
    type: string;
    defaultValue: string | Date;
    feedImages: string;
    updateNotes: string;
    reactions: string;
};
export type UpdateItemWithSilentOption = UpdateItem & {
    silent?: boolean;
};
export type UpdatesAggregatedByTime = {
    thisWeek: UpdateItem[];
    lastWeek: UpdateItem[];
    previous: UpdateItem[];
};
