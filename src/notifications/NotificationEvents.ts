import { QueryTypes, Sequelize } from 'sequelize';
import { DateTime } from 'luxon';
import { SecurityContext } from '../common/security';
import { IQueryFilters } from '../common/filters_v2';

export class NotificationEvents {
    private orgId: string;
    private aurora: Promise<Sequelize>;
    private filters?: IQueryFilters;

    constructor(opts: {
        security: SecurityContext;
        aurora: Promise<Sequelize>;
        filters?: IQueryFilters;
    }) {
        this.orgId = opts.security.organisation ?? '';
        this.aurora = opts.aurora;
        this.filters = opts.filters;
    }

    async getNotifications(): Promise<{message: string}[]> {
        const db = await this.aurora;
        const datasources = await db.query(
            'select * from datasources where "orgId" = :orgId',
            {
                replacements: {
                    orgId: this.orgId,
                },
                type: QueryTypes.SELECT,
            },
        );

        const notifications: {message: string}[] = [];

        datasources.forEach((datasource: any) => {
            if (datasource.nextRunStartFrom) {
                const dataLoadedUntil = DateTime.fromJSDate(datasource.nextRunStartFrom)
                    .setLocale(this.filters?.clientLanguage!)
                    .setZone(this.filters?.clientTimezone!)
                    .toLocaleString(DateTime.DATETIME_MED);

                notifications.push({
                    message: `${decodeURIComponent(datasource.serviceUrl)} loaded until ${dataLoadedUntil}`,
                });
            } else {
                notifications.push({
                    message: `${decodeURIComponent(datasource.serviceUrl)} not started yet`,
                });
            }
        });

        return notifications;
    }
}
