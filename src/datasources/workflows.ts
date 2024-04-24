import { find, flatten, flattenDeep, isEqual, omit, sortBy, uniqWith } from 'lodash';
import slugify from 'slugify';

import { writerConnection } from '../models/sequelize';
import WorkflowEventsModel, {
    WorkflowEventsAttributes,
} from '../models/WorkflowEventsModel';
import Workflow from '../models/WorkflowModel';
import WorkflowStepsModel, {
    WorkflowStepsAttributes,
} from '../models/WorkflowStepsModel';
import WorkItemTypeMapModel, {
    WorkItemTypeMapAttributes,
} from '../models/WorkItemTypeMapModel';
import WorkItemTypeModel, {
    WorkItemTypeAttributes,
} from '../models/WorkItemTypeModel';
import {
    deleteWorkItemTypes,
    getDeletedAtFilterCondition,
} from './delete/delete_functions';
import jwtToUser, { isUserAdmin } from './jwtToUser';
import { DatasourceId } from './Providers';
import { kickOffReIngest } from './utils';
import WorkflowModel from '../models/WorkflowModel';
import ProjectModel from '../models/ProjectModel';

type PayloadStep = {
    category: string;
    id: string;
    name: string;
    type: string;
    isUnmapped: boolean;
    workflowId: string;
};

type PayloadProject = {
    name: string;
    id: string;
    isUnmapped: boolean;
};

type PostPayload = {
    arrivalPointOrder: number;
    commitmentPointOrder: number;
    departurePointOrder: number;
    checked: boolean;
    displayName: string;
    serviceLevelExpectationInDays: number;
    id: string;
    level: string;
    name: string;
    orgId: string;
    projects: PayloadProject[];
    steps: PayloadStep[];
    workItemTypeId: string;
    workflowId: string;
    isDistinct: boolean;
};

