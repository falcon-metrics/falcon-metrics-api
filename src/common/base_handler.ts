import { asValue, AwilixContainer } from 'awilix';
import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { getDependencyInjectionContainer } from './dependency_injection';
import { SecurityContext } from './security';
import { Settings } from 'luxon';

export abstract class BaseHandler {
    protected dependencyInjectionContainer: AwilixContainer;

    protected security: SecurityContext;

    constructor(event: APIGatewayProxyEventV2, additionalDependencies: any) {
        this.dependencyInjectionContainer = getDependencyInjectionContainer(
            event,
        );

        this.dependencyInjectionContainer.register(additionalDependencies);

        this.security = this.dependencyInjectionContainer.cradle.security;

        // TODO eventually get rid of the whole org id and default value thing
        // should use security.organisation directly and set up all users with an org id
        const security = this.security;
        let orgId = 'org-1';

        if (security && security.organisation) {
            orgId = security.organisation;
        } else {
            security.organisation = orgId;
        }

        this.dependencyInjectionContainer.register({
            orgId: asValue(orgId),
        });

        // Avoid TZ weirdness by ensuring the server deals with dates in UTC
        // and let individual code specify other zones when required
        // This will only affect code using the Luxon library
        Settings.defaultZoneName = 'utc';
    }
}
