import { chain, flattenDeep, isEqual, uniqWith } from 'lodash';
import slugify from 'slugify';

import { writerConnection } from '../models/sequelize';
import WorkItemTypeMapModel, {
    WorkItemTypeMapAttributes
} from '../models/WorkItemTypeMapModel';
import WorkItemTypeModel, {
    WorkItemTypeAttributes
} from '../models/WorkItemTypeModel';
import {
    deleteWorkItemTypes,
    getDeletedAtFilterCondition
} from './delete/delete_functions';
import jwtToUser, { isUserAdmin } from './jwtToUser';
import { DatasourceId } from './Providers';

type PostPayloadItem = {
    cardTypeName: string;
    cardTypeId: string;
    boardId: string;
    sle: string;
    level: string;
};

export const NOT_APPLICABLE = "NOT_APPLICABLE";

// This api is for Kanbanize only
// GET /datasources/kanbanize/{namespace}/workitemtypes
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
            workItemTypeMapModel
        ] = await Promise.all([
            WorkItemTypeModel(),
            WorkItemTypeMapModel()
        ]);

        const [
            orgWorkItemTypes,
            workItemTypeMaps
        ] = await Promise.all([
            workItemTypeModel.findAll({
                where: getDeletedAtFilterCondition({ orgId: organisationId }),
                raw: true,
            }),
            workItemTypeMapModel.findAll({
                ...baseQueryOptions,
                where: { ...baseWhere, archived: false } as any,
            }),
        ]);
        return {
            statusCode: 200,
            body: JSON.stringify(workItemTypeMaps),
        };

    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify((error as any).errors ? (error as any).errors : (error as any).message),
        };
    }
};

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
    const payload = JSON.parse(body) as PostPayloadItem[];

    const datasourceId = await DatasourceId({
        provider,
        organisationId,
        namespace,
    });


    const workItemTypesToInsert = payload.map(
        ({ cardTypeName, level, sle }) => ({
            orgId: organisationId,
            workItemTypeId: getWorkItemTypeId(organisationId, cardTypeName),
            displayName: cardTypeName,
            level,
            serviceLevelExpectationInDays: Number(
                sle,
            ),
            deletedAt: null
        }),
    );

    /** 
     * In kanbanize, the work item type is not associated to a workflow or a board. 
     * The card type is a property on a card. 
     * Therefore, the project id and workflow id are omitted here. In the database, 
     * projectId and workflowId is set as 'NOT APPLICABLE'
    */
    const workItemTypeMapsToInsert = flattenDeep(
        payload.map(({ cardTypeId, cardTypeName, level, sle, boardId }) => ({
            orgId: organisationId,
            datasourceId,
            workItemTypeId: getWorkItemTypeId(
                organisationId,
                cardTypeName,
            ),
            datasourceWorkItemId: cardTypeId,
            archived: false,
            workflowId: NOT_APPLICABLE,
            projectId: boardId,
            level,
            serviceLevelExpectationInDays: sle
        }),
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
            return !workItemTypeMapsToInsert.some((payloadWorkItemTypeMap) =>
                isEqual(payloadWorkItemTypeMap, workItemTypeMap),
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

        const [
            workItemTypeModel,
            workItemTypeMapModel,
        ] = await Promise.all([
            WorkItemTypeModel(aurora),
            WorkItemTypeMapModel(aurora),
        ]);

        const uniqueWorkItemTypes = chain(workItemTypesToInsert)
            .map(wit => ({
                ...wit,
                serviceLevelExpectationInDays: 0,
                level: 0
            }))
            .uniqWith(isEqual)
            .value();

        const [
            workItemTypesResult,
            workItemTypeMapsResult,
        ] = await Promise.all([
            workItemTypeModel.bulkCreate(uniqueWorkItemTypes,
                {
                    updateOnDuplicate: Object.keys(workItemTypesToInsert[0] ?? {}) as Array<
                        keyof WorkItemTypeAttributes
                    >,
                    transaction,
                }),
            workItemTypeMapModel.bulkCreate(
                uniqWith(workItemTypeMapsToInsert, isEqual),
                {
                    updateOnDuplicate: Object.keys(
                        workItemTypeMapsToInsert[0] ?? {},
                    ) as Array<keyof WorkItemTypeMapAttributes>,
                    transaction,
                },
            ),
        ]);

        const resp = {
            workItemTypes: workItemTypesResult,
            workItemTypeMaps: workItemTypeMapsResult,
        };

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
