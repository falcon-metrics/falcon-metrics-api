import { asClass, Lifetime } from "awilix";
import { APIGatewayProxyEventV2, ScheduledEvent } from "aws-lambda";
import { SeedDataCreator } from ".";
import { BaseHandler } from "../common/base_handler";
import { HandleEvent } from "../common/event_handler";
import { Context } from "../context/context_db_aurora";


class CreateSeedDataHandler extends BaseHandler {
    readonly seedDataCreator: SeedDataCreator;

    constructor(event: APIGatewayProxyEventV2) {
        super(event, {
            context: asClass(Context, {
                lifetime: Lifetime.SCOPED,
            }),
            seedDataCreator: asClass(SeedDataCreator, {
                lifetime: Lifetime.SCOPED,
            })
        });
        this.seedDataCreator = this.dependencyInjectionContainer.cradle.seedDataCreator;
    }

    async getEverything(event: APIGatewayProxyEventV2) {
        try {
            await this.seedDataCreator.createSeedData();

            return {
                statusCode: 200,
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({}),
            };
        } catch (error) {
            const parsedError: Error = error instanceof Error
                ? error
                : new Error(
                    `Unexpected error object of type "${typeof error}"`,
                );
            console.log('create-seed-data handler error');
            console.log(parsedError);
            return {
                statusCode: 500,
                body: JSON.stringify({ error: parsedError.message }),
            };
        }
    }
}

export const getEverything = async (
    event: APIGatewayProxyEventV2 | ScheduledEvent,
): Promise<any> => {
    return HandleEvent(event, CreateSeedDataHandler);
};