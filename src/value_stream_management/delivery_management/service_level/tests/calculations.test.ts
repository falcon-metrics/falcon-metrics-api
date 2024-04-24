import { DateTime } from 'luxon';
import { Week } from '../../../../utils/date_utils';
import { ExtendedStateItem } from '../../../../workitem/interfaces';
import { Calculations as ServiceLevelCalculations } from '../calculations';

describe('Service Level processing functions work correctly.', () => {
    test('Filtering of completed items in a given week works correctly.', () => {
        const earlyItem: ExtendedStateItem = {
            workItemId: '314159',
            departureDateTime: DateTime.fromISO('2022-04-10T23:00:00.000+00', {
                zone: 'utc',
            }),
        };
        const initialItem: ExtendedStateItem = {
            workItemId: '271828',
            departureDateTime: DateTime.fromISO('2022-04-13T11:00:00.000+00', {
                zone: 'utc',
            }),
        };
        const finalItem: ExtendedStateItem = {
            workItemId: '141421',
            departureDateTime: DateTime.fromISO('2022-04-17T23:30:00.000+00', {
                zone: 'utc',
            }),
        };

        const lateItem: ExtendedStateItem = {
            workItemId: '173205',
            departureDateTime: DateTime.fromISO('2022-04-18T00:00:00.000+00', {
                zone: 'utc',
            }),
        };

        const workItems: ExtendedStateItem[] = [
            earlyItem,
            initialItem,
            finalItem,
            lateItem,
        ];

        const referenceDate: DateTime = DateTime.fromISO(
            '2022-04-13T11:00:00.000+00',
            { zone: 'utc' },
        );
        const referenceWeek = new Week(referenceDate)

        const completedWorkReferenceWeek: ExtendedStateItem[] = ServiceLevelCalculations.selectCompletedItemsInSameWeek(
            referenceWeek,
            workItems,
        );

        expect(completedWorkReferenceWeek).toEqual(
            expect.arrayContaining([initialItem, finalItem]),
        );

        expect(completedWorkReferenceWeek).not.toEqual(
            expect.arrayContaining([earlyItem]),
        );
        expect(completedWorkReferenceWeek).not.toEqual(
            expect.arrayContaining([lateItem]),
        );
    });

    test('Target Met function handles empty array of work items appropriately.', () => {
        const target = ServiceLevelCalculations.getTargetMet([], 3, 'past');

        expect(target).toEqual(0);
    });

    test('Target Met function uses lead time for Completed items.', () => {
        const quickItem1: ExtendedStateItem = {
            workItemId: '314159',
            leadTimeInWholeDays: 1,
        };
        const quickItem2: ExtendedStateItem = {
            workItemId: '271828',
            leadTimeInWholeDays: 2,
        };
        const slowItem1: ExtendedStateItem = {
            workItemId: '141421',
            leadTimeInWholeDays: 4,
        };

        const slowItem2: ExtendedStateItem = {
            workItemId: '173205',
            leadTimeInWholeDays: 6,
        };

        const workItems: ExtendedStateItem[] = [
            quickItem1,
            quickItem2,
            slowItem1,
            slowItem2,
        ];

        const target = ServiceLevelCalculations.getTargetMet(
            workItems,
            3,
            'past',
        );

        expect(target).toEqual(50);
    });

    test('Target Met function use WIP age for WIP items.', () => {
        const quickItem1: ExtendedStateItem = {
            workItemId: '314159',
            wipAgeInWholeDays: 1,
        };
        const quickItem2: ExtendedStateItem = {
            workItemId: '271828',
            wipAgeInWholeDays: 2,
        };
        const slowItem1: ExtendedStateItem = {
            workItemId: '141421',
            wipAgeInWholeDays: 4,
        };

        const slowItem2: ExtendedStateItem = {
            workItemId: '173205',
            wipAgeInWholeDays: 6,
        };

        const workItems: ExtendedStateItem[] = [
            quickItem1,
            quickItem2,
            slowItem1,
            slowItem2,
        ];

        const target = ServiceLevelCalculations.getTargetMet(
            workItems,
            3,
            'present',
        );

        expect(target).toEqual(50);
    });
});