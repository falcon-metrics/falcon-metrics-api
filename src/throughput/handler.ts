import { asClass } from 'awilix';
import { APIGatewayProxyEventV2, ScheduledEvent } from 'aws-lambda';
import {
    Calculations,
    ThroughputData,
    ThroughputRunChartDataV2,
} from './calculations';
import { State } from '../workitem/state_aurora';
import { TrendAnalysis } from '../utils/trend_analysis';
import { AssignedToDatum } from '../utils/assigned_to';
import { IBoxPlot } from '../common/box_plot';
import { BaseHandler } from '../common/base_handler';
import { DateTime } from 'luxon';
import { HandleEvent } from '../common/event_handler';
import { StateItem } from '../workitem/interfaces';
import { emptyDistributionFactory, IDistribution } from '../leadtime/handler';

type Everything = {
    throughputData: ThroughputData;
    throughputRunChartData: ThroughputRunChartDataV2;
    trendAnalysis: TrendAnalysis;
    workItemTypeAnalysisData: Array<{ type: string; count: number }>;
    classOfServiceAnalysisData: Array<{
        serviceClassName: string;
        count: number;
    }>;
    demandAnalysisData: Array<{ type: string; count: number }>;
    plannedUnplannedAnalysisData: Array<{ type: string; count: number }>;
    valueAreaAnalysisData: Array<{ areaName: string; count: number }>;
    assignedToAnalysisData: Array<AssignedToDatum>;
    boxPlot: IBoxPlot;
    distribution: Partial<IDistribution>;
    workItemList: StateItem[];
    normalisedWorkItemList: Record<string, Record<string, number>>;
};

class ThroughputHandler extends BaseHandler {
    private calculations: Calculations;

    constructor(event: APIGatewayProxyEventV2) {
        super(event, {
            calculations: asClass(Calculations),
            state: asClass(State),
        });

        this.calculations = this.dependencyInjectionContainer.cradle.calculations;
    }

    async getEverything() {
        const throughputResponse: Everything = {
            throughputData: {
                count: 0,
                fromDate: DateTime.utc(),
                untilDate: DateTime.utc(),
                numDays: 0,
            },
            throughputRunChartData: { throughputSeries: [] },
            trendAnalysis: {
                lastWeek: {
                    percentage: 0,
                    text: '',
                    arrowDirection: '',
                    arrowColour: '',
                },
                lastTwoWeeks: {
                    percentage: 0,
                    text: '',
                    arrowDirection: '',
                    arrowColour: '',
                },
                lastFourWeeks: {
                    percentage: 0,
                    text: '',
                    arrowDirection: '',
                    arrowColour: '',
                },
            },
            workItemTypeAnalysisData: [],
            classOfServiceAnalysisData: [],
            demandAnalysisData: [],
            plannedUnplannedAnalysisData: [],
            valueAreaAnalysisData: [],
            assignedToAnalysisData: [],
            boxPlot: {
                median: Number.MIN_VALUE,
                quartile1st: Number.MIN_VALUE,
                quartile3rd: Number.MIN_VALUE,
                interQuartileRange: Number.MIN_VALUE,
                lowerWhisker: Number.MIN_VALUE,
                upperWhisker: Number.MIN_VALUE,
                lowerOutliers: [],
                upperOutliers: [],
            },
            distribution: emptyDistributionFactory(),
            workItemList: [],
            normalisedWorkItemList: {},
        };

        try {
            const calcs = this.calculations;
            throughputResponse.throughputData = await calcs.getThroughputData();
            throughputResponse.throughputRunChartData = await calcs.getThroughputRunChartDataV2();
            throughputResponse.trendAnalysis = await calcs.getTrendAnalysis();
            throughputResponse.workItemTypeAnalysisData = await calcs.getWorkItemTypeAnalysisData();
            throughputResponse.classOfServiceAnalysisData = await calcs.getClassOfServiceAnalysisData();
            throughputResponse.demandAnalysisData = await calcs.getDemandAnalysisData();
            throughputResponse.plannedUnplannedAnalysisData = await calcs.getPlannedUnplannedAnalysisData();
            throughputResponse.valueAreaAnalysisData = await calcs.getValueAreaAnalysisData();
            throughputResponse.assignedToAnalysisData = await calcs.getAssignedToAnalysisData();
            throughputResponse.boxPlot = await calcs.getDeliveryRateBoxPlot();
            throughputResponse.distribution = {
                // average: await calcs.getAverage(),
                // modes: await calcs.getModes(),
                percentile50th: await calcs.getPercentile(50),
                percentile85th: await calcs.getPercentile(15),
                percentile95th: await calcs.getPercentile(5),
                percentile98th: await calcs.getPercentile(2),
            };

            throughputResponse.workItemList = await calcs.getWorkItemList();
            throughputResponse.normalisedWorkItemList = await calcs.getNormalisedWorkItemsCount();
        } catch (e) {
            const err = e instanceof Error ? e : new Error('Unexpected error object of type \"' + typeof e + '\"');
            console.error('Failed: ' + err.message + '\n' + err.stack);
            return {
                statusCode: 400,
                body: JSON.stringify({ error: err.message }),
            };
        }
        return {
            statusCode: 200,
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(throughputResponse),
        };
    }
}

// export const getEverything = async (event: APIGatewayProxyEventV2) => {
//     return await new ThroughputHandler(event).getEverything();
// };

export const getEverything = async (
    event: APIGatewayProxyEventV2 | ScheduledEvent,
) => {
    return HandleEvent(event, ThroughputHandler);
};
