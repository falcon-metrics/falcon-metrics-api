import { StateItem } from '../workitem/interfaces'

/**
 * Calculates the Demand from a list of work item
 * 
 * The demand is the number of work items that have arrival date
 * 
 * The number of work item list must include all work items
 * 
 * @param workItemList 
 */
export function calculateDemand(
    workItemList: StateItem[]
): number {
    let demand = 0;
    for (const workItem of workItemList) {
        if (workItem.arrivalDateTime) {
            demand++;
        }
    }
    return demand;
}