type PostKanbanizePayload = {
    arrivalPointOrder: number;
    commitmentPointOrder: number;
    departurePointOrder: number;
    id: string;
    name: string;
    orgId: string;
    projectId: string;
    steps: PayloadStep[];
    workItemTypeId: string;
    workflowId: string;
    datasourceWorkflowId: string;
};
// GET /datasources/{provider}/{namespace}/workflows
export const get = async (event: any) => {
    const {
        pathParameters: { provider, namespace },
        requestContext: {
            authorizer: { jwt },
        },
    } = event;

    const { organisationId } = jwtToUser(jwt);
    const datasourceId = await DatasourceId({
        provider,
        organisationId,
        namespace,
    });
    const baseWhere = { orgId: organisationId, datasourceId };
    const baseQueryOptions = { where: baseWhere, raw: true };

    try {
        const [
            workItemTypeModel,
            workItemTypeMapModel,
            workflowEventsModel,
            workflowStepsModel,
        ] = await Promise.all([
            WorkItemTypeModel(),
            WorkItemTypeMapModel(),
            WorkflowEventsModel(),
            WorkflowStepsModel(),
        ]);
        const [
            orgWorkItemTypes,
            workItemTypeMaps,
            workflowEvents,
            workflowSteps,
        ] = await Promise.all([
            workItemTypeModel.findAll({
                where: getDeletedAtFilterCondition({ orgId: organisationId }),
                raw: true,
            }),
            workItemTypeMapModel.findAll({
                ...baseQueryOptions,
                where: { ...baseWhere, archived: false } as any,
                attributes: [
                    'workItemTypeId',
                    'datasourceWorkItemId',
                    'workflowId',
                    'projectId',
                    'serviceLevelExpectationInDays',
                    'isDistinct'
                ],
            }),
            workflowEventsModel.findAll({
                ...baseQueryOptions,
                where: getDeletedAtFilterCondition(baseWhere),
                attributes: [
                    'workflowId',
                    'arrivalPointOrder',
                    'commitmentPointOrder',
                    'departurePointOrder',
                ],
            }),
            workflowStepsModel.findAll({
                ...baseQueryOptions,
                where: getDeletedAtFilterCondition(baseWhere),
                attributes: [
                    'id',
                    'workflowId',
                    ['stateType', 'type'],
                    ['stateCategory', 'category'],
                    'name',
                    'order',
                ],
            }),
        ]);
        const uniqueWorkItemTypeMaps = uniqWith(workItemTypeMaps, isEqual);
        const mappedWorkItemTypesWithEvents = uniqueWorkItemTypeMaps.map(
            (workItemTypeMap: WorkItemTypeMapAttributes) => {
                const [events] = uniqWith(
                    workflowEvents.filter(
                        (item) =>
                            workItemTypeMap.workflowId === item.workflowId,
                    ),
                    isEqual,
                );

                if (!events) {
                    return { ...workItemTypeMap };
                }
                return { ...workItemTypeMap, ...events };
            },
        );
        const workItemTypesWithSteps = mappedWorkItemTypesWithEvents.map(
            (workItemType) => {
                const filteredSteps = uniqWith(
                    workflowSteps.filter(
                        (item) => workItemType.workflowId === item.workflowId,
                    ),
                    isEqual,
                );
                const orderedSteps = sortBy(filteredSteps, ({ order }) =>
                    Number(order),
                );
                return { ...workItemType, steps: orderedSteps };
            },
        );
        const formattedResponse = workItemTypesWithSteps.map(
            (workItemTypeWithSteps) => {
                const workItemType = find(orgWorkItemTypes, {
                    workItemTypeId: workItemTypeWithSteps.workItemTypeId,
                });
                if (!workItemType) {
                    return workItemTypeWithSteps;
                }
                const { serviceLevelExpectationInDays, ...modifiedWorkItemType } = workItemType;
                return { ...workItemTypeWithSteps, ...modifiedWorkItemType };
            },
        );

        return {
            statusCode: 200,
            body: JSON.stringify(formattedResponse),
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify((error as any).errors ? (error as any).errors : (error as any).message),
        };
    }
};
// GET /datasources/{provider}/{namespace}/workflows
export const getKanbanize = async (event: any) => {
    const {
        pathParameters: { provider, namespace },
        requestContext: {
            authorizer: { jwt },
        },
    } = event;

    const { organisationId } = jwtToUser(jwt);
    const datasourceId = await DatasourceId({
        provider,
        organisationId,
        namespace,
    });
    const baseWhere = { orgId: organisationId, datasourceId };
    const baseQueryOptions = { where: baseWhere, raw: true };

    const projectModel = await ProjectModel();
    const projectsResult = await projectModel.findAll({
        where: { datasourceId, deletedAt: null },
    });

    try {
        const [
            workflowModel,
            workflowEventsModel,
            workflowStepsModel,
        ] = await Promise.all([
            WorkflowModel(),
            WorkflowEventsModel(),
            WorkflowStepsModel(),
        ]);
        const [
            workflows,
            workflowEvents,
            workflowSteps,
        ] = await Promise.all([
            workflowModel.findAll({
                ...baseQueryOptions
            }),
            workflowEventsModel.findAll({
                ...baseQueryOptions,
                where: getDeletedAtFilterCondition(baseWhere),
                attributes: [
                    'workflowId',
                    'arrivalPointOrder',
                    'commitmentPointOrder',
                    'departurePointOrder',
                ],
            }),
            workflowStepsModel.findAll({
                ...baseQueryOptions,
                where: getDeletedAtFilterCondition(baseWhere),
                attributes: [
                    'id',
                    'workflowId',
                    ['stateType', 'type'],
                    ['stateCategory', 'category'],
                    'name',
                    'order',
                ],
            }),
        ]);
        const uniqueWorkItemTypeMaps = uniqWith(workflows, isEqual);
        const mappedWorkItemTypesWithEvents = uniqueWorkItemTypeMaps.map(
            (workItemTypeMap: any) => {
                const [events] = uniqWith(
                    workflowEvents.filter(
                        (item) =>
                            workItemTypeMap.workflowId === item.workflowId,
                    ),
                    isEqual,
                );

                if (!events) {
                    return { ...workItemTypeMap };
                }
                return { ...workItemTypeMap, ...events };
            },
        );
        const workItemTypesWithSteps = mappedWorkItemTypesWithEvents.map(
            (workItemType) => {
                const filteredSteps = uniqWith(
                    workflowSteps.filter(
                        (item) => workItemType.workflowId === item.workflowId,
                    ),
                    isEqual,
                );
                const orderedSteps = sortBy(filteredSteps, ({ order }) =>
                    Number(order),
                );

                const workspace = projectsResult.find(({ projectId }) => projectId === workItemType.projectId);
                return { ...workItemType, steps: orderedSteps, board: workspace?.dataValues.name, workspace: workspace?.dataValues.workspace };
            },
        );

        return {
            statusCode: 200,
            body: JSON.stringify(workItemTypesWithSteps),
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify((error as any).errors ? (error as any).errors : (error as any).message),
        };
    }
};


