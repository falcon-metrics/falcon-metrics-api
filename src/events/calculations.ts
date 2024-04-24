import { Logger } from 'log4js';
import { Sequelize } from 'sequelize';
import { IQueryFilters } from '../common/filters_v2';
import { SecurityContext } from '../common/security';
import { EventsDbAurora } from './events_db_aurora';
import { RawEvent } from './interfaces';

export class Calculations {
    readonly orgId?: string;
    readonly logger: Logger;
    readonly filters?: IQueryFilters;
    readonly eventsDbAurora: EventsDbAurora;
    readonly auroraWriter: any;

    constructor(opts: {
        auroraWriter: any;
        security: SecurityContext;
        logger: Logger;
        filters?: IQueryFilters;
        eventsDbAurora: EventsDbAurora;
    }) {
        this.auroraWriter = opts.auroraWriter;
        this.orgId = opts.security.organisation!;
        this.logger = opts.logger;
        this.filters = opts.filters;
        this.eventsDbAurora = opts.eventsDbAurora;
    }

    async getEvents(contextId: string): Promise<Array<RawEvent | unknown>> {
        const dateRange = await this.filters?.datePeriod();
        const aurora: Sequelize = await this.auroraWriter;
        return await this.eventsDbAurora.getAllEvents(
            this.orgId!,
            contextId,
            dateRange!,
            aurora,
        );
    }

    async createEvent(eventObject: RawEvent): Promise<RawEvent | unknown> {
        const aurora: Sequelize = await this.auroraWriter;
        try {
            const result = await this.eventsDbAurora.saveEvent(
                this.orgId!,
                eventObject,
                aurora,
            );
            return result;
        } catch (error) {
            const message =
                error instanceof Error && error?.message
                    ? error.message
                    : 'An error occured on create Event';
            console.debug('Error when create Event: ', message);
        }
    }

    async updateEvent(eventObject: RawEvent): Promise<RawEvent | unknown> {
        const aurora: Sequelize = await this.auroraWriter;
        try {
            return await this.eventsDbAurora.updateEvent(
                this.orgId!,
                eventObject,
                aurora,
            );
        } catch (error) {
            const message =
                error instanceof Error && error?.message
                    ? error.message
                    : 'An error occured on update';
            console.debug('Error when Update Event: ', message);
        }
    }

    async deleteEvent(eventId: string): Promise<void> {
        const aurora = await this.auroraWriter;
        try {
            // Delete the event
            await this.eventsDbAurora.delete(eventId, this.orgId!, aurora);
        } catch (error) {
            console.log('error calculations deleteEvent ==>', error);
            throw error;
        }
    }

    async getEvent(eventId: string): Promise<RawEvent | null> {
        const aurora: Sequelize = await this.auroraWriter;
        return await this.eventsDbAurora.getEvent(
            eventId,
            this.orgId!,
            aurora,
        );
    }
}
