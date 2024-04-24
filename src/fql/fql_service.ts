import * as esprima from 'esprima';
import { getLogger } from 'log4js';
import {
    CustomFieldConfigs,
    ICustomFieldConfigs,
} from '../data_v2/custom_fields_config';
import connection from '../models/sequelize';
import { FQLError } from './fql_error';
import { getStateModelDefinition } from '../models/StateModel';
import escape from 'pg-escape';
import { CustomFieldConfigAttributes } from '../models/CustomFieldConfigModel';
import { DataTypes } from 'sequelize';

/**
 * Use this value as the default(fallback) value if the value in NULL
 * This works for both strings and JSON. But it won't work for numbers and bool
 */
export const DEFAULT_JSON_VALUE_IF_NULL = '{"flomatika_null": "flomatika_null"}';
export const DEFAULT_STRING_VALUE_IF_NULL = 'FLOMATIKA_NULL';
export interface IFQLService {
    convertFQLToJS(fql: string): Promise<string>;
    convertJStoSQL(
        orgId: string,
        datasourceId: string,
        js: string,
    ): Promise<string>;
    convertFQLToSQL(
        orgId: string,
        datasourceId: string,
        fql: string,
    ): Promise<string>;
}
// https://regexr.com/
export class FQLService implements IFQLService {
    // private logger: Logger;
    private customFieldConfigs: ICustomFieldConfigs;
    private stateModelDefinition: any;

    constructor(opts: {
        // logger: Logger,
        customFieldConfigs: ICustomFieldConfigs;
        stateModelDefinition: any;
    }) {
        // this.logger = opts.logger;
        this.customFieldConfigs = opts.customFieldConfigs;
        this.stateModelDefinition = opts.stateModelDefinition;
    }

    readonly JS_AND: string = '&&';
    readonly JS_OR: string = '\\|\\|';
    readonly JS_EQUALS: string = '==';
    readonly JS_NOT_EQUALS: string = '!==';

    readonly FQL_AND: string = 'AND';
    readonly FQL_OR: string = 'OR';
    readonly FQL_EQUALS: string = '=';
    readonly FQL_NOT_EQUALS: string = '!=';
    readonly FQL_EMPTY: string = 'empty';

    readonly FQL_OPERATORS: Array<string> = [
        this.FQL_AND,
        this.FQL_OR,
        this.FQL_EQUALS,
        this.FQL_NOT_EQUALS,
        this.FQL_EMPTY,
    ];

    readonly SQL_AND: string = 'AND';
    readonly SQL_OR: string = 'OR';
    readonly SQL_EQUALS: string = '=';
    readonly SQL_NOT_EQUALS: string = '!=';
    readonly SQL_EMPTY: string = 'null';

    readonly FQL_TO_JS: Map<string, string> = new Map([
        [this.FQL_AND, '&&'],
        [this.FQL_OR, '||'],
        [this.FQL_EQUALS, '==='],
        [this.FQL_NOT_EQUALS, '!=='],
        [this.FQL_EMPTY, this.SQL_EMPTY],
    ]);

    readonly FIELD_REPLACEMENTS: Map<string, string> = new Map([
        ['workItemType', 'flomatikaWorkItemTypeName'],
        ['SLE', 'flomatikaWorkItemTypeServiceLevelExpectationInDays'],
        ['workItemLevel', 'flomatikaWorkItemTypeLevel'],
    ]);

    readonly BLACKLIST: Array<string> = [
        '--',
        ';',
        'SELECT',
        'DROP',
        'DELETE',
        'UNION',
        'TO_XML',
        'DUMP',
    ];

