import { BuildOptions, DataTypes, Model, Sequelize } from 'sequelize';
import { writerConnection } from './sequelize';

//TODO: Figure out what is the correct typescript type for Sequelize dates.
export type SequelizeDate = Date;
export interface DatasourceAttributes {
    orgId: string;
    datasourceId: string;
    enabled: boolean;
    datasourceType: string;
    lastRunOn?: SequelizeDate;
    nextRunStartFrom?: SequelizeDate | null;
    nextSnapshotFillingStartFrom?: SequelizeDate;
    excludeItemsCompletedBeforeDate?: SequelizeDate;
    batchSizeStateItems: number;
    runDelayStateMinutes: number;
    accessCredentialsKey: string;
    accessCredentialsType: string;
    runType: string;
    serviceUrl: string;
    deletedAt?: SequelizeDate | null;
}

export interface DatasourceModel
    extends Model<DatasourceAttributes, any>,
        DatasourceAttributes {}

export type DatasourceStatic = typeof Model & {
    new (
        values?: Record<string, unknown>,
        options?: BuildOptions,
    ): DatasourceModel;
};

const types: typeof DataTypes = Sequelize as any;

export const DatasourceFactory = (
    sequelize: Sequelize,
    _type?: any,
): DatasourceStatic => {
    return <DatasourceStatic>sequelize.define(
        'datasource',
        {
            orgId: {
                type: types.STRING,
                primaryKey: true,
            },
            datasourceId: {
                type: types.STRING,
                primaryKey: true,
            },
            enabled: {
                type: types.BOOLEAN,
                allowNull: false,
                defaultValue: false,
            },

            datasourceType: types.STRING,

            lastRunOn: types.DATE,
            nextRunStartFrom: types.DATE,
            nextSnapshotFillingStartFrom: types.DATE,

            excludeItemsCompletedBeforeDate: types.DATE,
            batchSizeStateItems: types.INTEGER,
            runDelayStateMinutes: types.INTEGER,

            accessCredentialsKey: types.STRING,
            accessCredentialsType: types.STRING,

            runType: types.STRING,
            serviceUrl: types.STRING,

            deletedAt: types.DATE,
        },
        {
            timestamps: false,
        },
    );
};

export default async function () {
    const sequelize = await writerConnection();
    return DatasourceFactory(sequelize);
}
