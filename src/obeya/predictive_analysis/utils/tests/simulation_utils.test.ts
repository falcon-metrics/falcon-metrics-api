import { describe, expect, test } from '@jest/globals';
import { DeliveryRate, DeliveryRatePrecision } from '../../types/types';
import { simulateDays } from '../simulation_utils';

describe('test simulate days', () => {
    test('simulate days gets correct delivery days and throughput within expected remaining days', () => {
        const sampleData: DeliveryRate[] = [
            {
                date: 'test-date-1',
                itemCompleted: 5,

            },
            {
                date: 'test-date-2',
                itemCompleted: 5,
            },
        ];

        const result = simulateDays(sampleData, 10, 2);
        expect(result.throughput).toBe(10);
        expect(result.days).toBe(2);
    });
    test('simulate days gets correct delivery days and throughput after expected remaining days', () => {
        const sampleData = [
            {
                date: 'test-date-1',
                itemCompleted: 2,
            },
        ];

        const result = simulateDays(sampleData, 9, 2);
        expect(result.throughput).toBe(4);
        expect(result.days).toBe(5);
    });
});
