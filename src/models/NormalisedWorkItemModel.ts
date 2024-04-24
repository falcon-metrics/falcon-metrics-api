import { Sequelize, DataTypes, Model, BuildOptions } from 'sequelize';

export interface NormalisedWorkItemAttributes {
    orgId: string;
    datasourceId: string;
    filterId: number;
    contextId?: string;
    displayName: string;
}

export interface NormalisedWorkItemModel
    extends Model<NormalisedWorkItemAttributes, any>,
        NormalisedWorkItemAttributes {}

// export class NormalisedWorkItem extends Model<NormalisedWorkItemModel, NormalisedWorkItemAttributes> {}

export type NormalisedWorkItemStatic = typeof Model & {
    new (values?: object, options?: BuildOptions): NormalisedWorkItemModel;
};

const types: typeof DataTypes = Sequelize as any;

export const NormalisedWorkItemFactory = (
    sequelize: Sequelize,
    _type?: any,
): NormalisedWorkItemStatic => {
    return <NormalisedWorkItemStatic>sequelize.define(
        'normalisedWorkItem',
        {
            orgId: {
                type: types.STRING,
                primaryKey: true,
            },
            datasourceId: {
                type: types.STRING,
                primaryKey: true,
            },
            filterId: {
                type: types.INTEGER,
                primaryKey: true,
            },
            contextId: types.STRING,
            displayName: types.STRING,
        },
        {
            timestamps: false,
        },
    );
};
