import { asClass, Lifetime } from 'awilix';
import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { BaseHandler } from '../common/base_handler';
import { IQueryFilters, QueryFilters } from '../common/filters_v2';
import { Calculations as EventsCalculations } from './calculations';
import { EventsDbAurora } from './events_db_aurora';
import { GetResponse } from './interfaces';
import RelationshipsDbAurora from '../relationships/relationships_db_aurora';

class Events extends BaseHandler {
    readonly eventsCalculations: EventsCalculations;
    readonly eventsDbAurora: EventsDbAurora;
    readonly orgId: string;
    readonly filters: IQueryFilters;
    private relationshipsDbAurora: RelationshipsDbAurora;

    constructor(event: APIGatewayProxyEventV2) {
        super(event, {
            eventsDbAurora: asClass(EventsDbAurora, {
                lifetime: Lifetime.SCOPED,
            }),
            eventsCalculations: asClass(EventsCalculations, {
                lifetime: Lifetime.SCOPED,
            }),
            filters: asClass(QueryFilters, {
                lifetime: Lifetime.SCOPED,
            }),
            relationshipsDbAurora: asClass(RelationshipsDbAurora, {
                lifetime: Lifetime.SCOPED
            })
        });
        this.eventsCalculations = this.dependencyInjectionContainer.cradle.eventsCalculations;
        this.eventsDbAurora = this.dependencyInjectionContainer.cradle.eventsDbAurora;
        this.orgId = this.dependencyInjectionContainer.cradle.security.organisation!;
        this.filters = this.dependencyInjectionContainer.cradle.filters;
        this.relationshipsDbAurora = this.dependencyInjectionContainer.cradle.relationshipsDbAurora;
    }

