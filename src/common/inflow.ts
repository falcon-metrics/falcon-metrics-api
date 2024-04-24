import { StateItem } from '../workitem/interfaces'

/**
 * Calculates the inflow from a list of work item
 * 
 * The inflow is the number of work items that have commitment date
 * 
 * @param workItemList
 */
export function calculateInflow(
    workItemList: StateItem[]
): number {
    let inflow = 0;
    for (const workItem of workItemList) {
        if (workItem.commitmentDateTime) {
            inflow++;
        }
    }
    return inflow;
}