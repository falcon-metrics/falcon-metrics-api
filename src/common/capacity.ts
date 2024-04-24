import { StateItem } from '../workitem/interfaces'

/**
 * Calculates the capacity from a list of work item
 * 
 * The capacity is the number of work items that have departure date
 * 
 * @param workItemList
 */
export function calculateCapacity(
    workItemList: StateItem[]
): number {
    let capacity = 0;
    for (const workItem of workItemList) {
        if (workItem.departureDateTime) {
            capacity++;
        }
    }
    return capacity;
}