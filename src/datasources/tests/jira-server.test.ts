import { mock } from 'jest-mock-extended';
import { formatJiraServerContexts } from '../jira-server';
test('context import response with single project formatted correctly', async () => {
    const mockJiraApiResponse = [
        {
            id: '10000',
            name: 'Filter for FAL board',
            jql: 'project = 10000 ORDER BY Rank ASC',
        },
    ];
    const formatedResponse = formatJiraServerContexts(mockJiraApiResponse);

    const expectedResp = [
        {
            id: '10000',
            name: 'Filter for FAL board',
            projects: ['10000'],
        },
    ];
    expect(expectedResp).toEqual(formatedResponse);
});
test('context import response with multiple project formatted correctly', async () => {
    const mockJiraApiResponse = [
        {
            id: '10001',
            name: 'All Items in FAL Project',
            jql: 'project in (10000,10001)',
        },
    ];
    const formatedResponse = formatJiraServerContexts(mockJiraApiResponse);

    const expectedResp = [
        {
            id: '10001',
            name: 'All Items in FAL Project',
            projects: ['10000', '10001'],
        },
    ];
    expect(expectedResp).toEqual(formatedResponse);
});
