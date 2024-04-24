import { Lifetime, asClass } from 'awilix';
import { APIGatewayProxyEventV2, ScheduledEvent } from 'aws-lambda';

import { BaseHandler } from '../../common/base_handler';
import { HandleEvent } from '../../common/event_handler';
import { CustomFieldConfigAttributes } from '../../models/CustomFieldConfigModel';
import { ObeyaRoom, ObeyaRoomsCalculations } from './calculations';
import { State } from '../../workitem/state_aurora';
import RelationshipsDbAurora from '../../relationships/relationships_db_aurora';
import { ObeyaCalculation } from '../calculations';
import { pushInitiativeToSQS } from '../../initiatives/handler';
import { SqsClient } from '../../utils/sqs_client';
import { INTERNAL_SERVER_ERROR_RESPONSE } from '../../utils/api';
import { Logger } from 'log4js';

type IEverything = {
    obeyaRooms?: ObeyaRoom[];
    customFieldsConfig: CustomFieldConfigAttributes[];
};


class ObeyaRoomsHandler extends BaseHandler {
    private obeyaRooms: ObeyaRoomsCalculations;
    private relationshipsDbAurora: RelationshipsDbAurora;
    readonly obeyaCalculation: ObeyaCalculation;
    private sqsClient: SqsClient;
    private logger: Logger;


    constructor(event: APIGatewayProxyEventV2) {
        super(event, {
            obeyaRooms: asClass(ObeyaRoomsCalculations),
            state: asClass(State, { lifetime: Lifetime.SCOPED }),
            relationshipsDbAurora: asClass(RelationshipsDbAurora, {
                lifetime: Lifetime.SCOPED,
            }),
            sqsClient: asClass(SqsClient),
            obeyaCalculation: asClass(ObeyaCalculation),
            obeyaRoomsCalculations: asClass(ObeyaRoomsCalculations),
        });
        this.obeyaRooms = this.dependencyInjectionContainer.cradle.obeyaRooms;
        this.relationshipsDbAurora = this.dependencyInjectionContainer.cradle.relationshipsDbAurora;
        this.obeyaCalculation = this.dependencyInjectionContainer.cradle.obeyaCalculation;
        this.sqsClient = this.dependencyInjectionContainer.cradle.sqsClient;
        this.logger = this.dependencyInjectionContainer.cradle.logger;
    }

    async getEverything() {
        /* allow any roles to access Governance Obeya
        if (!this.security.isGovernanceObeya()) {
            return {
                statusCode: 403,
                body: JSON.stringify({ error: { message: 'Forbidden' } }),
            };
        } */
        try {
            let obeyaRoomsResponse: IEverything = {
                obeyaRooms: [],
                customFieldsConfig: [],
            };

            obeyaRoomsResponse = await this.obeyaRooms.getObeyaRooms();
            if (obeyaRoomsResponse.obeyaRooms) {
                await Promise.all(
                    obeyaRoomsResponse.obeyaRooms.map(async (obeyaRoom) => {
                        const relationshipCount = await this.relationshipsDbAurora.getRelationshipCount(
                            obeyaRoom.roomId,
                            'obeyaRoom',
                            this.security.organisation!,
                        );
                        obeyaRoom.relationshipCount = relationshipCount;
                    }),
                );
            }

            return {
                statusCode: 200,
                body: JSON.stringify(obeyaRoomsResponse),
            };
        } catch (error) {
            const message = 'Error in getEverything';
            console.error(message, error);
            this.logger.error(JSON.stringify({
                message,
                errorMessage: (error as Error).message,
                errorStack: (error as Error).stack,
            }));
            return INTERNAL_SERVER_ERROR_RESPONSE;
        }
    }

    async saveObeyaRoom(event: APIGatewayProxyEventV2) {
        if (!this.security.isGovernanceObeyaAdmin()) {
            return {
                statusCode: 403,
                body: JSON.stringify({ error: { message: 'Forbidden' } }),
            };
        }

        const body: any = event.body || {};
        try {
            const payload = JSON.parse(body);
            const response: ObeyaRoom = await this.obeyaRooms.createObeyaRoom(payload);
            await pushInitiativeToSQS(this.sqsClient, {
                initiativeId: response.roomId,
                orgId: response.orgId!
            });
            return {
                statusCode: 201,
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(response),
            };
        } catch (error) {
            const message = 'Error in saveObeyaRoom';
            console.error(message, error);
            this.logger.error(JSON.stringify({
                message,
                errorMessage: (error as Error).message,
                errorStack: (error as Error).stack,
            }));
            return INTERNAL_SERVER_ERROR_RESPONSE;
        }
    }

