import { getLogger } from 'log4js';
import { Sequelize, Model } from 'sequelize';

import ContextModel from '../models/ContextModel';
import { CustomFieldConfigFactory } from '../models/CustomFieldConfigModel';
import { CustomFieldModel } from '../models/CustomFieldModel';
import DatasourceJob from '../models/DatasourceJobModel';
import DatasourceModel from '../models/DatasourceModel';
import { FQLFilterFactory } from '../models/FilterModel';
import { ObeyaRoomModel } from '../models/ObeyaRoomModel';
import Organisation from '../models/OrganisationModel';
import ProjectModel from '../models/ProjectModel';
import { writerConnection } from '../models/sequelize';
import { Secrets } from '../secrets/secretsmanager_client';
import {
    deleteProjects,
    getDeletedAt,
    getDeletedAtFilterCondition,
} from './delete/delete_functions';
import jwtToUser, { isUserAdmin } from './jwtToUser';

export type DatasourceItem = {
    orgId: string;
    datasourceId: string;
    enabled: boolean;
    nextRunStartFrom: Date | null;
};

export const get = async (event: any) => {
    const {
        requestContext: {
            authorizer: { jwt },
        },
    } = event;

    const { organisationId } = jwtToUser(jwt);
    const datasourceModel = await DatasourceModel();
    const data = await datasourceModel.findAll({
        where: getDeletedAtFilterCondition({ orgId: organisationId }),
    });
    const dataset = data.map((record: any) => {
        const { serviceUrl, datasourceType } = record;
        const namespace = extractNamespaceFromServiceUrl(
            datasourceType,
            serviceUrl,
        );
        return {
            ...record.toJSON(),
            namespace,
            isDemoDatasource: organisationId === 'falcon-metrics-demo',
        };
    });

    return {
        statusCode: 200,
        body: JSON.stringify(dataset),
    };
};

export const patch = async (event: any) => {
    const {
        body,
        pathParameters: { id },
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
    const payload = JSON.parse(body);

    if (id === 'demo') {
        const { visible } = payload;
        const updateSampleData = { seeSampleData: visible };

        const orgModel = await Organisation();
        await orgModel.update(updateSampleData, {
            where: { id: organisationId } as any,
        } as any);

        return {
            statusCode: 200,
            body: JSON.stringify({
                orgId: organisationId,
                datasourceId: id,
                ...payload,
            }),
        };
    }

    const datasourceModel = await DatasourceModel();
    const data = await datasourceModel.update(payload, {
        where: { orgId: organisationId, datasourceId: id } as any,
    } as any);

    return {
        statusCode: 200,
        body: JSON.stringify(data),
    };
};

export const deleteHandler = async (event: any) => {
    const {
        pathParameters: { id },
        requestContext: {
            authorizer: { jwt },
        },
    } = event;

    const logger = getLogger();
    logger.level = process.env.LOG_LEVEL
        ? process.env.LOG_LEVEL
        : 'error';

    const { organisationId: orgId, roles } = jwtToUser(jwt);
    if (!isUserAdmin(roles)) {
        return {
            statusCode: 403,
            body: JSON.stringify({ error: { message: 'Forbidden' } }),
        };
    }

    const aurora = await writerConnection();
    const transaction = await aurora.transaction();

    try {
        const where = {
            orgId: orgId,
            datasourceId: id,
        } as any;

        const datasourceModel = await DatasourceModel();
        const data = await datasourceModel.update(getDeletedAt(), {
            where,
            transaction,
        } as any);

        const datasourceJobsModel: Model<any, any> = await DatasourceJob() as any;
        await (datasourceJobsModel as any).update(getDeletedAt(), {
            where,
            transaction,
        } as any);
        //delete the filter for the datasource first, so we can by pass the dependency check
        const filterModel = await FQLFilterFactory(aurora);
        const obeyaRoomodel = ObeyaRoomModel(aurora);
        await filterModel.update(getDeletedAt(), {
            where: {
                orgId,
                datasourceId: id,
            } as any,
        } as any);
        await obeyaRoomodel.destroy({
            where: {
                orgId,
                datasourceId: id,
            },
        });
        const customFieldModel = CustomFieldModel(aurora);

        await customFieldModel.destroy({
            where: {
                orgId,
                datasourceId: id,
            },
            transaction,
        });

        const customFieldConfigsModel = CustomFieldConfigFactory(aurora);
        await customFieldConfigsModel.update(getDeletedAt(), {
            where: {
                orgId,
                datasourceId: id,
            } as any,
            transaction,
        } as any);
        const projectModel = await ProjectModel(aurora);
        const projectsFromDb = await projectModel.findAll({
            where,
            attributes: ['orgId', 'datasourceId', 'projectId'],
        });

        await deleteProjects(projectsFromDb, orgId, id, aurora, transaction);
        // Delete the secret after the commit because it can't be rolled back
        const contextModel = await ContextModel(aurora);
        // Delete residue context that has no project id, because it didnt be deleted from delete projects
        await contextModel.update(
            { archived: true },
            {
                where: {
                    orgId,
                    datasourceId: id,
                } as any,
                transaction,
            } as any,
        );
        await transaction.commit();
        try {
            const secrets = new Secrets({ logger });
            secrets.deleteSecret(`datasource-secret/${orgId}/${id}`);
            logger.info(
                `datasource secret deleted: org: ${orgId}, datasource: ${id}`,
            );
        } catch (secretError) {
            if (secretError instanceof Error) {
                logger.error(
                    `Error deleting datasource secret for. org: ${orgId}, datasource: ${id}:`,
                    secretError.message,
                );
            } else {
                console.error(secretError);
            }
        }
        return {
            statusCode: 200,
            body: JSON.stringify(data),
        };
    } catch (error) {
        await transaction.rollback();
        logger.error(
            `Error deleting datasource. org: ${orgId}, datasource: ${id} `,
            ((error as any).message),
        );
        return {
            statusCode: 400,
            body: JSON.stringify({
                dependencies: (error as any).dependencies ? (error as any).dependencies : null,
                message: ((error as any).message) ? ((error as any).message) : 'Unknown datasource errors'
            }),
        };
    }
};

const datasourceTypeExtractors: Record<string, (raw: string) => string> = {
    'jira-cloud': (raw: string) => raw.split('.')[0],
    'azure-boards': (raw: string) => raw.split('/').reverse()[0],
    'jira-server': (raw: string) => raw.split('.')[1],
    'kanbanize': (raw: string) => raw.split('.')[0],
};

export function extractNamespaceFromServiceUrl(
    datasourceType: string,
    serviceUrl: string,
) {
    const raw = serviceUrl.replace('https://', '');

    const extractor = datasourceTypeExtractors[datasourceType];
    if (!extractor) {
        return raw;
    }
    return extractor(raw);
}
