import pgp from 'pg-promise';
import {
    asCustomFieldItem,
    CustomFieldModel,
    CustomFieldItem,
} from '../models/CustomFieldModel';
import { Op, Sequelize, literal } from 'sequelize';
import { QueryFilters } from '../common/filters_v2';

type Everything = {
    customFields: Array<CustomFieldType>;
};

type CustomFieldType = {
    customFieldName: string;
    displayName: string;
    values: Array<string>;
};

export interface ICustomFieldsService {
    getEverything(orgId: string): Promise<Everything>;
    generateSubQueryFilters(
        orgId: string,
        model: any,
        customFields?: Map<string, string[]>,
    ): Promise<Array<{}>>;
}

export class CustomFieldsService implements ICustomFieldsService {
    private aurora: Promise<Sequelize>;

    constructor(opt: { aurora: Promise<Sequelize>; }) {
        this.aurora = opt.aurora;
    }

    async generateSubQueryFilters(
        orgId: string,
        model: any,
        customFields?: Map<string, string[]>,
    ): Promise<Array<{}>> {
        const customFieldSubQueries: Array<{}> = [];
        customFields?.forEach((values: string[], key: string) => {
            //if only empty field, not generate anything;
            const customFieldsCondition: any[] = [
                {
                    datasourceFieldName: { [Op.eq]: key },
                    datasourceFieldValue: {
                        [Op.in]: values.filter(
                            (v) => v !== QueryFilters.EMPTY_FIELD,
                        ),
                    },
                    orgId,
                },
            ];
            const hasEmptyField = values.filter(
                (v) => v === QueryFilters.EMPTY_FIELD,
            ).length;
            if (hasEmptyField) {
                /**
                 * Select all the work item ids that HAS the
                 * custom field;
                 * Exclude these work item ids by put in the NOT IN
                 */
                const notInSql = `SELECT "customFields"."workItemId"
                FROM "customFields"
                WHERE "customFields"."datasourceFieldName" ='${key}'
                AND "customFields"."orgId" = '${orgId}'`;
                const conditionForNotHavingTheField = {
                    workItemId: { [Op.notIn]: literal(`(${notInSql})`) }, //Should not have the field mapped in custom fields table
                    orgId,
                };
                customFieldsCondition.push(conditionForNotHavingTheField);
            }

            const where = {
                [Op.or]: customFieldsCondition,
            };

            //this generates:
            //("customFields"."datasourceFieldName" = :key AND "customFields"."datasourceFieldValue" in (:values)

            //get the work items that have the selected custom field values

            /*
                Returns a query for selecting elements in the table <tableName>.
                Options:
                - attributes -> An array of attributes (e.g. ['name', 'birthday']). Default: *
                - where -> A hash with conditions (e.g. {name: 'foo'})
                            OR an ID as integer
                - order -> e.g. 'id DESC'
                - group
                - limit -> The maximum count you want to get.
                - offset -> An offset value to start from. Only useable with limit!
            */
            const customFieldSql = model.queryInterface.queryGenerator
                .selectQuery('customFields', {
                    attributes: ['workItemId'],
                    where,
                })
                .slice(0, -1); // removes trailing ';'
            const conditions = [{ [Op.in]: literal(`(${customFieldSql})`) }];

            const queryForNullValue = `(SELECT s."workItemId" FROM (
                (
                    SELECT "workItemId" FROM "states"
                    WHERE "partitionKey" = 'state#${orgId}'
                ) as s
                left JOIN (
                    SELECT "datasourceFieldValue", "workItemId" 
                    FROM public."customFields" 
                    where "orgId" = '${orgId}' AND "datasourceFieldName" = '${key}'
                ) as c 
                on c."workItemId" = s."workItemId"
            ) where "datasourceFieldValue" is null
        )`;

            if (values.includes(QueryFilters.EMPTY_FIELD)) {
                conditions.push({ [Op.in]: literal(queryForNullValue) }); //for when custom field exist but value is empty
            }

            customFieldSubQueries.push({
                workItemId: {
                    [Op.or]: conditions,
                },
            });
        });

        return customFieldSubQueries;
    }

