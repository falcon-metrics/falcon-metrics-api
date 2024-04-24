import { asClass, Lifetime } from 'awilix';
import { APIGatewayProxyEventV2, ScheduledEvent } from 'aws-lambda';
import { Calculations } from './calculations';
import { groupBy } from 'lodash';
// eslint-disable-next-line import/namespace
import { Calculations as LeadTimeCalculations } from '../leadtime/calculations';
import { Calculations as ThroughputCalculations } from '../throughput/calculations';
import { Calculations as WipCalculations } from '../wip/calculations';
import { Calculations as FlowEfficiencyCalculations } from '../flow_efficiency/calculations';
import { Calculations as InventoryCalculations } from '../inventory/calculations';
import { InOutFlowCalculations } from '../flow_efficiency/in_out_flow_calculations';
import { TrendAnalysisStructure } from '../utils/trend_analysis';
import { State } from '../workitem/state_aurora';
import { BaseHandler } from '../common/base_handler';
import { SnapshotQueries } from '../workitem/snapshot_queries';
import { Snapshot } from '../workitem/snapshot_db';
import { HandleEvent } from '../common/event_handler';
import { PredefinedFilterTags } from '../common/filters_v2';
import { ObeyaRoomsCalculations } from '../obeya/obeya_rooms/calculations';
import { Normalization } from '../normalization/Normalization';

export type ProductivityValue = { itemTypeName: string; count: number };
export type QualityValue = { itemTypeName: string; count: number };

export type Productivity = {
    years: Array<{
        year: number;
        values: Array<ProductivityValue>;
    }>;
    quarters: Array<{
        year: number;
        quarter: number;
        values: Array<ProductivityValue>;
    }>;
    months: Array<{
        year: number;
        month: number;
        values: Array<ProductivityValue>;
    }>;
    weeks: Array<{
        year: number;
        week: number;
        startOfWeekDate: string;
        values: Array<ProductivityValue>;
    }>;
};

export type Quality = {
    years: Array<{
        year: number;
        values?: QualityValue[];
    }>;
    quarters: Array<{
        year: number;
        quarter: number;
        values?: QualityValue[];
    }>;
    months: Array<{
        year: number;
        values?: QualityValue & { month: string }[];
    }>;
    weeks: Array<{
        year: number;
        months: {
            year: number;
            month: number;
            week: number;
            values?: QualityValue &
                {
                    year: string;
                    week: string;
                    weekStarting: string;
                }[];
        };
    }>;
};

export type WorkFlowTrendValue = { itemTypeName: string; count: number };

export type LeadTimeWidgetValue = {
    itemTypeName: string;
    percentile85th: number;
};

export type LeadTimeWeeks = Array<{
    year: number;
    week: number;
    values?: LeadTimeWidgetValue &
        {
            month: string;
            year: string;
            week: string;
            weekStarting: string;
        }[];
}>;

export type LeadTimeMonths = Array<{
    year: number;
    values?: LeadTimeWidgetValue & { month: string }[];
}>;

export type LeadTimeQuarters = Array<{
    year: number;
    quarter: number;
    values?: LeadTimeWidgetValue[];
}>;

export type LeadTimeWidget = {
    years: Array<{
        year: number;
        values?: LeadTimeWidgetValue[];
    }>;
    quarters: LeadTimeQuarters;
    months: LeadTimeMonths;
    weeks: LeadTimeWeeks;
};

export type WorkflowItem = {
    itemTypeName: string;
    count: number;
    flomatikaSnapshotDate: string;
};

export type WorkflowTrendWidget = {
    years: Array<{
        year: number;
        values: Array<WorkflowItem>;
    }>;
    quarters: Array<{
        year: number;
        quarter: number;
        values: Array<WorkflowItem>;
    }>;
    months: Array<{
        year: number;
        month: number;
        values: Array<WorkflowItem>;
    }>;
    weeks: Array<{
        year: number;
        week: number;
        startOfWeekDate: string;
        values: Array<WorkflowItem>;
    }>;
};

