import { groupBy, isEqual } from 'lodash';
import { DateTime } from 'luxon';
import { Op, Sequelize, Transaction, WhereOptions, Model } from 'sequelize';

import ContextModel from '../../models/ContextModel';
import { ContextWorkItemMapFactory } from '../../models/ContextWorkItemMapModel';
import ProjectModel, { Project } from '../../models/ProjectModel';
import { SnapshotModel } from '../../models/SnapshotModel';
import { StateModel } from '../../models/StateModel';
import WorkflowEventsModel from '../../models/WorkflowEventsModel';
import WorkflowModel from '../../models/WorkflowModel';
import WorkflowStepsModel from '../../models/WorkflowStepsModel';
import WorkItemTypeMap, {
    WorkItemTypeMapModel,
} from '../../models/WorkItemTypeMapModel';
import WorkItemTypeModel from '../../models/WorkItemTypeModel';
import { getWorkItemTypeDependency } from './dependency_check';

export type WorkItemCondition = {
    flomatikaWorkItemTypeId?: string;
    projectId?: string | string[];
    partitionKey: string;
    sortKey?: any;
    gs2PartitionKey?: any;
};

export type ProjectItem = {
    orgId: string;
    datasourceId: string;
    projectId: string;
};

export function getDeletedAt(): { deletedAt: Date; } {
    return { deletedAt: DateTime.utc().toJSDate() };
}

export function getDeletedAtFilterCondition(condition: WhereOptions<any>): WhereOptions<any> {
    return {
        ...condition,
        deletedAt: null,
    };
}

export const deleteProjects = async (
    projectsToDelete: ProjectItem[],
    organisationId: string,
    datasourceId: string,
    aurora: Sequelize,
    transaction: Transaction,
): Promise<void> => {
    const projectModel: Model<Project, any> = (await ProjectModel(aurora)) as any;

    await deleteContexts(
        aurora,
        {
            orgId: organisationId,
            datasourceId,
            projectId: {
                [Op.or]: projectsToDelete
                    .map((project) => project.projectId)
                    .map((projectId) => ({
                        [Op.iLike]: `%${projectId}%`,
                    })),
            },
        },
        transaction,
    );
    const workItemTypeMapModel = await WorkItemTypeMap(aurora);
    const workItemTypeMapsToDelete = await workItemTypeMapModel.findAll({
        where: {
            projectId: projectsToDelete.map((project) => project.projectId),
            orgId: projectsToDelete.map((project) => project.orgId),
            datasourceId: projectsToDelete.map(
                (project) => project.datasourceId,
            ),
        } as any,
        raw: true,
    });

    await deleteWorkItemTypes(
        workItemTypeMapsToDelete,
        organisationId,
        datasourceId,
        aurora,
        transaction,
    );
    await (projectModel as any).update(getDeletedAt(), {
        where: {
            projectId: projectsToDelete.map((project) => project.projectId),
            orgId: projectsToDelete.map((project) => project.orgId),
            datasourceId: projectsToDelete.map(
                (project) => project.datasourceId,
            ),
        } as any,
        transaction,
    });
};

export const deleteContexts = async (
    aurora: Sequelize,
    contextWhereCondition: {
        orgId: string;
        datasourceId: string;
        projectId: any;
    },
    transaction: Transaction,
): Promise<void> => {
    const contextModel = await ContextModel(aurora);
    //delete contexts and context workItem maps
    const contexts = await contextModel.findAll({
        where: { ...contextWhereCondition, archived: false } as any,
        attributes: ['contextId'],
    });
    const contextIdsToDelete = contexts.map((context) => {
        const { contextId } = (context as any).toJSON() as { contextId: string; };
        return contextId;
    });
    const contextWorkItemMapModel = ContextWorkItemMapFactory(
        aurora,
        Sequelize,
    );
    await contextWorkItemMapModel.update(getDeletedAt(), {
        where: {
            orgId: contextWhereCondition.orgId,
            contextId: contextIdsToDelete,
        } as any,
        transaction,
    } as any);

    await contextModel.update(
        { archived: true },
        {
            where: contextWhereCondition as any,
            transaction,
        } as any,
    );
};

