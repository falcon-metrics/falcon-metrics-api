import flatten from 'lodash/flatten';
import { Logger } from 'log4js';
import { DateTime } from 'luxon';
import {
    Op,
    Sequelize,
    Transaction,
} from 'sequelize';
import { v4 as uuidV4 } from 'uuid';

import { SecurityContext } from '../../common/security';
import { ObeyaDependenciesModel } from '../../models/ObeyaDependenciesModel';
import {
    ObeyaDependencyItemMapsModel,
} from '../../models/ObeyaDependencyItemMapsModel';
import {
    LinkedItem,
    StateItem,
} from '../../workitem/interfaces';
import { RelatedTypes } from '../../workitem/state_aurora';
import {
    ObeyaCalculation,
    ObeyaContextsWithWorkItems,
} from '../calculations';

type ContextWithWorkItems = {
    contextId: string;
    contextName?: string;
    workItems: any[];
};

export type AssociateWorkItemDependency = {
    dependencyMapId?: string;
    blockerContextId: string;
    blockerWorkItemId?: string;
    blockerContextName?: string;
    blockerWorkItemTitle?: string;

    blockedContextId: string;
    blockedWorkItemId?: string;
    blockedContextName?: string;
    blockedWorkItemTitle?: string;
    shouldBeDeleted?: boolean;
    deletedAt?: DateTime | null;
};

export type DependencyItem = {
    dependencyId?: string;
    roomId?: string;
    orgId?: string;
    blockedContextAddress?: string;
    blockedName: string;
    blockerContextAddress?: string;
    blockerName: string;
    severity: string;
    name: string;
    summary: string;
    dateOfImpact: Date;
    status: string;
    createdBy?: string;
    associateWorkItemDependencies: AssociateWorkItemDependency[];
};

export type AssociateWorkItemDependencySchema = AssociateWorkItemDependency &
    Partial<{
        orgId: string;
        roomId: string;
        dependencyId: string;
        createdAt: DateTime | null;
        modifiedAt: DateTime | null;
        deletedAt: DateTime | null;
        datasourceId: string;
        shouldDelete?: boolean;
    }>;

const findLinkedItemsByType = (
    items: LinkedItem[],
    type: RelatedTypes,
): boolean => !!items.find((l) => l.type === type);

const filterByOnlyLinkedWorkItems = (
    workItems: StateItem[],
    relationType: RelatedTypes.BLOCKS | RelatedTypes.BLOCKED_BY,
): StateItem[] => {
    return workItems.filter((w: StateItem) => {
        return (
            w?.linkedItems &&
            w?.linkedItems?.length &&
            findLinkedItemsByType(w?.linkedItems || [], relationType)
        );
    });
};

const getEmptyContext = (contextId: string): ContextWithWorkItems => ({
    contextId: contextId,
    contextName: '',
    workItems: [],
});

export class Calculations {
    readonly orgId?: string;
    readonly logger: Logger;
    readonly auroraWriter: Promise<Sequelize>;
    readonly obeyaCalculation: ObeyaCalculation;

    constructor(opts: {
        security: SecurityContext;
        logger: Logger;
        auroraWriter: Promise<Sequelize>;
        calculations: any;
        obeyaCalculation: ObeyaCalculation;
    }) {
        this.orgId = opts?.security?.organisation;
        this.logger = opts.logger;
        this.obeyaCalculation = opts.obeyaCalculation;
        this.auroraWriter = opts.auroraWriter;
    }

