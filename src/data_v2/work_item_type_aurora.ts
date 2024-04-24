import { Logger } from 'log4js';
import { Sequelize } from 'sequelize';
import { getDeletedAtFilterCondition } from '../datasources/delete/delete_functions';
import WorkItemTypeModel from '../models/WorkItemTypeModel';
import WorkItemTypeMapModel, { WorkItemTypeMapAttributes } from '../models/WorkItemTypeMapModel';

export type WorkItemTypeItem = {
    id: string;
    displayName?: string;
    level?: string;
    serviceLevelExpectationInDays?: number;
};

export type WorkItemTypeMapItem = {
    id: string;
    name?: string;
    workItemTypeId?: string;
};

export interface IWorkItemType {
    getTypes(orgId: string): Promise<Array<WorkItemTypeItem>>;
    getWorkItemTypeMaps(orgId: string, datasourceId: string): Promise<Array<WorkItemTypeMapAttributes>>;
}

export class WorkItemType implements IWorkItemType {
    private logger: Logger;
    private aurora: Promise<Sequelize>;

    constructor(opt: { logger: Logger; aurora: Promise<Sequelize>; }) {
        this.logger = opt.logger;
        this.aurora = opt.aurora;
    }

    async getTypes(orgId: string): Promise<WorkItemTypeItem[]> {
        const workItemTypes = new Array<WorkItemTypeItem>();
        const workItemTypeModel = await WorkItemTypeModel();

        const workItemTypesDb: any = await workItemTypeModel.findAll({
            where: getDeletedAtFilterCondition({
                orgId,
            }),
        });

        for (const workItemType of workItemTypesDb) {
            workItemTypes.push({
                id: workItemType.workItemTypeId,
                displayName: workItemType.displayName,
                level: workItemType.level,
                serviceLevelExpectationInDays:
                    workItemType.serviceLevelExpectationInDays,
            });
        }

        return workItemTypes;
    }

    async getWorkItemTypeMaps(orgId: string, datasourceId: string) {
        const workItemTypeMapModel = await WorkItemTypeMapModel();

        const workItemTypeMapsResult = await workItemTypeMapModel.findAll({
            where: {
                orgId, 
                datasourceId
            },
        });

        return workItemTypeMapsResult.map(m => m.toJSON());
    }
}

