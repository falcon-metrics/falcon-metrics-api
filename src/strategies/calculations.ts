import { Logger } from 'log4js';
import { QueryTypes, Sequelize } from 'sequelize';
import { IQueryFilters } from '../common/filters_v2';
import { SecurityContext } from '../common/security';
import { StrategyDbAurora } from './strategies_db_aurora';
import { StrategyItem } from './interfaces';
import { ObjectivesModel } from '../models/ObjectiveModel';
import { OKRKeyResult, OKRObjective } from '../obeya/objectives/calculations';
import RelationshipsDbAurora from '../relationships/relationships_db_aurora';
import { KeyResultsModel } from '../models/KeyResultModel';
import { HighlightsResponse, ObeyaCalculation } from '../obeya/calculations';
import _ from 'lodash';

export class Calculations {
    readonly orgId?: string;
    readonly logger: Logger;
    readonly filters?: IQueryFilters;
    readonly strategyDbAurora: StrategyDbAurora;
    readonly auroraWriter: Promise<Sequelize>;
    private relationshipsDbAurora: RelationshipsDbAurora;
    readonly obeyaCalculations: ObeyaCalculation;

    constructor(opts: {
        relationshipsDbAurora: RelationshipsDbAurora;
        auroraWriter: Promise<Sequelize>;
        security: SecurityContext;
        logger: Logger;
        filters?: IQueryFilters;
        strategyDbAurora: StrategyDbAurora;
        obeyaCalculations: ObeyaCalculation;
    }) {
        this.auroraWriter = opts.auroraWriter;
        this.orgId = opts.security.organisation!;
        this.logger = opts.logger;
        this.filters = opts.filters;
        this.strategyDbAurora = opts.strategyDbAurora;
        this.relationshipsDbAurora = opts.relationshipsDbAurora;
        this.obeyaCalculations = opts.obeyaCalculations;
    }

    async getStrategy(id: number | string): Promise<StrategyItem[]> {
        // const dateRange = await this.filters?.datePeriod();
        return await this.strategyDbAurora.getStrategy(
            id,
            this.orgId!,
            // dateRange!,
        );
    }

    async getStrategyFromStrategicDriver(
        parentStrategicDriverId: string,
    ): Promise<StrategyItem[]> {
        return await this.strategyDbAurora.getStrategyFromStrategicDriver(
            parentStrategicDriverId,
            this.orgId!,
        );
    }

    async getAllStrategies(
        contextId?: string,
        horizonId?: string,
    ): Promise<StrategyItem[]> {
        return await this.strategyDbAurora.getAllStrategies(
            this.orgId!,
            contextId,
            horizonId,
        );
    }

    async createStrategy(
        strategyObject: StrategyItem,
    ): Promise<StrategyItem | unknown> {
        const aurora: Sequelize = await this.auroraWriter;
        try {
            const result = await this.strategyDbAurora.saveStrategy(
                this.orgId!,
                strategyObject,
                aurora,
            );
            return result;
        } catch (e) {
            console.error(e);
            this.logger.error(JSON.stringify({
                message: 'Error in createStrategy',
                errorMessage: (e as Error).message,
                errorStack: (e as Error).stack,
            }));
            throw e;
        }
    }

    async updateStrategy(
        strategyObject: StrategyItem,
    ): Promise<StrategyItem | unknown> {
        const aurora: Sequelize = await this.auroraWriter;
        try {
            const result = await this.strategyDbAurora.updateStrategy(
                this.orgId!,
                strategyObject,
                aurora,
            );
            if (strategyObject.okrs) {
                const okrResult = await this.updateOkr(strategyObject.okrs, strategyObject.id ? parseInt(strategyObject.id.toString()) : 0);
            }
            return result;
        } catch (e) {
            console.error(e);
            this.logger.error(JSON.stringify({
                message: 'Error in updateStrategy',
                errorMessage: (e as Error).message,
                errorStack: (e as Error).stack,
            }));
            throw e;
        }
    }

    async deleteStrategy(strategyId: number): Promise<void> {
        const aurora: Sequelize = await this.auroraWriter;
        try {
            await this.strategyDbAurora.deleteStrategy(strategyId, this.orgId!, aurora);
        } catch (e) {
            console.error(e);
            this.logger.error(JSON.stringify({
                message: 'Error in deleteStrategy',
                errorMessage: (e as Error).message,
                errorStack: (e as Error).stack,
            }));
            throw e;
        }
    }

