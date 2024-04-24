import { IQueryFilters } from '../common/filters_v2';
import { PerspectiveKey } from '../common/perspectives';
import { SecurityContext } from '../common/security';
import { IState } from '../workitem/state_aurora';
import { Calculations as FlowItemsCalculations } from '../value_stream_management/delivery_management/flow_items/calculations';
import { DateTime } from 'luxon';
import _ from 'lodash';
import { ISnapshot } from '../workitem/snapshot_db';

type SnapshotItem = {
    id: number;
    workItemId: string;
    state: string;
    stateType: string;
    flomatikaSnapshotDate: Date;
    assignee: string;
    type: string;
};
type StateTransitions = {
    id: number;
    workItemId: string;
    fromState: string;
    fromStateType: string;
    toState: string;
    toStateType: string;
    fromTimeInState: string;
    toTimeInState: string;
    fromTimeStamp: string;
    toTimeStamp: string;
};
type AssigneeTransitions = {
    id: number;
    workItemId: string;
    fromAssignee: string;
    toAssignee: string;
    fromTimeInState: string;
    toTimeInState: string;
    fromTimeStamp: string;
    toTimeStamp: string;
};

type SnapshotItemWithTime = SnapshotItem & {
    timeInState: number;
};

export class Calculations {
    readonly orgId: string;
    readonly state: IState;
    readonly snapshot: ISnapshot;
    readonly filters: IQueryFilters;
    readonly flowItemsCalculations: FlowItemsCalculations;

    constructor(opts: {
        security: SecurityContext;
        state: IState;
        snapshot: ISnapshot;
        filters: IQueryFilters;
        flowItemsCalculations: FlowItemsCalculations;
    }) {
        this.orgId = opts.security.organisation!;
        this.state = opts.state;
        this.snapshot = opts.snapshot;
        this.filters = opts.filters!;
        this.flowItemsCalculations = opts.flowItemsCalculations;
    }

    public async getExtendedCardDetails(
        perspective: PerspectiveKey,
        workItemId: string,
    ) {
        const workItemDetails = await this.flowItemsCalculations.getWorkItemDetailsById(
            perspective,
            workItemId,
        );

        const results = workItemDetails.find(
            (item) => item.workItemId === workItemId,
        );

        const {
            assigneeTransitions,
            stateTransitions,
        } = await this.getSnapshotsForWorkItemId(workItemId);

        return {
            extendedDetails: results,
            assigneeTransitions,
            stateTransitions,
        };
    }

    async getSnapshotsForWorkItemId(workItemId: string) {
        const snapshots = await this.snapshot.getSnapshotsForWorkItemId(
            workItemId,
            this.orgId,
            false,
        );
        const grouped_snapshots: Record<string, SnapshotItem[]> = {};

        snapshots.map((item: any) => {
            const snapshotObj = _.pick(item, [
                'id',
                'workItemId',
                'state',
                'stateType',
                'flomatikaSnapshotDate',
                'assignee',
                'type',
            ]) as SnapshotItem;
            if (Object.keys(grouped_snapshots).includes(item.type)) {
                grouped_snapshots[item.type].push(snapshotObj);
            } else {
                grouped_snapshots[item.type] = [snapshotObj];
            }
        });
        // console.log(grouped_snapshots);
        const stateTransitions: StateTransitions[] = [];
        if (grouped_snapshots['state_change']) {
            const snapshotsWithTime: SnapshotItemWithTime[] = grouped_snapshots[
                'state_change'
            ].map((snapshot: any, index: number) => {
                if (index === grouped_snapshots['state_change'].length - 1) {
                    return {
                        ...snapshot,
                        timeInState: Math.ceil(
                            DateTime.now().diff(
                                DateTime.fromJSDate(
                                    snapshot.flomatikaSnapshotDate,
                                ),
                                'days',
                            ).days,
                        ),
                    };
                }
                return {
                    ...snapshot,
                    timeInState: Math.ceil(
                        DateTime.fromJSDate(
                            grouped_snapshots['state_change'][index + 1]
                                .flomatikaSnapshotDate,
                        ).diff(
                            DateTime.fromJSDate(snapshot.flomatikaSnapshotDate),
                            'days',
                        ).days,
                    ),
                };
            });
            snapshotsWithTime.forEach((item, index) => {
                const nextState = snapshotsWithTime[index + 1];
                if (nextState) {
                    stateTransitions.push({
                        id: index,
                        workItemId: item.workItemId,
                        fromState: item.state,
                        fromStateType: item.stateType,
                        toState: nextState.state,
                        toStateType: nextState.stateType,
                        fromTimeInState: `${item.timeInState} ${item.timeInState > 1 ? 'days' : 'day'
                            }`,
                        toTimeInState: `${nextState.timeInState} ${nextState.timeInState > 1 ? 'days' : 'day'
                            }`,
                        fromTimeStamp: DateTime.fromJSDate(
                            item.flomatikaSnapshotDate,
                        ).toISO(),
                        toTimeStamp: DateTime.fromJSDate(
                            nextState.flomatikaSnapshotDate,
                        ).toISO(),
                    });
                }
            });
        }
        const assigneeTransitions: AssigneeTransitions[] = [];
        if (grouped_snapshots['assignee_change']) {
            const snapshotsWithTime: SnapshotItemWithTime[] = grouped_snapshots[
                'assignee_change'
            ].map((snapshot: any, index: number) => {
                if (index === grouped_snapshots['assignee_change'].length - 1) {
                    return {
                        ...snapshot,
                        timeInState: Math.ceil(
                            DateTime.now().diff(
                                DateTime.fromJSDate(
                                    snapshot.flomatikaSnapshotDate,
                                ),
                                'days',
                            ).days,
                        ),
                    };
                }
                return {
                    ...snapshot,
                    timeInState: Math.ceil(
                        DateTime.fromJSDate(
                            grouped_snapshots['assignee_change'][index + 1]
                                .flomatikaSnapshotDate,
                        ).diff(
                            DateTime.fromJSDate(snapshot.flomatikaSnapshotDate),
                            'days',
                        ).days,
                    ),
                };
            });
            snapshotsWithTime.forEach((item, index) => {
                const nextState = snapshotsWithTime[index + 1];
                if (nextState) {
                    assigneeTransitions.push({
                        id: index,
                        workItemId: item.workItemId,
                        fromAssignee: item.assignee,
                        toAssignee: nextState.assignee,
                        fromTimeInState: `${item.timeInState} ${item.timeInState > 1 ? 'days' : 'day'
                            }`,
                        toTimeInState: `${nextState.timeInState} ${nextState.timeInState > 1 ? 'days' : 'day'
                            }`,
                        fromTimeStamp: DateTime.fromJSDate(
                            item.flomatikaSnapshotDate,
                        ).toISO(),
                        toTimeStamp: DateTime.fromJSDate(
                            nextState.flomatikaSnapshotDate,
                        ).toISO(),
                    });
                }
            });
        }
        // console.log({
        //     stateTransitions,
        //     assigneeTransitions,
        // });
        return {
            stateTransitions,
            assigneeTransitions,
        };
    }
}
