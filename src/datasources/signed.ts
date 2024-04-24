import jwtToUser, { isUserAdmin } from './jwtToUser';
import Organisation from '../models/OrganisationModel';

export const patch = async (event: any) => {
    const {
        requestContext: {
            authorizer: { jwt },
        },
    } = event;

    const { organisationId, roles } = jwtToUser(jwt);
    if (!isUserAdmin(roles)) {
        return {
            statusCode: 403,
            body: JSON.stringify({ error: { message: 'Forbidden' } }),
        };
    }

    const user = jwt.claims.sub;

    const payload = { MSASignedBy: user, MSASignedAt: new Date(Date.now()) };
    console.debug(payload);
    try {
        const model = await Organisation();
        const data = await model.update(payload, {
            where: { id: organisationId } as any,
        } as any);

        return {
            statusCode: 200,
            body: JSON.stringify(data),
        };
    } catch (error) {
        console.error((error as any).errors || error);
        return {
            statusCode: 500,
            body: JSON.stringify((error as any).errors || error),
        };
    }
};