export type SummaryPastItem = {
    itemTypeName: string;
    serviceLevelExpectationDays: string;
    serviceLevelPercent: number;
    trendAnalysisSLE: TrendAnalysisStructure;
    leadtimePercentile: string;
    trendAnalysisLeadTime: TrendAnalysisStructure;
    variabilityLeadTime: string;
    throughput: number;
    trendAnalysisThroughput: TrendAnalysisStructure;
    variabilityThroughput: string;
};

export type SummaryFutureItem = {
    itemTypeName: string;
    inventoryCount: number;
    inventoryAgePercentile85th: string;
    trendAnalysisInventoryAge: TrendAnalysisStructure;
    inventoryVariability: string;
    commitmentRate: string;
    timeToCommitPercentile85th: string;
};

type SummaryInprogressItem = {
    itemTypeName: string;
    wipCount: number;
    percentageOfStaleWorkItem: string;
    wipAge85Percentile: number;
    wipAgeAverage: number;
    wipVariability: string;
    flowDebt: string;
    flowEfficiencyAverage: number;
    keySourceOfDelay: string;
    demandVsCapacity: string;
};

export type SummaryTable = {
    past: Array<SummaryPastItem>;
    present: Array<SummaryInprogressItem>;
    future: Array<any>;
};

export type SummaryResponse = {
    productivity: Productivity;
    quality: Quality;
    workflowTrendWidget: WorkflowTrendWidget;
    leadTimeWidget: LeadTimeWidget;
    summaryTable: SummaryTable;
};

class SummaryHandler extends BaseHandler {
    private calculations: Calculations;
    private leadtimeCalculations: LeadTimeCalculations;
    private throughputCalculations: ThroughputCalculations;
    private wipCalculations: WipCalculations;
    private flowEfficiencyCalculations: FlowEfficiencyCalculations;
    private inOutCalculations: InOutFlowCalculations;
    private inventoryCalculations: InventoryCalculations;
    private summaryResponse: SummaryResponse;
    private obeyaRoomsCalculations: ObeyaRoomsCalculations;
    private obeyaRoomId?: string;
    private parsedQuery?: string;
    private normalization: Normalization;

    constructor(event: APIGatewayProxyEventV2) {
        super(event, {
            calculations: asClass(Calculations, { lifetime: Lifetime.SCOPED }),
            leadtimeCalculations: asClass(LeadTimeCalculations, {
                lifetime: Lifetime.SCOPED,
            }),
            throughputCalculations: asClass(ThroughputCalculations, {
                lifetime: Lifetime.SCOPED,
            }),
            wipCalculations: asClass(WipCalculations, {
                lifetime: Lifetime.SCOPED,
            }),
            flowEfficiencyCalculations: asClass(FlowEfficiencyCalculations, {
                lifetime: Lifetime.SCOPED,
            }),
            inOutCalculations: asClass(InOutFlowCalculations, {
                lifetime: Lifetime.SCOPED,
            }),
            inventoryCalculations: asClass(InventoryCalculations, {
                lifetime: Lifetime.SCOPED,
            }),
            state: asClass(State, { lifetime: Lifetime.SCOPED }),
            snapshot: asClass(Snapshot, { lifetime: Lifetime.SCOPED }),
            snapshotQueries: asClass(SnapshotQueries, {
                lifetime: Lifetime.SCOPED,
            }),
            obeyaRoomsCalculations: asClass(ObeyaRoomsCalculations, {
                lifetime: Lifetime.SCOPED,
            }),
            normalization: asClass(Normalization, {
                lifetime: Lifetime.SCOPED,
            }),
        });

        this.calculations = this.dependencyInjectionContainer.cradle.calculations;
        this.leadtimeCalculations = this.dependencyInjectionContainer.cradle.leadtimeCalculations;
        this.throughputCalculations = this.dependencyInjectionContainer.cradle.throughputCalculations;
        this.wipCalculations = this.dependencyInjectionContainer.cradle.wipCalculations;
        this.flowEfficiencyCalculations = this.dependencyInjectionContainer.cradle.flowEfficiencyCalculations;
        this.inOutCalculations = this.dependencyInjectionContainer.cradle.inOutCalculations;
        this.inventoryCalculations = this.dependencyInjectionContainer.cradle.inventoryCalculations;
        this.obeyaRoomsCalculations = this.dependencyInjectionContainer.cradle.obeyaRoomsCalculations;
        this.normalization = this.dependencyInjectionContainer.cradle.normalization;

        this.obeyaRoomId = '';
        this.parsedQuery = '';

        const emptyPeriod: any = {
            years: [],
            months: [],
            weeks: [],
            quarters: [],
        };
        this.summaryResponse = {
            productivity: { ...emptyPeriod },
            quality: { ...emptyPeriod },
            workflowTrendWidget: { ...emptyPeriod },
            leadTimeWidget: { ...emptyPeriod },
            summaryTable: {
                past: [],
                present: [],
                future: [],
            },
        };
    }

