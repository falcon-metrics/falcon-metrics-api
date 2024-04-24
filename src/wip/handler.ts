import { asClass, Lifetime } from 'awilix';
import {
    APIGatewayProxyEventV2,
    APIGatewayProxyResultV2,
    ScheduledEvent,
} from 'aws-lambda';
import {
    Calculations,
    WIPData,
    WIPRunChartData,
    HistogramDatum,
} from './calculations';
import { State } from '../workitem/state_aurora';
import { TrendAnalysis } from '../utils/trend_analysis';
import { AssignedToDatum } from '../utils/assigned_to';
import { IBoxPlot } from '../common/box_plot';
import { BaseHandler } from '../common/base_handler';
import { SnapshotQueries } from '../workitem/snapshot_queries';
import { DateTime } from 'luxon';
import { Snapshot } from '../workitem/snapshot_db';
import { HandleEvent } from '../common/event_handler';
import { StateItem } from '../workitem/interfaces';
import { emptyDistributionFactory, IDistribution } from '../leadtime/handler';
import { getTargetVariability } from '../utils/statistics';

type Everything = {
    WIPData: WIPData;
    WIPRunChartData: WIPRunChartData;
    trendAnalysis: TrendAnalysis;
    distribution: IDistribution;
    histogram: Array<HistogramDatum>;
    scatterplot: Array<{
        commitmentDateNoTime: string;
        wipAgeInWholeDays: number;
        workItemId: string;
        state: string;
    }>;
    workItemTypeAnalysisData: Array<{ type: string; count: number }>;
    stateAnalysisData: Array<{ stateName: string; count: number }>;
    classOfServiceAnalysisData: Array<{
        serviceClassName: string;
        count: number;
    }>;
    demandAnalysisData: Array<{ type: string; count: number }>;
    plannedUnplannedAnalysisData: Array<{ type: string; count: number }>;
    valueAreaAnalysisData: Array<{ areaName: string; count: number }>;
    assignedToAnalysisData: Array<AssignedToDatum>;
    boxPlot: IBoxPlot;
    distributionShape: string;
    workItemList: StateItem[];
    normalisedWorkItemList: Record<string, Record<string, number>>;
};

class WipHandler extends BaseHandler {
    private calculations: Calculations;

    constructor(event: APIGatewayProxyEventV2) {
        super(event, {
            calculations: asClass(Calculations, { lifetime: Lifetime.SCOPED }),
            state: asClass(State, { lifetime: Lifetime.SCOPED }),
            snapshotQueries: asClass(SnapshotQueries, {
                lifetime: Lifetime.SCOPED,
            }),
            snapshot: asClass(Snapshot, { lifetime: Lifetime.SCOPED }),
        });

        this.calculations = this.dependencyInjectionContainer.cradle.calculations;
    }

    async getEverything(): Promise<APIGatewayProxyResultV2> {
        const WIPResponse: Everything = {
            WIPData: {
                count: 0,
                fromDate: DateTime.utc(),
                untilDate: DateTime.utc(),
                numDays: 0,
                countInDate: 0,
            },
            WIPRunChartData: [],
            distribution: emptyDistributionFactory(),
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
            histogram: [],
            scatterplot: [],
            workItemTypeAnalysisData: [],
            classOfServiceAnalysisData: [],
            stateAnalysisData: [],
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
            distributionShape: '',
            workItemList: [],
            normalisedWorkItemList: {},
        };

        try {
            const calcs = this.calculations;
            
            WIPResponse.WIPData = await calcs.getWIPCount();
            WIPResponse.trendAnalysis = await calcs.getTrendAnalysis();
            WIPResponse.WIPRunChartData = await calcs.getWipRunChart();
            WIPResponse.workItemTypeAnalysisData = await calcs.getWorkItemTypeAnalysisData();
            WIPResponse.classOfServiceAnalysisData = await calcs.getClassOfServiceAnalysisData();
            WIPResponse.stateAnalysisData = await calcs.getStateAnalysisData();
            WIPResponse.demandAnalysisData = await calcs.getDemandAnalysisData();
            WIPResponse.plannedUnplannedAnalysisData = await calcs.getPlannedUnplannedAnalysisData();
            WIPResponse.valueAreaAnalysisData = await calcs.getValueAreaAnalysisData();
            WIPResponse.assignedToAnalysisData = await calcs.getAssignedToAnalysisDataV2();

            const median = await calcs.getPercentile(50);
            WIPResponse.distribution = {
                minimum: await calcs.getMinimum(),
                maximum: await calcs.getMaximum(),
                modes: await calcs.getModes(),
                average: await calcs.getAverage(),
                percentile50th: median,
                percentile85th: await calcs.getPercentile(85),
                percentile95th: await calcs.getPercentile(95),
                percentile98th: await calcs.getPercentile(98),
                targetForPredictability: getTargetVariability(median),
            };
            WIPResponse.boxPlot = await calcs.getWipAgeBoxPlot();
            WIPResponse.distributionShape = await calcs.getShapeOfWipAgeDistribution();
            WIPResponse.histogram = await calcs.getHistogramDataV2();
            WIPResponse.scatterplot = await calcs.getScatterplotDataV2();
            WIPResponse.workItemList = await calcs.getWorkItemList();
            WIPResponse.normalisedWorkItemList = await calcs.getNormalisedWorkItemsCount();
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
            body: JSON.stringify(WIPResponse),
        };
    }
}

export const getEverything = async (
    event: APIGatewayProxyEventV2 | ScheduledEvent,
) => {
    return HandleEvent(event, WipHandler);
};
