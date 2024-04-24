import { asClass } from 'awilix';
import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { BaseHandler } from '../common/base_handler';
import { ClassOfService } from '../data_v2/class_of_service';

export class ClassOfServiceHandler extends BaseHandler {
    private classOfService: ClassOfService;

    constructor(event: APIGatewayProxyEventV2) {
        super(event, { classOfService: asClass(ClassOfService) });

        this.classOfService = this.dependencyInjectionContainer.cradle.classOfService;
    }

    async getClassesOfService() {
        let response;

        try {
            response = (
                await this.classOfService.getEverything(
                    this.security.organisation!,
                )
            ).map((classOfService) => ({
                id: classOfService.id,
                name: classOfService.displayName,
            }));
        } catch (e) {
            console.error('Failed: ' + e.message + '\n' + e.stack);
            return {
                statusCode: 400,
                body: JSON.stringify({ error: e.message }),
            };
        }

        return {
            statusCode: 200,
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(response),
        };
    }
}

export const getClassesOfService = async (event: APIGatewayProxyEventV2) => {
    return await new ClassOfServiceHandler(event).getClassesOfService();
};
