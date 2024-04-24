import flatten from 'lodash/flatten';
import groupBy from 'lodash/groupBy';
import uniqBy from 'lodash/uniqBy';
import { Logger } from 'log4js';
import {
    Op,
    Sequelize,
    Transaction,
} from 'sequelize';
import { v4 as uuidV4 } from 'uuid';

import { SecurityContext } from '../../common/security';
import { KeyResultsModel } from '../../models/KeyResultModel';
import { ObjectivesModel } from '../../models/ObjectiveModel';
import { OKRRatingModel } from '../../models/OKRRatingModel';
import {
    StateItem,
    WorkItemStatesItem,
} from '../../workitem/interfaces';
import {
    IState,
} from '../../workitem/state_aurora';
import { ObeyaCalculation } from '../calculations';

export type OKRKeyResult = {
    orgId?: string;
    objectiveId?: string;
    roomId?: string;
    keyResultId?: string;
    initiativeId?: string;
    keyResultDescription?: string;
    completed?: boolean;
    parentWorkItemId?: string;
    parentWorkItemTitle?: string;
    numberOfItemsCompleted?: number;
    numberOfItemsInProgress?: number;
    numberOfItemsProposed?: number;
    completedItems?: StateItem[];
    inProgressItems?: StateItem[];
    proposedItems?: StateItem[];
    ratingId?: string;
    ratingDescription?: string;
    includeChildren?: boolean;
    includeRelated?: boolean;
    includeChildrenOfChildren?: boolean;
    includeChildrenOfRelated?: boolean;
    createdAt?: string;
    updatedAt?: string;
    childItemLevel?: number;
    linkTypes?: string[];
    relationshipCount?: number;
    contextId?: string;
    strategyId?: number;
};

export type OKRObjective = {
    orgId: string;
    roomId: string;
    contextId?: string;
    objectiveId: string;
    objectiveDescription?: string;
    ratingId?: string;
    ratingDescription?: string;
    createdAt?: Date;
    keyResults?: Array<OKRKeyResult>;
    achieved?: boolean;
    relationshipCount?: number;
    strategyId?: string;
};

export type ObeyaOKRs = {
    OKRs?: Array<OKRObjective>;
};

export type CountStatus = {
    parentId: string;
    numberOfItemsCompleted: number;
    numberOfItemsInProgress: number;
    numberOfItemsProposed: number;
};

export class ObjectiveCalculations {
    private orgId: string;
    private logger: Logger;
    private state: IState;
    private auroraWriter: Promise<Sequelize>;
    private obeyaCalculation: any;
    readonly obeyaRoomsCalculations: any;

    constructor(opts: {
        security: SecurityContext;
        logger: Logger;
        state: IState;
        auroraWriter: Promise<Sequelize>;
        obeyaCalculation: ObeyaCalculation;
        obeyaRoomsCalculations: any;
    }) {
        this.orgId = opts.security.organisation!;
        this.logger = opts.logger;
        this.state = opts.state;
        this.auroraWriter = opts.auroraWriter;
        this.obeyaCalculation = opts.obeyaCalculation;
        this.obeyaRoomsCalculations = opts.obeyaRoomsCalculations;
    }

    async createOkr(okrObjective: OKRObjective): Promise<OKRObjective | { error: true, message: string; }> {
        try {
            const newObjective = await this.createOKR(okrObjective);
            return newObjective;
        } catch (error) {
            const message = error instanceof Error ? error.message : `Unknown error while creating/updating a OKR object`;
            console.debug('Error creating OKRs:', message);
            throw error;
        }
    }
    async updateOkr(okrObjective: OKRObjective): Promise<OKRObjective | { error: true, message: string; }> {
        try {
            const newObjective = await this.updateOKR(okrObjective);
            return newObjective;
        } catch (error) {
            const message = error instanceof Error ? error.message : `Unknown error while creating/updating a OKR object`;
            console.debug('Error creating OKRs:', message);
            throw error;
        }
    }

