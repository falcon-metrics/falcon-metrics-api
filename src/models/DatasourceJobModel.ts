import { Model, Sequelize, DataTypes } from 'sequelize';
import { SequelizeDate } from './DatasourceModel';
import { writerConnection } from './sequelize';

class DatasourceJob extends Model {
    public orgId!: string; // Note that the `null assertion` `!` is required in strict mode.
    public datasourceId!: string;
    public jobName!: string;
    public enabled!: boolean;
    public batchSize!: number;
    public runDelayMinutes!: number;
    public deletedAt!: SequelizeDate | null;
}

const types: typeof DataTypes = Sequelize as any;

export default async function () {
    const sequelize = await writerConnection();
    DatasourceJob.init(
        {
            orgId: {
                type: types.STRING,
                primaryKey: true,
            },
            datasourceId: {
                type: types.STRING,
                primaryKey: true,
            },
            jobName: {
                type: types.STRING,
                primaryKey: true,
            },
            enabled: {
                type: types.BOOLEAN,
                allowNull: false,
                defaultValue: false,
            },
            batchSize: {
                type: types.INTEGER,
                defaultValue: 500,
            },
            runDelayMinutes: {
                type: types.INTEGER,
                defaultValue: 5,
            },
        },
        {
            tableName: 'datasourceJobs',
            timestamps: false,
            sequelize,
        },
    );

    return DatasourceJob;
}
