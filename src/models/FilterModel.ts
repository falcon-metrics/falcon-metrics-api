import { Sequelize, DataTypes, Model, BuildOptions } from 'sequelize';
import { writerConnection } from './sequelize';
import { SequelizeDate } from './DatasourceModel';

export interface FQLFilterAttributes {
    id?: string;
    orgId: string;
    datasourceId?: string;
    contextId?: string;
    displayName: string;
    flomatikaQuery: string;
    parsedQuery: string;
    tags: string;
    isFavorite?: string;
    SLE?: number;
    target?: number;
    colorHex?: string;
    deletedAt: SequelizeDate | null;
    alsoIncludeChildren: boolean;
    onlyIncludeChildren: boolean;
}

export interface FQLFilterModel
    extends Model<FQLFilterAttributes, any>,
        FQLFilterAttributes {}

export type FQLFilterStatic = typeof Model & {
    new (
        values?: Record<string, unknown>,
        options?: BuildOptions,
    ): FQLFilterModel;
};

const types: typeof DataTypes = Sequelize as any;

export const FQLFilterFactory = (
    sequelize: Sequelize
): FQLFilterStatic => <FQLFilterStatic>sequelize.define(
        'filter',
        {
            id: {
                type: types.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                unique: true,
            },
            orgId: types.STRING,
            datasourceId: types.STRING,
            contextId: types.STRING,
            displayName: types.STRING,
            flomatikaQuery: types.STRING,
            parsedQuery: types.STRING,
            tags: types.STRING,
            isFavorite: types.BOOLEAN,
            SLE: types.INTEGER,
            target: types.INTEGER,
            colorHex: types.STRING,
            deletedAt: types.DATE,
            alsoIncludeChildren: types.BOOLEAN,
            onlyIncludeChildren: types.BOOLEAN,
        },
        {
            timestamps: false,
            indexes: [
                {
                    unique: false,
                    fields: ['orgId', 'datasourceId'],
                },
            ],
        },
    );

export default async function (aurora?: Sequelize) {
    const sequelize = aurora || (await writerConnection());
    return FQLFilterFactory(sequelize);
}
