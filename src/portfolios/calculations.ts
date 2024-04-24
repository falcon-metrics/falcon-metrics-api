import _, { countBy } from 'lodash';
import { Logger } from 'log4js';
import { DateTime, Interval } from 'luxon';
import { QueryTypes, Sequelize } from 'sequelize';
import { AggregationKey, generateDateArray } from '../common/aggregation';
import { IQueryFilters } from '../common/filters_v2';
import { SecurityContext } from '../common/security';
import ContextModel from '../models/ContextModel';
import { PortfolioModel } from '../models/PortfolioModel';
import { writerConnection } from '../models/sequelize';
import { NormalisationChartsWorkItem } from '../value_stream_management/delivery_governance/normalisation_charts/calculations';
import { groupWorkItemListByAggregation } from '../value_stream_management/delivery_governance/utils';
import { ExtendedStateItem, RetrievalScenario } from '../workitem/interfaces';
import { momentBizDiff } from '../workitem/utils';
import { IWorkItemQueries, ItemWithContextAndTime } from '../workitem/workitem_queries';
import { RawColumn } from './interfaces';
import { PortfolioDbAurora } from './portfolio_db_aurora';


type WorkItem = Partial<ExtendedStateItem> & { contextId: string; timeSpent?: number; };
type PortfolioAnalysisWorkItem = {
    workItemId?: string;
    isCompleted?: boolean;
    wipAgeInWholeDays?: number;
    leadTimeInWholeDays?: number;
    timeSpent?: number;
    contexts?: string[];
};
export class Calculations {
    readonly orgId: string;
    readonly logger: Logger;
    readonly filters?: IQueryFilters;
    readonly portfolioDbAurora: PortfolioDbAurora;
    readonly auroraWriter: any;
    readonly workItemQueries: IWorkItemQueries;

    constructor(opts: {
        auroraWriter: any;
        security: SecurityContext;
        logger: Logger;
        filters?: IQueryFilters;
        portfolioDbAurora: PortfolioDbAurora;
        workItemQueries: IWorkItemQueries;
    }) {
        this.auroraWriter = opts.auroraWriter;
        this.orgId = opts.security.organisation!;
        this.logger = opts.logger;
        this.filters = opts.filters;
        this.portfolioDbAurora = opts.portfolioDbAurora;
        this.workItemQueries = opts.workItemQueries;
    }

    async getColumns(): Promise<Array<RawColumn | unknown>> {
        const dateRange = await this.filters?.datePeriod();
        const aurora: Sequelize = await this.auroraWriter;
        const rawColumns: Array<RawColumn> = await this.portfolioDbAurora.getAllColumns(
            this.orgId,
            dateRange!,
            aurora,
        ) as any;
        return rawColumns;
    }

    async post(object: RawColumn): Promise<RawColumn | unknown> {
        const aurora: Sequelize = await this.auroraWriter;
        const transaction = await aurora.transaction();
        try {
            const [result] = await this.portfolioDbAurora.create(
                this.orgId,
                object,
                aurora,
                transaction,
            ) as any;
            await transaction.commit();
            return result?.dataValues as RawColumn;
        } catch (error) {
            await transaction.rollback();
            const message =
                error instanceof Error && error?.message
                    ? error.message
                    : 'An error occured on postOrPatch';
            console.debug('Error creating column : ', message);
        }
    }

    async update(
        columns: RawColumn | RawColumn[],
        // TODO: Something is wrong here with the types. Review it
    ): Promise<RawColumn | unknown> {
        const aurora = await writerConnection();
        const model = PortfolioModel(aurora);
        const transaction = await aurora.transaction();

        try {
            const object = Array.isArray(columns) ? columns : [columns];
            const responses = [];

            if (Array.isArray(columns)) {
                for (const column of object) {
                    const index = object.indexOf(column);
                    const payload = {
                        columnId: column,
                        order: index,
                    };

                    const response = await model.update(payload, {
                        transaction,
                        where: {
                            columnId: payload.columnId,
                        } as any,
                    } as any);

                    responses.push(response);
                }
            } else {
                for (const column of object) {
                    const payload = {
                        orgId: this.orgId,
                        columnId: column.columnId,
                        columnName: column.columnName,
                        colour: column.colour,
                        order: column.order,
                    };

                    const response = await model.update(payload, {
                        transaction,
                        where: {
                            columnId: payload.columnId,
                        } as any,
                    } as any);

                    responses.push(response);
                }
            }

            await transaction.commit();
            return Array.isArray(columns) ? responses : responses[0];
        } catch (e) {
            await transaction.rollback();
            throw e;
        }
    }

