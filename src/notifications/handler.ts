import { HandleEvent } from '../common/event_handler';
import {
    APIGatewayProxyEventV2,
    APIGatewayProxyResultV2,
    ScheduledEvent,
} from 'aws-lambda';
import { BaseHandler } from '../common/base_handler';
import { NotificationEvents } from './NotificationEvents';
import { asClass } from 'awilix';

class NotificationsHandler extends BaseHandler {
    private notificationEvents: NotificationEvents;

    constructor(event: APIGatewayProxyEventV2) {
        super(event, {
            notificationEvents: asClass(NotificationEvents),
        });

        this.notificationEvents = this.dependencyInjectionContainer.cradle.notificationEvents;
    }

    async getEverything(): Promise<APIGatewayProxyResultV2> {
        try {
            const notifications = await this.notificationEvents.getNotifications();

            return {
                statusCode: 200,
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(notifications),
            };
        } catch (err) {
            return {
                statusCode: 500,
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    error: `Could not retrieve notifications: ${typeof err === 'object' ? (err as any).message : 'No error'}`
                })
            }
        }
    }
}

export const getEverything = async (
    event: APIGatewayProxyEventV2 | ScheduledEvent,
) => {
    return HandleEvent(event, NotificationsHandler);
};
