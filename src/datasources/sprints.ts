import { asClass } from "awilix";
import { APIGatewayProxyEventV2 } from "aws-lambda";
import { DateTime } from "luxon";
import { Sequelize } from "sequelize-typescript";
import { BaseHandler } from "../common/base_handler";
import { HandleEvent } from "../common/event_handler";
import { Sprint } from "../common/interfaces";
import { SecurityContext } from "../common/security";
import { SprintModel } from "../models/SprintModel";


class SprintQueries {
    private sequelize: Promise<Sequelize>;
    private orgId: string;

    constructor(opts: {
        security: SecurityContext;
        aurora: Promise<Sequelize>;
    }) {
        this.orgId = opts.security.organisation!;
        this.sequelize = opts.aurora;
    }

    async getSprints(): Promise<Sprint[]> {
        const sequelize = await this.sequelize;
        const model = SprintModel(sequelize, Sequelize);
        const sprintModels = await model.findAll({
            where: {
                orgId: this.orgId
            }
        });
        const sprints: Sprint[] = sprintModels.map((s: any) => ({
            id: s.id,
            datasourceId: s.datasourceId,
            orgId: s.orgId,
            sprintId: s.sprintId,
            name: s.name,
            flomatikaCreatedDate: DateTime.fromISO(s.flomatikaCreatedDate),
        }));
        return sprints;
    }

}

class SprintsHandler extends BaseHandler {
    private readonly sprints: SprintQueries;
    constructor(event: APIGatewayProxyEventV2) {
        super(event, {
            sprints: asClass(SprintQueries)
        });
        this.sprints = this.dependencyInjectionContainer.cradle.sprints;
    }

    async getEverything(event: APIGatewayProxyEventV2) {
        try {
            const sprints = await this.sprints.getSprints();
            return {
                statusCode: 200,
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ sprints })
            };
        } catch (e) {
            console.error('error in getEverything : ', e);
        }
    }
}

export const get = (event: APIGatewayProxyEventV2) => {
    return HandleEvent(event, SprintsHandler);
};