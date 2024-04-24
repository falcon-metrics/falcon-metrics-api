import { mock } from 'jest-mock-extended';
import { ICustomFieldConfigs } from '../data_v2/custom_fields_config';
import { getStateModelDefinition } from '../models/StateModel';
import { DEFAULT_JSON_VALUE_IF_NULL, DEFAULT_STRING_VALUE_IF_NULL, FQLService } from './fql_service';
import { CustomFieldConfigAttributes } from '../models/CustomFieldConfigModel';

const mCustomFieldConfigs = mock<ICustomFieldConfigs>();

mCustomFieldConfigs.getCustomFieldConfigs.mockImplementation(
    async (): Promise<Array<CustomFieldConfigAttributes>> => {
        const configs: Array<CustomFieldConfigAttributes> = [];

        configs.push({
            orgId: '',
            datasourceId: '',
            datasourceFieldName: 'valuearea',
            displayName: '',
            type: '',
            enabled: true,
            hidden: false,
            deletedAt: null,
        });

        configs.push({
            orgId: '',
            datasourceId: '',
            datasourceFieldName: 'component',
            displayName: '',
            type: '',
            enabled: true,
            hidden: false,
            deletedAt: null,
        });

        configs.push({
            orgId: '',
            datasourceId: '',
            datasourceFieldName: 'customfield_10031',
            displayName: 'Failure Demand',
            type: '',
            enabled: true,
            hidden: false,
            deletedAt: null,
        });

        return configs;
    },
);

const fqlServiceArgs = {
    customFieldConfigs: mCustomFieldConfigs,
    stateModelDefinition: getStateModelDefinition(),
};

test('convertJStoSQL: 2', async () => {
    const mFqlService = new FQLService(fqlServiceArgs);

    const js =
        "flomatikaWorkItemTypeName === 'Bug' && valuearea === 'Business'";
    const expected =
        `LOWER(\"flomatikaWorkItemTypeName\") = 'bug' AND coalesce(lower(\"customFields\"::text)::jsonb, '${DEFAULT_JSON_VALUE_IF_NULL}') @> lower('[{\"name\":\"valuearea\",\"value\":\"business\"}]')::jsonb `;
    const actual = await mFqlService.convertJStoSQL('', '', js);

    expect(actual).toEqual(expected);
});

test('convertJStoSQL: 3', async () => {
    const mFqlService = new FQLService(fqlServiceArgs);

    const js =
        "flomatikaWorkItemTypeName == 'Bug' && valuearea == 'Business' && component == 'ETL'";
    const expected =
        `LOWER(\"flomatikaWorkItemTypeName\") = \'bug\' AND coalesce(lower(\"customFields\"::text)::jsonb, '${DEFAULT_JSON_VALUE_IF_NULL}') @> lower(\'[{"name":"valuearea","value":"business"}]\')::jsonb  AND coalesce(lower(\"customFields\"::text)::jsonb, '${DEFAULT_JSON_VALUE_IF_NULL}') @> lower(\'[{"name":"component","value":"etl"}]\')::jsonb `;
    const actual = await mFqlService.convertJStoSQL('', '', js);

    expect(actual).toEqual(expected);
});

test('convertFQLToJS: invalid FQL 1', async () => {
    const mFqlService = new FQLService(fqlServiceArgs);
    const invalidFql =
        "flomatikaWorkItemTypeName = Bug' AN component = 'API' OR component = 'ETL')";

    await expect(async () => {
        await mFqlService.convertFQLToSQL('', '', invalidFql);
    }).rejects.toThrow('Invalid FQL syntax');
});

test('convertFQLToJS: 1', async () => {
    const mFqlService = new FQLService(fqlServiceArgs);
    const fql =
        "flomatikaWorkItemTypeName = 'Bug' AND (component = 'API' OR component = 'ETL')";
    const expected =
        "flomatikaWorkItemTypeName === 'Bug' && (component === 'API' || component === 'ETL')";
    const actual = await mFqlService.convertFQLToJS(fql);

    expect(actual).toEqual(expected);
});