    async getOkrs(strategyId: string) {
        const aurora: Sequelize = await this.auroraWriter;
        const model = ObjectivesModel(aurora);
        const predicate = {
            where: {
                orgId: this.orgId,
                strategyId: strategyId,
            },
        };
        try {

            const objectives: any = await model.findAll({
                ...predicate,
                raw: true,
                logging: console.log
            });
            await Promise.all(objectives.map(async (objective: OKRObjective) => {
                const relationshipCount = await this.relationshipsDbAurora.getRelationshipCount(objective.objectiveId, 'strategicObjective', this.orgId!);
                objective.relationshipCount = relationshipCount;
            }));
            await Promise.all(
                objectives.map(async (objective: OKRObjective) => {
                    const keyResults = await this.getKeyResultsFromObjective(
                        objective.objectiveId,
                        this.orgId!
                    );
                    console.log(keyResults, "KRS");
                    objective.keyResults = keyResults;
                })
            );
            return objectives;
        } catch (e) {
            console.error(e);
            this.logger.error(JSON.stringify({
                message: 'Error in getOkrs',
                errorMessage: (e as Error).message,
                errorStack: (e as Error).stack,
            }));
            throw e;
        }
    }

    async getKeyResultsFromObjective(objectiveId: string, orgId: string) {
        const aurora = await this.auroraWriter;
        const model = KeyResultsModel(aurora);
        const keyresults: Array<OKRKeyResult> = await model.findAll({
            where: {
                objectiveId,
                orgId,
            },
            raw: true,
            logging: console.log
        }) as any;
        let OKRKeyResults: Array<OKRKeyResult> = [];
        OKRKeyResults = await Promise.all(
            keyresults.map(async (keyResult: any) => {
                const newKR: OKRKeyResult = {
                    orgId,
                    objectiveId,
                    keyResultId: keyResult.keyResultId,
                    keyResultDescription: keyResult.keyResultDescription,
                    completed: keyResult.completed,
                    parentWorkItemId: keyResult.parentWorkItemId,
                    parentWorkItemTitle: keyResult.parentWorkItemTitle,
                    numberOfItemsCompleted: undefined,
                    numberOfItemsInProgress: undefined,
                    numberOfItemsProposed: undefined,
                    completedItems: [],
                    inProgressItems: [],
                    proposedItems: [],
                    ratingId: keyResult.ratingId,
                    ratingDescription: keyResult.ratingDescription,
                    includeChildren: keyResult.includeChildren,
                    includeRelated: keyResult.includeRelated,
                    createdAt: keyResult.createdAt,
                    childItemLevel: keyResult.childItemLevel,
                    linkTypes: keyResult.linkTypes
                };
                console.log("KR id" + newKR.keyResultId);
                const relationships = await this.relationshipsDbAurora.getRelationshipCount(newKR.keyResultId || '', "strategyKeyResult", orgId);
                newKR.relationshipCount = relationships;
                return newKR;
            }
            ));
        return OKRKeyResults;
    }

    async getKeyResultProgress(keyResultId: string, clientTimezone: string) {
        const aurora = await this.auroraWriter;
        const model = KeyResultsModel(aurora);
        const keyresults: Array<OKRKeyResult> = await model.findAll({
            where: {
                keyResultId,
                orgId: this.orgId,
            },
            raw: true,
            logging: console.log
        }) as any;
        type ResultType = {
            numberOfItemsCompleted: undefined | number;
            numberOfItemsInProgress: undefined | number;
            numberOfItemsProposed: undefined | number;
        };
        const result: ResultType = {
            numberOfItemsCompleted: undefined,
            numberOfItemsInProgress: undefined,
            numberOfItemsProposed: undefined
        };
        if (keyresults.length > 0) {
            const keyResult = keyresults[0];
            const relationships = await this.relationshipsDbAurora.getRelationships(this.orgId!, keyResult.keyResultId || '', "strategyKeyResult");
            if (relationships.filter(i => i.toType === 'obeyaRoom').length > 0) {
                result.numberOfItemsCompleted = 0;
                result.numberOfItemsInProgress = 0;
                result.numberOfItemsProposed = 0;
                await Promise.all(relationships.filter(i => i.toType === 'obeyaRoom').map(async (roomRelationship) => {
                    const obeyaData = await this.obeyaCalculations.getSavedObeyaData(
                        roomRelationship.toId,
                        clientTimezone,
                    );
                    const highlights: HighlightsResponse = await this.obeyaCalculations.getScopeInfo(obeyaData);
                    const obeyaTotals = highlights.reduce((acc, item) => {
                        acc.completed = acc.completed + item.completed;
                        acc.inProgress = acc.inProgress + item.inProgress;
                        acc.proposed = acc.proposed + item.proposed;
                        return acc;
                    }, { completed: 0, inProgress: 0, proposed: 0 });
                    result.numberOfItemsCompleted = result.numberOfItemsCompleted! + obeyaTotals.completed;
                    result.numberOfItemsInProgress = result.numberOfItemsInProgress! + obeyaTotals.inProgress;
                    result.numberOfItemsProposed = result.numberOfItemsProposed! + obeyaTotals.proposed;
                }));
            }
        }
        return result;
    }

