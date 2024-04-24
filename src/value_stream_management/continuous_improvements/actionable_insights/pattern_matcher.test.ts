import { InsightsPatternMatcher } from './pattern_matcher';

describe('Test evaluateExpressionInString', () => {
    // Pass empty objects to options because they will not used
    // in the method invoked here
    const insightsPatternMatcher = new InsightsPatternMatcher({ aurora: {} as any, logger: {} as any, widgetInformationUtils: {} as any });

    test('Simple expression', () => {
        const str = 'Test (1 + 2)';
        const expected = 'Test 3';
        const actual = insightsPatternMatcher.evaluateExpressionInString(str);
        expect(actual).toStrictEqual(expected);
    });

    test('Invalid expression', () => {
        const str = 'Test (1 + 2()';
        const expected = 'Test (1 + 2()';
        const actual = insightsPatternMatcher.evaluateExpressionInString(str);
        expect(actual).toStrictEqual(expected);
    });

    test('Invalid expression', () => {
        const str = 'Test (1 + )';
        const expected = 'Test (1 + )';
        const actual = insightsPatternMatcher.evaluateExpressionInString(str);
        expect(actual).toStrictEqual(expected);
    });

    test('No expression', () => {
        const str = 'Test test (test)';
        const expected = 'Test test (test)';
        const actual = insightsPatternMatcher.evaluateExpressionInString(str);
        expect(actual).toStrictEqual(expected);
    });

    test('Expression contains parantheses', () => {
        const str = 'Test (1 + 2 * (10/2) - 1 + (10/1))';
        const expected = 'Test 20';
        const actual = insightsPatternMatcher.evaluateExpressionInString(str);
        expect(actual).toStrictEqual(expected);
    });

    test('Divide by zero', () => {
        const str = 'Test (1 / 0)';
        const expected = 'Test (1 / 0)';
        const actual = insightsPatternMatcher.evaluateExpressionInString(str);
        expect(actual).toStrictEqual(expected);
    });

    test('null in expression', () => {
        const str = 'Test (1 + null) + null * 100';
        const expected = 'Test (1 + null) + null * 100';
        const actual = insightsPatternMatcher.evaluateExpressionInString(str);
        expect(actual).toStrictEqual(expected);
    });

    test('undefined in expression', () => {
        const str = 'Test (1 + undefined)';
        const expected = 'Test (1 + undefined)';
        const actual = insightsPatternMatcher.evaluateExpressionInString(str);
        expect(actual).toStrictEqual(expected);
    });

    // This will not happen. Because the experssion does not contain user input
    test('code injection in expression', () => {
        const str = `Test ((function () {console.log('hello')})())`;
        const expected = `Test ((function () {console.log('hello')})())`;
        const actual = insightsPatternMatcher.evaluateExpressionInString(str);
        expect(actual).toStrictEqual(expected);
    });
});