test('convertFQLToSQL: 1', async () => {
    const mFqlService = new FQLService(fqlServiceArgs);
    const fql =
        "(workItemType = 'Squad Backlog Item' OR flomatikaWorkItemTypeName = 'Feature' OR flomatikaWorkItemTypeName = 'Release' OR flomatikaWorkItemTypeName = 'Epic')";
    const expected =
        '(LOWER("flomatikaWorkItemTypeName") = \'squad backlog item\' OR LOWER("flomatikaWorkItemTypeName") = \'feature\' OR LOWER("flomatikaWorkItemTypeName") = \'release\' OR LOWER("flomatikaWorkItemTypeName") = \'epic\')';
    const actual = await mFqlService.convertFQLToSQL('', '', fql);

    expect(actual).toEqual(expected);
});

test('convertFQLToSQL: case sensitivity 1', async () => {
    const mFqlService = new FQLService(fqlServiceArgs);
    const fql =
        "(WorkItemType = 'Squad Backlog Item' OR WorkItemType = 'Feature' OR WorkItemType = 'Release' OR WorkItemType = 'Epic')";
    const expected =
        '(LOWER("flomatikaWorkItemTypeName") = \'squad backlog item\' OR LOWER("flomatikaWorkItemTypeName") = \'feature\' OR LOWER("flomatikaWorkItemTypeName") = \'release\' OR LOWER("flomatikaWorkItemTypeName") = \'epic\')';
    const actual = await mFqlService.convertFQLToSQL('', '', fql);

    expect(actual).toEqual(expected);
});

test('convertFQLToSQL: case sensitivity 2', async () => {
    const mFqlService = new FQLService(fqlServiceArgs);
    const fql =
        "(WorkItemType = 'Squad Backlog Item' OR WorkItemType = 'Feature' OR WorkItemType = 'Release' OR WorkItemType = 'Epic')";
    const expected =
        '(LOWER("flomatikaWorkItemTypeName") = \'squad backlog item\' OR LOWER("flomatikaWorkItemTypeName") = \'feature\' OR LOWER("flomatikaWorkItemTypeName") = \'release\' OR LOWER("flomatikaWorkItemTypeName") = \'epic\')';
    const actual = await mFqlService.convertFQLToSQL('', '', fql);

    expect(actual).toEqual(expected);
});

test('convertFQLToSQL: case sensitivity 3', async () => {
    const mFqlService = new FQLService(fqlServiceArgs);
    const fql =
        "WorkItemType = 'Bug' AND (component = 'API' OR component = 'ETL')";
    const expected =
        `LOWER("flomatikaWorkItemTypeName") = \'bug\' AND (coalesce(lower(\"customFields\"::text)::jsonb, '${DEFAULT_JSON_VALUE_IF_NULL}') @> lower(\'[{"name":"component","value":"api"}]\')::jsonb OR coalesce(lower(\"customFields\"::text)::jsonb, '${DEFAULT_JSON_VALUE_IF_NULL}') @> lower(\'[{"name":"component","value":"etl"}]\')::jsonb)`;
    const actual = await mFqlService.convertFQLToSQL('', '', fql);

    expect(actual).toEqual(expected);
});

test('convertFQLToSQL: aliases work', async () => {
    const mFqlService = new FQLService(fqlServiceArgs);
    const fql =
        "SLE = 3 AND (workitemtype = 'Bug' OR workItemLevel = 'Portfolio')";
    const expected =
        '"flomatikaWorkItemTypeServiceLevelExpectationInDays" = 3 AND (LOWER("flomatikaWorkItemTypeName") = \'bug\' OR LOWER("flomatikaWorkItemTypeLevel") = \'portfolio\')';
    const actual = await mFqlService.convertFQLToSQL('', '', fql);

    expect(actual).toEqual(expected);
});

test('convertFQLToSQL: date fields work', async () => {
    const mFqlService = new FQLService(fqlServiceArgs);
    const fql = "changedDate = '05/06/2020'";
    const expected = '"changedDate" = \'05/06/2020\'';
    const actual = await mFqlService.convertFQLToSQL('', '', fql);

    expect(actual).toEqual(expected);
});

test('convertFQLToSQL: numeric fields work', async () => {
    const mFqlService = new FQLService(fqlServiceArgs);
    const fql = 'SLE = 3';
    const expected = '"flomatikaWorkItemTypeServiceLevelExpectationInDays" = 3';
    const actual = await mFqlService.convertFQLToSQL('', '', fql);

    expect(actual).toEqual(expected);
});

