import { sec } from 'mathjs';
import {
    ArrowColours,
    defaultColours,
    getPercentualDifference,
    reverseDefaultColours,
} from '../utils/trend_analysis';
import { ComparisionWithArrowDirection } from './interfaces';

export enum CheckpointDirections {
    UP_IS_GOOD = 'up is good',
    DOWN_IS_GOOD = 'down is good'
}

export enum CheckpointUnits {
    Percentage = '%',
    Points = '',
    Days = ' days',
}

export function comparePerformanceCheckpoints(
    firstCheckpoint: number,
    secondCheckpoint: number,
    direction: string, // setting this to string so it's easy to comprehend: 'up is good' or 'down is good',
    unit?: string,
) {
    let colours: ArrowColours = defaultColours;

    const value = calculateCheckpoints(Math.round(firstCheckpoint), Math.round(secondCheckpoint), unit) || 0;

    const results = {
        increase: {
            value: 'more',
            unit: unit,
            arrow: {
                direction: direction === CheckpointDirections.DOWN_IS_GOOD ? 'down' : 'up',
                colour: colours?.upColour,
            },
        },
        decrease: {
            value: 'less',
            unit: unit,
            arrow: {
                direction: direction === CheckpointDirections.DOWN_IS_GOOD ? 'up' : 'down',
                colour: colours?.downColour
            },
        },
        stable: {
            unit: unit,
            value: 'same',
            arrow: {
                direction: 'stable',
                colour: colours?.stableColour,
            },
        },
    };

    let selectedResult;
    let valueResult = `${Math.round(value)}`;

    if (value < 0)
        selectedResult = direction === CheckpointDirections.UP_IS_GOOD ? results["decrease"] : results["increase"];
    else if (value > 0)
        selectedResult = direction === CheckpointDirections.UP_IS_GOOD ? results["increase"] : results["decrease"];
    else {
        selectedResult = results["stable"];
        valueResult = "Stable";
    }

    const content = {
        ...selectedResult,
        value: valueResult || 0,
    };

    return content;
}

export function comparePerformanceCheckpointsForPredictability(
    firstCheckpoint: string,
    secondCheckpoint: string,
    unit?: string,
) {
    let colours: ArrowColours = defaultColours;

    const results = {
        increase: {
            value: 'more',
            unit: unit,
            arrow: {
                direction: 'up',
                colour: colours?.upColour,
            },
        },
        decrease: {
            value: 'less',
            unit: unit,
            arrow: {
                direction: 'down',
                colour: colours?.downColour
            },
        },
        stableHigh: {
            unit: unit,
            value: 'same',
            arrow: {
                direction: 'stable',
                colour: colours?.upColour, // green
            },
        },
        stableLow: {
            unit: unit,
            value: 'same',
            arrow: {
                direction: 'stable',
                colour: colours?.downColour, // red
            },
        },
        stable: {
            unit: unit,
            value: 'same',
            arrow: {
                direction: 'stable',
                colour: colours?.stableColour,
            },
        },
    };

    let value: string = "";
    let selectedResult;
    if (secondCheckpoint === 'Low' && firstCheckpoint === 'High') {
        value = "Decreased";
        selectedResult = results["decrease"];
    }
    else if (secondCheckpoint === 'High' && firstCheckpoint === 'Low') {
        value = "Increased";
        selectedResult = results["increase"];
    }
    else if (secondCheckpoint === 'High' && firstCheckpoint === 'High') {
        value = "stableHigh";
        selectedResult = results["stableHigh"];
    }
    else if (secondCheckpoint === 'Low' && firstCheckpoint === 'Low') {
        value = "stableLow";
        selectedResult = results["stableLow"];
    }
    else {
        value = "Stable";
        selectedResult = results["stable"];
    }

    const content = {
        ...selectedResult,
        value: value.includes("stable") ? "Stable" : value,
    };

    return content;
}

export function calculateCheckpoints(
    firstCheckpoint: number,
    secondCheckpoint: number,
    unit?: string,
) {
    const value = (secondCheckpoint - firstCheckpoint);
    return value;
}

/** @deprecated this is giving a wrong calculation */
export function getTrendAnalysisContent(
    previousValue: number = 0,
    currentValue: number = 0,
    colours?: ArrowColours,
    decreaseIsGood?: boolean,
    customUnit: string = '%',
    customCalculation?: () => number,
    keepColous?: boolean,
): ComparisionWithArrowDirection {
    if (!colours) {
        colours =
            decreaseIsGood && !keepColous
                ? reverseDefaultColours
                : defaultColours;
    }
    const results = {
        increase: {
            value: 'more',
            unit: customUnit,
            arrow: {
                direction: 'up',
                colour: colours.upColour,
            },
        },
        decrease: {
            value: 'less',
            unit: customUnit,
            arrow: {
                direction: 'down',
                colour: colours.downColour,
            },
        },
        stable: {
            unit: customUnit,
            value: 'same',
            arrow: {
                direction: 'stable',
                colour: colours.stableColour,
            },
        },
    };

    const value = customCalculation
        ? customCalculation()
        : getPercentualDifference(previousValue, currentValue);

    let signal = '';

    let selectedResultKey: keyof typeof results = 'stable';
    if (value > 0) {
        selectedResultKey = 'increase';
        if (previousValue > currentValue) {
            signal = '-';
            if (decreaseIsGood) {
                selectedResultKey = 'decrease';
                colours = defaultColours;
            }
        } else {
            signal = '+';
        }
    } else if (value < 0) {
        selectedResultKey = 'decrease';
    }

    const selectedResult = results[selectedResultKey];
    const content = {
        ...selectedResult,
        value: `${signal}${Math.round(value)}${customUnit === '%' ? customUnit : ` ${customUnit}`
            }`,
    };

    return content;
}

/** @deprecated this is giving a wrong calculation */
export function getTrendLeadTimePredicability(
    previousLeadTime?: string,
    nextLeadTime?: string,
): ComparisionWithArrowDirection {
    const colours = defaultColours;
    const results = {
        increase: {
            value: 'improved predictability',
            unit: '',
            arrow: {
                direction: 'up',
                colour: colours.upColour,
            },
        },
        decrease: {
            value: 'decreased predictability',
            unit: '',
            arrow: {
                direction: 'down',
                colour: colours.downColour,
            },
        },
        stable: {
            value: 'stable',
            unit: '',
            arrow: {
                direction: 'stable',
                colour: colours.stableColour,
            },
        },
    };

    let selectedResultKey: keyof typeof results = 'stable';
    if (previousLeadTime === 'High' && nextLeadTime === 'Low') {
        selectedResultKey = 'decrease';
    } else if (nextLeadTime === 'High' && previousLeadTime === 'Low') {
        selectedResultKey = 'increase';
    }

    return results[selectedResultKey];
}