    async editObeyaRoom(event: APIGatewayProxyEventV2) {
        if (!this.security.isGovernanceObeyaAdmin()) {
            return {
                statusCode: 403,
                body: JSON.stringify({ error: { message: 'Forbidden' } }),
            };
        }

        const body: any = event.body || {};
        try {
            const payload = JSON.parse(body);
            const response = await this.obeyaRooms.updateObeyaRoom(payload);
            const promises = response.map(or => pushInitiativeToSQS(this.sqsClient, {
                initiativeId: or.roomId,
                orgId: or.orgId!
            }));
            await Promise.all(promises);
            return {
                statusCode: 201,
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(response),
            };
        } catch (error) {
            const message = 'Error in editObeyaRoom';
            console.error(message, error);
            this.logger.error(JSON.stringify({
                message,
                errorMessage: (error as Error).message,
                errorStack: (error as Error).stack,
            }));
            return INTERNAL_SERVER_ERROR_RESPONSE;
        }
    }

    async editRoadmap(event: APIGatewayProxyEventV2) {
        if (!this.security.isGovernanceObeyaAdmin()) {
            return {
                statusCode: 403,
                body: JSON.stringify({ error: { message: 'Forbidden' } }),
            };
        }

        const body: any = event.body || {};
        try {
            const payload = JSON.parse(body);
            const response = await this.obeyaRooms.updatePortfolioRoadmap(
                payload,
            );
            return {
                statusCode: 201,
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(response),
            };
        } catch (error) {
            const message = 'Error in editRoadmap';
            console.error(message, error);
            this.logger.error(JSON.stringify({
                message,
                errorMessage: (error as Error).message,
                errorStack: (error as Error).stack,
            }));
            return INTERNAL_SERVER_ERROR_RESPONSE;
        }
    }

    async editObeyaRoadmap(event: APIGatewayProxyEventV2) {
        if (!this.security.isGovernanceObeyaAdmin()) {
            return {
                statusCode: 403,
                body: JSON.stringify({ error: { message: 'Forbidden' } }),
            };
        }

        const body: any = event.body || {};
        try {
            const payload = JSON.parse(body);
            const response = await this.obeyaRooms.updateObeyaRoadmap(payload);
            return {
                statusCode: 201,
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(response),
            };
        } catch (error) {
            const message = 'Error in editObeyaRoadmap';
            console.error(message, error);
            this.logger.error(JSON.stringify({
                message,
                errorMessage: (error as Error).message,
                errorStack: (error as Error).stack,
            }));
            return INTERNAL_SERVER_ERROR_RESPONSE;
        }
    }

    async deleteObeyaRoom(event: APIGatewayProxyEventV2) {
        if (!this.security.isGovernanceObeyaAdmin()) {
            return {
                statusCode: 403,
                body: JSON.stringify({ error: { message: 'Forbidden' } }),
            };
        }

        const body: any = event.body || {};
        try {
            const { obeyaRoomId } = JSON.parse(body);
            if (!obeyaRoomId) {
                return {
                    statusCode: 422,
                    body: JSON.stringify({
                        error: { message: 'Obeya Room Id is required' },
                    }),
                };
            }
            await this.obeyaRooms.removeObeyaRoom(obeyaRoomId);
            const relationshipCount = await this.relationshipsDbAurora.removeRelationships(
                obeyaRoomId || '',
                'obeyaRoom',
                this.security.organisation!,
            );

            return {
                statusCode: 204,
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify('Deleted Successfully'),
            };
        } catch (error) {
            const message = 'Error in deleteObeyaRoom';
            console.error(message, error);
            this.logger.error(JSON.stringify({
                message,
                errorMessage: (error as Error).message,
                errorStack: (error as Error).stack,
            }));
            return INTERNAL_SERVER_ERROR_RESPONSE;
        }
    }
}

export const getEverything = async (
    event: APIGatewayProxyEventV2 | ScheduledEvent,
) => {
    return HandleEvent(event, ObeyaRoomsHandler);
};

export const deleteObeyaRoom = async (event: APIGatewayProxyEventV2) => {
    return await new ObeyaRoomsHandler(event).deleteObeyaRoom(event);
};

export const saveObeyaRoom = async (event: APIGatewayProxyEventV2) => {
    return await new ObeyaRoomsHandler(event).saveObeyaRoom(event);
};

export const editObeyaRoom = async (event: APIGatewayProxyEventV2) => {
    return await new ObeyaRoomsHandler(event).editObeyaRoom(event);
};

export const editRoadmap = async (event: APIGatewayProxyEventV2) => {
    return await new ObeyaRoomsHandler(event).editRoadmap(event);
};

export const editObeyaRoadmap = async (event: APIGatewayProxyEventV2) => {
    return await new ObeyaRoomsHandler(event).editObeyaRoadmap(event);
};
