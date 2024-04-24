import { Sequelize, BuildOptions, Model, DataTypes } from 'sequelize';
import { SequelizeDate } from './DatasourceModel';
import { writerConnection } from './sequelize';

export enum tags {
    blockedReason = 'blocked_reason',
    discardedReason = 'discarded_reason',
    desiredDeliveryDate = 'desired_delivery_date',
    classOfService = 'class_of_service'
}
export interface CustomFieldConfigAttributes {
    orgId: string;
    datasourceId: string;
    datasourceFieldName: string;
    displayName: string;
    type: string;
    enabled: boolean;
    hidden: boolean;
    deletedAt: SequelizeDate | null;
    projectId?: string;
    tags?: string;
}

export interface CustomFieldConfigModel
    extends Model<CustomFieldConfigAttributes, any>,
    CustomFieldConfigAttributes { }

export type CustomFieldConfigStatic = typeof Model & {
    new(
        values?: Record<string, unknown>,
        options?: BuildOptions,
    ): CustomFieldConfigModel;
};

const types: typeof DataTypes = Sequelize as any;

export const CustomFieldConfigFactory = (
    sequelize: Sequelize,
): CustomFieldConfigStatic => <CustomFieldConfigStatic>sequelize.define(
    'customFieldConfig',
    {
        orgId: {
            type: types.STRING,
            primaryKey: true,
        },
        datasourceId: {
            type: types.STRING,
            primaryKey: true,
        },
        datasourceFieldName: {
            type: types.STRING,
            primaryKey: true,
        },
        displayName: types.STRING,
        type: types.STRING,
        enabled: types.BOOLEAN,
        hidden: types.BOOLEAN,
        projectId: {
            type: types.STRING,
            primaryKey: true,
            defaultValue: 'default-value'
        },
        deletedAt: types.DATE,
        tags: types.STRING
    },
    {
        timestamps: false,
    },
);

export default async function () {
    const sequelize = await writerConnection();
    return CustomFieldConfigFactory(sequelize);
}