    getSummaryPeriod(event: APIGatewayProxyEventV2): string {
        return event.queryStringParameters &&
            event.queryStringParameters.summaryPeriodType
            ? event.queryStringParameters.summaryPeriodType
            : 'past';
    }

    setObeyaRoomId(event: APIGatewayProxyEventV2): void {
        this.obeyaRoomId =
            event.queryStringParameters &&
            event.queryStringParameters?.obeyaRoomId;
    }

    async getParsedQueryByObeyaRoomId(): Promise<string | undefined> {
        const obeyaRoom = await this.obeyaRoomsCalculations.getObeyaRoom(
            this?.obeyaRoomId,
        );
        this.parsedQuery = obeyaRoom?.parsedQuery;
        return obeyaRoom?.parsedQuery;
    }

    async getEverything(event: any) {
        console.time('summary.getEverything');

        const productivity = await this.calculations.getProductivity();
        const leadtimeWidget = await this.calculations.getLeadTimeWidget();
        const qualityWidgetResult = await this.calculations.getQualityWidget();
        const workflowTrendWidget = await this.calculations.getWorkflowTrendWidget();

        const summaryPeriod = this.getSummaryPeriod(event);

        let resultsPromise;

        switch (summaryPeriod) {
            case 'present':
                resultsPromise = this.getPresent(
                    productivity,
                    leadtimeWidget,
                    qualityWidgetResult,
                    workflowTrendWidget,
                );
                break;
            case 'future':
                resultsPromise = this.getFuture(
                    productivity,
                    leadtimeWidget,
                    qualityWidgetResult,
                    workflowTrendWidget,
                );
                break;
            default:
                resultsPromise = this.getPast(
                    productivity,
                    leadtimeWidget,
                    qualityWidgetResult,
                    workflowTrendWidget,
                );
                break;
        }
        const results = await resultsPromise;

        console.timeEnd('summary.getEverything');
        const normalizationOrder =
            (await this.normalization?.getFilters()) ?? [];

        return {
            ...results,
            normalizationOrder,
        };
    }

    async getSummaryTable(event: any) {
        console.time('summary.getSummaryTable');
        const summaryPeriod = this.getSummaryPeriod(event);
        this.setObeyaRoomId(event);
        await this.getParsedQueryByObeyaRoomId();

        let resultsPromise;

        switch (summaryPeriod) {
            case 'past':
                resultsPromise = this.getPast();
                break;
            case 'present':
                resultsPromise = this.getPresent();
                break;
            case 'future':
                resultsPromise = this.getFuture();
                break;
            default:
                resultsPromise = this.getPast();
                break;
        }
        const results = await resultsPromise;

        console.timeEnd('summary.getEverything');
        return results;
    }

