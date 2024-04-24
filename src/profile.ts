import axios, { AxiosResponse } from 'axios';

export const auth0 = {
    client_id: process.env.AUTH0_API_CLIENT_ID,
    client_secret: process.env.AUTH0_API_CLIENT_SECRET,
    audience: process.env.AUTH0_API_AUDIENCE,
    grant_type: 'client_credentials',
};

const baseURL = 'https://example.auth0.com';

export type ProfileType = {
    updateUserMetadata: (payload: any) => Promise<AxiosResponse<any>>;
    updateAppMetadata: (payload: any) => Promise<AxiosResponse<any>>;
    updateEmailVerified: (payload: any) => Promise<AxiosResponse<any>>;
    sendEmailVerification: () => Promise<AxiosResponse<any>>;
    assignUserRole: (roleId: string) => Promise<AxiosResponse<any>>;
    getUserInfo: () => Promise<AxiosResponse<any>>;
    getUser: () => string;
};

export default async function profile(userId: string): Promise<ProfileType> {
    const {
        data: { access_token },
    } = await axios.post(`${baseURL}/oauth/token`, auth0, {
        headers: {
            'content-type': 'application/json',
        },
    });

    const headers = { Authorization: `Bearer ${access_token}` };

    function update(payload: any) {
        return axios.patch(`${baseURL}/api/v2/users/${userId}`, payload, {
            headers,
        });
    }
    function post(resource: string, payload: any) {
        return axios.post(`${baseURL}/api/v2/users/${userId}/${resource}`, payload, {
            headers,
        });
    }

    function updateUserMetadata(payload: any) {
        return update({ user_metadata: payload });
    }

    function updateAppMetadata(payload: any) {
        return update({ app_metadata: payload });
    }

    function updateEmailVerified(verified: boolean) {
        return update({ email_verified: verified });
    }
    function assignUserRole(roleId: string) {
        return post('roles', { roles: [roleId] });
    }

    function sendEmailVerification() {
        const userInfo = userId.split('|');
        const body = {
            user_id: userId,
            identity: {
                user_id: userInfo[1],
                provider: userInfo[0],
            },
        };

        return axios.post(`${baseURL}/api/v2/jobs/verification-email`, body, {
            headers,
        });
    }

    function getUserInfo(): Promise<AxiosResponse<any>> {
        return axios.get(`${baseURL}/api/v2/users/${userId}`, { headers });
    }

    function getUser() {
        return userId;
    }

    return {
        updateUserMetadata,
        updateAppMetadata,
        updateEmailVerified,
        sendEmailVerification,
        getUser,
        getUserInfo,
        assignUserRole,
    };
}