test('convertFQLToSQL: custom field has spaces', async () => {
    const mFqlService = new FQLService(fqlServiceArgs);
    const fql = "customfield_10031 = 'Failure Demand'";
    const expected =
        `coalesce(lower(\"customFields\"::text)::jsonb, '${DEFAULT_JSON_VALUE_IF_NULL}') @> lower(\'[{"name":"customfield_10031","value":"failure demand"}]\')::jsonb`;
    const actual = (await mFqlService.convertFQLToSQL('', '', fql)).trim();

    expect(actual).toEqual(expected);
});

test('convertFQLToSQL: custom field has other chars', async () => {
    const mFqlService = new FQLService(fqlServiceArgs);
    const fql = "customfield_10031 = 'Non-Value Demand _ it be, liked this!.'";
    const expected =
        `coalesce(lower(\"customFields\"::text)::jsonb, '${DEFAULT_JSON_VALUE_IF_NULL}') @> lower(\'[{"name":"customfield_10031","value":"non-value demand _ it be, liked this!."}]\')::jsonb`;
    const actual = (await mFqlService.convertFQLToSQL('', '', fql)).trim();

    expect(actual).toEqual(expected);
});

test('convertFQLToSQL: not english', async () => {
    const mFqlService = new FQLService(fqlServiceArgs);
    const fql = "customfield_10031 = 'résumé'";
    const expected =
        `coalesce(lower(\"customFields\"::text)::jsonb, '${DEFAULT_JSON_VALUE_IF_NULL}') @> lower(\'[{"name":"customfield_10031","value":"résumé"}]\')::jsonb`;
    const actual = (await mFqlService.convertFQLToSQL('', '', fql)).trim();

    expect(actual).toEqual(expected);
});

test('convertFQLToSQL: not equals', async () => {
    const mFqlService = new FQLService(fqlServiceArgs);
    const fql = "WorkItemType != 'Squad Backlog Item'";
    const expected =
        'LOWER("flomatikaWorkItemTypeName") != \'squad backlog item\'';
    const actual = await mFqlService.convertFQLToSQL('', '', fql);

    expect(actual).toEqual(expected);
});

test('convertFQLToSQL: not equals more complex', async () => {
    const mFqlService = new FQLService(fqlServiceArgs);
    const fql = `WorkItemType != 'Squad Backlog Item' and (WorkItemType != 'this value')`;
    const expected = `LOWER("flomatikaWorkItemTypeName") != 'squad backlog item' AND (LOWER("flomatikaWorkItemTypeName") != 'this value')`;
    const actual = await mFqlService.convertFQLToSQL('', '', fql);

    expect(actual).toEqual(expected);
});

test('convertFQLToSQL: AND equals custom fields', async () => {

    const mFqlService = new FQLService(fqlServiceArgs);
    const fql = `component === 'API' AND valuearea === 'va'`;
    const expected = `coalesce(lower(\"customFields\"::text)::jsonb, '${DEFAULT_JSON_VALUE_IF_NULL}') @> lower('[{"name":"component","value":"api"}]')::jsonb  AND coalesce(lower(\"customFields\"::text)::jsonb, '${DEFAULT_JSON_VALUE_IF_NULL}') @> lower('[{"name":"valuearea","value":"va"}]')::jsonb`;
    const actual = (await mFqlService.convertFQLToSQL('', '', fql)).trim();

    expect(actual).toEqual(expected);
});


test('convertFQLToSQL: not equals custom fields', async () => {

    const mFqlService = new FQLService(fqlServiceArgs);
    const fql = `component != 'API'`;
    const expected = `NOT coalesce(lower(\"customFields\"::text)::jsonb, '${DEFAULT_JSON_VALUE_IF_NULL}') @> lower('[{"name":"component","value":"api"}]')::jsonb`;
    const actual = (await mFqlService.convertFQLToSQL('', '', fql)).trim();

    expect(actual).toEqual(expected);
});

test('convertFQLToSQL: not equals custom fields: 2', async () => {

    const mFqlService = new FQLService(fqlServiceArgs);
    const fql = `component != 'API' AND valuearea != 'API'`;
    const expected = `NOT coalesce(lower(\"customFields\"::text)::jsonb, '${DEFAULT_JSON_VALUE_IF_NULL}') @> lower('[{"name":"component","value":"api"}]')::jsonb  AND NOT coalesce(lower(\"customFields\"::text)::jsonb, '${DEFAULT_JSON_VALUE_IF_NULL}') @> lower('[{"name":"valuearea","value":"api"}]')::jsonb`;
    const actual = (await mFqlService.convertFQLToSQL('', '', fql)).trim();

    expect(actual).toEqual(expected);
});

