import { DataTypes, Sequelize, Model, BuildOptions } from 'sequelize';
import { StrategyItem } from '../strategies/interfaces';
const types: typeof DataTypes = Sequelize as any;

export interface StrategyModel extends Model<StrategyItem, any>, StrategyItem {};

export type StrategytemStatic = typeof Model & {
    new (values?: object, options?: BuildOptions): StrategyModel;
};

export const Strategies = (sequelize: Sequelize): StrategytemStatic => {
    return <StrategytemStatic>sequelize.define('strategies', {
        id: {
            type: types.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        strategyStatement: types.STRING,
        strategyDescription: types.STRING,
        relationshipType: types.STRING,
        relationships: types.JSONB,
        parentStrategicDriverId: types.STRING,
        createdAt: {
            type: types.DATE,
            defaultValue: types.NOW,
        },
        updatedAt: types.DATE,
        deletedAt: types.DATE,
        userCreated: types.STRING,
        userModified: types.INTEGER,
        orgId: types.STRING,
        contextId: types.STRING,
        horizonId: types.STRING,
        lastUser: types.STRING,
    });
};
