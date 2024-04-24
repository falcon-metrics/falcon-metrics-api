import { APIGatewayProxyEventV2 } from "aws-lambda";
import { BaseHandler } from "../common/base_handler";
import PerspectivesDbAurora from "./perspectives_db_aurora";
import { asClass, Lifetime } from "awilix";
import { HandleEvent } from "../common/event_handler";
import { DateTime } from "luxon";

class BusinessScorecardPerspectivesHandler extends BaseHandler {

    readonly perspectivesDbAurora: PerspectivesDbAurora;
    readonly orgId: string;

    constructor(event: APIGatewayProxyEventV2) {
        super(event, {
            perspectivesDbAurora: asClass(PerspectivesDbAurora, {
                lifetime: Lifetime.SCOPED,
            }),
        });
        this.perspectivesDbAurora = this.dependencyInjectionContainer.cradle.perspectivesDbAurora;
        this.orgId = this.dependencyInjectionContainer.cradle.security.organisation!;

    }

    async getEverything(): Promise<
        { statusCode: number; body: string; }
    > {
        try {
            let perspectives = await this.perspectivesDbAurora.getAllPerspectives(this.orgId);
            perspectives = perspectives.map(perspective => {
                return {
                    id: perspective.perspective_id,
                    name: perspective.perspective_name
                };
            });
            return {
                statusCode: 200,
                body: JSON.stringify(
                    perspectives
                ),
            };
        } catch (error) {
            console.error(JSON.stringify({
                message: "Error in getPerspectives",
                orgId: this.orgId,
                errorMessage: (error as Error).message,
                errorStack: (error as Error).stack,
            }));
            return {
                statusCode: 500,
                body: JSON.stringify({ message: 'Internal Server Error' }),
            };
        }
    }

    async updatePerspectives({ body }: APIGatewayProxyEventV2) {
        try {
            const requestData = JSON.parse(body || '');
            let elementsToUpdate = [];
            if (requestData.updateElements) {
                elementsToUpdate = requestData.updateElements.map((i: any) => {
                    return {
                        perspective_id: i.id,
                        perspective_name: i.name,
                        org_id: this.orgId,
                        createdAt: ''
                    };
                });
            }
            if (requestData.addElements) {
                elementsToUpdate = elementsToUpdate.concat(requestData.addElements.map((i: any) => {
                    return {
                        perspective_id: i.id,
                        perspective_name: i.name,
                        org_id: this.orgId,
                        createdAt: DateTime.now().toSQL()
                    };
                }));
            }
            let updatedPerspectives;
            if (elementsToUpdate && elementsToUpdate.length > 0) {
                updatedPerspectives = await this.perspectivesDbAurora.updatePerspectives(elementsToUpdate);
            }
            if (requestData.deleteElements) {
                await this.perspectivesDbAurora.removePerspectives(requestData.deleteElements);
            }
            return {
                statusCode: 200,
                body: JSON.stringify({
                    updatedPerspectives
                }),
            };
        } catch (error) {
            console.error(JSON.stringify({
                message: "Error in updatePerspectives",
                orgId: this.orgId,
                errorMessage: (error as Error).message,
                errorStack: (error as Error).stack,
            }));
            return {
                statusCode: 500,
                body: JSON.stringify({ message: 'Internal Server Error' }),
            };
        }
    }
}

export const getEverything = async (event: APIGatewayProxyEventV2) => {
    return HandleEvent(event, BusinessScorecardPerspectivesHandler);
};

export const updatePerspectives = async (event: APIGatewayProxyEventV2) => {
    return await new BusinessScorecardPerspectivesHandler(event).updatePerspectives(event);
};