    private async getPast(
        productivityResult?: any,
        leadtimeWidgetResult?: any,
        qualityWidgetResult?: any,
        workflowTrendWidget?: any,
    ) {
        console.time('summary.getPast');
        try {
            const throughput = this.throughputCalculations.getThroughputSummaryTable(
                this.parsedQuery,
            );
            const sle = this.parsedQuery
                ? this.leadtimeCalculations.getServiceLevelDetailsForObeya(
                      this.parsedQuery,
                  )
                : this.leadtimeCalculations.getServiceLevelDetailsNormalised();
            const leadtime = this.leadtimeCalculations.getLeadTimeForSummaryTable(
                undefined,
                this.parsedQuery,
            );

            const [
                throughputResult,
                leadtimeResult,
                sleResult,
            ] = await Promise.all([throughput, leadtime, sle]);
            const trendAnalysisPlaceholder = {
                percentage: 0,
                text: '-',
                arrowDirection: '-',
                arrowColour: '-',
            };
            const placholderObject = {
                itemTypeName: '',
                serviceLevelExpectationDays: '-',
                serviceLevelPercent: 0,
                trendAnalysisSLE: trendAnalysisPlaceholder,
                leadtimePercentile: '-',
                trendAnalysisLeadTime: trendAnalysisPlaceholder,
                variabilityLeadTime: '-',
                throughput: '-',
                trendAnalysisThroughput: trendAnalysisPlaceholder,
                variabilityThroughput: '-',
            };

            const summaryData = groupByItemTypeName(
                [...throughputResult, ...sleResult, ...leadtimeResult],
                placholderObject,
            );

            this.summaryResponse.summaryTable.past = summaryData;
            if (
                productivityResult &&
                leadtimeWidgetResult &&
                qualityWidgetResult &&
                workflowTrendWidget
            ) {
                this.summaryResponse.productivity = productivityResult;
                this.summaryResponse.leadTimeWidget = leadtimeWidgetResult;
                this.summaryResponse.workflowTrendWidget = workflowTrendWidget;
                this.summaryResponse.quality = qualityWidgetResult;
            }
            return this.summaryResponse;
        } catch (e) {
            console.error('Failed:', e);
            return {
                statusCode: 500,
                body: JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error object type' }),
            };
        } finally {
            console.timeEnd('summary.getPast');
        }
    }

    private async getPresent(
        productivityResult?: any,
        leadtimeWidgetResult?: any,
        qualityWidgetResult?: any,
        workflowTrendWidget?: any,
    ) {
        console.time('summary.getPresent');
        try {
            // -----------------Present-----------------------
            //WIP Count | Wip Avg | WIP Age (85%tile) | WIP Variability  | Flow Debt |
            const demandVsCapacity = this.inOutCalculations.getDemandVsCapacity(
                this.parsedQuery,
            );
            const leadTimeData = await this.leadtimeCalculations.getLeadTimeByItemTypeName(
                this.parsedQuery,
            );
            const wipCalculations = this.wipCalculations.getWIPForSummaryTable(
                leadTimeData,
                this.parsedQuery,
            );
            const wipVariabilityValues = this.wipCalculations.getWiVariabilityForSummaryTable(
                this.parsedQuery,
            );

            const staleWorkItems = this.calculations.getStaleWorkItems(
                this.parsedQuery,
            );
            const averageFlowEfficiency = this.flowEfficiencyCalculations.getFlowEfficiencyAvg(
                this.parsedQuery,
            );

            // group them by itemTypeName
            // merge each result in a unique object by itemTypeName
            const placholderObject: SummaryInprogressItem = {
                itemTypeName: '-',
                wipCount: 0,
                wipAge85Percentile: 0,
                percentageOfStaleWorkItem: '-',
                wipVariability: '-',
                wipAgeAverage: 0,
                flowDebt: '-',
                flowEfficiencyAverage: 0,
                keySourceOfDelay: '-',
                demandVsCapacity: '-',
            };

            const [
                wipCalculationsResult,
                wipVariabilityResult,
                averageFlowEfficiencyResult,
                staleWorkItemsResult,
                demandVsCapacityResult,
            ] = await Promise.all([
                wipCalculations,
                wipVariabilityValues,
                averageFlowEfficiency,
                staleWorkItems,
                demandVsCapacity,
            ]);

            const summaryData = groupByItemTypeName(
                [
                    ...wipCalculationsResult,
                    ...wipVariabilityResult,
                    ...averageFlowEfficiencyResult,
                    ...staleWorkItemsResult,
                    ...demandVsCapacityResult,
                ],
                placholderObject,
            );
            this.summaryResponse.summaryTable.present = summaryData;
            if (
                productivityResult &&
                leadtimeWidgetResult &&
                qualityWidgetResult &&
                workflowTrendWidget
            ) {
                this.summaryResponse.productivity = productivityResult;
                this.summaryResponse.leadTimeWidget = leadtimeWidgetResult;
                this.summaryResponse.workflowTrendWidget = workflowTrendWidget;
                this.summaryResponse.quality = qualityWidgetResult;
            }
            return this.summaryResponse;
        } catch (e) {
            console.error('Failed:', e);
            return {
                statusCode: 500,
                body: JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error object type' }),
            };
        } finally {
            console.timeEnd('summary.getPresent');
        }
    }

