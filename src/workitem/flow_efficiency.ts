import { DateTime } from "luxon";
import { TreatedSnapshotItem } from "./interfaces";

/**
 * Syncronously calculate active time and waiting for a specific work item.
 * 
 * @param snapshots The snapshots as retrieved by a getTreatedSnapshots() call, can be undefined if there are no snapshots
 * @param departureDateTime The date of departure of the item, can be null if the item does not have it.
 * @param stateCategory 
 * @param arrivalPoint Whether or not to include the count before the arrival point
 * @param dateStart The date period where count should start
 * @param dateEnd The date period where count should end
 * @returns 
 */
export function calculateActiveTimeAndWaitingTime(
    snapshots: TreatedSnapshotItem[] | undefined,
    departureDateTime: DateTime | null | undefined,
    stateCategory: string,
    arrivalPoint: 'include' | 'exclude',
    dateStart: DateTime,
    dateEnd: DateTime, 
) {
    if (process.env.NODE_ENV !== 'production') {
        throw new Error(
            'This method of calculating active time and waiting time has been discontinued.' +
            'Use get_extended_state_items function in the database instead.' + 
            ', it returns active time, waiting time and flow efficiency.'
        );
    }

    const result = { activeTime: 0, waitingTime: 0 };
    if (snapshots) {
        for (const snapshot of snapshots) {
            // Business rule: when state category of snapshots is proposed it's before arrival point
            // includeArrivalPoint allows ('proposed', 'inprogress')
            // excludeArrivalPoint allows ('inprogress')
            if (arrivalPoint === 'include' && snapshot.stateCategory !== 'proposed' && snapshot.stateCategory !== 'inprogress') {
                continue;
            } else if (arrivalPoint === 'exclude' && snapshot.stateCategory !== 'inprogress') {
                continue;
            }

            // Skip snapshots before the date start
            if (snapshot.flomatikaSnapshotDate.toMillis() < dateStart.toMillis()) {
                console.log('skipped because of start of date');
                console.log(snapshot.flomatikaSnapshotDate.toString());
                continue;
            }
            // Skip snapshots after date end
            if (snapshot.flomatikaSnapshotDate.toMillis() > dateEnd.toMillis()) {
                console.log('skipped because of end of date');
                console.log(snapshot.flomatikaSnapshotDate.toString());
                continue;
            }

            if (snapshot.stateType === 'active') {
                result.activeTime += 1;
            } else if (snapshot.stateType === 'queue') {
                result.waitingTime += 1;
            }
        }
    }

    // Business rule: activeTime should receive +1 when state.stateCategory is completed
    // except if the date filtered ends before the time the work item became completed
    if (departureDateTime && stateCategory === 'completed' && dateEnd > departureDateTime) {
        result.activeTime += 1;
    }

    return result;
}

/**
* Helper function to do active and waiting time in bulk and faster
*
* The reason it is faster is that the primary parameter for this function has only the
* necessary data to do the calculations in the most efficienct manner.
* 
* Internally it calls calculateActiveTimeAndWaitingTime for each work item id
* 
* @param statesAndSnapshotsRecord
* Since snapshots has a lot of rows this parameter attempts to limit only what is
*  relevant for this function. It shouldn't be hard to generate if you have the
*  states table result as it is only a work item id group by departure date time,
*  state category and snapshots and you can get snapshots from the getTreatedSnapshots
*  function.
*/
export function calculateActiveTimeAndWaitingTimeBulk(
    statesAndSnapshotsRecord: {
        [workItemId: string]: {
            departureDateTime: DateTime;
            stateCategory: string;
            snapshots: TreatedSnapshotItem[];
        };
    },
    arrivalPoint: 'include' | 'exclude',
    dateStart: DateTime,
    dateEnd: DateTime,
) {
    const result = { activeTime: 0, waitingTime: 0 };

    for (const workItemId in statesAndSnapshotsRecord) {
        const {activeTime, waitingTime} = calculateActiveTimeAndWaitingTime(
            statesAndSnapshotsRecord[workItemId].snapshots,
            statesAndSnapshotsRecord[workItemId].departureDateTime,
            statesAndSnapshotsRecord[workItemId].stateCategory,
            arrivalPoint,
            dateStart,
            dateEnd
        );
        result.activeTime += activeTime;
        result.waitingTime += waitingTime;
    }

    return result;
}

/**
 * Performs the calculation of flow efficiency given active time and waiting time.
 * The active time and waiting time comes from the calculateActiveTimeAndWaitingTime function.
 * 
 * @param activeTime The amount of days the item has been in stateType='active'
 * @param waitingTime The amount of days the item has been in stateType='queue'
 * @returns The flow efficiency percentage which is a number between 0 and 1
 */
export function calculateFlowEfficiency(activeTime: number, waitingTime: number) {
    if (activeTime === 0 && waitingTime === 0) {
        return 0;
    }
    return activeTime / (activeTime + waitingTime);
}