import { getPercentRank } from '../statistics';

const theUnsortedArray = [12, 1, 1, 2, 11, 2, 2, 3, 8, 2, 3, 10, 4, 1];

test('should return 0 if array empty', () => {
    expect(getPercentRank([], 1)).toBe(0.0);
});

test('should return 0 if target is lower than lowest', () => {
    expect(getPercentRank(theUnsortedArray, -10)).toBe(0.0);
    expect(getPercentRank(theUnsortedArray, -1)).toBe(0.0);
    expect(getPercentRank(theUnsortedArray, 0.5)).toBe(0.0);
});

test('should return 1 if target is higher than highest', () => {
    expect(getPercentRank(theUnsortedArray, 12.1)).toBe(1.0);
    expect(getPercentRank(theUnsortedArray, 125)).toBe(1.0);
});

test('should return 0 if target is equl to lowest', () => {
    expect(getPercentRank(theUnsortedArray, 1)).toBe(0.0);
});

test('should return 1 if target is equal to highest', () => {
    expect(getPercentRank(theUnsortedArray, 12)).toBe(1.0);
});

test('should return 0.846 if target is 10 (single existing entry)', () => {
    expect(Math.round(getPercentRank(theUnsortedArray, 10) * 1000)).toBe(846);
});

test('should return 0.231 if target is 2 (multiple entries of same value)', () => {
    expect(Math.round(getPercentRank(theUnsortedArray, 2) * 1000)).toBe(231);
});

test('should return 0.538 if target is 3 (multiple entries of same value)', () => {
    expect(Math.round(getPercentRank(theUnsortedArray, 3) * 1000)).toBe(538);
});

test('should return 0.712 if target is 5 (not an entry)', () => {
    expect(Math.round(getPercentRank(theUnsortedArray, 5) * 1000)).toBe(712);
});

test('should return 0.75 if target is 7 (not an entry)', () => {
    expect(Math.round(getPercentRank(theUnsortedArray, 7) * 1000)).toBe(750);
});
