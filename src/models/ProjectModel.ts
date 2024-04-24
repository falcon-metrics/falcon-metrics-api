import { Model, DataTypes, Sequelize } from 'sequelize';
import { writerConnection } from './sequelize';

// @ts-ignore
export class Project extends Model {
    public orgId!: string; // Note that the `null assertion` `!` is required in strict mode.
    public datasourceId!: string;
    public datasourceType!: string;
    public projectId!: string;
    public name!: string;
    public deletedAt!: Date;
}

const types: typeof DataTypes = Sequelize as any;

export default async function (aurora?: Sequelize) {
    const sequelize = aurora || (await writerConnection());
    // @ts-ignore
    if (!Project.init) {
        throw new Error("Missing init function on project model");
    }
    // @ts-ignore
    Project.init(
        {
            orgId: {
                type: types.STRING,
                primaryKey: true,
            },
            datasourceId: {
                type: types.STRING,
                primaryKey: true,
            },
            datasourceType: {
                type: types.STRING,
                primaryKey: true,
            },
            projectId: {
                type: types.STRING,
                primaryKey: true,
            },
            name: types.STRING,
            workspace: types.STRING,
            deletedAt: types.DATE,
        },
        {
            tableName: 'projects',
            timestamps: false,
            sequelize,
        },
    );

    return Project;
}