    async updateOkr(okrs: OKRObjective[], strategyId: number) {
        try {
            const aurora: Sequelize = await this.auroraWriter;
            const model = ObjectivesModel(aurora);
            const keyResultModel = KeyResultsModel(aurora);
            const ids = okrs.map(i => i.objectiveId);
            const objectives: any[] = await model.findAll({
                where: {
                    strategyId: strategyId.toString(),
                    orgId: this.orgId!,
                },
                raw: true
            });
            okrs.forEach(okr => {
                okr.orgId = this.orgId!;
                okr.roomId = '';
                okr.strategyId = strategyId.toString();
                okr.keyResults?.map(kr => {
                    kr.orgId = this.orgId!;
                    kr.strategyId = strategyId;
                    kr.objectiveId = okr.objectiveId;
                    kr.roomId = '';
                });
            });
            //Hanlde objective updates
            const idsToDelete = objectives.map(i => i.objectiveId).filter(i => !okrs.map(x => x.objectiveId).includes(i));
            const idsToUpdate = objectives.map(i => i.objectiveId).filter(i => okrs.map(x => x.objectiveId).includes(i));
            const idsToCreate = okrs.map(i => i.objectiveId).filter(i => !objectives.map(x => x.objectiveId).includes(i));
            let objectivePromises = [];
            if (idsToDelete.length > 0) {
                const deletePromise = model.destroy({
                    where: {
                        objectiveId: idsToDelete,
                        orgId: this.orgId!
                    },
                    logging: console.log
                });
                const deleteKrFromObjectivesPromise = keyResultModel.destroy({
                    where: {
                        objectiveId: idsToDelete,
                        orgId: this.orgId!
                    },
                    logging: console.log
                });
                const objectivesRelationshipsPromise = Promise.all(idsToDelete.map(async (id) => {
                    const relationshipCount = await this.relationshipsDbAurora.removeRelationships(id, 'strategicObjective', this.orgId!);
                }));
                objectivePromises.push(objectivesRelationshipsPromise);
                objectivePromises.push(deletePromise);
                objectivePromises.push(deleteKrFromObjectivesPromise);
            }
            if (idsToCreate.length > 0) {
                const createPromise = model.bulkCreate(okrs.filter(i => idsToCreate.includes(i.objectiveId)), {
                    fields:
                        ["orgId", "roomId", "objectiveId", "objectiveDescription", "ratingId", "ratingDescription", "achieved", "contextId", "strategyId"],
                    logging: console.log
                });
                objectivePromises.push(createPromise);
            }
            if (idsToUpdate.length > 0) {
                const updatePromise = Promise.all(okrs.filter(i => idsToUpdate.includes(i.objectiveId)).map(async (objective) => {
                    await model.update(objective, {
                        where: {
                            objectiveId: objective.objectiveId,
                            orgId: this.orgId!
                        } as any,
                        logging: console.log
                    } as any);
                }));
                objectivePromises.push(updatePromise);
            }
            await Promise.all(objectivePromises as any);
            //Hanlde key result updates
            const krIdsToDelete: any[] = [];
            const krIdsToUpdate: (string | undefined)[] = [];
            const krIdsToCreate: any[] = [];
            const incomingKrs = _.flatten(okrs.map(i => i.keyResults || []));
            if (idsToCreate.length > 0) {
                okrs.filter(i => idsToCreate.includes(i.objectiveId)).forEach(i => i.keyResults?.map(x => krIdsToCreate.push(x.keyResultId)));
            }
            if (idsToUpdate.length > 0) {
                const savedKrs: any[] = await keyResultModel.findAll({
                    where: {
                        objectiveId: idsToUpdate,
                        orgId: this.orgId!
                    },
                    raw: true,
                    logging: console.log
                });
                savedKrs.filter(i => !incomingKrs.map(x => x.keyResultId || '').includes(i.keyResultId)).forEach(i => krIdsToDelete.push(i.keyResultId));
                incomingKrs.filter(i => !savedKrs.map(x => x.keyResultId).includes(i.keyResultId)).forEach(i => krIdsToCreate.push(i.keyResultId || ''));
                incomingKrs.filter(i => savedKrs.map(x => x.keyResultId).includes(i.keyResultId)).forEach(i => krIdsToUpdate.push(i.keyResultId || ''));
            }
            console.log("305", krIdsToCreate, krIdsToDelete, krIdsToUpdate);
            const krPromises = [];
            if (krIdsToDelete.length > 0) {
                const deleteKrPromise = keyResultModel.destroy({
                    where: {
                        keyResultId: krIdsToDelete,
                        orgId: this.orgId!
                    },
                    logging: console.log
                });
                krPromises.push(deleteKrPromise);
            }
            if (krIdsToCreate.length > 0) {
                console.log("385", incomingKrs.filter(i => krIdsToCreate.includes(i.keyResultId)));
                console.log(incomingKrs);
                const createKrPromise = keyResultModel.bulkCreate(incomingKrs.filter(i => krIdsToCreate.includes(i.keyResultId)), {
                    fields:
                        ["orgId", "roomId", "contextId", "objectiveId", "keyResultId", "keyResultDescription", "completed", "parentWorkItemId", "parentWorkItemTitle", "ratingId", "ratingDescription", "includeChildren", "includeRelated", "includeChildrenOfChildren", "includeChildrenOfRelated", "childItemLevel", "linkTypes", "initiativeId", "strategyId"],
                    logging: console.log
                });
                krPromises.push(createKrPromise);
            }
            if (krIdsToUpdate.length > 0) {
                const updateKrPromise = Promise.all(incomingKrs.filter(i => krIdsToUpdate.includes(i.keyResultId)).map(async (keyResult) => {
                    await keyResultModel.update(keyResult, {
                        where: {
                            keyResultId: keyResult.keyResultId,
                            orgId: this.orgId!
                        } as any,
                        logging: console.log
                    } as any);
                }));
                krPromises.push(updateKrPromise);
            }
            await Promise.all(krPromises as any);
            await Promise.all(krIdsToDelete.map(async (deletedkeyResultId) => {
                const relationshipCount = await this.relationshipsDbAurora.removeRelationships(deletedkeyResultId.keyResultId, 'strategyKeyResult', this.orgId!);
            }));
            return true;
        } catch (e) {
            console.error(e);
            this.logger.error(JSON.stringify({
                message: 'Error in updateOkr',
                errorMessage: (e as Error).message,
                errorStack: (e as Error).stack,
            }));
            throw e;
        }
    }

