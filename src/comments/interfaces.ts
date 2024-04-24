export type RawComment = {
    orgId?: string;
    context_id: string;
    comment?: string;
    title?: string;
    user_id: string;
    username: string;
    effective_date: Date | string;
    id?: string | number;
    parentId?: number;
    replies?: any[];
    relationshipCount?: number;
};

export type GetResponse = {
    metrics: RawComment[];
};

export type CommentItem = {
    orgId?: string;
    context_id: string;
    comment?: string;
    title: string;
    user_id?: string;
    username: string;
    effective_date: Date;
    context: string;
    parentId: number;
};
