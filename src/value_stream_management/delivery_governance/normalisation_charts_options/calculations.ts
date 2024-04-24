import { DateTime } from 'luxon';
import { Sequelize } from 'sequelize';
import {
    IQueryFilters,
} from '../../../common/filters_v2';
import { SecurityContext } from '../../../common/security';
import getNormalisationCategoryList from './utils';

export type ClassOfServiceWorkItem = {
    workItemId: string;
    dateTime: DateTime;
    dateTimeToExclude?: DateTime;
    normalizedDisplayName: string;
};
export class Calculations {
    private aurora: Promise<Sequelize>;
    private orgId: string;
    private filters: IQueryFilters;

    constructor(opts: {
        security: SecurityContext;
        aurora: Promise<Sequelize>;
        filters: IQueryFilters;
    }) {
        this.orgId = opts.security.organisation!;
        this.filters = opts.filters;
        this.aurora = opts.aurora;
    }

    async getNormalisationCategoryList() {
        const aurora = await this.aurora;
        if (!aurora || !await this.aurora) {
            throw new Error("No database connection");
        }

        const options: { id: string, displayName: string; }[] = await getNormalisationCategoryList(aurora, this.orgId);

        return options;
    }
}