    async getAllEvents(
        event: APIGatewayProxyEventV2,
    ): Promise<GetResponse | { statusCode: number; body: string; }> {
        const contextId = event?.queryStringParameters?.contextId as
            | string
            | undefined;

        if (!contextId) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    error: { message: 'ContextId is required.' },
                }),
            };
        }
        try {
            /*
                Should list the events stored by the current org level
            */
            const events = await this.eventsCalculations.getEvents(contextId);
            await Promise.all(events.map(async (event: any) => {
                const relationshipCount = await this.relationshipsDbAurora.getRelationshipCount(event.id || '', 'event', this.orgId);
                event = event.dataValues;
                event.relationshipCount = relationshipCount;
            }));
            return {
                statusCode: 200,
                body: JSON.stringify({
                    events, // stored events
                }),
            };
        } catch (error) {
            console.error(
                JSON.stringify({
                    message: 'Error in events.getAllEvents',
                    orgId: this.orgId,
                    errorMessage: (error as Error).message,
                    errorStack: (error as Error).stack,
                }),
            );
            return {
                statusCode: 500,
                body: JSON.stringify(
                    error && (error as any).errors
                        ? (error as any).errors
                        : error instanceof Error
                            ? error.message
                            : 'Internal Server Error',
                ),
            };
        }
    }

    private parseBody(body: string) {
        const checkpointView = JSON.parse(body!);
        return checkpointView;
    }

    async postEvent({ body, requestContext }: APIGatewayProxyEventV2) {
        if (!(this.security.isAdminUser() || this.security.isPowerUser())) {
            return {
                statusCode: 403,
                body: JSON.stringify({ error: { message: 'Forbidden' } }),
            };
        }

        const event = this.parseBody(body!);
        delete event.id;

        if (!event.context_id) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    error: { message: 'Context Id field is required.' },
                }),
            };
        }
        if (!event.event_name) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    error: { message: 'Event name field is required.' },
                }),
            };
        }

        const userId = requestContext?.authorizer?.jwt.claims.sub;
        if (!userId) {
            return {
                statusCode: 422,
                body: JSON.stringify({
                    error: { message: 'invalid user id in events request' },
                }),
            };
        }

        const newEvent = {
            ...event,
            user_id: userId,
        };

        try {
            const result = await this.eventsCalculations.createEvent({
                ...newEvent,
            });
            return {
                statusCode: 200,
                body: JSON.stringify(result),
            };
        } catch (error) {
            console.error(
                JSON.stringify({
                    message: 'Error in postEvent',
                    orgId: this.orgId,
                    errorMessage: (error as Error).message,
                    errorStack: (error as Error).stack,
                }),
            );
            return {
                statusCode: 500,
                body: JSON.stringify(
                    error && (error as any).errors
                        ? (error as any).errors
                        : error instanceof Error
                            ? error.message
                            : 'Internal Server Error',
                ),
            };
        }
    }

    async removeEvent(event: APIGatewayProxyEventV2) {
        if (!(this.security.isAdminUser() || this.security.isPowerUser())) {
            return {
                statusCode: 403,
                body: JSON.stringify({ error: { message: 'Forbidden' } }),
            };
        }

        const eventId = event?.pathParameters?.id as string | undefined;

        if (!eventId) {
            return {
                statusCode: 422,
                body: JSON.stringify({
                    error: { message: 'event id is required' },
                }),
            };
        }

        try {
            await this.eventsCalculations.deleteEvent(eventId);
            await this.relationshipsDbAurora.removeRelationships(eventId, 'event', this.orgId);
            return {
                statusCode: 200,
            };
        } catch (error) {
            console.error(
                JSON.stringify({
                    message: 'Error in remove Event',
                    orgId: this.orgId,
                    errorMessage: (error as Error).message,
                    errorStack: (error as Error).stack,
                }),
            );
            return {
                statusCode: 500,
                body: {
                    statusCode: 500,
                    body: JSON.stringify({ message: 'Internal Server Error' }),
                },
            };
        }
    }

    async patchEvent({ body }: APIGatewayProxyEventV2) {
        if (!(this.security.isAdminUser() || this.security.isPowerUser())) {
            return {
                statusCode: 403,
                body: JSON.stringify({ error: { message: 'Forbidden' } }),
            };
        }

        const eventInfo = this.parseBody(body!);
        try {
            const events = await this.eventsCalculations.getEvents(
                eventInfo.context_id,
            );
            const eventItemWasFound = events.findIndex(
                (eventItem: any) =>
                    eventItem?.id.toString() === eventInfo?.id?.toString(),
            );
            if (eventItemWasFound > -1) {
                const result = await this.eventsCalculations.updateEvent(
                    eventInfo,
                );
                return {
                    statusCode: 200,
                    body: JSON.stringify(result),
                };
            } else {
                return {
                    statusCode: 404,
                    body: JSON.stringify({
                        message: 'Event with id not found.',
                    }),
                };
            }
        } catch (error) {
            console.error(
                JSON.stringify({
                    message: 'Error in patchEvent',
                    orgId: this.orgId,
                    errorMessage: (error as Error).message,
                    errorStack: (error as Error).stack,
                }),
            );
            return {
                statusCode: 500,
                body: JSON.stringify({ message: 'Internal Server Error' }),
            };
        }
    }

    async getEvent(
        event: APIGatewayProxyEventV2,
    ): Promise<GetResponse | { statusCode: number; body: string; }> {
        console.log(event);
        const eventId = event?.pathParameters?.eventId as
            | string
            | undefined;

        if (!eventId) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    error: { message: 'ContextId is required.' },
                }),
            };
        }
        try {
            /*
                Should list the events stored by the current org level
            */
            const event = await this.eventsCalculations.getEvent(eventId);
            return {
                statusCode: 200,
                body: JSON.stringify({
                    event, // stored events
                }),
            };
        } catch (error) {
            console.error(
                JSON.stringify({
                    message: 'Error in events.getAllEvents',
                    orgId: this.orgId,
                    errorMessage: (error as Error).message,
                    errorStack: (error as Error).stack,
                }),
            );
            return {
                statusCode: 500,
                body: JSON.stringify(
                    error && (error as any).errors
                        ? (error as any).errors
                        : error instanceof Error
                            ? error.message
                            : 'Internal Server Error',
                ),
            };
        }
    }
}

export const getAllEvents = async (event: APIGatewayProxyEventV2) => {
    return await new Events(event).getAllEvents(event);
};

export const postEvent = async (event: APIGatewayProxyEventV2) => {
    return await new Events(event).postEvent(event);
};

export const removeEvent = async (event: APIGatewayProxyEventV2) => {
    return await new Events(event).removeEvent(event);
};

export const patchEvent = async (event: APIGatewayProxyEventV2) => {
    return await new Events(event).patchEvent(event);
};

export const getEvent = async (event: APIGatewayProxyEventV2) => {
    return await new Events(event).getEvent(event);
};