    /**
     * Accepts the list of tokens from the JS expression and returns the a list of pairs
     * Each pair contains the string to replace and the replacement string
     * @param tokens
     * @returns
     */
    convertContainsTokensToSQL(tokens: esprima.Token[]) {
        /**
         * Convert the list of tokens
         * from the JS columnName.includes('someString')
         * to an SQL predicate columnName like "someString"
         * @param slice List of tokens
         * @returns
         */
        const sliceToSQL = (slice: esprima.Token[], isNegation: boolean) => {
            // FQL columnName like 'includeStr'
            // After FQL to JS : columnName.includes('includeStr')
            const colName = slice[0].value;

            // Remove single quotes
            const includesStr = slice[4].value
                .replace(/^'/, '')
                .replace(/'$/, '');

            // Comparator. Use not like if the expression is negated
            let cmp = 'like';
            if (isNegation) {
                cmp = 'not like';
            }

            // Build the string of the SQL predicate
            return `${colName} ${cmp} '%${includesStr.toLowerCase()}%'`;
        };

        /**
         * Build the JS string from the list of tokens. Concat the values of the tokens
         * */
        const sliceToStr = (slices: esprima.Token[]) => {
            let str = '';
            slices.forEach(s => str = str + s.value);
            str = str.replace(/===false$/, ' === false');
            return str;
        };

        /**
         * From the tokens from the whole JS expression,
         * get slices of tokens for all occurances of
         * this expression: `columnName.includes('someString')`
         *
         *
         * This function returns a list of pairs. The slice of tokens,
         * and the corresponding JS string for those tokens
         * @param allTokens
         * @returns
         */
        const getContainsSlices = (allTokens: esprima.Token[]) => {
            const containsStartIndices = allTokens
                .map((token, index) => ({ token, index }))
                .filter(({ token }) => token.type === 'Identifier' && token.value === 'includes')
                .map(({ index }) => index);

            return containsStartIndices.map(i => {
                let containsSlice = [];

                // Check for === false at the end

                // { type: 'Identifier', value: 'state' },    -2
                // { type: 'Punctuator', value: '.' },        -1
                // { type: 'Identifier', value: 'includes' },  0
                // { type: 'Punctuator', value: '(' },         1
                // { type: 'String', value: "'Completed'" },   2
                // { type: 'Punctuator', value: ')' },         3
                // { type: 'Punctuator', value: '===' },       4
                // { type: 'Boolean', value: 'false' }         5

                const DISTANCE_TO_OPERAND = -2;
                const DISTANCE_TO_EQ = 4;
                const DISTANCE_TO_BRACE = 3;
                const DISTANCE_TO_FALSE = 5;
                const isNegation = (
                    allTokens[i + DISTANCE_TO_EQ]?.value === '===' &&
                    allTokens[i + DISTANCE_TO_FALSE]?.value === 'false'
                );

                const startIndex = i + DISTANCE_TO_OPERAND;
                let endIndex = i + DISTANCE_TO_BRACE;
                if (isNegation) {
                    endIndex = i + DISTANCE_TO_FALSE;
                }

                // Add 1 to endIndex becuase the slice function does not include the element at the end index
                containsSlice = allTokens.slice(startIndex, endIndex + 1);
                const stringToReplace = sliceToStr(containsSlice);

                return { containsSlice, stringToReplace, isNegation };
            });
        };

        const pairs = getContainsSlices(tokens);
        return pairs.map(pair => (
            {
                stringToReplace: pair.stringToReplace,
                // Convert the slice of tokens to SQL predicate
                replacementString: sliceToSQL(pair.containsSlice, pair.isNegation)
            }
        ));
    }

    async convertFQLToSQL(
        orgId: string,
        datasourceId: string,
        fql: string,
    ): Promise<string> {
        try {
            this.failIfLooksLikeSqlInjection(fql);

            this.FIELD_REPLACEMENTS.forEach((newFieldName, oldFieldName) => {
                const regExp = new RegExp(`\\b${oldFieldName}\\b`, 'gi');
                fql = fql.replace(regExp, newFieldName);
            });

            const js = await this.convertFQLToJS(fql);

            const sql = await this.convertJStoSQL(orgId, datasourceId, js);
            return sql;
        } catch (e) {
            throw new FQLError('Invalid FQL syntax');
        }
    }

    private failIfLooksLikeSqlInjection(fql: string) {
        if (!fql || !fql.length) {
            return;
        }

        const fqlUpper = fql.toUpperCase();

        if (this.BLACKLIST.some((value) => fqlUpper.includes(value))) {
            throw new FQLError('Invalid FQL');
        }
    }

    private escapeReservedSymbols(value: string): string {
        return value.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, '\\$&');
    }

    private escapeIdentifier(identifier: string): string {

        //don't escape these special identifiers because they're not identifiers
        switch (identifier) {
            case "not":
            case "NOT":
            case "empty":
            case "EMPTY":
            case "is":
            case "IS":
                return identifier;
        }

        let value = escape.ident(identifier);

        if (!value.startsWith('"')) {
            value = `"${value}"`;
        }

        return value;
    }

    async convertJStoSQL(
        orgId: string,
        datasourceId: string,
        js: string,
    ): Promise<string> {
        const customFields = await this.customFieldConfigs.getCustomFieldConfigs(
            orgId,
            datasourceId,
        );

        const customFieldMap: Map<
            string,
            CustomFieldConfigAttributes
        > = customFields.reduce(
            (
                map: Map<string, CustomFieldConfigAttributes>,
                cf: CustomFieldConfigAttributes,
            ) => {
                map.set(cf.datasourceFieldName, cf);
                return map;
            },
            new Map<string, CustomFieldConfigAttributes>(),
        );

        const tokens = esprima.tokenize(js);




        const stateFieldReplacements: Map<string, string> = new Map();

        tokens
            .filter(
                (t) => t.type === 'Identifier' && !customFieldMap.has(t.value)
            )
            .forEach((t) => {
                let value = this.escapeIdentifier(t.value);

                if (this.stateModelDefinition[t.value] === DataTypes.STRING ||
                    this.stateModelDefinition[t.value]?.type === DataTypes.STRING) {
                    value = `LOWER(${value})`;

                    // Use COALESCE to handle null values
                    if (this.stateModelDefinition[t.value].allowNull === true) {
                        value = `coalesce(${value}, '${DEFAULT_STRING_VALUE_IF_NULL}')`;
                    }
                }

                stateFieldReplacements.set(t.value, value);
            });

        //custom fields are store in a jsonb column
        const customFieldReplacements: Map<string, string> = new Map();
        tokens
            .filter(
                (t) => t.type === 'Identifier' && customFieldMap.has(t.value),
            )
            .forEach((t) => {
                //append @> here, remove next = later
                customFieldReplacements.set(
                    t.value,
                    `${this.escapeIdentifier(t.value)} @> `,
                );
            });

        const stringReplacements: Map<string, string> = new Map();
        tokens
            .filter((t) => t.type === 'String')
            .forEach((t) => {
                stringReplacements.set(t.value, `${t.value.toLowerCase()}`);
            });

        const operatorReplacements: Map<string, string> = new Map();
        tokens
            .filter((t) => t.type === 'Punctuator')
            .forEach((t) => {
                switch (t.value) {
                    case '&&':
                        operatorReplacements.set(this.JS_AND, this.SQL_AND);
                        break;
                    case '||':
                        operatorReplacements.set(this.JS_OR, this.SQL_OR);
                        break;
                    case '==':
                    case '===':
                        operatorReplacements.set(t.value, this.SQL_EQUALS);
                        break;
                    case '!=':
                    case '!==':
                        operatorReplacements.set(t.value, this.SQL_NOT_EQUALS);
                        break;
                }
            });

        let filter = js;

        // Replace the JS expressions for contains with the SQL predicates
        const jsReplacementPairs = this.convertContainsTokensToSQL(tokens);
        jsReplacementPairs.forEach(pair => {
            filter = filter.replace(pair.stringToReplace, pair.replacementString);
        });

        stateFieldReplacements.forEach(
            (newValue, oldValue) =>
                (filter = filter.replace(new RegExp(oldValue, 'g'), newValue)),
        );

        stringReplacements.forEach((value, key) => {
            const lookForValue = this.escapeReservedSymbols(key);
            filter = filter.replace(new RegExp(lookForValue, 'g'), value);
        });

        //position here is important. the values been lowercases now (above)
        //but we still have js operators needed for the regex
        customFieldReplacements.forEach((value, identifier) => {
            filter = filter.replace(new RegExp(identifier, 'g'), value);
        });

        let openScopes = 0;
        let closeScopes = 0;

        //this regex will match a string that looks like this:
        //     "customfield_10031" @> ===  'failure demand'
        //and give you the Left Hand Side, and the Right Hand Side as matching groups
        filter = filter.replace(/\s*(?<lhs>\(?"\w*")\s*@>\s*(?<rhs>(!|=)*\s*'(.*?)'\)?)/g, (...args) => {

            const { lhs, rhs } = args[args.length - 1];

            if (lhs.trim().startsWith('(')) {
                openScopes += 1;
            }

            if (rhs.trim().endsWith(')')) {
                closeScopes += 1;
            }

            const lhsName = lhs.replace('(', '');
            const rhsValue = rhs.match(/'(.*?)'/)[0].replace(/'/g, '');

            let eqExpression = `${filter.includes('!=') ? ' NOT' : ''} coalesce(lower("customFields"::text)::jsonb, '${DEFAULT_JSON_VALUE_IF_NULL}') @> lower('[{"name":${lhsName},"value":"${rhsValue}"}]')::jsonb `;

            if (openScopes > 0) {
                eqExpression = ` (${eqExpression.trim()}`;
                openScopes -= 1;
            }

            if (closeScopes > 0) {
                eqExpression = ` ${eqExpression.trim()})`;
                closeScopes -= 1;
            }

            return eqExpression;
        },
        );

        operatorReplacements.forEach((value, op) => {
            filter = filter.replace(new RegExp(op, 'g'), value);
        });

        return filter;
    }

    // state contains    'teststr   '
    // state.includes('teststr   ')
    convertContainsOperatorToJS(fql: string): string {
        // If single quotes are not used around the word after contains, throw error

        const containsNoQuotesRegex = /contains +[^ ']+/g;
        const noQuotesMatch = fql.match(containsNoQuotesRegex);
        if (noQuotesMatch !== null && noQuotesMatch?.length > 0) {
            throw new Error('Invalid FQL. The second operand of the contains operator must be a quoted string with single quotes');
        }
        const containsRegex = / *(not)? +contains +'[^']+'/gi;
        const matches = fql.match(containsRegex);
        matches?.forEach(match => {
            const fqlContains = match;
            const isNegation = fqlContains.match(/^ *not/i) !== null;
            let jsContainsReplacement = fqlContains
                .replace(/^ *(not)? */i, '.')
                .replace(/contains +/i, 'includes(')
                .replace(/$/, ')');
            if (isNegation) {
                jsContainsReplacement = jsContainsReplacement + ' === false';
            }
            fql = fql.replace(fqlContains, jsContainsReplacement);
        });

        return fql;
    }

    async convertFQLToJS(fql: string): Promise<string> {
        let js: string = fql;

        this.FQL_TO_JS.forEach((jsOp, fqlOp) => {
            //has whitespacee before it, and either whitespace after or end of string
            js = js.replace(new RegExp(`\\s+${fqlOp}(\\s+|$)`, 'gi'), ` ${jsOp} `);
        });

        js = this.convertContainsOperatorToJS(js);

        return js;
    }
}

export default async function () {
    const logger = getLogger();
    const database = await connection();
    const customFieldConfigs = new CustomFieldConfigs({ logger, database });
    const stateModelDefinition = getStateModelDefinition(DataTypes);
    return new FQLService({ customFieldConfigs, stateModelDefinition });
}
