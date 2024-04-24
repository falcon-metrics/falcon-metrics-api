import { Logger } from 'log4js';
import { CustomDashboardDataModel } from '../models/CustomDashboard/CustomDashboardModel';

import { GroupUser as GroupUserModel } from '../models/GroupUser';
import { Op } from 'sequelize';

export default class CustomDashboardsDbAurora {
    private logger: Logger;
    private auroraWriter: any;

    constructor(opt: { logger: Logger; auroraWriter: any }) {
        this.logger = opt.logger;
        this.auroraWriter = opt.auroraWriter;
    }

    async getCustomDashboardData(
        userId: string,
        dashboardId?: string,
    ): Promise<any | null> {
        const aurora = await this.auroraWriter;
        const model = CustomDashboardDataModel(aurora);
    
        const userGroups = await this.getUserGroups(userId);
    
        const whereCondition: any = {
            [Op.or]: [
                { userId }, // Check if userId matches
                { userGroupId: userGroups.map(group => group.groupId) } // Check if userId is part of userGroup
            ]
        };
    
        if (dashboardId) {
            whereCondition.dashboardId = dashboardId;
        }
    
        const queryOptions: any = { where: whereCondition };
        if (!dashboardId) {
            queryOptions.order = [['dashboardTitle', 'ASC']];
        }
    
        const dashboardData = dashboardId
            ? await model.findOne(queryOptions)
            : await model.findAll(queryOptions);
    
        return dashboardData;
    }
    
    // Function to fetch user's groups
    async getUserGroups(userId: string): Promise<any[]> {
        const aurora = await this.auroraWriter;
        const groupUsers = GroupUserModel(aurora);
    
        const userGroups = await groupUsers.findAll({ where: { userId } });
        return userGroups;
    }
    
    async updateCustomDashboardData(
        userId: string,
        dashboardId: string,
        dashboardData: any,
    ): Promise<any[]> {
        const aurora = await this.auroraWriter;
        const model = CustomDashboardDataModel(aurora);
        const results = await model.update(dashboardData, {
            where: {
                userId,
                dashboardId,
            },
        });
        return results;
    }

    async saveCustomDashboardData(dashboardData: any): Promise<unknown> {
        const aurora = await this.auroraWriter;
        const model = CustomDashboardDataModel(aurora);
        const results = await model.create(dashboardData);
        return results;
    }
}
