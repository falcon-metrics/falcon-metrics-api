export enum Roles {
    PowerUser = 'falcon_metrics_powerUser',
    StandardUser = 'falcon_metrics_standardUser',
    GovernanceObeya = 'governance_obeya',
    AdminUser = 'user_admin',
    Beta = 'beta',
    FalconMetricsAdmin = 'falcon_metrics_admin',
    Alpha = 'alpha',
}
export class SecurityContext {
    public organisation?: string;
    public businessUnitId?: string;
    public allowedContextIds: Array<string> = [];
    public contextAccessControlEnabled = false;
    roles: Array<Roles> = [];
    public email: string | undefined;
    public userId: string | undefined;

    isPowerUser(): boolean {
        return this.roles.includes(Roles.PowerUser);
    }

    isStandardUser(): boolean {
        return (
            this.roles.length < 1 ||
            (!this.isPowerUser() && this.roles.includes(Roles.StandardUser))
        );
    }

    isGovernanceObeya(): boolean {
        return (
            this.roles.includes(Roles.GovernanceObeya) ||
            this.roles.includes(Roles.Beta) ||
            this.roles.includes(Roles.FalconMetricsAdmin)
        );
    }

    isAdminUser(): boolean {
        return (
            this.roles.includes(Roles.FalconMetricsAdmin) ||
            this.roles.includes(Roles.PowerUser) ||
            this.roles.includes(Roles.AdminUser)
        );
    }

    isGovernanceObeyaAdmin(): boolean {
        return this.isAdminUser();
    }

    isContextAccessControlEnabled(): boolean {
        return this.contextAccessControlEnabled;
    }
}
