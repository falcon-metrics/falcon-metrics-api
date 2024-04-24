import {
    getMax,
    getMean,
    getMedian,
    getMin,
    getModes,
    getPercentile,
} from '../statistics';

describe('Mean, median, and mode are calculated correctly.', () => {
    test('Mean function calculates mean for simple example.', () => {
        const result = getMean([10, 20, 30, 40]);

        expect(result).toEqual(25);
    });
    test('Mean function handles empty array.', () => {
        const result = getMean([]);

        expect(result).toEqual(null);
    });

    test('Median function calculates median for simple example.', () => {
        const result = getMedian([1, 2, 3, 4, 5, 6, 7]);

        expect(result).toEqual(4);
    });
    test('Median function handles empty array.', () => {
        const result = getMedian([]);

        expect(result).toEqual(null);
    });
    test('Median returns mean in case of two medians.', () => {
        const result = getMedian([10, 22, 30, 40, 50, 60, 70, 80]);

        expect(result).toEqual(45);
    });

    test('Mode function calculates mode for simple example.', () => {
        const result = getModes([1, 2, 2, 2, 3, 4, 4]);

        expect(result).toEqual([2]);
    });
    test('Mode function handles empty array.', () => {
        const result = getModes([]);

        expect(result).toEqual(null);
    });

    test('Mode function returns all modes in case of multiple modes.', () => {
        const result = getModes([1, 2, 2, 4, 4, 3]);

        expect(result).toEqual(expect.arrayContaining([2, 4]));
        expect(result?.length).toEqual(2);
    });
});

describe('Maximum and minimum are calculated correctly.', () => {
    test('Maximum function works for simple example.', () => {
        const result = getMax([4, 2, 6, 3]);

        expect(result).toEqual(6);
    });
    test('Maximum function handles empty array.', () => {
        const result = getMax([]);

        expect(result).toEqual(null);
    });

    test('Minimum function works for simple example.', () => {
        const result = getMin([4, 2, 6, 3]);

        expect(result).toEqual(2);
    });
    test('Minimum function handles empty array.', () => {
        const result = getMin([]);

        expect(result).toEqual(null);
    });
});

describe('Percentiles are calculated correctly.', () => {
    test('Percentiles calculated correctly for simple example.', () => {
        const result = getPercentile(0.7, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

        expect(result).toEqual(7);
    });
    test('Percentile function handles empty array.', () => {
        const result = getPercentile(0.7, []);

        expect(result).toEqual(null);
    });
});