// POST /datasources/{provider}/{namespace}/workflows
export const post = async (event: any) => {
    const {
        body,
        pathParameters: { provider, namespace },
        requestContext: {
            authorizer: { jwt },
        },
    } = event;

    const { organisationId, roles } = jwtToUser(jwt);
    if (!isUserAdmin(roles)) {
        return {
            statusCode: 403,
            body: JSON.stringify({ error: { message: 'Forbidden' } }),
        };
    }
    const payload = JSON.parse(body) as PostPayload[];

    const datasourceId = await DatasourceId({
        provider,
        organisationId,
        namespace,
    });

    const getFilteredProjects = (projects: PayloadProject[]) =>
        projects.filter(({ isUnmapped }) => !isUnmapped);

    const workflows = flattenDeep(
        payload.map(({ name, projects }) => {
            return getFilteredProjects(projects).map((project) => {
                const workflowId = getWorkflowId(
                    organisationId,
                    project.id,
                    name,
                );
                return {
                    orgId: organisationId,
                    datasourceId,
                    workflowId,
                    workflowName: workflowId,
                    projectId: project.id,
                    deletedAt: null,
                };
            });
        }),
    );

    const workItemTypes = payload.map(
        ({ displayName, level, serviceLevelExpectationInDays }) => ({
            orgId: organisationId,
            workItemTypeId: getWorkItemTypeId(organisationId, displayName),
            displayName,
            level,
            serviceLevelExpectationInDays: Number(
                serviceLevelExpectationInDays,
            ),
            deletedAt: null,
        }),
    );

    const payloadWorkItemTypeMaps = flattenDeep(
        payload.map(({ id, name: name, displayName, projects, serviceLevelExpectationInDays, isDistinct }) =>
            getFilteredProjects(projects).map(
                (project): WorkItemTypeMapAttributes => ({
                    orgId: organisationId,
                    datasourceId,
                    workflowId: getWorkflowId(organisationId, project.id, name),
                    workItemTypeId: getWorkItemTypeId(
                        organisationId,
                        displayName,
                    ),
                    datasourceWorkItemId: id,
                    projectId: project.id,
                    archived: false,
                    serviceLevelExpectationInDays: Number(
                        serviceLevelExpectationInDays,
                    ),
                    isDistinct: isDistinct
                }),
            ),
        ),
    );

    const workflowEvents = flattenDeep(
        payload.map(
            ({
                name,
                projects,
                arrivalPointOrder,
                commitmentPointOrder,
                departurePointOrder,
            }: PostPayload) => {
                return getFilteredProjects(projects).map((project) => {
                    {
                        return {
                            orgId: organisationId,
                            datasourceId,
                            workflowId: getWorkflowId(
                                organisationId,
                                project.id,
                                name,
                            ),
                            arrivalPointOrder,
                            commitmentPointOrder,
                            departurePointOrder,
                            deletedAt: null,
                        };
                    }
                });
            },
        ),
    );

    const workflowSteps: WorkflowStepsAttributes[] = flatten(
        payload.map(({ name: workflowName, projects, steps }) =>
            flatten(
                getFilteredProjects(projects).map((project) =>
                    flatten(
                        steps.map(
                            (
                                { id, name, category, type, isUnmapped },
                                index,
                            ) => ({
                                orgId: organisationId,
                                datasourceId,
                                workflowId: getWorkflowId(
                                    organisationId,
                                    project.id,
                                    workflowName,
                                ),
                                id,
                                name,
                                projectId: project.id,
                                stateCategory: category.toLowerCase(),
                                stateType: type,
                                active: !isUnmapped,
                                order: index,
                                deletedAt: null,
                            }),
                        ),
                    ),
                ),
            ),
        ),
    );

    const aurora = await writerConnection();

    const existingWorkItemTypeMaps = await getWorkItemTypeMapsByOrgId(
        organisationId,
        datasourceId,
    );

    //if there are workItemTypeMaps exist in the database, then the ones does not exist from the payload
    // are the ones to delete;
    const workItemTypeMapsToDelete = existingWorkItemTypeMaps.filter(
        (workItemTypeMap) => {
            return !payloadWorkItemTypeMaps.some((payloadWorkItemTypeMap) =>
                payloadWorkItemTypeMap.workItemTypeId === workItemTypeMap.workItemTypeId && payloadWorkItemTypeMap.projectId === workItemTypeMap.projectId
            );
        },
    );

    const transaction = await aurora.transaction();

    try {
        await deleteWorkItemTypes(
            workItemTypeMapsToDelete,
            organisationId,
            datasourceId,
            aurora,
            transaction,
        );

        //Temporary until we remove the columns from work item types table
        //TO-DO
        const compareWorkItemTypes = (wit1: any, wit2: any) => {
            return isEqual(omit(wit1, ['serviceLevelExpectationInDays']), omit(wit2, ['serviceLevelExpectationInDays']));
        };

        const [
            workItemTypeModel,
            workItemTypeMapModel,
            workflowModel,
            workflowEventsModel,
            workflowStepsModel,
        ] = await Promise.all([
            WorkItemTypeModel(aurora),
            WorkItemTypeMapModel(aurora),
            Workflow(aurora),
            WorkflowEventsModel(aurora),
            WorkflowStepsModel(aurora),
        ]);
        const [
            workflowsResult,
            workItemTypesResult,
            workItemTypeMapsResult,
            workflowEventsResult,
            workflowStepsResult,
        ] = await Promise.all([
            workflowModel.bulkCreate(uniqWith(workflows, isEqual), {
                updateOnDuplicate: Object.keys(workflows[0] ?? {}), //update all fields
                transaction,
            }),
            workItemTypeModel.bulkCreate(uniqWith(workItemTypes, compareWorkItemTypes), {
                updateOnDuplicate: Object.keys(workItemTypes[0] ?? {}) as Array<
                    keyof WorkItemTypeAttributes
                >,
                transaction,
            }),
            workItemTypeMapModel.bulkCreate(
                uniqWith(payloadWorkItemTypeMaps as any, isEqual),
                {
                    updateOnDuplicate: Object.keys(
                        payloadWorkItemTypeMaps[0] ?? {},
                    ) as Array<keyof WorkItemTypeMapAttributes>,
                    transaction,
                },
            ),
            workflowEventsModel.bulkCreate(uniqWith(workflowEvents, isEqual), {
                updateOnDuplicate: Object.keys(
                    workflowEvents[0] ?? {},
                ) as Array<keyof WorkflowEventsAttributes>,
                transaction,
            }),
            workflowStepsModel.bulkCreate(uniqWith(workflowSteps as any, isEqual), {
                updateOnDuplicate: Object.keys(workflowSteps[0] ?? {}) as Array<
                    keyof WorkflowStepsAttributes
                >,
                transaction,
            }),
        ]);

        const resp = {
            workflows: workflowsResult,
            workItemTypes: workItemTypesResult,
            workItemTypeMaps: workItemTypeMapsResult,
            workflowEvents: workflowEventsResult,
            workflowSteps: workflowStepsResult,
        };
        await kickOffReIngest(organisationId, datasourceId, transaction);
        await transaction.commit();
        return {
            statusCode: 201,
            body: JSON.stringify(resp),
        };
    } catch (error) {
        await transaction.rollback();
        console.log(error);
        if (Object.keys(error as any).includes('dependencies')) {
            return {
                statusCode: 400,
                body: JSON.stringify(error),
            };
        }
        return {
            statusCode: 500,
            body: JSON.stringify((error as any).errors ? (error as any).errors : (error as any).message),
        };
    }
};

