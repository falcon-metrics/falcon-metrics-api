import {
    DateTime,
    Interval,
} from 'luxon';
import {
    abs,
    round,
} from 'mathjs';

import { getWeekIndex } from './date_utils';

const DISPLAY_PERCENTAGE_LIMIT = 9999;

export enum TrendDirection {
    UP = 'Up',
    DOWN = 'Down',
    STABLE = 'Stable',
};

export type TrendAnalysis = {
    lastWeek?: TrendAnalysisStructure;
    lastTwoWeeks?: TrendAnalysisStructure;
    lastFourWeeks?: TrendAnalysisStructure;
};

export type TrendAnalysisStructure = {
    percentage: number;
    text: string;
    arrowDirection: string;
    arrowColour: string;
};

export const defaultColours = {
    upColour: 'green',
    downColour: 'red',
    stableColour: 'yellow',
};
export type ArrowColours = typeof defaultColours;

export const reverseDefaultColours = {
    ...defaultColours,
    upColour: defaultColours.downColour,
    downColour: defaultColours.upColour,
} as ArrowColours;

export function getTrendAnalysisContent(
    previousValue: number,
    currentValue: number,
    periodString: string,
    colours?: ArrowColours,
    decreaseIsGood?: boolean,
): TrendAnalysisStructure {
    const comparisonString = ' compared to last ' + periodString;
    if (!colours) {
        colours = decreaseIsGood ? reverseDefaultColours : defaultColours;
    }
    const results = {
        increase: {
            text: 'more' + comparisonString,
            arrowDirection: TrendDirection.UP,
            arrowColour: colours.upColour,
        },
        decrease: {
            text: 'less' + comparisonString,
            arrowDirection: TrendDirection.DOWN,
            arrowColour: colours.downColour,
        },
        stable: {
            text: 'same' + comparisonString,
            arrowDirection: TrendDirection.STABLE,
            arrowColour: colours.stableColour,
        },
    };

    const percentage = getPercentualDifference(previousValue, currentValue);

    let selectedResultKey: keyof typeof results = 'stable';
    if (percentage > 0) {
        selectedResultKey = 'increase';
    } else if (percentage < 0) {
        selectedResultKey = 'decrease';
    }

    const selectedResult = results[selectedResultKey];
    const content = {
        percentage: abs(round(percentage)),
        ...selectedResult,
    };

    return content;
}

export function getPercentualDifference(
    previousValue: number,
    currentValue: number,
) {
    const divisionIsInvalid = !previousValue && !currentValue;
    const divisionResult = divisionIsInvalid
        ? 0
        : ((currentValue - previousValue) / previousValue) * 100;
    const cappedValue = Math.min(divisionResult, DISPLAY_PERCENTAGE_LIMIT);
    return cappedValue;
}

export function formatWeekCount(
    weekCount: Map<number, number>,
    period: any,
): void {
    const weekCountSortedAsc = [...weekCount.keys()].sort((a, b) => (a - b));
    const currentCalendarWeekNum =
        period?.end?.endOf('week')?.weekNumber ?? DateTime.utc().weekNumber;
    const beginningWeekNum = period?.start?.startOf('week').weekNumber;
    if (
        weekCountSortedAsc[weekCountSortedAsc.length - 1] !==
        currentCalendarWeekNum
    ) {
        //if the current calendar week isn't in the dataset
        //(because there are no completed items this week yet)
        //add it with a count of 0
        weekCount.set(currentCalendarWeekNum, 0);
    }
    if (beginningWeekNum && weekCountSortedAsc[0] !== beginningWeekNum) {
        //if the calendar week of the **from period** isn't in the dataset
        //(because there are no completed items this week yet)
        //add it with a count of 0
        weekCount.set(beginningWeekNum, 0);
    }
    //fill the rest of week with 0;
    for (let i = beginningWeekNum + 1; i < currentCalendarWeekNum; i++) {
        if (!weekCount.has(i)) weekCount.set(i, 0);
    }
}

export function getCurrentWeekNum(weekCount: Map<number, number>): number {
    ///Get the last week which is !finished! as the current week num
    const indexOfWeekBeforeCurrent = 1;
    const weekCountSortedDesc = [...weekCount.keys()].sort((a, b) => b - a);
    const currentWeekNum = weekCountSortedDesc[indexOfWeekBeforeCurrent];
    return currentWeekNum;
}

function getWeekValue(weekNumber: number, weekCount: Map<number, number>) {
    const count = weekCount.get(getWeekIndex(weekNumber));
    return count || 0;
}

export function getTrendAnalysisResponseFromWeekCount(
    weekCount: Map<number, number>,
    colours?: ArrowColours,
): TrendAnalysis {
    const emptyTrendAnalysis = {
        percentage: 0,
        text: '',
        arrowDirection: '',
        arrowColour: '',
    };
    const response: TrendAnalysis = {
        lastWeek: { ...emptyTrendAnalysis },
        lastTwoWeeks: { ...emptyTrendAnalysis },
        lastFourWeeks: { ...emptyTrendAnalysis },
    };

    let currentWeek: number = 0,
        lastWeek: number = 0,
        currentTwoWeeks: number = 0,
        previousTwoWeeks: number = 0,
        currentFourWeeks: number = 0,
        previousFourWeeks: number = 0;

    const arraySize = weekCount.size;

    const currentWeekNum = getCurrentWeekNum(weekCount);

    //Calculation and fill response object
    if (arraySize > 1) {
        currentWeek = getWeekValue(currentWeekNum, weekCount);
        //we cannot use arraySize > 2, because we are excluding the actual current week
        // the currentWeek is actually last week
        if (arraySize > 2) {
            lastWeek = getWeekValue(currentWeekNum - 1, weekCount);
            response.lastWeek = getTrendAnalysisContent(
                lastWeek,
                currentWeek,
                'week',
                colours,
            );

            currentTwoWeeks = currentWeek + lastWeek;
        }
        if (arraySize > 4) {
            previousTwoWeeks =
                getWeekValue(currentWeekNum - 2, weekCount) +
                getWeekValue(currentWeekNum - 3, weekCount);
            response.lastTwoWeeks = getTrendAnalysisContent(
                previousTwoWeeks,
                currentTwoWeeks,
                'two weeks',
                colours,
            );
            currentFourWeeks = currentTwoWeeks + previousTwoWeeks;
        }
        if (arraySize > 8) {
            previousFourWeeks =
                getWeekValue(currentWeekNum - 4, weekCount) +
                getWeekValue(currentWeekNum - 5, weekCount) +
                getWeekValue(currentWeekNum - 6, weekCount) +
                getWeekValue(currentWeekNum - 7, weekCount);
            response.lastFourWeeks = getTrendAnalysisContent(
                previousFourWeeks,
                currentFourWeeks,
                'four weeks',
                colours,
            );
        }
    }
    return response;
}

export function getTrendAnalysisResponse(
    items: number[],
    period: Interval,
    colours?: ArrowColours,
): TrendAnalysis {
    const weekCount: Map<number, number> = new Map();
    items.forEach((week) => {
        const currentCount = weekCount.get(week);
        const newCount = currentCount ? currentCount + 1 : 1;
        weekCount.set(week, newCount);
    });
    formatWeekCount(weekCount, period);

    return getTrendAnalysisResponseFromWeekCount(weekCount, colours);
}
