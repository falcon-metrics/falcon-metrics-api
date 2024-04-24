import { Sequelize, Transaction } from 'sequelize';

import { MetricsConfig } from '../models/MetricsConfig';
import { Op } from 'sequelize';
import { RawMetric, FilterWithId } from './interfaces';
import { getDeletedAtFilterCondition } from '../datasources/delete/delete_functions';
import FilterModel from '../models/FilterModel';
import { PredefinedFilterTags } from '../common/filters_v2';
import _ from 'lodash';

export class MetricsDbAurora {
    private aurora: Promise<Sequelize>;

    constructor(opt: { aurora: Promise<Sequelize>; }) {
        this.aurora = opt.aurora;
    }

    async getAllMetrics(orgId: string) {
        try {
            const aurora = await this.aurora;
            const model = MetricsConfig(aurora);
            const metricItems = await model.findOne({
                where: {
                    orgId,
                },
            });
            
            if (!metricItems) {
                return null;
            }
            
            let res = metricItems.dataValues;
            res.metrics = res.metrics && res.metrics.length !== 0 ? JSON.parse(res.metrics) : [];
            res.customViews = res.customViews && res.customViews.length !== 0 ? JSON.parse(res.customViews) : [];
            
            return res;
        } catch (error) {
            console.error("Error fetching metrics:", error);
        }
    }
    
    private extractNormalizationTags = (tags: string) => {
        const splittedTags = tags.split(', ');
        return splittedTags.filter(
            (t) => t !== PredefinedFilterTags.NORMALISATION,
        )[0];
    };

    async getFilters(
        columns: string[],
        orgId: string,
    ): Promise<Partial<FilterWithId>[]> {
        const filterModel = await FilterModel(await this.aurora);
        const result = await filterModel.findAll({
            attributes: columns,
            where: getDeletedAtFilterCondition({
                orgId,
                tags: {
                    [Op.like]: '%' + PredefinedFilterTags.NORMALISATION + '%',
                },
            }),
        });
        const formattedFilters: Partial<FilterWithId>[] = result.map(
            ({ displayName, tags, id }) => ({
                filter_displayName: displayName,
                filter_id: id,
                tag: this.extractNormalizationTags(tags),
            }),
        );
        return formattedFilters;
    }

    async saveMetric(
        orgId: string,
        metric: RawMetric,
        sequelize: Sequelize,
        transaction: Transaction,
    ): Promise<unknown> {
        const metrictData: RawMetric = {
            orgId,
            ...metric,
        };
        // console.log("🚀 ~ MetricsDbAurora ~ metrictData:", metrictData);
        const model = MetricsConfig(sequelize);
        return await model.upsert(metrictData, {
            conflictFields: ['orgId'],
            transaction,
        });
    }

    async delete(
        id: string,
        orgId: string,
        sequelize: Sequelize,
        transaction: Transaction,
    ): Promise<unknown> {
        const model = MetricsConfig(sequelize);
        return model.destroy({
            where: {
                orgId,
                id,
            },
            transaction,
        });
    }
}
