export type RawEvent = {
    orgId?: string;
    context_id?: string;
    description?: string;
    event_name?: string;
    user_id?: string;
    username?: string;
    efective_date?: Date | string;
    id?: string | number;
    relationshipCount?: number;
};

export type GetResponse = {
    metrics: RawEvent[];
};

export type EventItem = {
    orgId?: string;
    context_id: string;
    description?: string;
    event_name: string;
    user_id?: string;
    username: string;
    efective_date: Date;
};
