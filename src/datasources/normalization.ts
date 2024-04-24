import { Op } from 'sequelize';

import { PredefinedFilterTags } from '../common/filters_v2';
import FQLService from '../fql/fql_service';
import DatasourceModel from '../models/DatasourceModel';
import FilterModel, { FQLFilterAttributes } from '../models/FilterModel';
import { writerConnection } from '../models/sequelize';
import {
    getDeletedAt,
    getDeletedAtFilterCondition,
} from './delete/delete_functions';
import jwtToUser, { isUserAdmin } from './jwtToUser';
import { DatasourceId } from './Providers';

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

    const model = await FilterModel();
    const dataset = await model.findAll({
        raw: true,
        where: {
            datasourceId,
            deletedAt: null,
        } as any,
    });

    return {
        statusCode: 200,
        body: JSON.stringify(dataset),
    };
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
    const payload = JSON.parse(body) as any[];
    const service = await FQLService();
    const datasourceId = await DatasourceId({
        provider,
        organisationId,
        namespace,
    });

    const keys = {
        orgId: organisationId,
        datasourceId,
    };

    const dataset: FQLFilterAttributes[] = [];
    const errors = [];

    for (let index = 0; index < payload.length; index++) {
        const row = payload[index];
        try {
            const parsedQuery = await service.convertFQLToSQL(
                organisationId,
                datasourceId,
                row.flomatikaQuery,
            );

            dataset.push({
                orgId: organisationId,
                datasourceId,
                parsedQuery,
                displayName: row.displayName,
                flomatikaQuery: row.flomatikaQuery,
                target: row.target,
                SLE: row.SLE,
                tags: [PredefinedFilterTags.NORMALISATION, row.category].join(', '),
                colorHex: row.colorHex,
                deletedAt: null,
                alsoIncludeChildren: (row.alsoIncludeChildren || false).toString() === 'true',
                onlyIncludeChildren: (row.onlyIncludeChildren || false).toString() === 'true',
            });
        } catch (error) {
            errors.push({
                index,
                error,
            });
        }
    }
    if (errors.length) {
        return {
            statusCode: 500,
            body: JSON.stringify(errors),
        };
    }
    const aurora = await writerConnection();
    const transaction = await aurora.transaction();
    try {
        const filterModel = await FilterModel(aurora);
        await filterModel.update(getDeletedAt(), {
            where: {
                ...keys,
                tags: {
                    [Op.like]: '%' + PredefinedFilterTags.NORMALISATION + '%',
                },
            } as any,
        } as any);

        const success = await filterModel.bulkCreate(dataset as any);

        const datasourceModel = await DatasourceModel();
        await datasourceModel.update(
            {
                enabled: true,
                nextRunStartFrom: null,
            },
            {
                where: getDeletedAtFilterCondition({
                    orgId: organisationId,
                    datasourceId,
                }) as any
            } as any,
        );
        await transaction.commit();
        return {
            statusCode: 201,
            body: JSON.stringify(success),
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
