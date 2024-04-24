import { Sequelize, Transaction, Model } from 'sequelize';
import { Interval } from 'luxon';
import { PortfolioModel } from '../models/PortfolioModel';
import { RawColumn } from './interfaces';

export class PortfolioDbAurora {
    private aurora: Promise<Sequelize>;

    constructor(opt: { aurora: Promise<Sequelize>; }) {
        this.aurora = opt.aurora;
    }

    async getAllColumns(
        orgId: string,
        dateRange: Interval,
        sequelize: Sequelize,
    ): Promise<Model<RawColumn>[]> {
        const model = PortfolioModel(sequelize);
        const columns: Model<RawColumn>[] = await model.findAll({
            where: {
                orgId,
            },
        });
        return columns;
    }

    async create(
        orgId: string,
        object: RawColumn,
        sequelize: Sequelize,
        transaction: Transaction,
    ): Promise<unknown> {
        const data: RawColumn = {
            orgId,
            ...object,
        };
        const model = PortfolioModel(sequelize);
        return await model.upsert(data, {
            transaction,
        });
    }

    async update(
        object: RawColumn,
        sequelize: Sequelize,
        transaction: Transaction,
    ) {
        const { columnId, ...rawObject } = object;
        const model = PortfolioModel(sequelize);
        return model.update(rawObject, {
            transaction,
            where: {
                columnId,
            } as any,
        } as any);
    }
    async delete(
        columnId: string,
        sequelize: Sequelize,
        transaction: Transaction,
    ): Promise<unknown> {
        const model = PortfolioModel(sequelize);
        return model.destroy({
            where: {
                columnId,
            },
            transaction,
        });
    }
}
