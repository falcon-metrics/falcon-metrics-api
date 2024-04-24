import { Op, QueryTypes, Sequelize } from 'sequelize';
import { SecurityContext } from '../../common/security';
import {
    CustomFieldConfigAttributes,
    CustomFieldConfigFactory,
} from '../../models/CustomFieldConfigModel';
import { DatasourceId } from '../Providers';
import DatasourceJob from '../../models/DatasourceJobModel';
import { Logger } from 'log4js';
import { FQLFilterFactory } from '../../models/FilterModel';
import { ObeyaRoomModel } from '../../models/ObeyaRoomModel';
import { CustomFieldModel } from '../../models/CustomFieldModel';
import {
    getDeletedAt,
    getDeletedAtFilterCondition,
} from '../delete/delete_functions';
import DatasourceModel from '../../models/DatasourceModel';

export type CustomFieldDependencies = {
    customFields: Map<
        string,
        {
            fqlFilters: string[];
            obeyaRooms: string[];
        }
    >;
};
export class HandleCustomFields {
    private orgId: string;
    private auroraWriter: any;
    private logger: Logger;

    constructor(opts: {
        security: SecurityContext;
        auroraWriter: any;
        logger: Logger;
    }) {
        this.orgId = opts.security.organisation!;
        this.auroraWriter = opts.auroraWriter;
        this.logger = opts.logger;
    }

    async postCustomFields(
        customFieldsConfig: Array<CustomFieldConfigAttributes>,
        removedCustomFields: string[],
        provider: string,
        namespace: string,
    ): Promise<Array<CustomFieldConfigAttributes>> {
        const datasourceId = await DatasourceId({
            provider,
            organisationId: this.orgId,
            namespace,
        });
        const aurora = await this.auroraWriter;
        const transaction = await aurora.transaction();

        try {
            await this.deleteCustomFieldsFromTable(
                removedCustomFields,
                transaction,
            );

            await this.deleteCustomFieldsFromStateJson(
                removedCustomFields,
                transaction,
            );

            await this.saveCustomFields(
                customFieldsConfig,
                datasourceId,
                aurora,
                transaction,
            );
            await transaction.commit();
        } catch (error) {
            await transaction.rollback();
            this.logger.error(
                'Error saving customFieldsConfig: ',
                error instanceof Error ? error.message : 'Unknown error type',
            );
        }
        return customFieldsConfig;
    }

    async getDependencies(
        customFieldIds: string[],
        provider: string,
        namespace: string,
    ): Promise<CustomFieldDependencies> {
        const dependencies: CustomFieldDependencies = {
            customFields: new Map(),
        };

        const datasourceId = await DatasourceId({
            provider,
            organisationId: this.orgId,
            namespace,
        });

        for (const customFieldId of customFieldIds) {
            let customFields = dependencies.customFields.get(customFieldId);
            if (!dependencies.customFields.has(customFieldId)) {
                customFields = {
                    fqlFilters: [],
                    obeyaRooms: [],
                };

                dependencies.customFields.set(customFieldId, customFields);
            }

            const displayNames = await this.hasFqlDependencies(
                customFieldId,
                datasourceId,
            );
            if (displayNames) {
                const fqlFilters = customFields!.fqlFilters.concat(
                    displayNames,
                );
                customFields!.fqlFilters = fqlFilters;
            }

            const obeyaRooms = await this.hasObeyaDependencies(
                customFieldId,
                datasourceId,
            );
            if (obeyaRooms) {
                const rooms = customFields!.obeyaRooms.concat(obeyaRooms);
                customFields!.obeyaRooms = rooms;
            }
        }

        return dependencies;
    }

    private async hasFqlDependencies(
        datasourceFieldName: string,
        datasourceId: string,
    ): Promise<string[]> {
        const aurora = await this.auroraWriter;
        const filterModel = FQLFilterFactory(aurora);
        const fqlFilters = await filterModel.findAll({
            where: {
                orgId: this.orgId,
                datasourceId,
                flomatikaQuery: {
                    [Op.iLike]: `%${datasourceFieldName}%`,
                },
                deletedAt: null,
                parsedQuery: {
                    [Op.not]: ''
                },
            } as any,
            attributes: ['displayName'],
        });

        return fqlFilters.map((f) => f.displayName);
    }