    /**
     * Generates SQL predicates for custom fields.
     * @param orgId Organization ID in the database
     * @param model Sequelize model with custom fields column.
     * @param customFields Specific custom fields to retrieve.
     */
    async generateSubQueryFiltersSQL(
        orgId: string,
        model: any,
        customFields?: Map<string, string[]>,
    ): Promise<string[]> {
        if (!customFields) {
            return [];
        }

        const format = pgp.as.format;

        const predicates: string[] = [];
        customFields.forEach((values: string[], key: string) => {
            const where = {
                [Op.or]: [
                    {
                        datasourceFieldName: { [Op.eq]: key },
                        datasourceFieldValue: {
                            [Op.in]: values.filter(
                                (v) => v !== QueryFilters.EMPTY_FIELD,
                            ),
                        },
                        orgId,
                    },
                ],
            };

            //this generates:
            //("customFields"."datasourceFieldName" = :key AND "customFields"."datasourceFieldValue" in (:values)

            //get the work items that have the selected custom field values

            /*
                Returns a query for selecting elements in the table <tableName>.
                Options:
                - attributes -> An array of attributes (e.g. ['name', 'birthday']). Default: *
                - where -> A hash with conditions (e.g. {name: 'foo'})
                            OR an ID as integer
                - order -> e.g. 'id DESC'
                - group
                - limit -> The maximum count you want to get.
                - offset -> An offset value to start from. Only useable with limit!
            */
            const customFieldSql = model.queryInterface.queryGenerator
                .selectQuery('customFields', {
                    attributes: ['workItemId'],
                    where,
                })
                .slice(0, -1); // removes trailing ';'

            const includesEmptyField: boolean = values.includes(
                QueryFilters.EMPTY_FIELD,
            );

            if (!includesEmptyField) {
                // Use just custom field condition
                const query = format(
                    '"states"."workItemId" IN ($<customFieldSql:raw>)',
                    {
                        customFieldSql,
                    },
                );
                predicates.push(query);
            } else {
                // Add additional condition to query

                //LEFT JOIN to get workItemIds for which no record with the chosen datasourceFieldName exists
                const nullValueFieldsSql = format(
                    `SELECT s."workItemId" FROM (
                        (
                            SELECT "workItemId" FROM "states"
                            WHERE "orgId" = $<orgId>
                        ) as s
                        left JOIN (
                            SELECT "datasourceFieldValue", "workItemId" 
                            FROM public."customFields" 
                            where "orgId" = $<orgId> AND "datasourceFieldName" = $<key>
                        ) as c 
                        on c."workItemId" = s."workItemId"
                    ) where "datasourceFieldValue" is null`,
                    {
                        orgId,
                        key,
                    },
                );
                const nullFieldSql = format(
                    `SELECT "customFields"."workItemId"
                    FROM "customFields"
                    WHERE "customFields"."datasourceFieldName" = $<key>
                    AND "customFields"."orgId" = $<orgId>`,
                    {
                        orgId,
                        key,
                    },
                );
                const query = format(
                    `
                    "workItemId" IN ($<customFieldSql:raw>)
                    OR "workItemId" IN ($<nullValueFieldsSql:raw>)
                    OR "workItemId" NOT IN ($<nullFieldSql:raw>)
                    `,
                    {
                        customFieldSql,
                        nullValueFieldsSql,
                        nullFieldSql,
                    },
                );

                predicates.push(query);
            }
        });

        return predicates;
    }

    async getEverything(orgId: string): Promise<Everything> {
        const aurora = await this.aurora;
        const model = CustomFieldModel(aurora);
        const customFieldsDb = await model.findAll({
            where: {
                orgId,
                // TODO: hidden and enabled are in the config object
                // enabled: true,
                // hidden: false
            },
            // Use grouping. We dont have to fetch all the rows, only the distinct rows
            attributes: ["datasourceFieldName", "displayName", "datasourceFieldValue"],
            group: ["datasourceFieldName", "datasourceFieldValue", "displayName"],
        });

        const customFields: Array<CustomFieldItem> = [];
        for (const customFieldDb of customFieldsDb) {
            const customFieldItem: CustomFieldItem = asCustomFieldItem(
                customFieldDb,
            );
            customFields.push(customFieldItem);
        }

        const everything: Array<CustomFieldType> = [];
        const uniqueCustomFields = [
            ...new Set(customFields.map((cf) => cf.datasourceFieldName)),
        ].sort((a, b) => a.localeCompare(b));
        for (const datasourceFieldName of uniqueCustomFields) {
            const customFieldInstances = customFields.filter(
                (cf) => cf.datasourceFieldName === datasourceFieldName,
            );

            const customFieldType: CustomFieldType = {
                customFieldName: datasourceFieldName,
                displayName: customFieldInstances[0].displayName,
                values: [
                    ...new Set(
                        customFieldInstances.map(
                            (cf) => cf.datasourceFieldValue,
                        ),
                    ),
                ].sort((a, b) => a.localeCompare(b)),
            };

            everything.push(customFieldType);
        }
        return { customFields: everything };

        /*
{
    "customFields": [
        {
            "customFieldName": "labels",
            "displayName": "Labels",
            "values": [
                "Security",
                "UX"
            ]
        },
        {
            "customFieldName": "priority",
            "displayName": "Priority",
            "values": [
                "Medium",
                "High"
            ]
        },
        {
            "customFieldName": "components",
            "displayName": "Components",
            "values": [
                "Front End",
                "Analytics Dashboard"
            ]
        }
    ]
}
*/
    }
}
