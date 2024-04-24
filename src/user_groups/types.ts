import { DateTime } from "luxon";

export type UserGroup = {
    name: string;
    orgId: string;
    description?: string;
    id: string;
    createdAt: DateTime;
    createdBy: string;
    userCount?: number;
};

export type GroupUser = {
    orgId: string;
    userId: string;
    addedAt: DateTime;
    addedBy: string;
    groupId: string;
};


interface Identity {
    connection: string;
    user_id: string;
    provider: string;
    isSocial: boolean;
}

interface AppMetadata {
    user_organisation?: string;
    roles?: string[];
}

interface UserMetadata {
}

export interface UserProfile {
    blocked: boolean;
    created_at: string;
    email: string;
    email_verified: boolean;
    identities: Identity[];
    name: string;
    nickname: string;
    picture: string;
    updated_at: string;
    user_id: string;
    user_metadata: UserMetadata;
    last_password_reset: string;
    app_metadata: AppMetadata;
}