    private async hasObeyaDependencies(
        datasourceFieldName: string,
        datasourceId: string,
    ): Promise<string[]> {
        const aurora = await this.auroraWriter;

        const model = ObeyaRoomModel(aurora);
        const obeyaRooms = await model.findAll({
            where: {
                orgId: this.orgId,
                datasourceId,
                flomatikaQuery: {
                    [Op.iLike]: `%${datasourceFieldName}%`,
                },
            },
            attributes: ['roomName'],
        });

        return obeyaRooms.map((i: any) => i.roomName);
    }

    private async deleteCustomFieldsFromTable(
        removedCustomFields: string[],
        transaction: any,
    ): Promise<void> {
        const aurora = await this.auroraWriter;
        const customFieldModel = CustomFieldModel(aurora);

        customFieldModel.destroy({
            where: {
                orgId: this.orgId,
                datasourceFieldName: removedCustomFields,
            },
            transaction,
        });

        const customFieldConfigsModel = CustomFieldConfigFactory(aurora);
        const emptyTagsObject = { tags: '' };
        customFieldConfigsModel.update({ ...getDeletedAt(), ...emptyTagsObject }, {
            where: {
                orgId: this.orgId,
                datasourceFieldName: removedCustomFields,
            } as any,
            transaction,
        } as any);

        return;
    }

    private async deleteCustomFieldsFromStateJson(
        removedCustomFields: string[],
        transaction: any,
    ): Promise<void> {
        const aurora = await this.auroraWriter;

        if (!removedCustomFields || removedCustomFields.length === 0) {
            return;
        }

        const innerPredicates: string[] = [];
        const outerPredicates: string[] = [];

        removedCustomFields.forEach((customFieldName) => {
            innerPredicates.push(
                `lower("customFields"::text)::jsonb @> lower('[{"name":"${customFieldName}"}]')::jsonb`,
            );

            outerPredicates.push(
                `not (cf @> lower('{"name":"${customFieldName}"}')::jsonb)`,
            );
        });

        const deleteQuery = `
        update	states
        set		"customFields" = states_sub.updated_cf

        from (
            select id, jsonb_agg(cf) as updated_cf
            from (
                select  id, jsonb_array_elements("customFields") as cf
                from	states
                where	"partitionKey" = 'state#${this.orgId}'

                and (
                    ${innerPredicates.join(' OR ')}
                )
            ) arr
            where 
                    ${outerPredicates.join(' AND ')}

            group by arr.id
        ) states_sub

        where states.id = states_sub.id        
        `;

        await aurora.query(deleteQuery, {
            type: QueryTypes.SELECT,
            transaction,
        });

        return;
    }

    private async saveCustomFields(
        customFieldsConfig: Array<CustomFieldConfigAttributes>,
        datasourceId: string,
        sequelize: any,
        transaction: any,
    ) {
        const customFieldConfigsModel = CustomFieldConfigFactory(sequelize);

        await Promise.all(
            customFieldsConfig.map(async (config) => {
                const newConfig: CustomFieldConfigAttributes = {
                    orgId: this.orgId,
                    datasourceId,
                    datasourceFieldName: config.datasourceFieldName,
                    displayName: config.displayName,
                    type: 'system',
                    enabled: true,
                    hidden: false,
                    projectId: config.projectId,
                    deletedAt: null,
                };
                await customFieldConfigsModel.upsert((newConfig as any), {
                    transaction,
                });
                return newConfig;
            }),
        );

        await this.startCustomFieldReingestion(this.orgId, datasourceId);
    }

    private async startCustomFieldReingestion(
        orgId: string,
        datasourceId: string,
    ): Promise<void> {
        const datasource = await DatasourceModel();

        this.logger.info(
            'custom field config change - start reingesting custom fields',
        );

        await datasource.update(
            {
                nextRunStartFrom: null,
                enabled: true,
            },
            {
                where: getDeletedAtFilterCondition({
                    orgId,
                    datasourceId,
                }) as any,
            } as any,
        );

        return;
    }
}