    private async updateOKR(okrObjective: OKRObjective): Promise<OKRObjective> {
        const sequelize = await this.auroraWriter;
        const transaction = await sequelize.transaction();
        const receivedObject = {
            orgId: this.orgId,
            roomId: okrObjective.roomId,
            contextId: okrObjective?.contextId,
            objectiveDescription: okrObjective.objectiveDescription,
            ratingId: okrObjective.ratingId,
            ratingDescription: okrObjective.ratingDescription,
            createdAt: okrObjective.createdAt,
            objectiveId: okrObjective.objectiveId,
            keyResults: okrObjective.keyResults ?? [],
            achieved: okrObjective.achieved ?? false
        };

        receivedObject.ratingDescription = await this.getRating(
            this.orgId,
            okrObjective.ratingId!,
            sequelize,
        );

        const model = ObjectivesModel(sequelize);

        try {
            await model.update(receivedObject, {
                where: {
                    orgId: this.orgId,
                    roomId: receivedObject.roomId,
                    objectiveId: okrObjective.objectiveId,
                } as any,
                transaction,
            } as any);

            await this.resyncKeyResults(
                receivedObject,
                transaction,
                false
            );

            await transaction.commit();

            return receivedObject;
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    }

    private async createOKR(okrObjective: OKRObjective): Promise<OKRObjective> {
        const sequelize = await this.auroraWriter;
        const transaction = await sequelize.transaction();
        const receivedObject = {
            orgId: this.orgId,
            roomId: okrObjective.roomId,
            contextId: okrObjective?.contextId,
            objectiveDescription: okrObjective.objectiveDescription,
            ratingId: okrObjective.ratingId,
            ratingDescription: okrObjective.ratingDescription,
            createdAt: okrObjective.createdAt,
            objectiveId: uuidV4(),
            keyResults: okrObjective.keyResults ?? [],
            achieved: okrObjective.achieved ?? false,
        };

        receivedObject.ratingDescription = await this.getRating(
            this.orgId,
            okrObjective.ratingId!,
            sequelize,
        );

        const model = ObjectivesModel(sequelize);

        try {
            await model.create(receivedObject, { transaction });

            await this.resyncKeyResults(
                receivedObject,
                transaction,
                true
            );

            await transaction.commit();

            return receivedObject;
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    }


    async resyncKeyResults(objective: OKRObjective, transaction: any, isNewObjectiveId: boolean) {
        if (!(objective.keyResults instanceof Array)) {
            throw new Error("Could not sync key results because the list is invalid");
        }
        if (!objective.roomId) {
            throw new Error("OKR is missing room id");
        }
        if (!this.orgId) {
            throw new Error("Missing valid org id");
        }

        const aurora: Sequelize = await this.auroraWriter;
        const model = KeyResultsModel(aurora);

        const existingKeyResultIdList: string[] = isNewObjectiveId ? [] : (
            await model.findAll({
                attributes: ["keyResultId"],
                where: {
                    orgId: this.orgId,
                    roomId: objective.roomId,
                    objectiveId: objective.objectiveId
                }
            })
        ).map(
            (keyResult) => ((keyResult as OKRKeyResult).keyResultId ?? "")
        );

        // Updated list of objects that already exists on the database and must just change
        const updated: Array<OKRKeyResult> = objective.keyResults.filter(
            keyResult => existingKeyResultIdList.includes(keyResult.keyResultId ?? "")
        );

        // Create deleted list by using the intersection between updated and existing
        const updatedKeyResultIdList: string[] = updated.map((keyResult) => (keyResult.keyResultId ?? ""));
        const deletedKeyResultIdList: string[] = existingKeyResultIdList.filter(existingKeyResultId => existingKeyResultId && !updatedKeyResultIdList.includes(existingKeyResultId));

        updated.forEach(
            keyResult => {
                // Make sure orgId is present with the logged in credentials
                keyResult.orgId = this.orgId;
                // Make sure the target matches the parent object values
                keyResult.roomId = objective.roomId;
                keyResult.objectiveId = objective.objectiveId;
                // Remove createdAt and updatedAt as that's handled internally on sequelize
                delete keyResult.createdAt;
                delete keyResult.updatedAt; 
            }
        );

        // Apply update changes (sequelize does not support bulk update)
        for (let updatedKeyResult of updated) {
            await model.update(updatedKeyResult, {
                where: {
                    orgId: this.orgId,
                    roomId: objective.roomId,
                    keyResultId: updatedKeyResult.keyResultId
                } as any,
                transaction,
            } as any);
        }

        // Apply deletion on the rows that exists on the database but are missing on the new object
        if (deletedKeyResultIdList.length) {
            await model.destroy({
                where: {
                    orgId: this.orgId,
                    roomId: objective.roomId,
                    keyResultId: {
                        [Op.in]: deletedKeyResultIdList
                    }
                },
                transaction,
            });
        }

        // Create inserted list of new objects to be added to the database
        const inserted: Array<OKRKeyResult> = objective.keyResults.filter(
            keyResult => !existingKeyResultIdList.includes(keyResult.keyResultId ?? "")
        );

        inserted.forEach(
            (keyResult, index) => {
                // Make sure it has a valid uuid
                keyResult.keyResultId = keyResult.keyResultId ?? uuidV4();
                // Make sure orgId is present with the logged in credentials
                keyResult.orgId = this.orgId;
                // Make sure the target matches the parent object values
                keyResult.roomId = objective.roomId;
                keyResult.objectiveId = objective.objectiveId;
                // Since bulkCreate will create multiple rows, they must have different createdAt values to sort predictably
                const now = new Date();
                now.setTime(now.getTime() + index * 10);
                keyResult.updatedAt = keyResult.createdAt = now.toISOString();
            }
        );

        // Apply create changes
        await model.bulkCreate(inserted, { transaction });
    }

    private async getKeyResultsFromObjective(
        objectiveId: string,
        orgId: string,
        obeyaData: StateItem[],
    ): Promise<Array<OKRKeyResult>> {
        const aurora = await this.auroraWriter;
        const model = KeyResultsModel(aurora);
        const keyresults = await model.findAll({
            where: {
                objectiveId,
                orgId,
            },
        });
        const OKRKeyResults: Array<OKRKeyResult> = await Promise.all(
            keyresults.map(async (keyResult: any) => {
                const workItems = await this.getScopeItemsForKeyResult(
                    obeyaData,
                    keyResult.parentWorkItemId,
                    keyResult.includeRelated,
                    keyResult.includeChildren,
                    keyResult.childItemLevel,
                    keyResult.linkTypes
                );
                const newKR: OKRKeyResult = {
                    orgId,
                    objectiveId,
                    keyResultId: keyResult.keyResultId,
                    keyResultDescription: keyResult.keyResultDescription,
                    completed: keyResult.completed,
                    parentWorkItemId: keyResult.parentWorkItemId,
                    parentWorkItemTitle: keyResult.parentWorkItemTitle,
                    numberOfItemsCompleted: workItems.numberOfItemsCompleted,
                    numberOfItemsInProgress: workItems.numberOfItemsInProgress,
                    numberOfItemsProposed: workItems.numberOfItemsProposed,
                    completedItems: workItems.completedItems,
                    inProgressItems: workItems.inProgressItems,
                    proposedItems: workItems.proposedItems,
                    ratingId: keyResult.ratingId,
                    ratingDescription: keyResult.ratingDescription,
                    includeChildren: keyResult.includeChildren,
                    includeRelated: keyResult.includeRelated,
                    createdAt: keyResult.createdAt,
                    childItemLevel: keyResult.childItemLevel,
                    linkTypes: keyResult.linkTypes
                };

                return newKR;
            }),
        );
        return OKRKeyResults;
    }

    private async getScopeItemsForKeyResult(
        obeyaData: StateItem[],
        associatedWorkItemId?: string,
        includeRelatedItems = false,
        includeChildrenOfRelated = false,
        childItemLevel = 0,
        linkTypes = []
    ): Promise<
        WorkItemStatesItem & {
            completedItems: StateItem[];
            proposedItems: StateItem[];
            inProgressItems: StateItem[];
        }
    > {
        let relatedItems: StateItem[] = [];
        let childrenOfRelatedItems: StateItem[] = [];
        let childrenOfAssociatedItem: StateItem[] = [];

        if (!associatedWorkItemId) {
            return {
                parentId: associatedWorkItemId,
                numberOfItemsCompleted: 0,
                numberOfItemsInProgress: 0,
                numberOfItemsProposed: 0,
                completedItems: [],
                proposedItems: [],
                inProgressItems: [],
            };
        }

        // get LEVEL 1 children: fetch the direct descendants of the parent id
        childrenOfAssociatedItem = obeyaData.filter((w: StateItem) => {
            return w?.parentId === associatedWorkItemId;
        });

        // get LEVEL 2+ children: fetch the children of child items
        let childrenOfChildItems: StateItem[] = [];
        if (childItemLevel > 1) {
            childrenOfChildItems.push(...childrenOfAssociatedItem);

            let prep: StateItem[] = [];
            while (childItemLevel !== 1) {
                childrenOfChildItems.forEach((item => {
                    const res = obeyaData.filter((w: StateItem) => {
                        return w?.parentId === item.workItemId;
                    });
                    prep.push(...res);
                }));
                childrenOfChildItems.push(...prep);
                childItemLevel--;
            }
        }

        if (includeRelatedItems) {
            type LinkItem = { type: string; workItemId: string; };
            const filteredObeya = obeyaData.filter((w) => w.workItemId === associatedWorkItemId);

            let ids: string[] = [];
            filteredObeya.forEach((w: StateItem) => {
                if (linkTypes.length >= 1) {
                    for (const type of linkTypes) {
                        const links: LinkItem[] = flatten(w?.linkedItems || []);
                        if (links) {
                            links?.forEach((link: LinkItem) => {
                                // should bring related items of each child item or related with the associateWorkItem

                                if (link?.type === type) {
                                    ids.push(link?.workItemId);
                                }
                            });

                        }
                    }
                }
            });

            if (ids.length > 0) {
                relatedItems = obeyaData.filter((w) => ids.includes(w?.workItemId || ""));
            }

            if (includeChildrenOfRelated) {
                const relatedItemsIds: string[] = relatedItems.map(
                    (linkedItem: StateItem) => linkedItem?.workItemId?.toString() || "",
                );
                // get children of related
                childrenOfRelatedItems = obeyaData.filter((w: StateItem) => {
                    return relatedItemsIds.includes(w?.parentId || "");
                });
            }
        }

        const mergedWorkItems = [
            ...childrenOfAssociatedItem,
            ...childrenOfChildItems,
            ...relatedItems,
            ...childrenOfRelatedItems
        ];

        const uniqMergedWorkItems = uniqBy(mergedWorkItems, 'workItemId');

        const countWorkItemsByStateCategory: WorkItemStatesItem = this.breakItemsDownIntoStateCategory(
            uniqMergedWorkItems,
            associatedWorkItemId,
        );

        const workItemsByStateCategory = groupBy(
            uniqMergedWorkItems,
            'stateCategory',
        );

        return {
            ...countWorkItemsByStateCategory,
            completedItems: workItemsByStateCategory.completed,
            proposedItems: workItemsByStateCategory.proposed,
            inProgressItems: workItemsByStateCategory.inprogress,
        };
    }

    async getAllObjectives(
        obeyaRoomId: string,
        obeyaData: StateItem[],
    ): Promise<
        | Array<OKRObjective>
        | { error: true; message: string; obeyaRoomId?: string; }
    > {
        const aurora = await this.auroraWriter;
        const model = ObjectivesModel(aurora);

        const predicate = {
            where: {
                orgId: this.orgId,
                roomId: obeyaRoomId,
            },
        };
        try {

            const objectives: any = await model.findAll({
                ...predicate,
            });

            const filteredObeyaData = await this.obeyaCalculation.getFilteredObeyaData(obeyaData);

            const OKRObjectives: Array<OKRObjective> = await Promise.all(
                objectives.map(async (objective: OKRObjective) => {
                    const keyResults = await this.getKeyResultsFromObjective(
                        objective.objectiveId,
                        this.orgId,
                        filteredObeyaData,
                    );
                    const newObjective: OKRObjective = {
                        orgId: this.orgId,
                        roomId: objective.roomId,
                        objectiveId: objective.objectiveId,
                        objectiveDescription: objective.objectiveDescription,
                        ratingId: objective.ratingId,
                        ratingDescription: objective.ratingDescription,
                        createdAt: objective.createdAt,
                        achieved: objective?.achieved,
                        keyResults,
                    };
                    return newObjective;
                }),
            );
            return OKRObjectives;
        } catch (error) {
            const message = (error instanceof Error && error.message) ? error.message : "An error occured while loading objectives";
            console.debug('Error Retrieving OKRs: ', message);
            return { error: true, message, obeyaRoomId };
        }
    }

    breakItemsDownIntoStateCategory(
        workItems: StateItem[] | unknown[],
        associatedWorkItemId?: string,
    ): WorkItemStatesItem {
        const countWorkItemsByStateCategory: WorkItemStatesItem = {
            parentId: associatedWorkItemId,
            numberOfItemsCompleted: 0,
            numberOfItemsInProgress: 0,
            numberOfItemsProposed: 0,
        };
        workItems.forEach((stateDbItem: any) => {
            switch (stateDbItem.stateCategory) {
                case 'completed':
                    countWorkItemsByStateCategory.numberOfItemsCompleted++;
                    break;
                case 'inprogress':
                    countWorkItemsByStateCategory.numberOfItemsInProgress++;
                    break;
                case 'proposed':
                    countWorkItemsByStateCategory.numberOfItemsProposed++;
                    break;
                default:
                    break;
            }
        });
        return countWorkItemsByStateCategory;
    }

    async postOKRs(okrObjective: OKRObjective): Promise<OKRObjective> {
        const aurora: Sequelize = await this.auroraWriter;
        const transaction = await aurora.transaction();
        try {
            await this.saveObjective(okrObjective, aurora, transaction);
            await this.cleanAllKRs(okrObjective, aurora, transaction);
            await this.saveKeyResults(okrObjective, aurora, transaction);
            await transaction.commit();
        } catch (error) {
            await transaction.rollback();
            const message = (error instanceof Error && error.message) ? error.message : "An error occured on postOKRs";
            console.debug('Error Deleting OKRs: ', message);
        }
        return okrObjective;
    }

    private async cleanAllKRs(
        okrObjective: OKRObjective,
        sequelize: Sequelize,
        transaction: Transaction,
    ) {
        const model = KeyResultsModel(sequelize);
        try {
            await model.destroy(
                {
                    where: {
                        orgId: this.orgId,
                        roomId: okrObjective.roomId,
                        objectiveId: okrObjective.objectiveId,
                    },
                    transaction
                },
                // We no longer use the old version of Sequelize that required the transaction...
                // to be put on a second argument, but it does not hurt to keep just in case.
                // @ts-ignore
                { transaction }
            );
        } catch (error) {
            console.debug('Error cleanAllKRs: ', error);
            // Must throw error to tell parent function to rollback transaction
            throw error;
        }
    }

    private async saveObjective(
        okrObjective: OKRObjective,
        sequelize: Sequelize,
        transaction: Transaction,
    ) {
        if (
            okrObjective.objectiveId == '' ||
            okrObjective.objectiveId == null ||
            okrObjective.objectiveId == undefined
        ) {
            const guid = uuidV4();
            okrObjective.objectiveId = guid;
            okrObjective.orgId = this.orgId;
            okrObjective.createdAt = new Date();
        }

        okrObjective.ratingDescription = await this.getRating(
            this.orgId,
            okrObjective.ratingId!,
            sequelize,
        );

        const receivedObject: OKRObjective = {
            orgId: this.orgId,
            roomId: okrObjective.roomId,
            objectiveId: okrObjective.objectiveId,
            objectiveDescription: okrObjective.objectiveDescription,
            ratingId: okrObjective.ratingId,
            ratingDescription: okrObjective.ratingDescription,
            createdAt: okrObjective.createdAt,
        };

        const model = ObjectivesModel(sequelize);
        await model.upsert(receivedObject, { transaction });

        okrObjective.ratingId = receivedObject.ratingId;
        okrObjective.ratingDescription = receivedObject.ratingDescription;
    }

    private async saveKeyResults(
        okrObjective: OKRObjective,
        sequelize: Sequelize,
        transaction: Transaction,
    ) {
        const model = KeyResultsModel(sequelize);
        //TODO: use bulkCreate

        const OKRKeyResults: Array<OKRKeyResult> = await Promise.all(
            okrObjective.keyResults!.map(async (keyResult, index) => {
                const newKR: OKRKeyResult = {
                    orgId: this.orgId,
                    roomId: okrObjective.roomId,
                    objectiveId: okrObjective.objectiveId,
                    keyResultId: (index + 1).toString(),
                    //keyResultId: uuidV4(),
                    keyResultDescription: keyResult.keyResultDescription,
                    completed: keyResult.completed,
                    parentWorkItemId: keyResult.parentWorkItemId,
                    parentWorkItemTitle: keyResult.parentWorkItemTitle,
                    //datasourceId: "",
                    createdAt: keyResult.createdAt,
                    childItemLevel: keyResult.childItemLevel,
                    linkTypes: keyResult.linkTypes,
                    initiativeId: keyResult?.initiativeId,
                };

                await model.upsert(newKR, { transaction });
                return newKR;
            }),
        );

        okrObjective.keyResults = OKRKeyResults;
    }

    async deleteOKR(okrObjective: OKRObjective) {
        const aurora = await this.auroraWriter;
        const transaction = await aurora.transaction();
        try {
            await this.cleanAllKRs(okrObjective, aurora, transaction);
            await this.deleteObjective(okrObjective, aurora, transaction);
            await transaction.commit();
        } catch (error) {
            await transaction.rollback();
            const message = (error instanceof Error && error.message) ? error.message : "An error occured while loading objectives";
            console.debug('Error Deleting OKRs: ', message);
        }
        return okrObjective;
    }

    private async deleteObjective(
        okrObjective: OKRObjective,
        sequelize: Sequelize,
        transaction: Transaction,
    ) {
        const model = ObjectivesModel(sequelize);
        try {
            await model.destroy(
                {
                    where: {
                        orgId: this.orgId,
                        roomId: okrObjective.roomId,
                        objectiveId: okrObjective.objectiveId,
                    },
                    transaction
                },
                // We no longer use the old version of Sequelize that required the transaction...
                // to be put on a second argument, but it does not hurt to keep just in case.
                // @ts-ignore
                { transaction },
            );
        } catch (error) {
            console.debug('Error deleteObjective: ', error);
            // Must throw error to tell parent function to rollback transaction
            throw error;
        }
    }

    private async getRating(
        orgId: string,
        ratingId: any,
        sequelize: Sequelize
    ) {
        const model = OKRRatingModel(sequelize, Sequelize);
        const rating: any[] = await model.findAll({
            where: {
                ratingId,
                orgId,
            },
        });
        const ratingDescription =
            rating && rating.length > 0 ? rating[0].ratingDescription : '';
        return ratingDescription.toString();
    }
}
