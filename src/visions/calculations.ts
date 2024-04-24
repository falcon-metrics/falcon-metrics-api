import { Logger } from 'log4js';
import { Sequelize } from 'sequelize';
import { IQueryFilters } from '../common/filters_v2';
import { SecurityContext } from '../common/security';
import { VisionsDbAurora } from './visions_db_aurora';
import { StrategicDriver, VisionItem } from './interfaces';
import { Calculations as StrategiesCalculations } from '../strategies/calculations';
import { VisionStrategicDriverModel } from '../models/VisionStrategicDrivers';
import { HorizonItem } from '../strategies/interfaces';

export class Calculations {
    readonly orgId?: string;
    readonly logger: Logger;
    readonly filters?: IQueryFilters;
    readonly visionsDbAurora: VisionsDbAurora;
    readonly auroraWriter: any;
    readonly strategiesCalculations: StrategiesCalculations;

    constructor(opts: {
        auroraWriter: any;
        security: SecurityContext;
        logger: Logger;
        filters?: IQueryFilters;
        visionsDbAurora: VisionsDbAurora;
        strategiesCalculations: StrategiesCalculations;
    }) {
        this.auroraWriter = opts.auroraWriter;
        this.orgId = opts.security.organisation!;
        this.logger = opts.logger;
        this.filters = opts.filters;
        this.visionsDbAurora = opts.visionsDbAurora;
        this.strategiesCalculations = opts.strategiesCalculations;
    }

    async getVision(id: number | string): Promise<VisionItem[]> {
        return await this.visionsDbAurora.getVision(id, this.orgId!);
    }

    async getAllVisions(): Promise<VisionItem[]> {
        const visions = await this.visionsDbAurora.getAllVisions(this.orgId!);
        return visions;
    }

    async getAllHorizons(): Promise<HorizonItem[]> {
        const horizons = await this.visionsDbAurora.getAllHorizons(this.orgId!);
        return horizons;
    }

    async createVision(
        commentObject: VisionItem,
    ): Promise<VisionItem | unknown> {
        const aurora: Sequelize = await this.auroraWriter;
        try {
            const result = await this.visionsDbAurora.saveVision(
                this.orgId!,
                commentObject,
                aurora,
            );
            return result;
        } catch (error) {
            const message =
                error instanceof Error && error?.message
                    ? error.message
                    : 'An error occured on createComment';
            console.debug('Error create a Comment: ', message);
        }
    }

    async updateVision(
        visionObject: VisionItem,
    ): Promise<VisionItem | unknown> {
        const aurora: Sequelize = await this.auroraWriter;
        try {
            return await this.visionsDbAurora.updateVision(
                this.orgId!,
                visionObject,
                aurora,
            );
        } catch (error) {
            const message =
                error instanceof Error && error?.message
                    ? error.message
                    : 'An error occured on update';
            console.debug('Error when Update vision: ', message);
        }
    }

    async deleteVision(visionId: number): Promise<void> {
        const aurora: Sequelize = await this.auroraWriter;
        try {
            await this.visionsDbAurora.delete(visionId, this.orgId!, aurora);
        } catch (error) {
            console.debug('error calculations delete vision ==>', error);
            throw error;
        }
    }
}