test('cant stack queries', async () => {

    const mFqlService = new FQLService(fqlServiceArgs);
    const invalidFql =
        "flomatikaWorkItemTypeName = Bug' AN component = 'API' OR component = 'ETL');--";

    await expect(async () => {
        await mFqlService.convertFQLToSQL('', '', invalidFql);
    }).rejects.toThrow('Invalid FQL syntax');
});

test('cant dump db', async () => {
    const mFqlService = new FQLService(fqlServiceArgs);
    const invalidFql = "database_to_xml(true, true, '')";

    await expect(async () => {
        await mFqlService.convertFQLToSQL('', '', invalidFql);
    }).rejects.toThrow('Invalid FQL syntax');
});

test('cant hide query', async () => {
    const mFqlService = new FQLService(fqlServiceArgs);
    const invalidFql = "query_to_xml('select * from pg_user',true,true,'')";

    await expect(async () => {
        await mFqlService.convertFQLToSQL('', '', invalidFql);
    }).rejects.toThrow('Invalid FQL syntax');
});

test('cant select', async () => {
    const mFqlService = new FQLService(fqlServiceArgs);
    const invalidFql = 'select id';

    await expect(async () => {
        await mFqlService.convertFQLToSQL('', '', invalidFql);
    }).rejects.toThrow('Invalid FQL syntax');
});

test('cant drop', async () => {
    const mFqlService = new FQLService(fqlServiceArgs);
    const invalidFql = 'drop table states';

    await expect(async () => {
        await mFqlService.convertFQLToSQL('', '', invalidFql);
    }).rejects.toThrow('Invalid FQL syntax');
});

test('cant union', async () => {
    const mFqlService = new FQLService(fqlServiceArgs);
    const invalidFql = "flomatikaWorkItemTypeName = 'UNION'";

    await expect(async () => {
        await mFqlService.convertFQLToSQL('', '', invalidFql);
    }).rejects.toThrow('Invalid FQL syntax');
});

test('convertFQLToSQL: shell removed query', async () => {
    const mFqlService = new FQLService(fqlServiceArgs);
    const fql =
        "state = 'Not Required' OR state = 'Duplicate' OR state = 'Not Required(old)'";
    const expected =
        'LOWER("state") = \'not required\' OR LOWER("state") = \'duplicate\' OR LOWER("state") = \'not required(old)\'';
    const actual = await mFqlService.convertFQLToSQL('', '', fql);

    expect(actual).toEqual(expected);
});

//------ IN -------

test('convertFQLToSQL: IN clause 1', async () => {
    const mFqlService = new FQLService(fqlServiceArgs);
    const fql =
        "state in ('Not Required', 'Duplicate')";
    const expected =
        `LOWER("state") in ('not required', 'duplicate')`;
    const actual = await mFqlService.convertFQLToSQL('', '', fql);

    expect(actual).toEqual(expected);
});

test('convertFQLToSQL: IN clause 2', async () => {
    const mFqlService = new FQLService(fqlServiceArgs);
    const fql =
        "title = 'test1' AND state in ('Not Required', 'Duplicate') OR state not in ('Required', 'Unique')";
    const expected =
        `LOWER("title") = 'test1' AND LOWER("state") in ('not required', 'duplicate') OR LOWER("state") not in ('required', 'unique')`;
    const actual = await mFqlService.convertFQLToSQL('', '', fql);

    expect(actual).toEqual(expected);
});

test('convertFQLToSQL: NOT IN clause 1', async () => {
    const mFqlService = new FQLService(fqlServiceArgs);
    const fql =
        "state not in ('Not Required', 'Duplicate')";
    const expected =
        `LOWER("state") not in ('not required', 'duplicate')`;
    const actual = await mFqlService.convertFQLToSQL('', '', fql);

    expect(actual).toEqual(expected);
});

//------ EMPTY -------

test('convertFQLToSQL: EMPTY clause 1', async () => {
    const mFqlService = new FQLService(fqlServiceArgs);
    const fql =
        "state is empty";
    const expected =
        `LOWER("state") is null`;
    const actual = await mFqlService.convertFQLToSQL('', '', fql);

    expect(actual.trimEnd()).toEqual(expected);
});

