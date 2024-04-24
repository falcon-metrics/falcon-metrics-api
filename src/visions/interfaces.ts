export type StrategicDriver = {
    relationshipCount?: number;
    description: string;
    name: string;
    id: string | number;
    colour: string;
    icon_name: string;
    vision_id: number;
    org_id: string;
    uuid?: string;
    oneLineSummary?: string;
    strategy?: any;
};

export type VisionItem = {
    id?: number | string;
    visionStatement: string;
    missionStatement: string;
    orgId: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    deletedAt?: Date | string;
    strategicDrivers: StrategicDriver[];
    parentStrategicDriverId?: string;
    horizons: any[];
};

export type TimeHorizon = {
    id: string;
    startDate: string | Date;
    endDate: string | Date;
    title: string;
    orgId: string;
    visionId: string | number;
    contextId?: string | number;
    uuid?: string;
    updatedAt?: string;
    deletedAt?: string;
    createdAt?: string;
};
