import { DateTime } from 'luxon';

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
import CustomFields, { tags, CustomFieldConfigModel } from '../models/CustomFieldConfigModel';

const getFilterWhereCondition = (
    orgId: string,
    datasourceId: string,
    tags: PredefinedFilterTags,
) => ({
    where: getDeletedAtFilterCondition({
        orgId,
        datasourceId,
        tags,
    }),
});

const getRemoveFilterWhereCondition = (
    orgId: string,
    datasourceId: string,
) => ({
    where: getDeletedAtFilterCondition({
        orgId,
        datasourceId,
        tags: PredefinedFilterTags.REMOVED,
    }),
});

const getExcludeFilter = async (orgId: string, datasourceId: string) => {
    const filterModel = await FilterModel();
    return await filterModel.findOne(
        getRemoveFilterWhereCondition(orgId, datasourceId),
    );
};

const getBlockersFilterWhereCondition = (
    orgId: string,
    datasourceId: string,
) => ({
    where: getDeletedAtFilterCondition({
        orgId,
        datasourceId,
        tags: PredefinedFilterTags.BLOCKERS,
    }),
});

const getBlockersFilter = async (orgId: string, datasourceId: string) => {
    const filterModel = await FilterModel();
    return await filterModel.findOne(
        getBlockersFilterWhereCondition(orgId, datasourceId),
    );
};

const getDiscardedFilterWhereCondition = (
    orgId: string,
    datasourceId: string,
) => ({
    where: getDeletedAtFilterCondition({
        orgId,
        datasourceId,
        tags: PredefinedFilterTags.DISCARDED,
    }),
});

const getDiscardedFilter = async (orgId: string, datasourceId: string) => {
    const filterModel = await FilterModel();
    return await filterModel.findOne(
        getDiscardedFilterWhereCondition(orgId, datasourceId),
    );
};

type Payload = {
    initialDate: string;
    excludeExpression: string;
    blockersExpression: string;
    discardedExpression: string;
    alsoIncludeChildrenExclude: boolean;
    onlyIncludeChildrenExclude: boolean;
    alsoIncludeChildrenBlockers: boolean;
    onlyIncludeChildrenBlockers: boolean;
    alsoIncludeChildrenDiscarded: boolean;
    onlyIncludeChildrenDiscarded: boolean;
    customFieldsDb: any;
    blockedReasonFieldId: string;
    discardedReasonFieldId: string;
    desiredDeliveryDateFieldId: string;
    classOfServiceFieldId: string;
};