test('convertFQLToSQL: NOT EMPTY clause 1', async () => {
    const mFqlService = new FQLService(fqlServiceArgs);
    const fql =
        "state is not empty";
    const expected =
        `LOWER("state") is not null`;
    const actual = await mFqlService.convertFQLToSQL('', '', fql);

    expect(actual.trimEnd()).toEqual(expected);
});

//------- both IN and EMPTY

test('convertFQLToSQL: IN and EMPTY clause 1', async () => {
    const mFqlService = new FQLService(fqlServiceArgs);
    const fql =
        "state not in ('Not Required', 'Duplicate') OR state is empty";
    const expected =
        `LOWER("state") not in ('not required', 'duplicate') OR LOWER("state") is null`;
    const actual = await mFqlService.convertFQLToSQL('', '', fql);

    expect(actual.trimEnd()).toEqual(expected);
});


describe('convertFQLToSQL: Test the contains operator', () => {
    test('Test contains operator at the end of the expression', async () => {
        const mFqlService = new FQLService(fqlServiceArgs);
        const fql =
            "state not in ('Not Required', 'Duplicate') OR state is empty OR state contains 'Completed'";
        const expected =
            `LOWER("state") not in ('not required', 'duplicate') OR LOWER("state") is null OR LOWER("state") like '%completed%'`;
        const actual = await mFqlService.convertFQLToSQL('', '', fql);

        expect(actual.trimEnd()).toEqual(expected);
    });


    test('Test contains operator in the middle of the expression', async () => {
        const mFqlService = new FQLService(fqlServiceArgs);
        const fql =
            "state not in ('Not Required', 'Duplicate') OR state contains 'Completed' OR state is empty";
        const expected =
            `LOWER("state") not in ('not required', 'duplicate') OR LOWER("state") like '%completed%' OR LOWER("state") is null`;
        const actual = await mFqlService.convertFQLToSQL('', '', fql);

        expect(actual.trimEnd()).toEqual(expected);
    });

    test('Expression contains at the beginning of the expression', async () => {
        const mFqlService = new FQLService(fqlServiceArgs);
        const fql = "state contains 'Completed' AND state not in ('Not Required', 'Duplicate')";
        const expected = `LOWER("state") like '%completed%' AND LOWER("state") not in ('not required', 'duplicate')`;
        const actual = await mFqlService.convertFQLToSQL('', '', fql);

        expect(actual.trimEnd()).toEqual(expected);
    });

    test('Expression contains only the contains operator', async () => {
        const mFqlService = new FQLService(fqlServiceArgs);
        const fql = "state contains 'Completed'";
        const expected = `LOWER("state") like '%completed%'`;
        const actual = await mFqlService.convertFQLToSQL('', '', fql);

        expect(actual.trimEnd()).toEqual(expected);
    });

    test('Multiple uses of contains operator in an expression', async () => {
        const mFqlService = new FQLService(fqlServiceArgs);
        const fql = "state contains 'Completed' AND (workItemType contains 'Risk' or workItemType contains 'Enhancement')";
        const expected = `LOWER("state") like '%completed%' AND (LOWER("flomatikaWorkItemTypeName") like '%risk%' OR LOWER("flomatikaWorkItemTypeName") like '%enhancement%')`;
        const actual = await mFqlService.convertFQLToSQL('', '', fql);

        expect(actual.trimEnd()).toEqual(expected);
    });

    test('Multiple spaces around the contains operator', async () => {
        const mFqlService = new FQLService(fqlServiceArgs);
        const fql = "state   contains    'Completed'    AND (workItemType contains 'Risk  ' or workItemType    contains          'Enhancement' )";
        const expected = `LOWER("state") like '%completed%' AND (LOWER("flomatikaWorkItemTypeName") like '%risk  %' OR LOWER("flomatikaWorkItemTypeName") like '%enhancement%' )`;
        const actual = await mFqlService.convertFQLToSQL('', '', fql);

        expect(actual.trimEnd()).toEqual(expected);
    });
});


