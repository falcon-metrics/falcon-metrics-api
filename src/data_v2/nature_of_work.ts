import {
    asNatureOfWorkItem,
    NatureOfWorkModel,
} from '../models/NatureOfWorkModel';
import { Sequelize } from 'sequelize';

export type NatureOfWorkItem = {
    id: string;
    displayName?: string;
};

export interface INatureOfWork {
    getEverything(orgId: string): Promise<Array<NatureOfWorkItem>>;
}

export class NatureOfWork implements INatureOfWork {
    private aurora: Promise<Sequelize>;

    constructor(opt: { aurora: Promise<Sequelize> }) {
        this.aurora = opt.aurora;
    }

    async getEverything(orgId: string): Promise<Array<NatureOfWorkItem>> {
        const aurora = await this.aurora;
        const model = NatureOfWorkModel(aurora, Sequelize);
        const natureOfWorksDb = await model.findAll({
            where: {
                orgId,
            },
        });

        const natureOfWorks = new Array<NatureOfWorkItem>();
        for (const natureOfWorkDb of natureOfWorksDb) {
            natureOfWorks.push(asNatureOfWorkItem(natureOfWorkDb));
        }

        return natureOfWorks;
    }
}
