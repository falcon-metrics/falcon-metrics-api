// Expect only approximate behavior from these functions due to the limitations
// of floating-point arithmetic.
import { max, mean, median, min, mode, quantileSeq, sort } from 'mathjs';

export const getMean = (values: number[]): number | null => {
    if (values.length === 0) {
        return null;
    }

    const meanValue = mean(values);

    return Math.round(meanValue);
};

export const getMedian = (values: number[]): number | null => {
    if (values.length === 0) {
        return null;
    }

    const medianValue = median(values);

    return Math.round(medianValue);
};

export const getModes = (values: number[]): number[] | null => {
    if (values.length === 0) {
        return null;
    }

    const modes: number[] = mode(values);

    // Business rule to match Google Sheets behavior
    const modesOccurOnlyOnce: boolean = modes.length === values.length;
    if (modesOccurOnlyOnce) {
        return null;
    }

    const roundedModes: number[] = modes.map(Math.round);
    const sortedModes: number[] = sort(roundedModes, 'asc');

    return sortedModes;
};

export const getMin = (values: number[]): number | null => {
    if (values.length === 0) {
        return null;
    }

    const minValue: number = min(values);

    return Math.round(minValue);
};

export const getMax = (values: number[]): number | null => {
    if (values.length === 0) {
        return null;
    }

    const maxValue: number = max(values);

    return Math.round(maxValue);
};

export const getPercentile = (
    selectedPercentile: number,
    items: number[],
): number | null => {
    if (items.length === 0) {
        return null;
    }

    const percentileResults = quantileSeq(items, selectedPercentile);

    const scalarPercentile: number = Array.isArray(percentileResults)
        ? Number(percentileResults[0])
        : Number(percentileResults);

    const percentileValue: number | null = scalarPercentile
        ? Math.round(scalarPercentile)
        : null;

    return percentileValue;
};
