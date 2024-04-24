import { flattenDeep } from 'lodash';

import ContextModel, { ContextAttributes } from '../models/ContextModel';
import { writerConnection } from '../models/sequelize';
import { Op } from 'sequelize';
import jwtToUser, { isUserAdmin } from './jwtToUser';
import { DatasourceId, Providers } from './Providers';
import { kickOffReIngest } from './utils';
import { v4 } from 'uuid';
import { ContextItem } from '../context/context_interfaces';

const ALL = 'All';

export const get = async (event: any) => {
    const {
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
    const datasourceId = await DatasourceId({
        provider,
        organisationId,
        namespace,
    });

    const contextModel = await ContextModel();
    const dataset = await contextModel.findAll({
        where: {
            datasourceId,
            orgId: organisationId,
            archived: {
                [Op.or]: [false, null]
            },
            obeyaId: null,

        } as any,
        raw: true,
    });

    return {
        statusCode: 200,
        body: JSON.stringify(dataset),
    };
};

type PayloadItem = {
    positionInHierarchy: string;
    name: string;
    contextId: string;
    address: string | string[];
    projectId?: string;
    cost?: number;
};

/**
 * If the list of contexts sent in the payload
 * does not have the "All" context, add it here. 
 * 
 * The top level "All" context is not added by the user. So
 * it is added automatically and it is handled as a special case 
 * when fetched work items
 */
const addTopLevelAll = async (contexts: any[], allContexts: ContextItem[]) => {
    const exists = allContexts.length > 0;
    if (!exists) {
        if (contexts.length > 0) {
            console.log(`The top level "All" context does not exist. Adding a new context`);
            const context = {
                ...contexts[0],
                name: ALL,
                positionInHierarchy: '0',
                contextAddress: undefined,
                contextId: v4(),
                cost: 0
            };
            return [...contexts, context];
        }
    } else {
        // This is a workaround due to the behaviour of the UI
        // The UI is difficult to fix. Thats why doing this workaround here

        // The positionInHierarchy here gets set based on the order of the 
        // row in the UI. So we have to set it to 0 here
        const result = contexts.find(c => c.name === ALL);
        if (result) {
            result.positionInHierarchy = '0';
        }
    }
    return contexts;
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
    const payload = JSON.parse(body) as PayloadItem[];

    const datasourceId = await DatasourceId({
        provider,
        organisationId,
        namespace,
    });

    const keys = {
        orgId: organisationId,
        datasourceId,
        archived: false,
    };


    /**
     * Contexts in the payload
     */
    let contexts;
    if (provider === Providers.JiraCloud || provider === Providers.JiraServer) {
        contexts = flattenDeep(
            payload.map(
                ({ positionInHierarchy, name, address, projectId, contextId, cost }) => ({
                    projectId,
                    name,
                    positionInHierarchy,
                    contextAddress: address,
                    contextId,
                    cost: (cost as any) === "" ? null : cost,
                    ...keys,
                }),
            ),
        );
    } else {
        const convertToString = (address: any) => {
            return Array.isArray(address) ? address.join(',') : null;
        };

        contexts = flattenDeep(
            payload.map(
                ({ positionInHierarchy, name, address, projectId, contextId, cost }) => ({
                    projectId,
                    name,
                    positionInHierarchy,
                    contextAddress: convertToString(address),
                    contextId,
                    cost: (cost as any) === "" ? null : cost,
                    ...keys,
                }),
            ),
        );
    }

    const aurora = await writerConnection();
    const transaction = await aurora.transaction();
    try {
        const contextModel = await ContextModel(aurora);
        const allContexts = await contextModel.findAll({
            where: {
                orgId: organisationId,
                archived: false,
                obeyaId: null,
                name: ALL,
            } as any
        });
        contexts = await addTopLevelAll(contexts, allContexts);
        // Add the Top level "All" context
        await contextModel.update({
            archived: true
        }, {
            where: { ...keys } as any,
            transaction,
        } as any);
        const resp = await contextModel.bulkCreate(contexts, {
            updateOnDuplicate: Object.keys(contexts[0] ?? {}) as Array<
                keyof ContextAttributes
            >,
            transaction,
        });
        await kickOffReIngest(organisationId, datasourceId, transaction);
        await transaction.commit();
        return {
            statusCode: 201,
            body: JSON.stringify(resp),
        };
    } catch (error) {
        await transaction.rollback();
        console.error(JSON.stringify((error as any).errors || error));
        return {
            statusCode: 500,
            body: JSON.stringify((error as any).errors || error),
        };
    }
};