describe('convertFQLToJS: Test the contains operator', () => {
    test('Test contains operator at the end of the expression', async () => {
        const mFqlService = new FQLService(fqlServiceArgs);
        const fql =
            "state not in ('Not Required', 'Duplicate') OR state is empty OR state contains 'Completed'";
        const expected =
            `state not in ('Not Required', 'Duplicate') || state is null || state.includes('Completed')`;
        const actual = await mFqlService.convertFQLToJS(fql);

        expect(actual.trimEnd()).toEqual(expected);
    });


    test('Test contains operator in the middle of the expression', async () => {
        const mFqlService = new FQLService(fqlServiceArgs);
        const fql =
            "state not in ('Not Required', 'Duplicate') OR state contains 'Completed' OR state is empty";
        const expected =
            `state not in ('Not Required', 'Duplicate') || state.includes('Completed') || state is null`;
        const actual = await mFqlService.convertFQLToJS(fql);

        expect(actual.trimEnd()).toEqual(expected);
    });

    test('Expression contains only the contains operator', async () => {
        const mFqlService = new FQLService(fqlServiceArgs);
        const fql = "state contains 'Completed Test Test'";
        const expected = `state.includes('Completed Test Test')`;
        const actual = await mFqlService.convertFQLToJS(fql);

        expect(actual.trimEnd()).toEqual(expected);
    });

    test('Multiple uses of contains operator in an expression', async () => {
        const mFqlService = new FQLService(fqlServiceArgs);
        const fql = "state contains 'Completed' AND (workItemType contains 'Risk' or workItemType contains 'Enhancement')";
        const expected = `state.includes('Completed') && (workItemType.includes('Risk') || workItemType.includes('Enhancement'))`;
        const actual = await mFqlService.convertFQLToJS(fql);

        expect(actual.trimEnd()).toEqual(expected);
    });

    test('Multiple spaces around the contains operator', async () => {
        const mFqlService = new FQLService(fqlServiceArgs);
        const fql = "state   contains    'Completed'    AND (workItemType contains ' Risk   ' or workItemType    contains          ' Enhancement ' )";
        const expected = `state.includes('Completed') && (workItemType.includes(' Risk   ') || workItemType.includes(' Enhancement ') )`;
        const actual = await mFqlService.convertFQLToJS(fql);

        expect(actual.trimEnd()).toEqual(expected);
    });

    test('Conversion is case insensitive', async () => {
        const mFqlService = new FQLService(fqlServiceArgs);
        const fql = "state   COnTaiNs    'Completed'    AnD (workItemType contains ' Risk   ' or workItemType    CONTAINS          ' Enhancement ' )";
        const expected = `state.includes('Completed') && (workItemType.includes(' Risk   ') || workItemType.includes(' Enhancement ') )`;
        const actual = await mFqlService.convertFQLToJS(fql);

        expect(actual.trimEnd()).toEqual(expected);
    });

    test('Invalid syntax. No quotes around the operand', async () => {
        const mFqlService = new FQLService(fqlServiceArgs);
        const fql = "state   contains    Completed    AND (workItemType contains ' Risk   ' or workItemType    contains          ' Enhancement ' )";
        // const expected = `state.includes('Completed') && (workItemType.includes(' Risk   ') || workItemType.includes(' Enhancement ') )`;
        const fnCall = () => mFqlService.convertFQLToSQL('', '', fql);


        // const test1 = await fnCall();
        // console.log('test1 : ', test1);

        expect(fnCall).rejects.toThrow();
    });

    test('Invalid syntax. Only one quote around the operand, quote before the operand', async () => {
        const mFqlService = new FQLService(fqlServiceArgs);
        const fql = "state   contains    'Completed    AND (workItemType contains ' Risk   ' or workItemType    contains          ' Enhancement ' )";
        const fnCall = () => mFqlService.convertFQLToSQL('', '', fql);

        expect(fnCall).rejects.toThrow();
    });

    test('Invalid syntax. Only one quote around the operand, quote after the operand', async () => {
        const mFqlService = new FQLService(fqlServiceArgs);
        const fql = "state   contains    Completed'    AND (workItemType contains ' Risk   ' or workItemType    contains          ' Enhancement ' )";
        const fnCall = () => mFqlService.convertFQLToSQL('', '', fql);
        expect(fnCall).rejects.toThrow();
    });
});


