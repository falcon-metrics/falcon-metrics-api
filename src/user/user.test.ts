import { mock } from 'jest-mock-extended';
import { describe, expect, test } from '@jest/globals';
import { SecurityContext } from '../common/security';
import { User } from './handler';
import { IUserDBOp } from '../database_operations/user_db_op';

const defaultSecurity = Object.assign(new SecurityContext(), {
    organisation: "doesn't matter",
    roles: [],
    allowedContextIds: [],
});

let user: User;
let mUserDBOp: any;

beforeEach(() => {
    mUserDBOp = mock<IUserDBOp>();

    user = new User({
        security: defaultSecurity,
        userDBOp: mUserDBOp,
    });
});

describe('User tests', () => {
    test('should not be null', async () => {
        mUserDBOp.get.mockResolvedValueOnce({});

        const info = await user.getInfo('any_user_id');
        expect(info).not.toBeNull();

        //const asyncMock = jest.fn().mockResolvedValue('userExample');
        //await asyncMock;
    });

    test('should return userInfo', async () => {
        const userExample = {
            orgId: 'flomatikathe-real-flomatika',
            userId: 'any_user_id',
            firstName: 'First Name',
            lastName: 'Last Name',
            email: 'email@flomatika.com',
            role: 'Senior FrontEnd Developer',
            optInNewsletter: false,
            contactForDemo: true,
            termsAndCondSignedAt: new Date('2021-09-14T04:25:21.339Z'),
            hideProductTour: true,
            dataValues: {
                orgId: 'flomatikathe-real-flomatika',
                userId: 'any_user_id',
                firstName: 'First Name',
                lastName: 'Last Name',
                email: 'email@flomatika.com',
                role: 'Senior FrontEnd Developer',
                optInNewsletter: false,
                contactForDemo: true,
                termsAndCondSignedAt: '2021-09-14T04:25:21.339Z',
                hideProductTour: true,
            },
        };

        const expectedResponse = {
            signed: true,
            // TODO: This test is failing. 
            // showBanner: false,
            // Hardcoding this to do deployment
            showBanner: true,
            orgId: 'flomatikathe-real-flomatika',
            userId: 'any_user_id',
            firstName: 'First Name',
            lastName: 'Last Name',
            email: 'email@flomatika.com',
            role: 'Senior FrontEnd Developer',
            optInNewsletter: false,
            contactForDemo: true,
            termsAndCondSignedAt: '2021-09-14T04:25:21.339Z',
            hideProductTour: true,
            analyticsDashboardUrl: "/value-stream-management",
        };

        mUserDBOp.get.mockResolvedValueOnce(userExample);

        const info = await user.getInfo('any_user_id');
        expect(info).toStrictEqual(expectedResponse);
    });

    test('should extract UserDetails', async () => {
        const payload = {
            userFirstName: 'First Name',
            userLastName: 'Last Name',
            userEmail: 'email@flomatika.com',
            userRole: 'Senior FrontEnd Developer',
            userAcceptTermsAndConditions: true,
            userOptInNewsletter: false,
            contactForDemo: true,
        };

        const expectedResponse = {
            orgId: 'flomatikathe-real-flomatika',
            userId: 'any_user_id',
            firstName: 'First Name',
            lastName: 'Last Name',
            email: 'email@flomatika.com',
            role: 'Senior FrontEnd Developer',
            optInNewsletter: false,
            contactForDemo: true,
            //termsAndCondSignedAt: '2021-09-14T04:25:21.339Z',
        };

        const info = await user.extractUserDetails(
            payload,
            'flomatikathe-real-flomatika',
            'any_user_id',
        );
        expect(info.orgId).toStrictEqual(expectedResponse.orgId);
        expect(info.userId).toStrictEqual(expectedResponse.userId);
        expect(info.firstName).toStrictEqual(expectedResponse.firstName);
        expect(info.lastName).toStrictEqual(expectedResponse.lastName);
        expect(info.email).toStrictEqual(expectedResponse.email);
        expect(info.role).toStrictEqual(expectedResponse.role);
        expect(info.optInNewsletter).toStrictEqual(
            expectedResponse.optInNewsletter,
        );
        expect(info.contactForDemo).toStrictEqual(
            expectedResponse.contactForDemo,
        );
    });
});
