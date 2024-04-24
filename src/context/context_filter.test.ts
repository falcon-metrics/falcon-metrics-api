import { mock } from 'jest-mock-extended';
import { ContextFilter } from './context_filter';
import { ContextItem, IContext } from './context_interfaces';
import { Roles, SecurityContext } from '../common/security';

const contextData: Array<ContextItem> = [
    { id: 'id1', positionInHierarchy: '1' },
    { id: 'id1-1', positionInHierarchy: '1.1' },
    { id: 'id1-1-1', positionInHierarchy: '1.1.1' },
    { id: 'id1-1-2', positionInHierarchy: '1.1.2' },
    { id: 'id1-1-3', positionInHierarchy: '1.1.3' },
    { id: 'id1-1-4', positionInHierarchy: '1.1.4' },
    { id: 'id1-2', positionInHierarchy: '1.2' },
    { id: 'id1-2-1', positionInHierarchy: '1.2.1' },
    { id: 'id2', positionInHierarchy: '2' },
    { id: 'id2-1', positionInHierarchy: '2.1' },
    { id: 'id2-1-1', positionInHierarchy: '2.1.1' },
    { id: 'id2-1-2', positionInHierarchy: '2.1.2' },
    { id: 'id2-2', positionInHierarchy: '2.2' },
    { id: 'id3', positionInHierarchy: '3' },
    { id: 'id3-1', positionInHierarchy: '3.1' },
    { id: 'id3-1-1', positionInHierarchy: '3.1.1' },
    { id: 'id3-1-2', positionInHierarchy: '3.1.2' },
    { id: 'id3-1-3', positionInHierarchy: '3.1.3' },
    { id: 'id3-2', positionInHierarchy: '3.2' },
    { id: 'id3-2-1', positionInHierarchy: '3.2.1' },
];

const contextWorkitemData = new Map([
    ['id1-1-1', ['a', 'b']],
    ['id1-1-2', ['c', 'd']],
    ['id1-1-3', ['e', 'f', 'g']],
    ['id1-1-4', ['a', 'g', 'h', 'i']],
]);

const mContext = mock<IContext>();

mContext.getContextBranch.mockImplementation(
    async (_orgId: string, id: string): Promise<Array<ContextItem>> => {
        const posInHierarchy = id.replace(/-/g, '.').replace('id', '');
        return contextData.filter((item) =>
            item.positionInHierarchy!.startsWith(posInHierarchy),
        );
    },
);

mContext.getWorkItemKeysForContextBranch.mockImplementation(
    async (_orgId: string, id: string): Promise<Array<string>> => {
        return contextWorkitemData.get(id)!;
    },
);

describe(`${ContextFilter.prototype.isAllowed.name} tests when no context id query param is provided`, () => {
    // test('When user has no role Then any workitem id is allowable', async () => {
    //     const filter = new ContextFilter({
    //         queryParameters: {},
    //         security: Object.assign(new SecurityContext(), {
    //             allowedContextIds: ['id1', 'id2'],
    //             organisation: 'any',
    //             roles: [],
    //         }),
    //         context: mContext,
    //     });

    //     expect(await filter.isAllowed('l')).toBe(true);
    // });

    // test('When user has power user role Then any workitem id is allowable', async () => {
    //     const filter = new ContextFilter({
    //         queryParameters: {},
    //         security: Object.assign(new SecurityContext(), {
    //             allowedContextIds: ['id1', 'id2'],
    //             organisation: 'any',
    //             roles: [Roles.PowerUser, Roles.StandardUser],
    //         }),
    //         context: mContext,
    //     });

    //     expect(await filter.isAllowed('n')).toBe(true);
    // });

    test.each([['a'], ['b'], ['c']])(
        'When user has standard user role, then all context are allowable because we have not implemented role based context security',
        async (workitemId) => {
            const filter = new ContextFilter({
                queryParameters: {},
                security: Object.assign(new SecurityContext(), {
                    allowedContextIds: [],
                    organisation: 'any',
                    roles: [Roles.StandardUser],
                }),
                context: mContext,
            });

            expect(await filter.isAllowed(workitemId)).toBe(true);
        },
    );

    // test.each([['a'], ['b'], ['c']])(
    //     'When user has standard user role And has no context ids in sec profile Then workitem id %s is not allowable',
    //     async (workitemId) => {
    //         const filter = new ContextFilter({
    //             queryParameters: {},
    //             security: Object.assign(new SecurityContext(), {
    //                 allowedContextIds: [],
    //                 organisation: 'any',
    //                 roles: [Roles.StandardUser],
    //             }),
    //             context: mContext,
    //         });

    //         expect(await filter.isAllowed(workitemId)).toBe(false);
    //     },
    // );

    // test.skip.each([
    //     ['a', true],
    //     ['b', true],
    //     ['c', false],

    //     ['d', false],
    //     ['e', true],
    //     ['f', true],
    //     ['g', true],

    //     ['h', false],
    //     ['i', false],
    //     ['k', false],
    // ])(
    //     'When user has standard user role And has context ids in sec profile Then workitem id %s allowable is %s',
    //     async (workitemId, expectedAllowedResult) => {
    //         const allowedContextIds = ['id1-1-1', 'id1-1-3'];

    //         const filter = new ContextFilter({
    //             queryParameters: {},
    //             security: Object.assign(new SecurityContext(), {
    //                 allowedContextIds: allowedContextIds,
    //                 organisation: 'any',
    //                 roles: [Roles.StandardUser],
    //             }),
    //             context: mContext,
    //         });

    //         expect(await filter.isAllowed(workitemId)).toBe(
    //             expectedAllowedResult,
    //         );
    //     },
    // );
});