    async getAllAssociateWorkItemDependency(
        blockerContextId: string,
        blockedContextId: string,
        roomId: string,
    ): Promise<AssociateWorkItemDependency[]> {
        const allObeyaData: StateItem[] = await this.obeyaCalculation.getObeyaData(
            roomId,
            RelatedTypes.BLOCKS,
        );
        const contextWithWorkItems: ObeyaContextsWithWorkItems = await this.obeyaCalculation.getAllContextsWithWorkItems(
            allObeyaData,
        );

        // ---------------------- Blocks ---------------------
        // Items by blockerContextId
        const blockerContext: ContextWithWorkItems =
            contextWithWorkItems?.[blockerContextId] || getEmptyContext(blockerContextId);

        const blocksWorkItems: StateItem[] = filterByOnlyLinkedWorkItems(
            blockerContext.workItems,
            RelatedTypes.BLOCKS,
        );

        // --------------------- Blocked ---------------------
        const blockedContext: ContextWithWorkItems =
            contextWithWorkItems?.[blockedContextId] || getEmptyContext(blockedContextId);

        // Check if there are blockers relations with blocked
        const blockerWithBlockedWorkItems: AssociateWorkItemDependency[] = blocksWorkItems.reduce(
            (
                acc: AssociateWorkItemDependency[],
                blockerWorkItem: StateItem,
            ) => {
                // get all blockers ids
                const blockerLinkedItems = blockerWorkItem?.linkedItems ?? [];
                const blockerIds: string[] = blockerLinkedItems.filter(
                    (linkedItem: LinkedItem) =>
                        linkedItem.type === RelatedTypes.BLOCKS,
                )
                    .map((linkedItem: LinkedItem) => linkedItem.workItemId);

                if (blockerLinkedItems) {
                    // get all blocked items related with some blocker
                    const blockedItems: StateItem[] = blockedContext.workItems.filter(
                        (blockedWorkItem: StateItem) =>
                            blockedWorkItem?.workItemId &&
                            blockerIds.includes(blockedWorkItem?.workItemId),
                    );

                    if (blockedItems?.length) {
                        // push all blocked items related with a blocker
                        blockedItems.forEach((blockedWorkItem: StateItem) => {
                            acc.push({
                                dependencyMapId: uuidV4(),
                                blockerWorkItemId: blockerWorkItem.workItemId,
                                blockerContextId: blockerContextId,
                                blockerWorkItemTitle:
                                    blockerWorkItem?.title ||
                                    blockerWorkItem.workItemId,
                                blockerContextName: blockerContext?.contextName,

                                blockedContextId: blockedContextId,
                                blockedWorkItemId: blockedWorkItem.workItemId,
                                blockedWorkItemTitle:
                                    blockedWorkItem.title || blockedWorkItem.workItemId,
                                blockedContextName: blockedContext?.contextName,
                            });
                        });
                    }
                }
                return acc;
            },
            [],
        );
        return blockerWithBlockedWorkItems;
    }

    async createOrUpdateAssociateWorkItemDependency(
        roomId: string,
        dependencyId: string,
        associateWorkItemDependecy: AssociateWorkItemDependency,
        transaction?: Transaction,
    ): Promise<AssociateWorkItemDependencySchema> {
        const orgId = this.orgId;

        const createOrModifiedDate = associateWorkItemDependecy.dependencyMapId
            ? { modifiedAt: DateTime.now() } : { createdAt: DateTime.now() };

        const associateWorkItemDependency = {
            orgId,
            roomId,
            dependencyId,

            deletedAt: associateWorkItemDependecy?.deletedAt?.toISODate() || null,

            dependencyMapId:
                associateWorkItemDependecy.dependencyMapId || uuidV4(),
            ...createOrModifiedDate,

            blockerContextId: associateWorkItemDependecy.blockerContextId,
            blockerContextName: associateWorkItemDependecy.blockerContextName,
            blockerWorkItemId: associateWorkItemDependecy.blockerWorkItemId,
            blockerWorkItemTitle:
                associateWorkItemDependecy.blockerWorkItemTitle,

            blockedContextId: associateWorkItemDependecy.blockedContextId,
            blockedContextName: associateWorkItemDependecy.blockedContextName,
            blockedWorkItemId: associateWorkItemDependecy.blockedWorkItemId,
            blockedWorkItemTitle:
                associateWorkItemDependecy.blockedWorkItemTitle,
        };

        const aurora = await this.auroraWriter;
        const currentTransaction: Transaction =
            transaction || (await aurora.transaction());
        const model = ObeyaDependencyItemMapsModel(aurora);
        try {
            const [result]: any[] = await model.upsert(
                associateWorkItemDependency,
                {
                    transaction,
                    returning: true,
                },
            );
            await currentTransaction.commit();

            return result.dataValues as AssociateWorkItemDependency;
        } catch (e) {
            await currentTransaction.rollback();
            console.log('ObeyaDependencyItemMapsModel Error', e);
            throw new Error(
                'Error when try to save ObeyaDependencyItemMapsModel',
            );
        }
    }

