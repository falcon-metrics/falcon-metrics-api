import {
    ForecastingSettingsItem,
    ForecastingSettingContextCapacity,
    ForecastingSettingsData,
} from './types';
import { Op, Sequelize, Transaction } from 'sequelize';
import { ForecastingSettingsModel } from '../../../models/Obeya/forecasting/ForecastingSettingsModel';
import { ForecastingSettingContextCapacityModel } from '../../../models/Obeya/forecasting/ForecastingSettingsContextCapacityModel';
export interface IForecastingSettingsDB {
    getForecastingSettings(
        orgId: string,
        roomId: string,
    ): Promise<ForecastingSettingsItem>;
    createOrUpdateForecastingSettingsData(
        orgId: string,
        newForecastingSettingsData: ForecastingSettingsData,
    ): Promise<ForecastingSettingsData>;
    getAllForecastingSettingContextCapacity(
        orgId: string,
        roomId: string,
    ): Promise<ForecastingSettingContextCapacity[]>;
    getForecastingSettingContextCapacity(
        orgId: string,
        roomId: string,
        contextIds: string[],
    ): Promise<ForecastingSettingContextCapacity[]>;
}

export class ForecastingSettingDB implements IForecastingSettingsDB {
    readonly auroraWriter: Promise<Sequelize>;
    readonly aurora: Promise<Sequelize>;
    constructor(opts: { auroraWriter: Promise<Sequelize>; aurora: Promise<Sequelize>; }) {
        this.auroraWriter = opts.auroraWriter;
        this.aurora = opts.aurora;
    }
    async getForecastingSettings(
        orgId: string,
        roomId: string,
    ): Promise<ForecastingSettingsItem> {
        const model = await ForecastingSettingsModel(
            await this.aurora,
            Sequelize,
        );
        const where = {
            orgId,
            roomId,
        };
        const forecastingSetting: any = await model.findOne({
            where,
            raw: true,
        });
        return forecastingSetting as ForecastingSettingsItem;
    }
    async getAllForecastingSettingContextCapacity(
        orgId: string,
        roomId: string,
    ): Promise<ForecastingSettingContextCapacity[]> {
        const model = await ForecastingSettingContextCapacityModel(
            await this.aurora,
            Sequelize,
        );
        const where = {
            orgId,
            roomId,
        };
        const forecastingSettingContextCapacity: any = await model.findAll({
            where,
            raw: true,
        });
        return forecastingSettingContextCapacity as ForecastingSettingContextCapacity[];
    }
    async getForecastingSettingContextCapacity(
        orgId: string,
        roomId: string,
        contextIds: string[],
    ): Promise<ForecastingSettingContextCapacity[]> {
        const model = await ForecastingSettingContextCapacityModel(
            await this.aurora,
            Sequelize,
        );
        const where = {
            orgId,
            roomId,
            contextId: { [Op.in]: contextIds },
        };
        const forecastingSettingContextCapacity: any = await model.findAll({
            where,
            raw: true,
        });
        return forecastingSettingContextCapacity as ForecastingSettingContextCapacity[];
    }
    async createOrUpdateForecastingSettingsData(
        orgId: string,
        newForecastingSettingsData: ForecastingSettingsData,
    ): Promise<ForecastingSettingsData> {
        const sequelize = await this.auroraWriter;
        const transaction = await sequelize.transaction();
        const roomId = newForecastingSettingsData.roomId;
        try {
            const forecastingSettingsModel = await ForecastingSettingsModel(
                sequelize,
                Sequelize,
            );
            newForecastingSettingsData.orgId = orgId;
            await forecastingSettingsModel.upsert(newForecastingSettingsData, {
                transaction,
            });
            const contextCapacityModel = await ForecastingSettingContextCapacityModel(
                sequelize,
                Sequelize,
            );
            for (const contextCapacity of newForecastingSettingsData.contextCapacity) {
                await contextCapacityModel.upsert(
                    { ...contextCapacity, orgId, roomId },
                    {
                        transaction,
                    },
                );
            }
            transaction.commit();
            return newForecastingSettingsData;
        } catch (error) {
            transaction.rollback();
            throw error;
        }
    }
    async createOrUpdateContextCapacity(
        contextCapacities: ForecastingSettingContextCapacity[],
        transaction: Transaction,
    ): Promise<void> {
        const model = await ForecastingSettingContextCapacityModel(
            await this.auroraWriter,
            Sequelize,
        );
        await Promise.all(
            contextCapacities.map(async (contextCapacity) => {
                model.upsert(contextCapacity, { transaction });
            }),
        );
    }
}