export const postKanbanize = async (event: any) => {
    const {
        body,
        pathParameters: { provider, namespace },
        requestContext: {
            authorizer: { jwt },
        },
    } = event;

    const { organisationId, roles } = jwtToUser(jwt);
    if (!isUserAdmin(roles)) {
        return {
            statusCode: 403,
            body: JSON.stringify({ error: { message: 'Forbidden' } }),
        };
    }
    const payload = JSON.parse(body) as PostKanbanizePayload[];

    const datasourceId = await DatasourceId({
        provider,
        organisationId,
        namespace,
    });

    const baseWhere = { orgId: organisationId, datasourceId };
    const baseQueryOptions = { where: baseWhere, raw: true };

    const workflowModel = await WorkflowModel();
    const currentWorkflows: any = await workflowModel.findAll({
        ...baseQueryOptions,
        where: getDeletedAtFilterCondition(baseWhere),
    });

    const workflows = flattenDeep(
        payload.map(({ id, name, projectId, datasourceWorkflowId }) => {
            // return getFilteredProjects(projects).map((project) => {
            const workflowId = getWorkflowId(
                organisationId,
                projectId,
                name,
            );
            return {
                orgId: organisationId,
                datasourceId,
                workflowId,
                workflowName: workflowId,
                projectId,
                deletedAt: null,
                datasourceWorkflowId,
            };
            // });
        }),
    );

    const workflowEvents = flattenDeep(
        payload.map(
            ({
                name,
                projectId,
                arrivalPointOrder,
                commitmentPointOrder,
                departurePointOrder,
                datasourceWorkflowId
            }: PostKanbanizePayload) => {
                // return getFilteredProjects(projects).map((project) => {
                //     {
                return {
                    orgId: organisationId,
                    datasourceId,
                    workflowId: getWorkflowId(
                        organisationId,
                        projectId,
                        name,
                    ),
                    arrivalPointOrder,
                    commitmentPointOrder,
                    departurePointOrder,
                    deletedAt: null,
                };
                //     }
                // });
            },
        ),
    );

    const workflowSteps: WorkflowStepsAttributes[] = flatten(
        payload.map(({ name: workflowName, projectId, steps, datasourceWorkflowId }) =>
            flatten(
                // getFilteredProjects(projects).map((project) =>
                // flatten(
                steps.map(
                    (
                        { id, name, category, type, isUnmapped },
                        index,
                    ) => ({
                        orgId: organisationId,
                        datasourceId,
                        workflowId: getWorkflowId(
                            organisationId,
                            projectId,
                            workflowName,
                        ),
                        id,
                        name,
                        projectId,
                        stateCategory: category.toLowerCase(),
                        stateType: type,
                        active: !isUnmapped,
                        order: index,
                        deletedAt: null,
                    }),
                ),
                // ),
                // ),
            ),
        ),
    );

    const aurora = await writerConnection();

    const transaction = await aurora.transaction();

    // This is to set datasourceWorkflowId to null when it's no longer part of the selected items  
    for (const currentWorkflow of currentWorkflows.filter((item: any) => item.datasourceWorkflowId !== null)) {
        const foundWorkflow = payload.find(
            (item) =>
                item.datasourceWorkflowId === currentWorkflow.datasourceWorkflowId
        );
        if (!foundWorkflow) {
            await workflowModel.update(
                { datasourceWorkflowId: null },
                {
                    where: {
                        orgId: organisationId,
                        datasourceId,
                        datasourceWorkflowId: currentWorkflow.datasourceWorkflowId
                    } as any,
                    transaction
                } as any
            );
        }
    }

    try {
        const [
            workflowModel,
            workflowEventsModel,
            workflowStepsModel,
        ] = await Promise.all([
            Workflow(aurora),
            WorkflowEventsModel(aurora),
            WorkflowStepsModel(aurora),
        ]);
        const [
            workflowsResult,
            workflowEventsResult,
            workflowStepsResult,
        ] = await Promise.all([
            workflowModel.bulkCreate(uniqWith(workflows, isEqual), {
                updateOnDuplicate: Object.keys(workflows[0] ?? {}), //update all fields
                transaction,
            }),
            workflowEventsModel.bulkCreate(uniqWith(workflowEvents, isEqual), {
                updateOnDuplicate: Object.keys(
                    workflowEvents[0] ?? {},
                ) as Array<keyof WorkflowEventsAttributes>,
                transaction,
            }),
            workflowStepsModel.bulkCreate(uniqWith(workflowSteps as any, isEqual), {
                updateOnDuplicate: Object.keys(workflowSteps[0] ?? {}) as Array<
                    keyof WorkflowStepsAttributes
                >,
                transaction,
            }),
        ]);

        const resp = {
            workflows: workflowsResult,
            workflowEvents: workflowEventsResult,
            workflowSteps: workflowStepsResult,
        };
        await kickOffReIngest(organisationId, datasourceId, transaction);
        await transaction.commit();
        return {
            statusCode: 201,
            body: JSON.stringify(resp),
        };
    } catch (error) {
        await transaction.rollback();
        console.log(error);
        return {
            statusCode: (error instanceof Error && 'dependencies' in error) ? 400 : 500,
            body: JSON.stringify((error as any).errors ? (error as any).errors : (error as any).message),
        };
    }
};

export function getWorkflowId(
    organisationId: string,
    project: string,
    name: string,
): string {
    return slugify(`${organisationId}.${project}.${name}`.toLowerCase());
}

export function getWorkItemTypeId(
    organisationId: string,
    displayName: string,
): string {
    return slugify(`${organisationId}.${displayName}`.toLowerCase());
}

export async function getWorkItemTypeMapsByOrgId(orgId: string, datasourceId: string) {
    const workItemTypeMapsModel = await WorkItemTypeMapModel();
    return await workItemTypeMapsModel.findAll({
        where: { orgId, datasourceId, archived: false } as any,
        raw: true,
    });
}
