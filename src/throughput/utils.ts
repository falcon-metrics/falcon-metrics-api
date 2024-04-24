import _ from 'lodash';
import { DateTime } from 'luxon';
import { mean, round, std } from 'mathjs';
import {
    getPercentile,
    HIGH_VARIABILITY_LIMIT,
} from '../utils/statistics';

export const THROUGHPUT_VARIABILITY_LIMIT = 0.4;

export type ThroughputRollingValues = {
    aggregatedDateTime: string;
    standardDeviation?: number;
    throughput?: number;
    mean?: number;
    label?: string;
};

export const DEFAULT_ROLLING_VARIABILITY = 0.4;

// TODO: remove once new calculation is implemeted
export const getThroughputVariability = (
    throughputValues: Array<number>,
): string => {
    const percentile98th = getPercentile(98, throughputValues);
    const percentile50th = getPercentile(50, throughputValues);
    const variabilityValue =
        !percentile98th || !percentile50th
            ? 0
            : percentile50th / percentile98th;
    return variabilityValue <= HIGH_VARIABILITY_LIMIT ? 'High' : 'Low';
};

export const getThroughputByCoefficient = (
    throughputValues: Array<number>,
): string => {
    // get standard deviation
    const throughputStdv = std(throughputValues);

    // get mean
    const throughputMean = mean(throughputValues);

    // get coefficient of variation 
    const throughputCoV = throughputStdv / throughputMean;

    // High <= 0.4, Low > 0.4
    const throughputVariability = !throughputCoV ? "" : throughputCoV <= THROUGHPUT_VARIABILITY_LIMIT ? 'High' : 'Low';

    return throughputVariability;
};

export const calculateRollingCoefficient = (
    throughputValues: [string, number][]
): [string, number][] => {

    const calculatedRollingStandardDeviation = getRollingStandardDeviation(throughputValues);
    const calculatedRollingMean = getRollingMean(throughputValues);

    // Merge the two results
    const mergeResults = _.merge(calculatedRollingMean, calculatedRollingStandardDeviation);

    const calculatedCoefficient: [
        string,
        number,
    ][] = mergeResults.map((item) => {
        let coefficient;
        if (!item.standardDeviation && !item.mean)
            return [item.aggregatedDateTime, NaN];
        if (item.standardDeviation && item.mean)
            coefficient = (item.standardDeviation / item.mean);

        return [item.aggregatedDateTime, coefficient || 0];
    });

    return calculatedCoefficient;
};

export const getRollingStandardDeviation = (throughputValues: [string, number][]): ThroughputRollingValues[] => {
    let result: ThroughputRollingValues[] = [];

    const values = throughputValues.map((item) => item[1]);
    const dates = throughputValues.map((item) => item[0]);

    /** 
     * set the startindex of the rolling period:
     * get the first 4 periods (index: 0 - 3) by moving the last period by one period at a time
     * by the 5th period (index: 4), move the start date by one while still in groups of 4
     * */
    for (let i = 0; i < values.length; i++) {
        const startIndex = i - 3 < 0 ? 0 : i - 3;
        const endIndex = i;
        const date = dates[i];

        let arr = [];

        for (let i = startIndex; i <= endIndex; i++) {
            const num = values[i];

            arr.push(num);
        }

        const curr = std(arr);

        result[i] = {
            aggregatedDateTime: date,
            standardDeviation: curr
        };
    };

    return result;
};

export const getRollingMean = (throughputValues: [string, number][]): ThroughputRollingValues[] => {
    let result: ThroughputRollingValues[] = [];

    const values = throughputValues.map((item) => item[1]);
    const dates = throughputValues.map((item) => item[0]);

    /** 
     * set the startindex of the rolling period:
     * get the first 4 periods (index: 0 - 3) by moving the last period by one period at a time
     * by the 5th period (index: 4), move the start date by one while still in groups of 4
     * */
    for (let i = 0; i < values.length; i++) {
        const startIndex = i - 3 < 0 ? 0 : i - 3;
        const endIndex = i;
        const date = dates[i];

        let arr = [];

        for (let i = startIndex; i <= endIndex; i++) {
            const num = values[i];

            arr.push(num);
        }

        const curr = mean(arr);
        result[i] = {
            aggregatedDateTime: date,
            mean: curr
        };
    };

    return result;
};