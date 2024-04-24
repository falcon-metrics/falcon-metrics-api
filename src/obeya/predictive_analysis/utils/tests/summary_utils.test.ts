import { describe, expect, test } from '@jest/globals';
import { StateItem } from '../../../../workitem/interfaces';
import {
    calculateDeliveryRatePerWeekFromDailyDeliveryRate,
    groupRemainingWorkItemsByLevel,
} from '../summary_utils';

describe('happy paths of summary utils', () => {
    test('group work items by level', () => {
        const testItems: StateItem[] = [
            {
                workItemId: 'test-item-1',
                stateCategory: 'inprogress',
                flomatikaWorkItemTypeLevel: 'Team',
            },
            {
                workItemId: 'test-item-2',
                stateCategory: 'proposed',
                flomatikaWorkItemTypeLevel: 'Portfolio',
            },
            {
                workItemId: 'test-item-3',
                stateCategory: 'inprogress',
                flomatikaWorkItemTypeLevel: 'Individual Contributor',
            },
            {
                workItemId: 'test-item-4',
                stateCategory: 'proposed',
                flomatikaWorkItemTypeLevel: 'Portfolio',
            },
        ];
        const result = groupRemainingWorkItemsByLevel(testItems);
        expect(result['portfolio']).toBe(2);
        expect(result['team']).toBe(1);
        expect(result['individualContributor']).toBe(1);
    });
});
