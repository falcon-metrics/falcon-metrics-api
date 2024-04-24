import { asValueAreaItem, ValueAreaModel } from '../models/ValueAreaModel';
import { Sequelize } from 'sequelize';

export type ValueAreaItem = {
    id: string;
    displayName?: string;
};

export interface IValueArea {
    getEverything(orgId: string): Promise<Array<ValueAreaItem>>;
}

export class ValueArea implements IValueArea {
    private aurora: Promise<Sequelize>;

    constructor(opt: { aurora: Promise<Sequelize> }) {
        this.aurora = opt.aurora;
    }

    async getEverything(orgId: string): Promise<Array<ValueAreaItem>> {
        const aurora = await this.aurora;
        const model = ValueAreaModel(aurora, Sequelize);
        const valueAreasDb = await model.findAll({
            where: {
                orgId,
            },
        });

        const valueAreas = new Array<ValueAreaItem>();
        for (const valueAreaDb of valueAreasDb) {
            valueAreas.push(asValueAreaItem(valueAreaDb));
        }

        return valueAreas;
    }
}