    /**
     * @function saveBulkOfAssociateWorkItemDependency
     * @param {roomId} - Is the unique indentifier used by each obeya room
     * @param {dependencyId} - Is the unique identifier for each dependency record
     * @param {associateWorkItemDependecies} - Is an array that contains  work items that are blockedBy other
     *                                         they can belong accross diferent contexts or the same
     * @returns {Promise<AssociateWorkItemDependencySchema[]>} - a list of associateWorkItemDependencies
     * @description - Entry point of the crud, we can receive the list of items,
     *                this will create or update or delete using upsert method from sequelize.
     *                NOTE: for DELETE we just need to send the associateWorkItems with a flag,
     *                shouldBeDeleted: true within the item.
     *                Identifying it we gonna set a the field deletedAt with a date.
     */
    async saveBulkOfAssociateWorkItemDependency(
        roomId: string,
        dependencyId: string,
        associateWorkItemDependecies: AssociateWorkItemDependency[],
    ): Promise<AssociateWorkItemDependencySchema[]> {

        const checkedAssociatedWorkItemsDependencies: AssociateWorkItemDependency[] = this.checkIfShouldDelete(
            associateWorkItemDependecies,
        );

        const savedItems = await (Promise.all(checkedAssociatedWorkItemsDependencies.map(
            async (
                associateWorkItemDependency: AssociateWorkItemDependency,
            ) => {
                const aurora = await this.auroraWriter;
                const currentTransaction: Transaction = await aurora.transaction();
                const res = await this.createOrUpdateAssociateWorkItemDependency(
                    roomId,
                    dependencyId,
                    associateWorkItemDependency,
                    currentTransaction,
                );
                return res;

            },
        )));
        return checkedAssociatedWorkItemsDependencies;
    }

    checkIfShouldDelete(
        associateWorkItems: AssociateWorkItemDependency[],
    ): AssociateWorkItemDependency[] {
        return associateWorkItems.map(
            (associateWorkItem: AssociateWorkItemDependency) => {
                if (associateWorkItem.shouldBeDeleted) {
                    associateWorkItem.deletedAt = DateTime.now().toUTC();
                } else {
                    associateWorkItem.deletedAt = null;
                }
                return associateWorkItem;
            },
        );
    }

    async saveDependency(
        dependency: DependencyItem,
    ): Promise<DependencyItem | unknown> {
        const aurora: Sequelize = await this.auroraWriter;
        const transaction: Transaction = await aurora.transaction();

        const createOfUpdateFn = dependency?.dependencyId
            ? this.updateDependency
            : this.saveNewDependency;

        try {
            const dependencyItem: any = await createOfUpdateFn(
                dependency,
                aurora,
                transaction,
                this.orgId,
            );
            await transaction.commit();

            if (dependency?.roomId) {
                const associateWorkItemDependencies: AssociateWorkItemDependencySchema[] = await this.saveBulkOfAssociateWorkItemDependency(
                    dependency?.roomId,
                    dependency?.dependencyId || dependencyItem?.dataValues?.dependencyId,
                    dependency?.associateWorkItemDependencies || [],
                );

                return {
                    ...dependencyItem.dataValues,
                    associateWorkItemDependencies,
                };
            }
            return {
                ...dependencyItem.dataValues,
            };
        } catch (error) {
            await transaction.rollback();
            throw (error as Error)?.message;
        }
    }

