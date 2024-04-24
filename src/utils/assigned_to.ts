import { sortBy } from 'lodash';
import { StateItem } from '../workitem/interfaces';

export type AssignedToDatum = {
    name: string;
    workItems: Array<{ id: string }>;
};

export async function extractAssignmentDataFromWorkItems(
    unsortedWorkItems: Array<StateItem>,
): Promise<Array<AssignedToDatum>> {
    const workItems = sortBy(unsortedWorkItems, ['assignedTo']);

    if (!workItems.length) return [];

    return workItems
        .map((item) => ({ name: item.assignedTo, id: item.workItemId }))
        .reduce((assignedToData, item) => {
            const lastDatum = assignedToData[assignedToData.length - 1];

            if (lastDatum && lastDatum.name === item.name) {
                lastDatum.workItems.push({ id: item.id! });
            } else {
                assignedToData.push({
                    name: item.name!,
                    workItems: [{ id: item.id! }],
                });
            }

            return assignedToData;
        }, new Array<AssignedToDatum>());
}
