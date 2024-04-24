import { DateTime } from 'luxon';
import { ExtendedStateItem, StateItem } from '../workitem/interfaces';

export interface WorkItemGroup {
    groupName: string;
    workItems: StateItem[];
}
export type WorkItemGroups = WorkItemGroup[];

export interface ExtendedItemGroup {
    groupName: string;
    workItems: ExtendedStateItem[];
}
export type ExtendedItemGroups = ExtendedItemGroup[];


export type Sprint = {
    /** ID Generated by the database. Unique identifer of a sprint */
    id: string;
    orgId: string;
    sprintId: string;
    datasourceId: string;
    name: string;
    flomatikaCreatedDate: DateTime;
};