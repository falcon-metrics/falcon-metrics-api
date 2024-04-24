import {
    createContainer,
    asValue,
    asClass,
    AwilixContainer,
    asFunction,
    Lifetime,
} from 'awilix';
import { getLogger } from 'log4js';
import { QueryFilters } from './filters_v2';
import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { ContextFilter } from '../context/context_filter';
import { SecurityContext } from './security';
import { WorkItemType } from '../data_v2/work_item_type_aurora';
import { ClassOfService } from '../data_v2/class_of_service';
import { CustomFieldsService } from '../data_v2/custom_fields_service';
import { ValueArea } from '../data_v2/value_area';
import { NatureOfWork } from '../data_v2/nature_of_work';
import { Context } from '../context/context_db_aurora';
import { ContextQueries } from '../context/context_queries';
import { AuroraSecret } from '../secrets/aurora_secret';
import { database } from '../models/sequelize';
import { HubspotSecret } from '../hubspot/HubspotSecret';
import { Hubspot } from '../hubspot/Hubspot';
import { NotificationEvents } from '../notifications/NotificationEvents';
import { WorkItemQueries } from '../workitem/workitem_queries';
import { UserDBOp } from '../database_operations/user_db_op';
import { Normalization } from '../normalization/Normalization';
import { OrganizationSettings } from '../organization-settings/handleSettings';
import { InsightsPatternMatcher } from '../value_stream_management/continuous_improvements/actionable_insights/pattern_matcher';
import { LinkTypesService } from '../data_v2/link_types_service';
import { createRedisClient } from './redis';
import { Secrets } from '../secrets/secretsmanager_client';
import { Project } from '../data_v2/project';

const LOCALHOST_REDIS_HOSTNAME = 'localhost';
const LOCALHOST_REDIS_PASS = 'password';
const DISABLE_REDIS_CACHE = true;

export const getDependencyInjectionContainer = (
    event: APIGatewayProxyEventV2,
) => {
    const container = createContainer();

    container.register({
        queryParameters: asValue(event.queryStringParameters),
        filters: asClass(QueryFilters),
    });

    injectSecurityObject(container, event);

    container.register({
        orgSetting: asClass(OrganizationSettings, {
            lifetime: Lifetime.SCOPED,
        }),
        contextFilter: asClass(ContextFilter, { lifetime: Lifetime.SCOPED }),
        workItemType: asClass(WorkItemType, { lifetime: Lifetime.SCOPED }),
        project: asClass(Project, { lifetime: Lifetime.SCOPED }),
        classOfService: asClass(ClassOfService, { lifetime: Lifetime.SCOPED }),
        customFieldsService: asClass(CustomFieldsService, {
            lifetime: Lifetime.SCOPED,
        }),
        linkTypes: asClass(LinkTypesService, { lifetime: Lifetime.SCOPED }),

        normalizationService: asClass(Normalization, {
            lifetime: Lifetime.SCOPED,
        }),
        valueArea: asClass(ValueArea, { lifetime: Lifetime.SCOPED }),
        natureOfWork: asClass(NatureOfWork, { lifetime: Lifetime.SCOPED }),
        context: asClass(Context, { lifetime: Lifetime.SCOPED }),
        contextQueries: asClass(ContextQueries, { lifetime: Lifetime.SCOPED }),
        auroraSecret: asClass(AuroraSecret, { lifetime: Lifetime.SCOPED }),
        hubspotSecret: asClass(HubspotSecret, { lifetime: Lifetime.SCOPED }),
        hubspot: asClass(Hubspot, { lifetime: Lifetime.SCOPED }),
        notificationEvents: asClass(NotificationEvents, {
            lifetime: Lifetime.SCOPED,
        }),
        workItemQueries: asClass(WorkItemQueries, {
            lifetime: Lifetime.SCOPED,
        }),
        userDBOp: asClass(UserDBOp, { lifetime: Lifetime.SCOPED }),
        insightsPatterns: asClass(InsightsPatternMatcher, { lifetime: Lifetime.SCOPED }),
    });

    const logger = getLogger();
    logger.level = process.env.LOG_LEVEL
        ? process.env.LOG_LEVEL
        : 'error';

    container.register({ logger: asValue(logger) });

    const aurora = async ({ auroraSecret }: any) => {
        const auroraHost = await auroraSecret.getReaderHost();
        const auroraPassword = await auroraSecret.getPassword();
        const aurora = database(auroraHost, auroraPassword);
        return aurora;
    };

    const auroraWriter = async ({ auroraSecret }: any) => {
        const auroraHost = await auroraSecret.getWriterHost();
        const auroraPassword = await auroraSecret.getPassword();
        const aurora = database(auroraHost, auroraPassword);
        return aurora;
    };

    const getRedisClients = async () => {
        if (DISABLE_REDIS_CACHE) {
            return undefined;
        }
        const secrets = new Secrets({ logger });
        let hostname, password;
        const ifOffine = process.env.IS_OFFLINE;
        if (ifOffine) {
            hostname = LOCALHOST_REDIS_HOSTNAME;
            password = LOCALHOST_REDIS_PASS;
        } else {
            hostname = await secrets.getRawSecret('REDIS_URL');
            password = await secrets.getRawSecret('REDIS_DEFAULT_USER_AUTH_PASSWORD');
        }
        return createRedisClient(hostname, password);
    };

    container.register({
        //this is injected into the constructor
        //as a promise and needs to be awaited when used in a method
        aurora: asFunction(aurora, { lifetime: Lifetime.SCOPED }),
        auroraWriter: asFunction(auroraWriter, { lifetime: Lifetime.SCOPED }),
        redisClient: asFunction(getRedisClients, { lifetime: Lifetime.SCOPED }),
    });
    return container;
};

const injectSecurityObject = (
    container: AwilixContainer,
    event: any,
) => {
    const { requestContext } = event;
    const security = new SecurityContext();
    if (!requestContext || !requestContext.authorizer) {
        const orgId = event.orgId;
        security.organisation = orgId;
        security.businessUnitId = '';
        security.roles = [];
        security.allowedContextIds = [];
        security.contextAccessControlEnabled = false;
        container.register({ security: asValue(security) });

    } else {
        const claims = requestContext.authorizer
            ? requestContext.authorizer.jwt
                ? // Lambda Event payload 2.0
                requestContext.authorizer.jwt.claims
                : // Lambda Event payload 1.0
                requestContext.authorizer.claims
            : {};

        security.organisation =
            (claims && claims['https://falcon-metrics.com/user_organisation']) || '';
        security.businessUnitId =
            (claims && claims['https://falcon-metrics.com/user_business_unit']) || '';
        security.roles =
            claims && claims['https://falcon-metrics.com/roles']
                ? JSON.parse(claims['https://falcon-metrics.com/roles'])
                : [];
        security.allowedContextIds =
            claims && claims['https://falcon-metrics.com/user_context_levels']
                ? JSON.parse(claims['https://falcon-metrics.com/user_context_levels'])
                : [];
        security.contextAccessControlEnabled =
            claims && claims['https://falcon-metrics.com/context_access_control_enabled']
                ? claims['https://falcon-metrics.com/context_access_control_enabled']
                : false;

        security.email = claims?.email;
        security.userId = claims?.sub;

        container.register({ security: asValue(security) });
    }
};