// describe(`${ContextFilter.prototype.isAllowed.name} tests when a context id query param is provided`, () => {
//     test.each([
//         ['a', false],
//         ['b', false],
//         ['c', true],

//         ['d', true],
//         ['e', false],
//         ['f', false],
//         ['g', false],

//         ['h', false],
//         ['i', false],
//         ['k', false],
//     ])(
//         'When user has no role Then workitem id for the query param is allowable - %s',
//         async (contextId, expectedResult) => {
//             const filter = new ContextFilter({
//                 queryParameters: { contextId: 'id1-1-2' },
//                 security: Object.assign(new SecurityContext(), {
//                     allowedContextIds: ['id1', 'id2'],
//                     organisation: 'any',
//                     roles: [],
//                 }),
//                 context: mContext,
//             });

//             expect(await filter.isAllowed(contextId)).toBe(expectedResult);
//         },
//     );

//     test.each([
//         ['a', true],
//         ['b', false],
//         ['c', false],

//         ['d', false],
//         ['e', false],
//         ['f', false],
//         ['g', true],

//         ['h', true],
//         ['i', true],
//         ['k', false],
//     ])(
//         'When user has power user role Then any workitem id is allowable',
//         async (contextId, expectedResult) => {
//             const filter = new ContextFilter({
//                 queryParameters: { contextId: 'id1-1-4' },
//                 security: Object.assign(new SecurityContext(), {
//                     allowedContextIds: ['id1-1-1', 'id1-1-3'],
//                     organisation: 'any',
//                     roles: [Roles.PowerUser, Roles.StandardUser],
//                 }),
//                 context: mContext,
//             });

//             expect(await filter.isAllowed(contextId)).toBe(expectedResult);
//         },
//     );

//     test.each([
//         ['a', false],
//         ['b', false],
//         ['c', false],

//         ['d', false],
//         ['e', false],
//         ['f', false],
//         ['g', false],

//         ['h', false],
//         ['i', false],
//         ['k', false],
//     ])(
//         'When user has standard user role And has no context ids in sec profile Then workitem id %s is not allowable',
//         async (contextId, expectedResult) => {
//             const filter = new ContextFilter({
//                 queryParameters: { contextId: 'id2' },
//                 security: Object.assign(new SecurityContext(), {
//                     allowedContextIds: [],
//                     organisation: 'any',
//                     roles: [Roles.StandardUser],
//                 }),
//                 context: mContext,
//             });

//             expect(await filter.isAllowed(contextId)).toBe(expectedResult);
//         },
//     );

//     test.each([
//         ['a', true],
//         ['b', true],
//         ['c', false],

//         ['d', false],
//         ['e', false],
//         ['f', false],
//         ['g', false],

//         ['h', false],
//         ['i', false],
//         ['k', false],
//     ])(
//         'When user has standard user role And has context ids in sec profile Then context id %s allowable is %s',
//         async (contextId, expectedResult) => {
//             const allowedContextIds = ['id1-1-1', 'id1-1-4'];

//             const filter = new ContextFilter({
//                 queryParameters: { contextId: 'id1-1-1' },
//                 security: Object.assign(new SecurityContext(), {
//                     allowedContextIds: allowedContextIds,
//                     organisation: 'any',
//                     roles: [Roles.StandardUser],
//                 }),
//                 context: mContext,
//             });

//             expect(await filter.isAllowed(contextId)).toBe(expectedResult);
//         },
//     );
// });