export const deleteWorkItems = async (
    workItemTypeMapsToDelete: WorkItemTypeMapModel[],
    organisationId: string,
    datasourceId: string,
    transaction: Transaction,
    aurora: Sequelize,
): Promise<void> => {
    const database = aurora;
    const stateModel = StateModel(database);
    const contextWorkItemMapModel = ContextWorkItemMapFactory(
        database,
        Sequelize,
    );
    const snapshotModel = SnapshotModel(database);
    //Delete data from table state using orgId, datasourceId, project id and workItemType name

    await stateModel.destroy({
        where: getStatesToDeleteWhereCondition(
            workItemTypeMapsToDelete,
            organisationId,
            datasourceId,
        ),
        transaction,
    });

    const workItemsToRemove = (
        await stateModel.findAll({
            where: getStatesToDeleteWhereCondition(
                workItemTypeMapsToDelete,
                organisationId,
                datasourceId,
            ) as WhereOptions<any>,
            transaction,
            raw: true,
            attributes: ['workItemId'],
        })
    ).map((state) => state.workItemId);

    await contextWorkItemMapModel.update(getDeletedAt(), {
        where: {
            workItemId: workItemsToRemove,
            orgId: organisationId,
        } as any,
        transaction,
    } as any);

    await snapshotModel.destroy({
        where: {
            [Op.or]: workItemTypeMapsToDelete.map(
                ({ workItemTypeId, projectId }) => ({
                    flomatikaWorkItemTypeId: workItemTypeId,
                    projectId,
                }),
            ),
            partitionKey: `snapshot#${organisationId}`,
            gs2PartitionKey: {
                [Op.like]: `%${datasourceId}#%`,
            },
        },
        transaction,
    });
};

export const deleteWorkItemTypes = async (
    workItemTypeMapsToDelete: WorkItemTypeMapModel[],
    orgId: string,
    datasourceId: string,
    aurora: Sequelize,
    transaction: Transaction,
): Promise<void> => {
    await deleteWorkItems(
        workItemTypeMapsToDelete,
        orgId,
        datasourceId,
        transaction,
        aurora,
    );

    const workItemTypeModel = await WorkItemTypeModel(aurora);
    const workItemTypeMapModel = await WorkItemTypeMap(aurora);
    const baseCriteria = {
        orgId,
        datasourceId,
    };
    const existingWorkItemTypeMaps = await workItemTypeMapModel.findAll({
        where: { orgId, archived: false } as any,
        // Criteria should not include datasourceId.
        // We want all the workItemTypeMaps to delete those that are not used in any datasource
        raw: true,
    });

    const workItemTypeMapsById = groupBy(
        existingWorkItemTypeMaps,
        'workItemTypeId',
    );
    const existingWorkItemTypeIds = Object.keys(workItemTypeMapsById);

    const isWithinListThatShouldBeDeleted = (
        workItemTypeMap: WorkItemTypeMapModel,
    ) =>
        workItemTypeMapsToDelete.some((workItemTypeMapToDelete) =>
            isEqual(workItemTypeMap, workItemTypeMapToDelete),
        );
    const workItemTypeIdsToDelete = existingWorkItemTypeIds.filter(
        (workItemTypeId) => {
            const mapsOfSameType = workItemTypeMapsById[workItemTypeId];
            return mapsOfSameType.every(isWithinListThatShouldBeDeleted);
        },
    );

    // remove workItemTypes, workItemTypeMaps;
    const workItemTypesToDeleteNames = (
        await workItemTypeModel.findAll({
            where: getDeletedAtFilterCondition({
                workItemTypeId: workItemTypeIdsToDelete,
                orgId,
            }),
            attributes: ['displayName'],
            raw: true,
        })
    ).map((workItemType) => workItemType.displayName);

    const workItemTypeDependencies = await getWorkItemTypeDependency(
        workItemTypesToDeleteNames,
        datasourceId,
        orgId,
        aurora,
    );
    // TODO: Do error handling in the kanbanize workflows endpoint
    // Uncomment this
    // if (workItemTypeDependencies?.length) {
    //     throw {
    //         dependencies: workItemTypeDependencies,
    //         error: new Error(),
    //     };
    // }

    await workItemTypeModel.update(getDeletedAt(), {
        where: {
            orgId,
            workItemTypeId: workItemTypeIdsToDelete,
        } as any,
        transaction,
    } as any);

    const destructionOptions = {
        where: {
            ...baseCriteria,
            workflowId: workItemTypeMapsToDelete.map(
                ({ workflowId }) => workflowId,
            ),
        } as any,
        transaction,
    } as any;

    await workItemTypeMapModel.update({ archived: true }, destructionOptions);

    const workflowEventsModel = await WorkflowEventsModel(aurora);
    await workflowEventsModel.update(getDeletedAt(), destructionOptions);

    const workflowStepsModel = await WorkflowStepsModel(aurora);
    await workflowStepsModel.update(getDeletedAt(), destructionOptions);

    const workflowModel = await WorkflowModel(aurora);
    await workflowModel.update(getDeletedAt(), destructionOptions);
};

function getStatesToDeleteWhereCondition(
    workItemTypeMapsToDelete: WorkItemTypeMapModel[],
    organisationId: string,
    datasourceId: string,
): any {
    return {
        [Op.or]: workItemTypeMapsToDelete.map(
            ({ projectId, workItemTypeId }) => {
                return {
                    flomatikaWorkItemTypeId: workItemTypeId,
                    projectId,
                };
            },
        ),
        partitionKey: `state#${organisationId}`,
        sortKey: {
            [Op.like]: `${datasourceId}#%`,
        },
        deletedAt: { [Op.eq]: null },
    };
}