describe('convertFQLToJS: Test the not contains operator', () => {
    test('Test not contains operator at the end of the expression', async () => {
        const mFqlService = new FQLService(fqlServiceArgs);
        const fql =
            "state not in ('Not Required', 'Duplicate') OR state is empty OR state not contains 'Completednot'";
        const expected =
            `state not in ('Not Required', 'Duplicate') || state is null || state.includes('Completednot') === false`;
        const actual = await mFqlService.convertFQLToJS(fql);

        expect(actual.trimEnd()).toEqual(expected);
    });


    test('Test not contains operator in the middle of the expression', async () => {
        const mFqlService = new FQLService(fqlServiceArgs);
        const fql =
            "state not in ('Not Required', 'Duplicate') OR state not contains 'Completed' OR state is empty";
        const expected =
            `state not in ('Not Required', 'Duplicate') || state.includes('Completed') === false || state is null`;
        const actual = await mFqlService.convertFQLToJS(fql);

        expect(actual.trimEnd()).toEqual(expected);
    });

    test('Expression contains only the not contains operator', async () => {
        const mFqlService = new FQLService(fqlServiceArgs);
        const fql = "state not contains 'Completed Test Test'";
        const expected = `state.includes('Completed Test Test') === false`;
        const actual = await mFqlService.convertFQLToJS(fql);

        expect(actual.trimEnd()).toEqual(expected);
    });

    test('Multiple uses of contains operator in an expression', async () => {
        const mFqlService = new FQLService(fqlServiceArgs);
        const fql = "state not contains 'Completed' AND (workItemType not contains 'Risk' or workItemType contains 'Enhancement')";
        const expected = `state.includes('Completed') === false && (workItemType.includes('Risk') === false || workItemType.includes('Enhancement'))`;
        const actual = await mFqlService.convertFQLToJS(fql);

        expect(actual.trimEnd()).toEqual(expected);
    });

    test('Multiple spaces around the not contains operator', async () => {
        const mFqlService = new FQLService(fqlServiceArgs);
        const fql = "state   not    contains    'Completed'    AND (workItemType contains ' Risk   ' or workItemType    not contains          ' Enhancement ' )";
        const expected = `state.includes('Completed') === false && (workItemType.includes(' Risk   ') || workItemType.includes(' Enhancement ') === false )`;
        const actual = await mFqlService.convertFQLToJS(fql);

        expect(actual.trimEnd()).toEqual(expected);
    });

    test('Conversion is case insensitive', async () => {
        const mFqlService = new FQLService(fqlServiceArgs);
        const fql = "state   Not COnTaiNs    'Completed'    AnD (workItemType NOT contains ' Risk   ' or workItemType    CONTAINS          ' Enhancement ' )";
        const expected = `state.includes('Completed') === false && (workItemType.includes(' Risk   ') === false || workItemType.includes(' Enhancement ') )`;
        const actual = await mFqlService.convertFQLToJS(fql);

        expect(actual.trimEnd()).toEqual(expected);
    });

    test('Invalid syntax. No quotes around the operand', async () => {
        const mFqlService = new FQLService(fqlServiceArgs);
        const fql = "state   contains    Completed    AND (workItemType contains ' Risk   ' or workItemType    contains          ' Enhancement ' )";
        // const expected = `state.includes('Completed') && (workItemType.includes(' Risk   ') || workItemType.includes(' Enhancement ') )`;
        const fnCall = () => mFqlService.convertFQLToSQL('', '', fql);


        // const test1 = await fnCall();
        // console.log('test1 : ', test1);

        expect(fnCall).rejects.toThrow();
    });

    test('Invalid syntax. Only one quote around the operand, quote before the operand', async () => {
        const mFqlService = new FQLService(fqlServiceArgs);
        const fql = "state   contains    'Completed    AND (workItemType contains ' Risk   ' or workItemType    contains          ' Enhancement ' )";
        const fnCall = () => mFqlService.convertFQLToSQL('', '', fql);

        expect(fnCall).rejects.toThrow();
    });

    test('Invalid syntax. Only one quote around the operand, quote after the operand', async () => {
        const mFqlService = new FQLService(fqlServiceArgs);
        const fql = "state   contains    Completed'    AND (workItemType contains ' Risk   ' or workItemType    contains          ' Enhancement ' )";
        const fnCall = () => mFqlService.convertFQLToSQL('', '', fql);
        expect(fnCall).rejects.toThrow();
    });
});