export const get = async (event: any) => {
    const {
        pathParameters: { namespace, provider },
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
    const model = await CustomFields();

    const [
        excludeFilter,
        blockersFilter,
        discardedFilter,
        customFieldsDb
    ] = await Promise.all([
        getExcludeFilter(organisationId, datasourceId),
        getBlockersFilter(organisationId, datasourceId),
        getDiscardedFilter(organisationId, datasourceId),
        model.findAll({
            where: { datasourceId, orgId: organisationId, deletedAt: null } as any,
        })
    ]);

    const datasourceModel = await DatasourceModel();

    const datasourceData: any = await datasourceModel.findOne({
        where: getDeletedAtFilterCondition({
            orgId: organisationId,
            datasourceId,
        }),
    });
    const blockedReasonFieldId = customFieldsDb.filter(i => i.enabled).find(i => i.tags?.includes(tags.blockedReason))?.datasourceFieldName;
    const discardedReasonFieldId = customFieldsDb.filter(i => i.enabled).find(i => i.tags?.includes(tags.discardedReason))?.datasourceFieldName;
    const desiredDeliveryDateFieldsId = customFieldsDb.filter(i => i.enabled && i.tags?.includes(tags.desiredDeliveryDate)).map(i => i.datasourceFieldName).join(',');
    const classOfServiceField = customFieldsDb.filter(i => i.enabled).find(i => i.tags?.includes(tags.classOfService))?.datasourceFieldName;

    const payload: Payload = {
        initialDate: datasourceData?.excludeItemsCompletedBeforeDate ?? '',

        excludeExpression: excludeFilter?.flomatikaQuery ?? '',
        blockersExpression: blockersFilter?.flomatikaQuery ?? '',
        discardedExpression: discardedFilter?.flomatikaQuery ?? '',

        alsoIncludeChildrenExclude: excludeFilter?.alsoIncludeChildren ?? false,
        onlyIncludeChildrenExclude: excludeFilter?.onlyIncludeChildren ?? false,

        alsoIncludeChildrenBlockers: blockersFilter?.alsoIncludeChildren ?? false,
        onlyIncludeChildrenBlockers: blockersFilter?.onlyIncludeChildren ?? false,

        alsoIncludeChildrenDiscarded: discardedFilter?.alsoIncludeChildren ?? false,
        onlyIncludeChildrenDiscarded: discardedFilter?.onlyIncludeChildren ?? false,
        customFieldsDb,
        blockedReasonFieldId: blockedReasonFieldId || '',
        discardedReasonFieldId: discardedReasonFieldId || '',
        desiredDeliveryDateFieldId: desiredDeliveryDateFieldsId || '',
        classOfServiceFieldId: classOfServiceField || ''
    };

    return {
        statusCode: 200,
        body: JSON.stringify(payload),
    };
};

export const post = async (event: any) => {
    const {
        body,
        pathParameters: { namespace, provider },
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

    const payload = JSON.parse(body) as Payload;
    const service = await FQLService();
    const aurora = await writerConnection();
    const transaction = await aurora.transaction();
    let parsedExcludeQuery: string;
    const {
        initialDate,
        excludeExpression,
        blockersExpression,
        discardedExpression,
        alsoIncludeChildrenExclude,
        onlyIncludeChildrenExclude,
        alsoIncludeChildrenBlockers,
        onlyIncludeChildrenBlockers,
        alsoIncludeChildrenDiscarded,
        onlyIncludeChildrenDiscarded,
        blockedReasonFieldId,
        discardedReasonFieldId,
        desiredDeliveryDateFieldId,
        classOfServiceFieldId
    } = payload;
    let parsedBlockerQuery: string;
    let parsedDiscardedQuery: string;

    if (typeof alsoIncludeChildrenExclude !== 'boolean') {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: { message: 'Missing parameter' } }),
        };
    }

    try {
        parsedExcludeQuery = await service.convertFQLToSQL(
            organisationId,
            datasourceId,
            excludeExpression,
        );
        parsedBlockerQuery = await service.convertFQLToSQL(
            organisationId,
            datasourceId,
            blockersExpression,
        );
        parsedDiscardedQuery = await service.convertFQLToSQL(
            organisationId,
            datasourceId,
            discardedExpression,
        );
        const parsedDate = DateTime.fromISO(initialDate).toJSDate();
        await saveDatasources(parsedDate, transaction, organisationId);

        const filterModel = await FilterModel(aurora);
        const successList: FQLFilterAttributes[] = [];
        if (typeof excludeExpression === 'string') {
            const where = getRemoveFilterWhereCondition(
                organisationId,
                datasourceId,
            ) as any;
            await filterModel.update(getDeletedAt(), { ...where, transaction } as any);
            const success = await filterModel.create(
                {
                    orgId: organisationId,
                    datasourceId,
                    flomatikaQuery: excludeExpression,
                    parsedQuery: parsedExcludeQuery,
                    displayName: 'Removed',
                    tags: PredefinedFilterTags.REMOVED,
                    deletedAt: null,
                    alsoIncludeChildren: alsoIncludeChildrenExclude,
                    onlyIncludeChildren: onlyIncludeChildrenExclude,
                },
                { ...where, transaction },
            );
            if (success)
                successList.push(success);
        }
        if (typeof blockersExpression === 'string') {
            const where = getFilterWhereCondition(
                organisationId,
                datasourceId,
                PredefinedFilterTags.BLOCKERS,
            ) as any;
            await filterModel.update(getDeletedAt(), { ...where, transaction } as any);
            const success = await filterModel.create(
                {
                    orgId: organisationId,
                    datasourceId,
                    flomatikaQuery: blockersExpression,
                    parsedQuery: parsedBlockerQuery,
                    displayName: 'Blockers',
                    tags: PredefinedFilterTags.BLOCKERS,
                    deletedAt: null,
                    alsoIncludeChildren: alsoIncludeChildrenBlockers,
                    onlyIncludeChildren: onlyIncludeChildrenBlockers,
                },
                { ...where, transaction },
            );
            if (success)
                successList.push(success);
        }
        if (typeof discardedExpression === 'string') {
            const where = getFilterWhereCondition(
                organisationId,
                datasourceId,
                PredefinedFilterTags.DISCARDED,
            ) as any;
            await filterModel.update(getDeletedAt(), { ...where, transaction } as any);
            const success = await filterModel.create(
                {
                    orgId: organisationId,
                    datasourceId,
                    flomatikaQuery: discardedExpression,
                    parsedQuery: parsedDiscardedQuery,
                    displayName: 'Discarded',
                    tags: PredefinedFilterTags.DISCARDED,
                    deletedAt: null,
                    alsoIncludeChildren: alsoIncludeChildrenDiscarded,
                    onlyIncludeChildren: onlyIncludeChildrenDiscarded,
                },
                { ...where, transaction },
            );
            if (success)
                successList.push(success);
        }
        const model = await CustomFields();
        const customFields = await model.findAll({
            where: { datasourceId, orgId: organisationId, deletedAt: null } as any,
        });
        if (blockedReasonFieldId && typeof blockedReasonFieldId === 'string' && blockedReasonFieldId.length > 0) {
            const existingCustomField = customFields.find(field => field.tags?.includes(tags.blockedReason));
            const targetCustomField = customFields.find(i => i.datasourceFieldName === blockedReasonFieldId);
            if (existingCustomField !== targetCustomField) {
                if (existingCustomField) {
                    await model.update({ tags: existingCustomField?.tags?.split(',').filter(i => i !== tags.blockedReason).join(',') },
                        {
                            where: { datasourceId, orgId: organisationId, datasourceFieldName: existingCustomField?.datasourceFieldName } as any,
                            transaction,

                        } as any);
                }
                if (targetCustomField) {
                    const existingTags = targetCustomField?.tags?.split(',').filter(val => val !== '');
                    const combinedTags = existingTags && existingTags?.length > 0 ? existingTags.concat([tags.blockedReason]).join(',') : tags.blockedReason;
                    await model.update({ tags: combinedTags },
                        {
                            where: { datasourceId, orgId: organisationId, datasourceFieldName: blockedReasonFieldId } as any,
                            transaction,

                        } as any);
                }
            }
        }
        if (discardedReasonFieldId && typeof discardedReasonFieldId === 'string' && discardedReasonFieldId.length > 0) {
            const existingCustomField = customFields.find(field => field.tags?.includes(tags.discardedReason));
            const targetCustomField = customFields.find(i => i.datasourceFieldName === discardedReasonFieldId);
            if (existingCustomField !== targetCustomField) {
                if (existingCustomField) {
                    await model.update({ tags: existingCustomField?.tags?.split(',').filter(i => i !== tags.discardedReason).join(',') },
                        {
                            where: { datasourceId, orgId: organisationId, datasourceFieldName: existingCustomField?.datasourceFieldName } as any,
                            transaction,

                        } as any);
                }
                if (targetCustomField) {
                    const existingTags = targetCustomField?.tags?.split(',').filter(val => val !== '');
                    const combinedTags = existingTags && existingTags?.length > 0 ? existingTags.concat([tags.discardedReason]).join(',') : tags.discardedReason;
                    await model.update({ tags: combinedTags },
                        {
                            where: { datasourceId, orgId: organisationId, datasourceFieldName: discardedReasonFieldId } as any,
                            transaction,

                        } as any);
                }
            }
        }
        if (desiredDeliveryDateFieldId !== undefined && desiredDeliveryDateFieldId !== null && typeof desiredDeliveryDateFieldId === 'string') {
            const existingCustomFields = customFields.filter(field => field.tags?.includes(tags.desiredDeliveryDate));
            const targetCustomFields = customFields.filter(i => desiredDeliveryDateFieldId.split(',').includes(i.datasourceFieldName));
            if (existingCustomFields.map(i => i.datasourceFieldName).sort((a, b) => a.localeCompare(b)).join(',')
                !== targetCustomFields.map(i => i.datasourceFieldName).sort((a, b) => a.localeCompare(b)).join(',')) {
                const fieldsToRemoveTag = existingCustomFields.filter(i => !(targetCustomFields.map(i => i.datasourceFieldName).includes(i.datasourceFieldName)));
                const fieldsToAddTag = targetCustomFields.filter(i => !(existingCustomFields.map(i => i.datasourceFieldName).includes(i.datasourceFieldName)));
                for (let i = 0; i < fieldsToRemoveTag.length; i++) {
                    const existingCustomField = fieldsToRemoveTag[i];
                    await model.update({ tags: existingCustomField?.tags?.split(',').filter(i => i !== tags.desiredDeliveryDate).join(',') },
                        {
                            where: { datasourceId, orgId: organisationId, datasourceFieldName: existingCustomField?.datasourceFieldName } as any,
                            transaction,
                        } as any);
                }
                for (let i = 0; i < fieldsToAddTag.length; i++) {
                    const targetCustomField = fieldsToAddTag[i];
                    const existingTags = targetCustomField?.tags?.split(',').filter(val => val !== '');
                    const combinedTags = existingTags && existingTags?.length > 0 ? existingTags.concat([tags.desiredDeliveryDate]).join(',') : tags.desiredDeliveryDate;
                    await model.update({ tags: combinedTags },
                        {
                            where: { datasourceId, orgId: organisationId, datasourceFieldName: targetCustomField.datasourceFieldName } as any,
                            transaction,
                        } as any);
                }
            }
        }
        if (classOfServiceFieldId && typeof classOfServiceFieldId === 'string' && classOfServiceFieldId.length > 0) {
            const existingCustomField = customFields.find(field => field.tags?.includes(tags.classOfService));
            const targetCustomField = customFields.find(i => i.datasourceFieldName === classOfServiceFieldId);
            if (existingCustomField !== targetCustomField) {
                if (existingCustomField) {
                    await model.update({ tags: existingCustomField?.tags?.split(',').filter(i => i !== tags.classOfService).join(',') },
                        {
                            where: { datasourceId, orgId: organisationId, datasourceFieldName: existingCustomField?.datasourceFieldName } as any,
                            transaction,

                        } as any);
                }
                if (targetCustomField) {
                    const existingTags = targetCustomField?.tags?.split(',').filter(val => val !== '');
                    const combinedTags = existingTags && existingTags?.length > 0 ? existingTags.concat([tags.classOfService]).join(',') : tags.classOfService;
                    await model.update({ tags: combinedTags },
                        {
                            where: { datasourceId, orgId: organisationId, datasourceFieldName: classOfServiceFieldId } as any,
                            transaction,

                        } as any);
                }
            }
        }
        await transaction.commit();
        return {
            statusCode: 201,
            body: JSON.stringify(
                successList
            ),
        };
    } catch (error) {
        await transaction.rollback();
        console.error('Datasource settings POST request failed with an error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify((error as any).errors || error),
        };
    }
};

async function saveDatasources(
    excludeItemsCompletedBeforeDate: Date,
    transaction: any,
    orgId: string,
) {
    const payload = { excludeItemsCompletedBeforeDate };

    const datasourceModel = await DatasourceModel();
    return await datasourceModel.update(payload, {
        where: getDeletedAtFilterCondition({
            orgId,
        }) as any,
        transaction,
    } as any);
}
