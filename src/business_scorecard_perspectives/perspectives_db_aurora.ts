import { Logger } from 'log4js';
import { PerspectivesModel } from '../models/BusinessScorecard/Perspectives';


export default class PerspectivesDbAurora {
    private logger: Logger;
    readonly auroraWriter: any;

    constructor(opt: { logger: Logger; auroraWriter: any; }) {
        this.logger = opt.logger;
        this.auroraWriter = opt.auroraWriter;
    }

    async getAllPerspectives(orgId: string): Promise<any[]> {
        const aurora = await this.auroraWriter;
        const model = PerspectivesModel(aurora);
        const perspectives = await model.findAll({
            where: {
                org_id: orgId
            }
        });
        return perspectives;
    }

    async updatePerspectives(perspectives: any): Promise<any[]> {
        const aurora = await this.auroraWriter;
        const model = PerspectivesModel(aurora);
        const results = await model.bulkCreate(perspectives, {
            fields: ["perspective_id", "perspective_name", "org_id", "createdAt"],
            updateOnDuplicate: ["perspective_name", "org_id"],
            logging: console.log
        });
        return results;
    }

    async removePerspectives(perspectives: any): Promise<number> {
        const aurora = await this.auroraWriter;
        const model = PerspectivesModel(aurora);
        const results = await model.destroy({ where: { perspective_id: perspectives.map((i: any) => i.id.toString()) } });
        return results;
    }
}