    private async getFuture(
        productivityResult?: any,
        leadtimeWidgetResult?: any,
        qualityWidgetResult?: any,
        workflowTrendWidget?: any,
    ) {
        console.time('summary.getFuture');
        try {
            const inventory = this.inventoryCalculations.getInventoryForSummaryTable(
                PredefinedFilterTags.DEMAND,
                this.parsedQuery,
            );
            const commitmentRate = this.inventoryCalculations.getCommitmentRate(
                PredefinedFilterTags.DEMAND,
                this.parsedQuery,
            );
            const timeToCommit = this.inventoryCalculations.getTimeToCommit(
                PredefinedFilterTags.DEMAND,
                this.parsedQuery,
            );

            const placholderObject = {
                itemTypeName: '',
                inventoryCount: 0,
                inventoryAgePercentile85th: '-',
                trendAnalysisInventoryAge: {
                    percentage: 0,
                    text: '-',
                    arrowDirection: '-',
                    arrowColour: '-',
                },
                inventoryVariability: '',
                commitmentRate: '',
                timeToCommitPercentile85th: '',
            };

            const [
                inventoryResult,
                timeToCommitResult,
                commitmentRateResult,
            ] = await Promise.all([inventory, timeToCommit, commitmentRate]);
            const summaryData = groupByItemTypeName(
                [
                    ...inventoryResult,
                    ...timeToCommitResult,
                    ...commitmentRateResult,
                ],
                placholderObject,
            );
            this.summaryResponse.summaryTable.future = summaryData;

            if (
                productivityResult &&
                leadtimeWidgetResult &&
                qualityWidgetResult &&
                workflowTrendWidget
            ) {
                this.summaryResponse.productivity = productivityResult;
                this.summaryResponse.leadTimeWidget = leadtimeWidgetResult;
                this.summaryResponse.workflowTrendWidget = workflowTrendWidget;
                this.summaryResponse.quality = qualityWidgetResult;
            }
            return this.summaryResponse;
        } catch (e) {
            console.error('Failed:', e);
            return {
                statusCode: 500,
                body: JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error object type' }),
            };
        } finally {
            console.timeEnd('summary.getFuture');
        }
    }
}

function groupByItemTypeName(items: Array<any>, placholderObject: any) {
    const groupedByWorkTypeName = groupBy(items, 'itemTypeName');
    const mergedObjectbyItemTypeName: Array<any> = [];
    Object.keys(groupedByWorkTypeName).forEach((itemTypeName) => {
        if (itemTypeName !== 'undefined') {
            const mergedObject = groupedByWorkTypeName[itemTypeName].reduce(
                (acc, item) => {
                    return { ...acc, ...item };
                },
                {},
            );
            mergedObjectbyItemTypeName.push({
                ...placholderObject,
                ...mergedObject,
            });
        }
    });
    return mergedObjectbyItemTypeName;
}

export const getEverything = async (
    event: APIGatewayProxyEventV2 | ScheduledEvent,
) => {
    return HandleEvent(event, SummaryHandler);
};

export const getSummaryTable = async (event: APIGatewayProxyEventV2) => {
    return await new SummaryHandler(event).getSummaryTable(event);
};