    async delete(columnId: string): Promise<void> {
        const aurora = await writerConnection();
        const transaction = await aurora.transaction();
        const model = PortfolioModel(aurora);
        try {
            const response = await model.destroy({
                where: {
                    columnId,
                },
            });
            await transaction.commit();
            return response as any;
        } catch (e) {
            await transaction.rollback();
            return e as any;
        }
    }

    private classifyAndGetUniqueItems(items: ItemWithContextAndTime[], obeyaContexts: string[]): ItemWithContextAndTime[] {
        const returnArray: ItemWithContextAndTime[] = [];
        items.forEach(item => {
            if (obeyaContexts.includes(item.contextId)) {
                item.normalizedDisplayName = 'strategic';
            }
            if (!item.normalizedDisplayName) {
                item.normalizedDisplayName = 'operational';
            }
            const idx = returnArray.findIndex(x => x.workItemId === item.workItemId);
            if (idx > -1) {
                returnArray[idx].normalizedDisplayName = item.normalizedDisplayName;
            } else {
                returnArray.push(item);
            }
        });
        return returnArray;
    }

    private async getObeyaContexts(contextId: string, contextsUnderSelectedContext: string[], includeChildren?: boolean) {
        const aurora: Sequelize = await this.auroraWriter;
        const obeyaContextsQuery = `select c."contextId" , obr."roomName", obr."roomId" from contexts c
        inner join  "obeya_rooms" obr on c."obeyaId" = obr."roomId"
        where obr."contextId" in (:contextId)
        and obr."orgId" = :orgId
        and c."orgId" = :orgId
        and  c."positionInHierarchy" like '%.%'`;
        const obeyaContexts: { contextId: string; roomName: string; roomId: string; }[] = await aurora.query(obeyaContextsQuery, {
            replacements: {
                contextId: includeChildren ? contextsUnderSelectedContext : contextId,
                orgId: this.orgId
            },
            type: QueryTypes.SELECT,
            logging: console.log
        });
        return obeyaContexts;
    }


    private mergeWipAndCompleted(wipItems: ItemWithContextAndTime[], completedItems: ItemWithContextAndTime[], interval: Interval, excludeWeekends: boolean) {
        const allItemsForCost: PortfolioAnalysisWorkItem[] = [];
        let filterDuration = Math.ceil(interval.toDuration('days').days);
        if (excludeWeekends) {
            filterDuration = momentBizDiff(interval.start, interval.end);
        }
        wipItems.forEach(x => {
            const item: PortfolioAnalysisWorkItem = _.pick(x, ['workItemId', 'wipAgeInWholeDays', 'leadTimeInWholeDays']);
            item.isCompleted = false;
            if (item.wipAgeInWholeDays) {
                item.timeSpent = item.wipAgeInWholeDays;
                if (item.wipAgeInWholeDays && item.wipAgeInWholeDays > filterDuration) {
                    item.timeSpent = filterDuration;
                }
            }
            const idx = allItemsForCost.findIndex(y => y.workItemId === item.workItemId);
            if (idx === -1) {
                allItemsForCost.push({ ...item, contexts: [x.contextId] });
            } else {
                item.contexts = (allItemsForCost[idx].contexts ?? []).concat([x.contextId]);
                allItemsForCost[idx] = item;
            }
        });
        completedItems.forEach(x => {
            const item: PortfolioAnalysisWorkItem = _.pick(x, ['workItemId', 'wipAgeInWholeDays', 'leadTimeInWholeDays']);
            item.isCompleted = true;
            item.timeSpent = item.leadTimeInWholeDays;
            const idx = allItemsForCost.findIndex(y => y.workItemId === item.workItemId);
            if (idx === -1) {
                allItemsForCost.push({ ...item, contexts: [x.contextId] });
            } else {
                item.contexts = (allItemsForCost[idx].contexts ?? []).concat([x.contextId]);
                allItemsForCost[idx] = item;
            }
        });
        return allItemsForCost;
    }