    async saveNewDependency(
        dependency: DependencyItem,
        aurora: Sequelize,
        transaction: Transaction,
        orgId?: string,
    ) {
        const receivedObject = {
            ...dependency,
            dependencyId: dependency?.dependencyId,
            name: dependency.name,
            orgId: dependency?.orgId || orgId,
            roomId: dependency?.roomId,
            createdAt: DateTime.now().toISODate(),
            createdBy: dependency?.createdBy,
        };

        if (
            dependency.dependencyId === '' ||
            dependency.dependencyId === null ||
            dependency.dependencyId === undefined
        ) {
            const guid = uuidV4();
            receivedObject.dependencyId = guid;
            receivedObject.orgId = orgId;
        }

        const model = ObeyaDependenciesModel(aurora, Sequelize);

        return model.create(receivedObject, { transaction });
    }

    async updateDependency(
        dependency: DependencyItem,
        aurora: Sequelize,
        transaction: Transaction,
        orgId?: string,
    ) {
        const model = ObeyaDependenciesModel(aurora, Sequelize);

        const newDependency = {
            ...dependency,
            dependencyId: dependency?.dependencyId,
            name: dependency.name,
            orgId: dependency?.orgId || orgId,
            roomId: dependency?.roomId,
            modifiedAt: DateTime.now().toISODate(),
        };

        return model.update(newDependency, {
            transaction,
            where: {
                orgId: newDependency.orgId,
                roomId: newDependency.roomId,
                dependencyId: dependency?.dependencyId,
            } as any,
        } as any);
    }

    async getAllDependencies(obeyaRoomId?: string): Promise<DependencyItem[]> {
        const orgId = this.orgId;
        const aurora = await this.auroraWriter;
        const model = ObeyaDependenciesModel(aurora, Sequelize);
        // find all dependencies
        const allDependencies: DependencyItem[] = await model.findAll({
            where: {
                orgId,
                roomId: obeyaRoomId,
                deletedAt: null,
            },
            raw: true,
        }) as any;

        const dependencyIds = allDependencies.map(d => d.dependencyId!);

        // // prepare a promise with all dependencyAssociateItemMaps
        // const dependenciesWithAssociatePromises = allDependencies.map((dependency: DependencyItem) => {
        //     return this.getAllDependencyItemMaps(
        //         obeyaRoomId!,
        //         // Types dont match - Hence the ! override
        //         dependency.dependencyId!,
        //     );
        // });

        // run all promises dependencyAssociateItemMaps in parallel
        const dependencyAssociateItemMap = await this.getAllDependencyItemMaps(
            obeyaRoomId!,
            // Types dont match - Hence the ! override
            dependencyIds,
        );

        // get all dependencyAssociateItemMaps items by each dependency
        const allDependenciesWithAssociateItemMap = allDependencies.map((dep: DependencyItem) => {
            const currentAssociateItemMap = flatten(dependencyAssociateItemMap || []).filter(
                (associateItemMap: AssociateWorkItemDependencySchema) =>
                    associateItemMap.dependencyId === dep.dependencyId
            );
            return {
                ...dep,
                associateWorkItemDependencies: currentAssociateItemMap || [],
            };
        });
        return allDependenciesWithAssociateItemMap;
    }

    async getAllDependencyItemMaps(obeyaRoomId: string, dependencyIds: string[]): Promise<AssociateWorkItemDependencySchema[]> {
        const orgId = this.orgId;
        const aurora = await this.auroraWriter;
        const dependencyItemMapModel = ObeyaDependencyItemMapsModel(aurora);
        const dependencyItemMapItems: AssociateWorkItemDependencySchema[] = await dependencyItemMapModel.findAll({
            where: {
                orgId,
                roomId: obeyaRoomId,
                dependencyId: { [Op.in]: dependencyIds },
            },
            raw: true,
        }) as any;
        return dependencyItemMapItems;
    }

    async deleteDependency(dependencyId: string) {
        const aurora = await this.auroraWriter;
        const transaction = await aurora.transaction();

        try {
            const model = ObeyaDependenciesModel(aurora, Sequelize);
            await model.destroy({
                where: {
                    orgId: this.orgId,
                    dependencyId,
                },
            });
            await transaction.commit();
        } catch (error) {
            await transaction.rollback();
            throw (error as Error)?.message;
        }
    }
}
