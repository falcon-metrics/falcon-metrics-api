import { DateTime } from 'luxon';
import {
    DeliveryDateHistogramData,
    DeliveryRatePrecision,
    ThroughputHistogramData
} from '../types/types';

export const getThroughputHistogramData = (
    throughputResults: number[],
): ThroughputHistogramData[] => {
    const throughputFrequencyMap = new Map<number, number>();
    const throughputHistogramData: ThroughputHistogramData[] = [];
    const invertedThroughput = throughputResults.sort((a, b) => b - a);
    invertedThroughput.forEach((throughput) => {
        throughputFrequencyMap.set(
            throughput,
            (throughputFrequencyMap.get(throughput) ?? 0) + 1,
        );
    });
    let accumulatedProbability = 0;
    const totalCounts = invertedThroughput.length;
    throughputFrequencyMap.forEach((frequency, throughput) => {
        const probability = (frequency / totalCounts) * 100;
        accumulatedProbability += probability;
        throughputHistogramData.push({
            bin: throughput,
            frequency,
            probability: Math.round(probability * 100) / 100,
            accumulatedProbability:
                Math.round(accumulatedProbability * 100) / 100,
        });
    });
    return throughputHistogramData;
};

export const buildHistogramData = (
    simulatedThroughput: number[],
    simulationStartDate: DateTime,
    precision: DeliveryRatePrecision,
): DeliveryDateHistogramData[] => {
    const histogramData: DeliveryDateHistogramData[] = [];
    const throughputFrequencyMap = new Map<number, number>();
    //sort the days by descends
    const comparator = (a: number, b: number) => a - b > 0 ? 1 : -1;
    const sortedThroughput = simulatedThroughput.sort(comparator);

    // Count the frequency of each occurance
    /**
     * throughput data = [1, 1, 3, 3, 2, 1, 1, 4]
     * daysRequiredCountMap = {
     *     1: 4,
     *     2: 2,
     *     3: 2,
     *     4: 1,
     * }
     */
    sortedThroughput.forEach((throughput) => {
        throughputFrequencyMap.set(
            throughput,
            (throughputFrequencyMap.get(throughput) ?? 0) + 1,
        );
    });

    let accumulatedProbability = 0;
    const totalCounts = sortedThroughput.length;
    // in each push, add the current probablity to total, push the total
    throughputFrequencyMap.forEach((count, throughput) => {
        let deliveryDate = simulationStartDate.plus({ days: throughput }).toISO();
        if (precision === DeliveryRatePrecision.WEEK) {
            deliveryDate = simulationStartDate.plus({ weeks: throughput }).toISO();
        }
        const probability = (count / totalCounts) * 100;
        accumulatedProbability += probability;
        histogramData.push({
            bin: throughput,
            frequency: count,
            probability: Math.round(probability * 100) / 100,
            accumulatedProbability:
                Math.round(accumulatedProbability * 100) / 100,
            deliveryDate,
        });
    });
    return histogramData;
};
