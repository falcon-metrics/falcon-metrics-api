import { Logger } from 'log4js';
import { Sequelize } from 'sequelize';
import ProjectModel from '../models/ProjectModel';


export type ProjectItem = {
    orgId: string;
    datasourceId: string;
    datasourceType: string;
    projectId: string;
    name: string;
    deletedAt: Date;
};
export interface IProject {
    getProjects(orgId: string): Promise<Array<ProjectItem>>;
}

export class Project implements IProject {
    private logger: Logger;
    private aurora: Promise<Sequelize>;

    constructor(opt: { logger: Logger; aurora: Promise<Sequelize>; }) {
        this.logger = opt.logger;
        this.aurora = opt.aurora;
    }

    async getProjects(orgId: string, datasourceId?: string): Promise<ProjectItem[]> {
        const model = await ProjectModel();
        const results = await model.findAll({
            where: {
                orgId,
                datasourceId,
                deletedAt: null,
            }
        });
        return results.map(m => m.toJSON());
    }
}