describe('convertFQLToSQL: Test the not not contains operator', () => {
    test('Test not contains operator at the end of the expression', async () => {
        const mFqlService = new FQLService(fqlServiceArgs);
        const fql =
            "state not in ('Not Required', 'Duplicate') OR state is empty OR state not contains 'Completed'";
        const expected =
            `LOWER("state") not in ('not required', 'duplicate') OR LOWER("state") is null OR LOWER("state") not like '%completed%'`;
        const actual = await mFqlService.convertFQLToSQL('', '', fql);

        expect(actual.trimEnd()).toEqual(expected);
    });


    test('Test not contains operator in the middle of the expression', async () => {
        const mFqlService = new FQLService(fqlServiceArgs);
        const fql =
            "state not in ('Not Required', 'Duplicate') OR state not contains 'Completed' OR state is empty";
        const expected =
            `LOWER("state") not in ('not required', 'duplicate') OR LOWER("state") not like '%completed%' OR LOWER("state") is null`;
        const actual = await mFqlService.convertFQLToSQL('', '', fql);

        expect(actual.trimEnd()).toEqual(expected);
    });

    test('Expression contains at not contains the beginning of the expression', async () => {
        const mFqlService = new FQLService(fqlServiceArgs);
        const fql = "state not contains 'Completed' AND state not in ('Not Required', 'Duplicate')";
        const expected = `LOWER("state") not like '%completed%' AND LOWER("state") not in ('not required', 'duplicate')`;
        const actual = await mFqlService.convertFQLToSQL('', '', fql);

        expect(actual.trimEnd()).toEqual(expected);
    });

    test('Expression contains only the not contains operator', async () => {
        const mFqlService = new FQLService(fqlServiceArgs);
        const fql = "state not contains 'Completed'";
        const expected = `LOWER("state") not like '%completed%'`;
        const actual = await mFqlService.convertFQLToSQL('', '', fql);

        expect(actual.trimEnd()).toEqual(expected);
    });

    test('Multiple uses of not contains operator in an expression', async () => {
        const mFqlService = new FQLService(fqlServiceArgs);
        const fql = "state not contains 'Completed' AND (workItemType contains 'Risk' or workItemType not contains 'Enhancement')";
        const expected = `LOWER("state") not like '%completed%' AND (LOWER("flomatikaWorkItemTypeName") like '%risk%' OR LOWER("flomatikaWorkItemTypeName") not like '%enhancement%')`;
        const actual = await mFqlService.convertFQLToSQL('', '', fql);

        expect(actual.trimEnd()).toEqual(expected);
    });

    test('Multiple spaces around the not contains operator', async () => {
        const mFqlService = new FQLService(fqlServiceArgs);
        const fql = "state   not    contains    'Completed'    AND (workItemType contains 'Risk  ' or workItemType    not     contains          'Enhancement' )";
        const expected = `LOWER("state") not like '%completed%' AND (LOWER("flomatikaWorkItemTypeName") like '%risk  %' OR LOWER("flomatikaWorkItemTypeName") not like '%enhancement%' )`;
        const actual = await mFqlService.convertFQLToSQL('', '', fql);

        expect(actual.trimEnd()).toEqual(expected);
    });
});


describe('Test for coalesce when using nullable columns', () => {
    test('convertFQLToSQL: When a nullable column is used in FQL, the SQL should have coalesce', async () => {

        const mFqlService = new FQLService(fqlServiceArgs);
        const fql = `component != 'API' AND valuearea != 'API' AND resolution != 'test'`;
        const expected = `NOT coalesce(lower(\"customFields\"::text)::jsonb, '${DEFAULT_JSON_VALUE_IF_NULL}') @> lower('[{"name":"component","value":"api"}]')::jsonb  AND NOT coalesce(lower(\"customFields\"::text)::jsonb, '${DEFAULT_JSON_VALUE_IF_NULL}') @> lower('[{"name":"valuearea","value":"api"}]')::jsonb  AND coalesce(LOWER("resolution"), '${DEFAULT_STRING_VALUE_IF_NULL}') != 'test'`;
        const actual = (await mFqlService.convertFQLToSQL('', '', fql)).trim();

        expect(actual).toEqual(expected);
    });
});


describe('Test the flagged column', () => {
    test('convertFQLToSQL: Test the flagged column', async () => {
        const mFqlService = new FQLService(fqlServiceArgs);
        const fql =
            "state = 'Not Required' OR state = 'Duplicate' OR state = 'Not Required(old)' and flagged = false";
        const expected =
            'LOWER("state") = \'not required\' OR LOWER("state") = \'duplicate\' OR LOWER("state") = \'not required(old)\' AND "flagged" = false';
        const actual = await mFqlService.convertFQLToSQL('', '', fql);

        expect(actual).toEqual(expected);
    });
});