    async getFocus(contextId: string, interval: Interval, includeChildren?: boolean): Promise<any> {
        const contextsUnderSelectedContext = await this.workItemQueries.getContextIdsForExtendedItems(this.orgId, contextId);
        contextsUnderSelectedContext.push(contextId);

        const obeyaContexts = await this.getObeyaContexts(contextId, contextsUnderSelectedContext, includeChildren);


        const [
            proposedItemsForDistribution,
            proposedItemsForHistorical,
            wipItemsForDistribution,
            wipItemsForHistorical,
            completedItems
        ] = await Promise.all([
            this.workItemQueries.getItemsByContextAndScenario(
                contextsUnderSelectedContext.concat(obeyaContexts.map((x) => x.contextId)),
                [RetrievalScenario.CURRENT_INVENTORY_ONLY],
                this.orgId,
                interval,
                this.filters
            ),
            this.workItemQueries.getItemsByContextAndScenario(
                contextsUnderSelectedContext.concat(obeyaContexts.map((x) => x.contextId)),
                [RetrievalScenario.WAS_INVENTORY_BETWEEN_DATES],
                this.orgId,
                interval,
                this.filters
            ),
            this.workItemQueries.getItemsByContextAndScenario(
                contextsUnderSelectedContext.concat(obeyaContexts.map((x) => x.contextId)),
                [RetrievalScenario.CURRENT_WIP_ONLY],
                this.orgId,
                interval,
                this.filters
            ),
            this.workItemQueries.getItemsByContextAndScenario(
                contextsUnderSelectedContext.concat(obeyaContexts.map((x) => x.contextId)),
                [RetrievalScenario.WAS_WIP_BETWEEN_DATES],
                this.orgId,
                interval,
                this.filters
            ),
            this.workItemQueries.getItemsByContextAndScenario(
                contextsUnderSelectedContext.concat(obeyaContexts.map((x) => x.contextId)),
                [RetrievalScenario.BECAME_COMPLETED_BETWEEN_DATES],
                this.orgId,
                interval,
                this.filters
            )
        ]);
        const oc = obeyaContexts.map((x: any) => x.contextId);
        const allWorkItemsUnderDates = _.uniqBy([...proposedItemsForHistorical, ...wipItemsForHistorical, ...completedItems], 'workItemId').length;
        const strategicWorkItemsUnderDates = _.uniqBy([...proposedItemsForHistorical, ...wipItemsForHistorical, ...completedItems]
            .filter(x => oc.includes(x.contextId)), 'workItemId').length;

        const obeyas: { roomName: any; itemsUnderThisObeya: number; totalItemsUnderAllObeyas: number; contextId: string; roomId: string; }[] = [];
        obeyaContexts.forEach((entry: any) => {
            const itemCount = _.uniqBy([...proposedItemsForHistorical, ...wipItemsForHistorical, ...completedItems].filter((x: any) => x.contextId === entry.contextId), 'workItemId').length;
            if (itemCount > 0)
                obeyas.push({
                    roomName: entry.roomName,
                    contextId: entry.contextId,
                    roomId: entry.roomId,
                    itemsUnderThisObeya: itemCount,
                    totalItemsUnderAllObeyas: allWorkItemsUnderDates
                });
        });

        // Commented till we fix the UX/UI of distribution with Operational Work
        // if ((allWorkItemsUnderDates - strategicWorkItemsUnderDates) > 0)
        //     obeyas.push({
        //         roomName: "Operational work",
        //         contextId: contextId,
        //         roomId: contextId,
        //         itemsUnderThisObeya: allWorkItemsUnderDates - strategicWorkItemsUnderDates,
        //         totalItemsUnderAllObeyas: allWorkItemsUnderDates
        //     });
        //

        //Future
        const formattedProposedItemsForDistribution = this.classifyAndGetUniqueItems(proposedItemsForDistribution, oc);
        const formattedProposedItemsForHistorical: NormalisationChartsWorkItem[] = this.classifyAndGetUniqueItems(proposedItemsForHistorical, oc).map(item => {
            return {
                workItemId: item.workItemId ?? '',
                normalizedDisplayName: item.normalizedDisplayName ?? '',
                dateTime: DateTime.fromJSDate(item.arrivalDate as any),
                dateTimeToExclude: DateTime.fromJSDate(item.commitmentDate as any)
            };
        });
        const proposedDistribution: {
            [normalizedDisplayName: string]: number;
        } = countBy(formattedProposedItemsForDistribution, 'normalizedDisplayName');

        const proposedHistorical = this.groupWorkItemListByAggregation(
            formattedProposedItemsForHistorical,
            'month',
            false,
            interval
        );
        //Present
        const formattedWipItemsForDistribution = this.classifyAndGetUniqueItems(wipItemsForDistribution, oc);
        const formattedWipItemsForHistorical: NormalisationChartsWorkItem[] = this.classifyAndGetUniqueItems(wipItemsForHistorical, oc).map(item => {
            return {
                workItemId: item.workItemId ?? '',
                normalizedDisplayName: item.normalizedDisplayName ?? '',
                dateTime: DateTime.fromJSDate(item.commitmentDate as any),
                dateTimeToExclude: DateTime.fromJSDate(item.departureDate as any)
            };
        });
        const wipDistribution: {
            [normalizedDisplayName: string]: number;
        } = countBy(formattedWipItemsForDistribution, 'normalizedDisplayName');

        const wipHistorical = this.groupWorkItemListByAggregation(
            formattedWipItemsForHistorical,
            'month',
            false,
            interval
        );
        //Past
        const formattedCompletedItems: NormalisationChartsWorkItem[] = this.classifyAndGetUniqueItems(completedItems, oc).map(item => {
            return {
                workItemId: item.workItemId ?? '',
                normalizedDisplayName: item.normalizedDisplayName ?? '',
                dateTime: DateTime.fromJSDate(item.departureDate as any)
            };
        });
        const completedDistribution: {
            [normalizedDisplayName: string]: number;
        } = countBy(formattedCompletedItems, 'normalizedDisplayName');

        const completedHistorical = this.groupWorkItemListByAggregation(
            formattedCompletedItems,
            'month',
            true,
            interval
        );
        [...proposedHistorical, ...wipHistorical, ...completedHistorical].forEach(x => {
            x.workItems = undefined;
            if (!Object.keys(x.values).includes('strategic')) {
                x.values.strategic = 0;
            }
            if (!Object.keys(x.values).includes('operational')) {
                x.values.operational = 0;
            }
        });
        [proposedDistribution, wipDistribution, completedDistribution].forEach(x => {
            if (!Object.keys(x).includes('strategic')) {
                x.strategic = 0;
            }
            if (!Object.keys(x).includes('operational')) {
                x.operational = 0;
            }
        });
        const wipCopy = _.cloneDeep(wipItemsForHistorical);
        const temp: NormalisationChartsWorkItem[] = [];
        obeyaContexts.forEach((entry: any) => {
            const wipItemsOfObeya = _.uniqBy(wipCopy.filter((x: any) => x.contextId === entry.contextId), 'workItemId');
            wipItemsOfObeya.forEach(item =>
                temp.push({
                    workItemId: item.workItemId ?? '',
                    normalizedDisplayName: entry.roomName,
                    dateTime: DateTime.fromJSDate(item.commitmentDate as any),
                    dateTimeToExclude: DateTime.fromJSDate(item.departureDate as any)
                })
            );
        });

        const obeyaHistorical = this.groupWorkItemListByAggregation(
            temp,
            'month',
            false,
            interval
        );

        obeyaHistorical.forEach(value => {
            const matchingOperational = wipHistorical.find(x => x.dateStart === value.dateStart && x.dateEnd === value.dateEnd);
            value.values['operational'] = matchingOperational?.values['operational'] ?? 0;
        });
        const percentageStrategic = (strategicWorkItemsUnderDates / allWorkItemsUnderDates) * 100;

        const excludeWeekends = !!(await this.filters?.getExcludeWeekendsSetting(this.orgId));

        //Compute lead time
        const allItemsForCost = this.mergeWipAndCompleted(wipItemsForHistorical, completedItems, interval, excludeWeekends);
        const filterDuration = Math.floor(interval.toDuration('days').days);
        const totalLeadTime = allItemsForCost.reduce((prevValue, item) => {
            return prevValue + item.timeSpent!;
        }, 0);
        const dateArray = generateDateArray(
            interval,
            'month',
        );
        const intervals = dateArray.map((dateTime, index) => ({
            start: index === 0 ? interval.start : dateTime,
            end: index === dateArray.length - 1 ? interval.end : dateTime.endOf("month")
        }));
        const promises = intervals.map(intr => [
            this.workItemQueries.getItemsByContextAndScenario(
                contextsUnderSelectedContext.concat(obeyaContexts.map((x) => x.contextId)),
                [RetrievalScenario.WAS_WIP_BETWEEN_DATES],
                this.orgId,
                Interval.fromDateTimes(intr.start, intr.end),
                this.filters,
            ),
            this.workItemQueries.getItemsByContextAndScenario(
                contextsUnderSelectedContext.concat(obeyaContexts.map((x) => x.contextId)),
                [RetrievalScenario.BECAME_COMPLETED_BETWEEN_DATES],
                this.orgId,
                Interval.fromDateTimes(intr.start, intr.end),
                this.filters,
            )
        ]
        );
        const monthlyItemsResults = await Promise.all(promises.map(p => Promise.all(p)));

        const strategicLeadTime = allItemsForCost.filter(x =>
            oc.some(contextId => x.contexts?.includes(contextId))
        ).reduce((prevValue, item) => {
            const itemTime = (item.timeSpent || 0);
            return prevValue + itemTime;
        }, 0);
        const obeyaTimes: any[] = [];
        obeyaContexts.forEach((entry) => {
            const itemsUnderThisObeya = allItemsForCost.filter(x => x.contexts?.includes(entry.contextId));
            const obeyaLeadTime = itemsUnderThisObeya.reduce((prevValue, item) => {
                const timeSpent = allItemsForCost.find(x => x.workItemId === item.workItemId)?.timeSpent;
                const itemTime = (timeSpent ?? 0);
                return prevValue + itemTime;
            }, 0);
            if (obeyaLeadTime > 0)
                obeyaTimes.push({
                    roomName: entry.roomName,
                    contextId: entry.contextId,
                    roomId: entry.roomId,
                    obeyaLeadTime,
                    totalLeadTime
                });
        });

        // Commented till we fix the UX/UI of distribution with Operational Work
        // if ((totalLeadTime - strategicLeadTime) > 0)
        //     obeyaTimes.push({
        //         roomName: "Operational work",
        //         contextId: contextId,
        //         roomId: contextId,
        //         obeyaLeadTime: totalLeadTime - strategicLeadTime,
        //         totalLeadTime
        //     });
        //
        const monthlyLeadTimes = intervals.map((interval, index) => {
            const returnValue = {
                dateStart: interval.start,
                dateEnd: interval.end,
                values: {} as any
            };
            const wip = monthlyItemsResults[index][0];
            const completed = monthlyItemsResults[index][1];
            const mergedWipAndCompletedItems = this.mergeWipAndCompleted(wip, completed, Interval.fromDateTimes(interval.start, interval.end), excludeWeekends);

            // Commented till we fix the UX/UI of distribution with Operational Work
            // const operationalMonthlyTime = mergedWipAndCompletedItems.filter(x =>
            //     !oc.some(contextId => x.contexts?.includes(contextId))
            // ).reduce((prevValue, item) => {
            //     const itemTime = (item.timeSpent || 0);
            //     return prevValue + itemTime;
            // }, 0);
            // if (operationalMonthlyTime > 0)
            //     returnValue.values["Operational work"] = operationalMonthlyTime;
            //

            obeyaContexts.forEach(obeyaContext => {
                const obeyaMonthCost = mergedWipAndCompletedItems.filter(x => x.contexts?.includes(obeyaContext.contextId)).reduce((prevValue, item) => {
                    const itemTime = (item.timeSpent ?? 0);
                    return prevValue + itemTime;
                }, 0);
                if (obeyaMonthCost > 0)
                    returnValue.values[obeyaContext.roomName] = obeyaMonthCost;
            });
            return returnValue;
        });
        const response = {
            profileOfWork: {
                strategic: strategicWorkItemsUnderDates,
                operational: allWorkItemsUnderDates - strategicWorkItemsUnderDates,
                distribution: obeyas,
                historical: obeyaHistorical,
                percentageStrategic,
                percentageOperational: 100 - percentageStrategic,
                perspectives: {
                    upcomingWork: {
                        distribution: proposedDistribution,
                        historical: proposedHistorical
                    },
                    workInProcess: {
                        distribution: wipDistribution,
                        historical: wipHistorical
                    },
                    completedWork: {
                        distribution: completedDistribution,
                        historical: completedHistorical
                    }
                }
            },
            cognitiveLoad: {
                strategic: strategicLeadTime,
                operational: totalLeadTime - strategicLeadTime,
                distribution: obeyaTimes,
                historical: monthlyLeadTimes
            },
            cost: {}
        };
        //Compute cost
        const cost = await this.getCost(contextId);
        // If cost not configured
        if (cost === undefined) {
            console.warn(`Cost is undefined for the context. Exiting cost analysis`);
        } else {
            const totalCost = (filterDuration / cost.days) * cost.cost;
            const costPerLeadTimeUnit = totalCost / totalLeadTime;

            response.cost = {
                strategic: response.cognitiveLoad.strategic * costPerLeadTimeUnit,
                operational: response.cognitiveLoad.operational * costPerLeadTimeUnit,
                distribution: obeyaTimes.map(x => {
                    return {
                        roomName: x.roomName,
                        contextId: x.contextId,
                        roomId: x.roomId,
                        obeyaCost: x.obeyaLeadTime * costPerLeadTimeUnit,
                        allObeyaCost: x.totalLeadTime * costPerLeadTimeUnit
                    };
                }),
                historical: response.cognitiveLoad.historical.map(x => {
                    return {
                        dateStart: x.dateStart,
                        dateEnd: x.dateEnd,
                        values: Object.keys(x.values).reduce(
                            (result, key) => ({
                                ...result,
                                [key]: x.values[key] * costPerLeadTimeUnit,
                            }),
                            {}
                        )
                    };
                })
            };
        }
        return response;
    }

    /**
     * Get cost of the context
     * 
     * If an aggregation context, 
     */
    async getCost(contextId: string)
        : Promise<{
            cost: number;
            unit: 'month' | 'quarter' | 'year';
            days: number;
        } | undefined> {
        // Hardcoded for now. Get the cost from the database
        const database = await this.auroraWriter;
        const contextModel = await ContextModel(database);
        const context = await contextModel.findOne({
            where: {
                orgId: this.orgId,
                contextId,
                archived: false,
                obeyaId: null,
            } as any
        });
        if (!context) return;

        if (!context.cost) return;

        return { cost: context.cost, unit: 'month', days: 30 };
    }

    private groupWorkItemListByAggregation(
        workItemList: NormalisationChartsWorkItem[],
        aggregation: AggregationKey,
        isBecameScenario: boolean,
        interval: Interval
    ) {
        return groupWorkItemListByAggregation(
            workItemList,
            aggregation,
            isBecameScenario,
            interval,
            // For cost analysis, we need the work items in every bucket
            // true
        );
    }
}
