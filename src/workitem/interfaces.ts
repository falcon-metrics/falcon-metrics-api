import { DateTime } from 'luxon';

import { CustomFieldValue } from '../models/CustomFieldModel';

export type ObeyaContextItem = {
    workItemId: string;
    positionInHierarchy: string;
    contextId: string;
    name?: string;
};

export type ParentWorkItem = {
    title?: string;
    workitemId?: string;
    flomatikaWorkItemTypeName?: string;
};

export type FlowEfficiencyAverageItem = {
    normalisedDisplayName: string;
    flomatikaWorkItemTypeName: string;
    stateType: string;
    daysInState: number;
    workItemId?: string;
};

export type DemandVsCapacityItem = {
    flomatikaWorkItemTypeName: string;
    stateCount: number;
    workflowEvent: string;
};

export type CommitmentRate = {
    flomatikaWorkItemTypeName: string;
    stateCount: number;
    countType: string;
};

export type TimeToCommit = {
    flomatikaWorkItemTypeName: string;
    arrivalDate: Date;
    commitmentDate: Date;
};

export type KeySourceOfDelayItem = {
    flomatikaWorkItemTypeName: string;
    state: string;
    delay: number;
};

export type CommonItem = {
    flomatikaWorkItemTypeId?: string;
    flomatikaWorkItemTypeName?: string;
    flomatikaWorkItemTypeLevel?: string;
    workItemId?: string;
    title?: string;
    workItemType?: string;
    state?: string;
    stateCategory?: string;
    stateType?: string;
    stateOrder?: string;

    assignedTo?: string;
    changedDate?: string;

    resolution?: string;
};

export type LinkedItem = { type: string; workItemId: string; };

export type StateItem = CommonItem & {
    flomatikaWorkItemTypeServiceLevelExpectationInDays?: number;

    arrivalDate?: string;
    arrivalDateTime?: DateTime;
    workItemType?: string;
    commitmentDate?: string;
    commitmentDateTime?: DateTime;

    departureDate?: string;
    departureDateTime?: DateTime;

    parentId?: string;

    leadTimeInWholeDays?: number;
    wipAgeInWholeDays?: number;
    inventoryAgeInWholeDays?: number;

    classOfServiceId?: string;
    natureOfWorkId?: string;
    valueAreaId?: string;

    normalisedDisplayName?: string;
    customFields?: CustomFieldValue[];
    projectId?: string;
    datasourceId?: string;
    linkedItems?: LinkedItem[];

    // roadmap fields
    targetStart?: string;
    targetStartDateTime?: DateTime;
    targetEnd?: string;
    targetEndDateTime?: DateTime;
    baselines?: JSON;
    dependencies?: JSON;
};

export type ExtendedStateItem = StateItem & {
    isBlocked?: boolean;
    isStale?: boolean;
    isDelayed?: boolean;
    isAboveSle?: boolean;
    isAboveSleByWipAge?: boolean;
    isExpedited?: boolean;
    isUnassigned?: boolean;
    isDiscardedAfter?: boolean;
    isDiscardedBefore?: boolean;
    activeTime?: number;
    flowEfficiency?: number;
    waitingTime?: number;
    flomatikaWorkItemTypeLevel?: string;
    stepCategory?: string;
    flagged?: boolean;

    leadTime85thPercentile?: number;
};

