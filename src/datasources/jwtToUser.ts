import { Roles } from "../common/security";

export default function jwtToUser(jwt: any) {
    const organisationId = (jwt.claims[
        'https://falcon-metrics.com/user_organisation'
    ] ?? '') as string;

    const roles = jwt.claims['https://falcon-metrics.com/roles']
        ? JSON.parse(jwt.claims['https://falcon-metrics.com/roles'])
        : [];

    return { organisationId, roles };
}

export function isGovernanceObeyaAdmin(roles: Array<string>) {
    return (
        roles?.length > 0 &&
        roles.includes('governance_obeya') &&
        roles.includes('user_admin')
    );
}

export function isUserAdmin(roles: Array<string>) {
    return roles?.length > 0
        && (
            roles.includes(Roles.FalconMetricsAdmin) ||
            roles.includes(Roles.AdminUser)
        );
}
