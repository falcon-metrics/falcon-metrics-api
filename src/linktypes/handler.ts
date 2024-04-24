import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { BaseHandler } from '../common/base_handler';
import { asClass, Lifetime } from 'awilix';
import { LinkTypesService } from '../data_v2/link_types_service';
import { State } from '../workitem/state_aurora';

export class LinkTypeHandler extends BaseHandler {
    readonly linkTypesService: LinkTypesService;
    readonly orgId: string;

    constructor(event: APIGatewayProxyEventV2) {
        super(event, {
            state: asClass(State, { lifetime: Lifetime.SCOPED }),
            linkTypesService: asClass(LinkTypesService, {
                lifetime: Lifetime.SCOPED,
            }),
        });
        
        this.linkTypesService = this.dependencyInjectionContainer.cradle.linkTypesService;
        this.orgId = this.dependencyInjectionContainer.cradle.security.organisation!;
    }

    async getEverything(): Promise<APIGatewayProxyResultV2> {
        let linkTypes: string[] = [];

        try {
            linkTypes = await this.linkTypesService.getEverything();
        } catch (e) {
            return {
                statusCode: 500,
                body: JSON.stringify({ error: e.message }),
            };
        }

        return {
            statusCode: 200,
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(linkTypes),
        };
    }
}

export const getEverything = async (
    event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
    return await new LinkTypeHandler(event).getEverything();
};
