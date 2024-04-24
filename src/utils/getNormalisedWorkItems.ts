import { PredefinedFilterTags } from '../common/filters_v2';
import { StateItem } from '../workitem/interfaces';

export async function getNormalisedWorkItems(
    getWorkItemFromTag: (tag: PredefinedFilterTags) => Promise<StateItem[]>,
    filteredTags?: PredefinedFilterTags[],
) {
    const defaultTags: PredefinedFilterTags[] = filteredTags || [
        PredefinedFilterTags.DEMAND,
        PredefinedFilterTags.VALUE_AREA,
        PredefinedFilterTags.QUALITY,
        PredefinedFilterTags.PLANNED_UNPLANNED,
        PredefinedFilterTags.CLASS_OF_SERVICE,
    ];

    // For each tag generate a list of normalised work item in progress
    const data = await Promise.all(
        defaultTags.map((tag) => getWorkItemFromTag(tag)),
    );

    // Group tags into a record
    const tagRecord: Record<string, StateItem[]> = {};

    defaultTags.forEach((tag, index) => {
        tagRecord[tag] = data[index];
    });

    const result: Record<string, Record<string, StateItem[]>> = {};

    for (const tag in tagRecord) {
        // Group displayName into a record
        const stateItemRecord: Record<string, StateItem[]> = {};
        const stateItemList = tagRecord[tag];
        for (const stateItem of stateItemList) {
            const key = stateItem.normalisedDisplayName || 'Empty';
            if (!stateItemRecord[key]) {
                stateItemRecord[key] = [];
            }
            stateItemRecord[key].push(stateItem);
        }
        result[tag] = stateItemRecord;
    }

    return result;
}