export function convertDbModelToStateItem(
    dbState: any,
    displayName?: string,
    timezone?: string,
): StateItem {
    const stateItem: StateItem = {
        flomatikaWorkItemTypeId: dbState.flomatikaWorkItemTypeId,
        flomatikaWorkItemTypeName: dbState.flomatikaWorkItemTypeName,
        flomatikaWorkItemTypeLevel: dbState.flomatikaWorkItemTypeLevel,
        workItemId: dbState.workItemId,
        title: dbState.title,
        workItemType: dbState.workItemType,
        state: dbState.state,
        stateCategory: dbState.stateCategory,
        stateType: dbState.stateType,
        stateOrder: dbState.stateOrder,

        assignedTo: dbState.assignedTo,
        changedDate: dateToString(dbState.changedDate, timezone)?.toISO(),
        flomatikaWorkItemTypeServiceLevelExpectationInDays:
            dbState.flomatikaWorkItemTypeServiceLevelExpectationInDays,

        arrivalDate: dateToString(dbState.arrivalDate, timezone)?.toISO(),
        arrivalDateTime: dateToString(dbState.arrivalDate, timezone),

        commitmentDate: dateToString(dbState.commitmentDate, timezone)?.toISO(),
        commitmentDateTime: dateToString(dbState.commitmentDate, timezone),

        departureDate: dateToString(dbState.departureDate, timezone)?.toISO(),
        departureDateTime: dateToString(dbState.departureDate, timezone),

        leadTimeInWholeDays: dbState.leadTimeInWholeDays,
        wipAgeInWholeDays: dbState.wipAgeInWholeDays,
        inventoryAgeInWholeDays: dbState.inventoryAgeInWholeDays,

        parentId: dbState.parentId,

        classOfServiceId: dbState.classOfServiceId,
        natureOfWorkId: dbState.natureOfWorkId,
        valueAreaId: dbState.valueAreaId,

        normalisedDisplayName: displayName,
        customFields: dbState.customFields,
        linkedItems: dbState.linkedItems,
        projectId: dbState.projectId,

        targetStart: dbState.targetStart,
        targetStartDateTime: dateToString(dbState.targetStart, timezone),
        targetEnd: dbState.targetEnd,
        targetEndDateTime: dateToString(dbState.targetEnd, timezone),
        baselines: dbState.baselines,
        dependencies: dbState.dependencies,
    };
    if (dbState.sortKey) {
        stateItem.datasourceId = dbState.sortKey.split('#')[0];
    }

    return stateItem;
}

/**
 * Not all queries are using cache. The row from cache has 
 * the date as a string. 
 * 
 * But when fetched without the cacher, the date is an object
 */
const dateToString = (d: string | Date, zone?: string) => {
    if (typeof d === 'string') {
        return DateTime.fromISO(d, { zone });
    } else if (typeof d === 'object') {
        return DateTime.fromJSDate(d, { zone });
    }
};

export function convertDbResultToExtendedStateItem(
    dbState: any,
    displayName?: string,
    timezone?: string,
): ExtendedStateItem {
    const stateItem: ExtendedStateItem = {
        flomatikaWorkItemTypeId: dbState?.flomatikaWorkItemTypeId,
        flomatikaWorkItemTypeName: dbState.flomatikaWorkItemTypeName,
        flomatikaWorkItemTypeLevel: dbState.flomatikaWorkItemTypeLevel,
        workItemId: dbState.workItemId,
        title: dbState.title,
        workItemType: dbState.workItemType,
        state: dbState.state,
        stateCategory: dbState.stateCategory,
        stateType: dbState.stateType,
        stateOrder: dbState.stateOrder,

        assignedTo: dbState.assignedTo,
        changedDate: dateToString(dbState.changedDate, timezone)?.toISO(),
        flomatikaWorkItemTypeServiceLevelExpectationInDays:
            dbState.flomatikaWorkItemTypeServiceLevelExpectationInDays,

        arrivalDate: dateToString(dbState.arrivalDate, timezone)?.toISO(),
        arrivalDateTime: dateToString(dbState.arrivalDate, timezone),

        commitmentDate: dateToString(dbState.commitmentDate, timezone)?.toISO(),
        commitmentDateTime: dateToString(dbState.commitmentDate, timezone),

        departureDate: dateToString(dbState.departureDate, timezone)?.toISO(),
        departureDateTime: dateToString(dbState.departureDate, timezone),

        leadTimeInWholeDays: dbState.leadTimeInWholeDays,
        wipAgeInWholeDays: dbState.wipAgeInWholeDays,
        inventoryAgeInWholeDays: dbState.inventoryAgeInWholeDays,

        parentId: dbState.parentId,

        classOfServiceId: dbState.classOfServiceId,
        natureOfWorkId: dbState.natureOfWorkId,
        valueAreaId: dbState.valueAreaId,

        normalisedDisplayName: displayName,
        customFields: dbState.customFields,
        linkedItems: dbState.linkedItems,
        projectId: dbState.projectId,

        isBlocked: dbState.isBlocked,
        isStale: dbState.isStale,
        isDelayed: dbState.isDelayed,
        isAboveSle: dbState.isAboveSle,
        isAboveSleByWipAge: dbState.isAboveSleByWipAge,
        isExpedited: dbState.isExpedited,
        isUnassigned: dbState.isUnassigned,
        activeTime: dbState.activeTime,
        flowEfficiency: dbState.flowEfficiency,
        waitingTime: dbState.waitingTime,

        flagged: dbState.flagged,

        stepCategory: dbState.stepCategory,
        targetStart: dbState.targetStart,
        targetStartDateTime: dateToString(dbState.targetStart, timezone),
        targetEnd: dbState.targetEnd,
        targetEndDateTime: dateToString(dbState.targetEnd, timezone),
        baselines: dbState.baselines,
        dependencies: dbState.dependencies,
    };
    if (dbState.sortKey) {
        stateItem.datasourceId = dbState.sortKey.split('#')[0];
    }

    return stateItem;
}

