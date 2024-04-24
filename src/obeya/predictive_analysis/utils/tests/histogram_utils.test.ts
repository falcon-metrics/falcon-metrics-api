import { describe, expect, test } from '@jest/globals';
import { DateTime } from 'luxon';
import { DeliveryDateHistogramData, DeliveryRatePrecision } from '../../types/types';
import { buildHistogramData } from '../histogram_utils';

describe('test buildHistogramData', () => {
    test('test buildHistogramData as expect', () => {
        const simulatedDaysRequired = [10, 10, 11];
        const simulationStartDate = DateTime.utc().startOf('day').plus({ days: 1 });
        const tomorrow = simulationStartDate;
        const result = buildHistogramData(simulatedDaysRequired, simulationStartDate, DeliveryRatePrecision.DAY);
        const expectedResults: DeliveryDateHistogramData[] = [
            {
                bin: 10,
                frequency: 2,
                accumulatedProbability: 66.67,
                deliveryDate: tomorrow.plus({ days: 10 }).toISO(),
                probability: Math.round((2 / 3) * 100 * 100) / 100,
            },
            {
                bin: 11,
                frequency: 1,
                accumulatedProbability: 100,
                deliveryDate: tomorrow.plus({ days: 11 }).toISO(),
                probability: Math.round((1 / 3) * 100 * 100) / 100,
            },
        ];
        const sortFunc = (a: DeliveryDateHistogramData, b: DeliveryDateHistogramData) =>
            a.bin - b.bin > 0 ? 1 : -1;
        expect(result.sort(sortFunc)).toEqual(expectedResults.sort(sortFunc));
    });


    test('test buildHistogramData for weekly precision', () => {
        const simulatedDaysRequired = [10, 10, 11];
        const today = DateTime.utc().startOf('day');
        const simulationStartDate = DateTime.utc().startOf('day');
        const result = buildHistogramData(simulatedDaysRequired, today, DeliveryRatePrecision.WEEK);
        const expectedResults: DeliveryDateHistogramData[] = [
            {
                bin: 10,
                frequency: 2,
                accumulatedProbability: 66.67,
                deliveryDate: simulationStartDate.plus({ weeks: 10 }).toISO(),
                probability: Math.round((2 / 3) * 100 * 100) / 100,
            },
            {
                bin: 11,
                frequency: 1,
                accumulatedProbability: 100,
                deliveryDate: simulationStartDate.plus({ weeks: 11 }).toISO(),
                probability: Math.round((1 / 3) * 100 * 100) / 100,
            },
        ];
        const sortFunc = (a: DeliveryDateHistogramData, b: DeliveryDateHistogramData) =>
            a.bin - b.bin > 0 ? 1 : -1;
        expect(result.sort(sortFunc)).toEqual(expectedResults.sort(sortFunc));
    });
});
