import { Sequelize, DataTypes, Model, BuildOptions } from 'sequelize';
import { writerConnection } from './sequelize';
import { ContextItem } from '../context/context_interfaces';

export interface ContextAttributes {
    contextAddress: string;
    contextId: string;
    datasourceId: string;
    name: string;
    orgId: string;
    positionInHierarchy: string;
    projectId?: string;
    archived: boolean;
    obeyaId?: string;
    cost?: number;
}

export interface ContextModel
    extends Model<ContextAttributes, any>,
    ContextAttributes { }

export type ContextStatic = typeof Model & {
    new(
        values?: Record<string, unknown>,
        options?: BuildOptions,
    ): ContextModel;
};

const types: typeof DataTypes = Sequelize as any;

export const ContextFactory = (
    sequelize: Sequelize
): ContextStatic => <ContextStatic>sequelize.define(
    'context',
    {
        contextId: {
            type: types.STRING,
            primaryKey: true,
        },
        orgId: types.STRING,
        datasourceId: types.STRING,
        projectId: types.STRING,
        name: types.STRING,
        positionInHierarchy: types.STRING,
        contextAddress: types.STRING,
        archived: types.BOOLEAN,
        obeyaId: types.STRING,
        cost: {
            type: types.NUMBER,
            allowNull: true
        },
    },
    {
        indexes: [
            {
                unique: false,
                fields: ['datasourceId'],
            },
        ],
        timestamps: true,
        defaultScope: {
            where: {
                archived: false
            } as any
        }
    },
);

export const asContextItem = (model: any): ContextItem => {
    return {
        id: model.contextId,
        level: model.positionInHierarchy?.split('.').length,
        name: model.name,
        positionInHierarchy: model.positionInHierarchy,
        datasourceId: model.datasourceId,
        contextAddress: model.contextAddress,
        obeyaId: model.obeyaId,
        cost: model.cost,
        projectId: model.projectId,
    };
};

export default async function ContextModel(aurora?: Sequelize) {
    const sequelize = aurora || (await writerConnection());
    return ContextFactory(sequelize);
}
