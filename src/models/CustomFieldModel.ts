import { Sequelize, DataTypes } from 'sequelize';

const types: typeof DataTypes = Sequelize as any;

export const CustomFieldModel = (sequelize: Sequelize) =>
    sequelize.define(
        'customField',
        {
            id: {
                type: types.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            orgId: types.STRING,
            datasourceId: types.STRING,
            datasourceFieldName: types.STRING,
            datasourceFieldValue: types.STRING,
            displayName: types.STRING,
            workItemId: types.STRING,
            type: types.STRING,
        },
        {
            timestamps: false,
            indexes: [
                {
                    unique: true,
                    fields: [
                        'orgId',
                        'datasourceId',
                        'datasourceFieldName',
                        'workItemId',
                    ],
                },
            ],
        },
    );

export type CustomFieldItem = {
    datasourceId: string;
    datasourceFieldName: string;
    datasourceFieldValue: string;
    displayName: string;
    type: string;
    enabled: boolean;
    hidden: boolean;
};

export type CustomFieldValue = {
    name: string;
    type: string;
    value: string;
    displayName: string;
};

export const asCustomFieldItem = (model: any): CustomFieldItem => {
    return {
        datasourceId: model.datasourceId,
        datasourceFieldName: model.datasourceFieldName,
        datasourceFieldValue: model.datasourceFieldValue,
        displayName: model.displayName,
        type: model.type,
        enabled: model.enabled,
        hidden: model.hidden,
    };
};
