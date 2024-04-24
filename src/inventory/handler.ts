import { asClass } from 'awilix';
import { APIGatewayProxyEventV2, ScheduledEvent } from 'aws-lambda';
import { Calculations, InventoryData, ScatterplotDatum } from './calculations';
import { State } from '../workitem/state_aurora';
import { TrendAnalysis } from '../utils/trend_analysis';
import { IBoxPlot } from '../common/box_plot';
import { BaseHandler } from '../common/base_handler';
import { DateTime } from 'luxon';
import { HandleEvent } from '../common/event_handler';
import { StateItem } from '../workitem/interfaces';
import { AssignedToDatum } from '../utils/assigned_to';
import { emptyDistributionFactory, IDistribution } from '../leadtime/handler';
import { getTargetVariability } from '../utils/statistics';
import { HistogramDatum } from '../wip/calculations';

interface IEverything {
    inventoryData: InventoryData;
    trendAnalysis: TrendAnalysis;
    distribution: IDistribution;
    histogram: Array<HistogramDatum>;
    scatterplot: Array<ScatterplotDatum>;
    workItemTypeAnalysisData: Array<{ type: string; count: number }>;
    stateAnalysisData: Array<{ stateName: string; count: number }>;
    classOfServiceAnalysisData: Array<{
        serviceClassName: string;
        count: number;
    }>;
    demandAnalysisData: Array<{ type: string; count: number }>;
    plannedUnplannedAnalysisData: Array<{ type: string; count: number }>;
    valueAreaAnalysisData: Array<{ areaName: string; count: number }>;
    assignedToAnalysisData: AssignedToDatum[];
    boxPlot: IBoxPlot;
    distributionShape: string;
    workItemList: StateItem[];
    normalisedWorkItemList: Record<string, Record<string, number>>;
}

class InventoryHandler extends BaseHandler {
    private calculations: Calculations;

    constructor(event: APIGatewayProxyEventV2) {
        super(event, {
            calculations: asClass(Calculations),
            state: asClass(State),
        });

        this.calculations = this.dependencyInjectionContainer.cradle.calculations;
    }

    async getEverything() {
        const inventoryResponse: IEverything = {
            inventoryData: {
                count: 0,
                countInDate: 0,
                fromDate: DateTime.utc(),
                untilDate: DateTime.utc(),
                numDays: 0,
            },
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
            distribution: emptyDistributionFactory(),
            histogram: [],
            scatterplot: [],
            workItemTypeAnalysisData: [],
            classOfServiceAnalysisData: [],
            demandAnalysisData: [],
            plannedUnplannedAnalysisData: [],
            valueAreaAnalysisData: [],
            assignedToAnalysisData: [],
            stateAnalysisData: [],
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
            inventoryResponse.inventoryData = await calcs.getInventoryData();
            inventoryResponse.trendAnalysis = await calcs.getTrendAnalysis();
            inventoryResponse.workItemTypeAnalysisData = await calcs.getWorkItemTypeAnalysisData();
            inventoryResponse.classOfServiceAnalysisData = await calcs.getClassOfServiceAnalysisData();
            inventoryResponse.stateAnalysisData = await calcs.getStateAnalysisData();
            inventoryResponse.demandAnalysisData = await calcs.getDemandAnalysisData();
            inventoryResponse.plannedUnplannedAnalysisData = await calcs.getPlannedUnplannedAnalysisData();
            inventoryResponse.valueAreaAnalysisData = await calcs.getValueAreaAnalysisData();
            inventoryResponse.assignedToAnalysisData = await calcs.getAssignedToAnalysisData();

            const median = await this.calculations.getPercentile(50);
            inventoryResponse.distribution = {
                minimum: await this.calculations.getMinimum(),
                maximum: await this.calculations.getMaximum(),
                average: await this.calculations.getAverage(),
                modes: await this.calculations.getModes(),
                percentile50th: median,
                percentile85th: await this.calculations.getPercentile(85),
                percentile95th: await this.calculations.getPercentile(95),
                percentile98th: await this.calculations.getPercentile(98),
                targetForPredictability: getTargetVariability(median),
            };
            inventoryResponse.boxPlot = await calcs.getWipAgeBoxPlot();
            inventoryResponse.distributionShape = await calcs.getShapeOfWipAgeDistribution();
            inventoryResponse.histogram = await calcs.getHistogramDataV2();
            inventoryResponse.scatterplot = await calcs.getScatterplotData();
            inventoryResponse.workItemList = await calcs.getWorkItemList();
            inventoryResponse.normalisedWorkItemList = await calcs.getNormalisedWorkItemsCount();
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
            body: JSON.stringify(inventoryResponse),
        };
    }
}

export const getEverything = async (
    event: APIGatewayProxyEventV2 | ScheduledEvent,
) => {
    return HandleEvent(event, InventoryHandler);
};