    async getStrategyPreviewFromObjective(objectiveId: string) {
        try {
            const aurora: Sequelize = await this.auroraWriter;
            const model = ObjectivesModel(aurora);
            const objective: any = await model.findOne({
                where: {
                    orgId: this.orgId,
                    objectiveId
                },
                raw: true
            });
            if (objective) {
                const strategyId = parseInt(objective.strategyId.toString());
                const strategy = await this.getStrategy(
                    strategyId,
                );
                if (strategy[0]) {
                    const keyResults = await this.getKeyResultsFromObjective(objectiveId, this.orgId!);
                    objective.keyResults = keyResults;
                    strategy[0].okrs = [objective];
                    return strategy[0];
                }
                return undefined;
            }
            return undefined;
        } catch (e) {
            console.error(e);
            this.logger.error(JSON.stringify({
                message: 'Error in getStrategyPreviewFromObjective',
                errorMessage: (e as Error).message,
                errorStack: (e as Error).stack,
            }));
            throw e;
        }
    }

    async getStrategyPreviewFromKeyResult(keyResultId: string) {
        try {
            const aurora: Sequelize = await this.auroraWriter;
            const model = ObjectivesModel(aurora);
            const keyResultModel = KeyResultsModel(aurora);
            const keyResult: any = await keyResultModel.findOne({
                where: {
                    orgId: this.orgId,
                    keyResultId
                },
                raw: true
            });
            if (keyResult) {
                const objectiveId = keyResult.objectiveId;
                const strategyId = parseInt(keyResult.strategyId.toString());
                const objectivePromise: any = model.findOne({
                    where: {
                        orgId: this.orgId,
                        objectiveId
                    },
                    raw: true
                });
                const strategyPromise = this.getStrategy(
                    strategyId,
                );
                const [strategy, objective] = await Promise.all([strategyPromise, objectivePromise]);
                if (strategy[0] && objective) {
                    objective.keyResults = [keyResult];
                    strategy[0].okrs = [objective];
                    return strategy[0];
                }
                return undefined;
            }
            return undefined;
        } catch (e) {
            console.error(e);
            this.logger.error(JSON.stringify({
                message: 'Error in getStrategyPreviewFromKeyResult',
                errorMessage: (e as Error).message,
                errorStack: (e as Error).stack,
            }));
            throw e;
        }
    }
}