export function convertDbResultToSnapshotItem(
    dbState: any,
    timezone?: string,
): SnapshotItem {
    const stateItem: SnapshotItem = {
        flomatikaWorkItemTypeId: dbState?.flomatikaWorkItemTypeId,
        flomatikaWorkItemTypeName: dbState.flomatikaWorkItemTypeName,
        flomatikaWorkItemTypeLevel: dbState.flomatikaWorkItemTypeLevel,
        workItemId: dbState.workItemId,
        title: dbState.title,
        workItemType: dbState.workItemType,
        state: dbState.state,
        stateCategory: dbState.stateCategory,
        stateType: dbState.stateType,
        stateOrder: dbState.stateOrder,

        assignedTo: dbState.assignedTo,
        changedDate: dateToString(dbState.changedDate, timezone)?.toISO(),
        flomatikaSnapshotDate: dbState.flomatikaSnapshotDate,
        isFiller: dbState.isFiller,
        resolution: dbState.resolution,
        revision: dbState.revision
    };

    return stateItem;
}
export type SnapshotItem = CommonItem & {
    flomatikaSnapshotDate?: Date;
    revision?: number;
    isFiller?: boolean;
};

//TODO: can remove this type because it's the same as FlowEfficiencyAnalysis
export type EfficiencyItem = {
    valueAddingTimeInDays?: number;
    waitingTimeDays?: number;
};
//TODO: stop creating tasks for imaginary people

export type WorkItemStatesItem = {
    parentId?: string;
    numberOfItemsCompleted: number;
    numberOfItemsInProgress: number;
    numberOfItemsProposed: number;
};

export type StateCategoryGroup = {
    count: number;
    itemTypeName: string;
    flomatikaSnapshotDate: string;
};

export type DefaultBoardItem = {
    [x: string]: any;
    count: string;
    stateCategory: string;
    boardName: string;
    contextId: string;
};

export type ProgressPeopleItem = {
    [x: string]: any;
    count: string;
    stateCategory: string;
    asssignedTo: string;
};

export type StaledDefaultItem = {
    flomatikaWorkItemTypeName: string;
    count: number;
    type: string;
};

export type StateNumberRecord = {
    [state: string]: number;
};

export enum RetrievalScenario {
    CURRENT_COMPLETED_ONLY,
    WAS_COMPLETED_BETWEEN_DATES,
    BECAME_COMPLETED_BETWEEN_DATES,
    CURRENT_WIP_ONLY,
    WAS_WIP_BETWEEN_DATES,
    BECAME_WIP_BETWEEN_DATES,
    CURRENT_INVENTORY_ONLY,
    WAS_INVENTORY_BETWEEN_DATES,
    BECAME_INVENTORY_BETWEEN_DATES,
}

export type TreatedSnapshotItem = {
    workItemId: string;
    flomatikaSnapshotDate: DateTime;

    // We use js Date object to avoid having to dynamically handle dates because
    //   the snapshots table is usually too big so you should only interpret the dates
    //   that you know you will need.
    // If you need to compare dates prefer Date.getTime and luxon.DateTime.toMillis
    createdAt?: Date;
    updatedAt?: Date;
    changedDate?: Date;
    flomatikaCreatedBy?: string;
    flomatikaCreatedDate?: Date;
    flomatikaWorkItemTypeId?: string;
    flomatikaWorkItemTypeLevel?: string;
    flomatikaWorkItemTypeName?: string;
    gs2PartitionKey?: string;
    gs2SortKey?: string;
    isFiller?: boolean;
    partitionKey?: string;
    revision?: number;
    sortKey?: string;
    state?: string;
    stateCategory?: string;
    stateOrder?: string;
    stateType?: string;
    title?: string;
    workItemType?: string;
    assignedTo?: string;
    flomatikaWorkItemTypeServiceLevelExpectationInDays?: number;
    classOfServiceId?: string;
    natureOfWorkId?: string;
    valueAreaId?: string;
    projectId?: string;
    isDelayed?: boolean;
    flagged?: boolean;
    stepCategory?: string;
    resolution?: string;
};