import { Logger } from 'log4js';
import { Sequelize } from 'sequelize';
import { getDeletedAtFilterCondition } from '../datasources/delete/delete_functions';
import {
    CustomFieldConfigAttributes,
    CustomFieldConfigFactory,
} from '../models/CustomFieldConfigModel';

export interface ICustomFieldConfigs {
    getCustomFieldConfigs(
        orgId: string,
        datasourceId?: string,
    ): Promise<Array<CustomFieldConfigAttributes>>;

    getByType(
        orgId: string,
        datasourceId: string,
        type: string,
    ): Promise<
        | Array<CustomFieldConfigAttributes>
        | CustomFieldConfigAttributes
        | undefined
    >;
}

export class CustomFieldConfigs implements ICustomFieldConfigs {
    protected logger: Logger;
    private database: Sequelize;
    private cache: Map<string, any> = new Map();

    constructor(opt: { logger: Logger; database: Sequelize; }) {
        this.logger = opt.logger;
        this.database = opt.database;
    }

    async getByType(
        orgId: string,
        datasourceId: string,
        type: string,
    ): Promise<
        CustomFieldConfigAttributes | CustomFieldConfigAttributes[] | undefined
    > {
        const customFieldConfigsModel = CustomFieldConfigFactory(this.database);

        const customFieldConfigsDb = await customFieldConfigsModel.findAll({
            where: {
                orgId,
                datasourceId,
                type,
                enabled: true,
            } as any,
        });

        if (!customFieldConfigsDb) {
            return undefined;
        }

        const allConfigs: Array<CustomFieldConfigAttributes> = [];

        for (const config of customFieldConfigsDb) {
            const customFieldConfig: CustomFieldConfigAttributes = {
                orgId: config.orgId,
                datasourceId: config.datasourceId,
                datasourceFieldName: config.datasourceFieldName,
                displayName: config.displayName,
                type: config.type,
                enabled: config.enabled,
                hidden: config.hidden,
                deletedAt: config.deletedAt,
            };
            allConfigs.push(customFieldConfig);
        }

        return allConfigs.length === 1 ? allConfigs[0] : allConfigs;
    }

    async getCustomFieldConfigs(
        orgId: string,
        datasourceId?: string,
    ): Promise<CustomFieldConfigAttributes[]> {
        const cacheKey = orgId + (datasourceId ? `#${datasourceId}` : '');
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey)!;
        } else {
            const fn = async () => {
                const customFieldConfigs: CustomFieldConfigAttributes[] = [];
                const customFieldConfigsModel = CustomFieldConfigFactory(this.database);
                const where: {
                    datasourceId?: string;
                    orgId: string;
                    enabled: boolean;
                } = {
                    orgId,
                    enabled: true,
                };
                if (datasourceId) {
                    where.datasourceId = datasourceId;
                }

                const allCustomFieldConfigsDb = await customFieldConfigsModel.findAll({
                    where: getDeletedAtFilterCondition(where),
                });

                for await (const customFieldConfigDb of allCustomFieldConfigsDb) {
                    const customFieldConfig: CustomFieldConfigAttributes = {
                        orgId: customFieldConfigDb.orgId,
                        datasourceId: customFieldConfigDb.datasourceId,
                        datasourceFieldName: customFieldConfigDb.datasourceFieldName,
                        displayName: customFieldConfigDb.displayName,
                        type: customFieldConfigDb.type,
                        enabled: customFieldConfigDb.enabled,
                        hidden: customFieldConfigDb.hidden,
                        deletedAt: customFieldConfigDb.deletedAt,
                    };
                    customFieldConfigs.push(customFieldConfig);
                }
                return customFieldConfigs;
            };
            const promise = fn();
            this.cache.set(cacheKey, promise);
            return promise;
        }
    }
}
