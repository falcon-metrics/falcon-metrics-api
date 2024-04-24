// This is the equivalent of the PERCENTRANK.INC function in Excel, Google Sheets, etc
// https://support.office.com/en-us/article/percentrank-function-f1b5836c-9619-4847-9fc9-080ec9024442 has examples
// Note: OpenOffice and LibreOffice use a different algorithm so results may differ
// This version is more tolerant of values outside of the minimum/maximum and will return 0 or 1
// accordingly
export function getPercentRank(entries: Array<number>, target: number): number {
    // Ranking needs the entries sorted. Don't assume the caller actually did that
    const sortedEntries = entries.sort(
        (firstEl: number, secondEl: number) => firstEl - secondEl,
    );
    const countOfEntries = sortedEntries.length;

    if (countOfEntries === 0) {
        return 0.0;
    }

    // If the target is actually equal or less than the lowest value, then we know it's 0
    if (target <= sortedEntries[0]) {
        return 0.0;
    }

    // Similarly if we're at or above the highest entry then we have 100%
    if (target >= sortedEntries[countOfEntries - 1]) {
        return 1.0;
    }

    let countOfEntriesUnderTarget = 0;

    let entryIndex = 0;

    for (
        ;
        entryIndex < countOfEntries && sortedEntries[entryIndex] < target;
        entryIndex++
    ) {
        countOfEntriesUnderTarget++;
    }

    if (sortedEntries[entryIndex] === target) {
        return countOfEntriesUnderTarget / (countOfEntries - 1);
    }

    // The target is not a value in the array, we need to position it in an imaginary place between its nearest values
    const lowerEntry = sortedEntries[entryIndex - 1];
    const higherEntry = sortedEntries[entryIndex];
    const virtualPosition = (target - lowerEntry) / (higherEntry - lowerEntry);

    return (
        getPercentRank(sortedEntries, lowerEntry) +
        virtualPosition *
            (getPercentRank(sortedEntries, higherEntry) -
                getPercentRank(sortedEntries, lowerEntry))
    );
}

/**
 * Error message for case when percentile is less than 0
 *
 * @param {Number} p
 *
 * @return {String}
 */
function lessThanZeroError(p: number): string {
    return (
        'Expect percentile to be >= 0 but given "' +
        p +
        '" and its type is "' +
        typeof p +
        '".'
    );
}

/**
 * Error message for case when percentile is greater than 100
 *
 * @param {Number} p
 *
 * @return {String}
 */
function greaterThanHundredError(p: number): string {
    return (
        'Expect percentile to be <= 100 but given "' +
        p +
        '" and its type is "' +
        typeof p +
        '".'
    );
}

/**
 * Error message for case when percentile is not a number (NaN)
 *
 * @param {Number} p
 *
 * @return {String}
 */
function nanError(p: number): string {
    return (
        'Expect percentile to be a number but given "' +
        p +
        '" and its type is "' +
        typeof p +
        '".'
    );
}

/**
 * Calculate percentile for given array of values.
 * This method is an alternative to the nearest-rank method. It uses linear interpolation between adjacent ranks.
 * Excel PERCENTILE.INC()
 *
 * @param {Number} p - percentile
 * @param {Array} list - array of values
 *
 * @return {*}
 */
//https://www.translatorscafe.com/unit-converter/en-US/calculator/percentile/
export function getPercentile(p: number, list: number[]): any {
    if (isNaN(Number(p))) {
        throw new Error(nanError(p));
    }

    p = Number(p);

    if (p < 0) {
        throw new Error(lessThanZeroError(p));
    }

    if (p > 100) {
        throw new Error(greaterThanHundredError(p));
    }

    list = list.slice().sort(function (a, b) {
        a = Number.isNaN(a) ? Number.NEGATIVE_INFINITY : a;
        b = Number.isNaN(b) ? Number.NEGATIVE_INFINITY : b;

        if (a > b) return 1;
        if (a < b) return -1;

        return 0;
    });

    if (p === 0) return list[0];
    if (p === 100) return list[list.length - 1];

    const rank = (p / 100) * (list.length - 1) + 1;

    const wholeRank = Math.floor(rank);
    const decimalRank = rank % 1;
    const vn = list[wholeRank - 1];

    // Handles undefined result when list count = 1 and wholeRank > 0
    const vn1 = list[wholeRank] ? list[wholeRank] : list[0];

    const percentile: number = vn + decimalRank * (vn1 - vn);

    return roundToDecimalPlaces(percentile, 2);
}

export function roundToDecimalPlaces(num: number, places: number) {
    return +(Math.round(parseFloat(num + 'e+' + places)) + 'e-' + places);
}

export const HIGH_VARIABILITY_LIMIT = 5.6;
export function getIsVariabilityHigh(
    percentile50th: number,
    percentile98th: number,
) {
    return percentile98th / percentile50th >= HIGH_VARIABILITY_LIMIT;
}

export const getTargetVariability = (median: number) =>
    median * HIGH_VARIABILITY_LIMIT;

enum VariabilityClassifications {
    high = 'High',
    low = 'Low',
}

export const getVariabilityClassification = (
    percentile50th: number,
    percentile98th: number,
) =>
    getIsVariabilityHigh(percentile50th, percentile98th)
        ? VariabilityClassifications.high
        : VariabilityClassifications.low;

export enum DistributionShapes {
    lowPredictability = 'Low Predictabilty Distribution',
    highPredictability = 'High Predictabilty Distribution',
}

export const getDistributionShape = (
    percentile50th: number,
    percentile98th: number,
) =>
    getIsVariabilityHigh(percentile50th, percentile98th)
        ? DistributionShapes.lowPredictability
        : DistributionShapes.highPredictability;
