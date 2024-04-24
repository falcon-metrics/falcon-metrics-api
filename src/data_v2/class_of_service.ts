import { Sequelize } from 'sequelize';
import {
    ClassOfServiceModel,
    asClassOfServiceItem,
} from '../models/ClassOfServiceModel';

export type ClassOfServiceItem = {
    id: string;
    displayName?: string;
};

export interface IClassOfService {
    getEverything(orgId: string): Promise<Array<ClassOfServiceItem>>;
}

export class ClassOfService implements IClassOfService {
    private aurora: Promise<Sequelize>;

    constructor(opt: { aurora: Promise<Sequelize> }) {
        this.aurora = opt.aurora;
    }

    async getEverything(orgId: string): Promise<Array<ClassOfServiceItem>> {
        const aurora = await this.aurora;
        const model = ClassOfServiceModel(aurora, Sequelize);
        const classesOfServicesDb = await model.findAll({
            where: {
                orgId,
            },
        });

        const classesOfService = new Array<ClassOfServiceItem>();
        for (const classOfServiceDb of classesOfServicesDb) {
            classesOfService.push(asClassOfServiceItem(classOfServiceDb));
        }

        return classesOfService;
    }
}
