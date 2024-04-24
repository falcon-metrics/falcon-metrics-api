import { Sequelize, Model } from 'sequelize';
import { Events } from '../models/Events';
import { Op } from 'sequelize';
import { RawEvent } from './interfaces';
import { Interval } from 'luxon';

export class EventsDbAurora {
    private aurora: Promise<Sequelize>;

    constructor(opt: { aurora: Promise<Sequelize>; }) {
        this.aurora = opt.aurora;
    }

    datePredicates(dateRange: Interval, sequelize: Sequelize) {
        const from = dateRange.start.toISO();
        const to = dateRange.end.toISO();
        return {
            [Op.gte]: sequelize.fn('DATE', from),
            [Op.lte]: sequelize.fn('DATE', to),
        };
    }

    async getAllEvents(
        orgId: string,
        contextId: string,
        dateRange: Interval,
        sequelize: Sequelize,
    ): Promise<Model<RawEvent>[]> {
        const datePredicate = this.datePredicates(dateRange!, sequelize);
        const model = Events(sequelize);
        const eventsItems: Model<RawEvent>[] = await model.findAll({
            where: {
                orgId,
                context_id: contextId,
                efective_date: datePredicate,
            },
        });
        return eventsItems;
    }

    async updateEvent(
        orgId: string,
        eventObject: RawEvent,
        sequelize: Sequelize,
    ): Promise<unknown> {
        const { id, ...rawObject } = eventObject;
        const model = Events(sequelize);
        return model.update(rawObject, {
            where: {
                orgId,
                user_id: eventObject.user_id,
                id,
            } as any,
        } as any);
    }

    async saveEvent(
        orgId: string,
        rawEvent: RawEvent,
        sequelize: Sequelize,
    ): Promise<unknown> {
        const eventData: RawEvent = {
            orgId,
            ...rawEvent,
        };
        const model = Events(sequelize);
        return await model.upsert(eventData, {
            conflictFields: ['id'],
        });
    }

    async delete(
        id: string,
        orgId: string,
        sequelize: Sequelize,
    ): Promise<unknown> {
        const model = Events(sequelize);
        return model.destroy({
            where: {
                orgId,
                id,
            },
        });
    }

    async getEvent(eventId: string, orgId: string, sequelize: Sequelize): Promise<RawEvent | null> {
        if (!isNaN(parseInt(eventId))) {
            const model = Events(sequelize);
            const event: RawEvent | null = await model.findOne({
                where: {
                    orgId,
                    id: parseInt(eventId),
                },
                raw: true,
                logging: console.log
            }) as any;
            return event;
        }
        return null;
    }
}
