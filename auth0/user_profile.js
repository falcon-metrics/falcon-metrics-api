function addAttributes(user, context, callback) {
    const namespace = "https://falcon-metrics.com/";

    //const user_roles_key = namespace + "user_roles";
    const user_context_levels_key = namespace + "user_context_levels";
    const user_organisation_key = namespace + "user_organisation";
    const user_business_unit_key = namespace + "user_business_unit";
    const context_access_control_enabled_key = namespace + "context_access_control_enabled";
    // email is a standard claim, so it doesn't need the namespace
    const email_key = "email";

    let user_app_metadata = user.app_metadata || {};

    //context.idToken[user_roles_key] = user_app_metadata.user_roles || [];
    context.idToken[user_context_levels_key] = user_app_metadata.user_context_levels || [];
    context.idToken[user_organisation_key] = user_app_metadata.user_organisation || '';
    context.idToken[user_business_unit_key] = user_app_metadata.user_business_unit || '';
    context.idToken[context_access_control_enabled_key] = user_app_metadata.context_access_control_enabled || '';


    //context.accessToken[user_roles_key] = user_app_metadata.user_roles || [];
    context.accessToken[user_context_levels_key] = JSON.stringify(user_app_metadata.user_context_levels || []);
    context.accessToken[user_organisation_key] = user_app_metadata.user_organisation || '';
    context.accessToken[user_business_unit_key] = user_app_metadata.user_business_unit || '';
    context.accessToken[context_access_control_enabled_key] = user_app_metadata.context_access_control_enabled || '';


    if (user.email) {
        context.accessToken[email_key] = user.email;
        context.idToken[email_key] = user.email;
    }

    callback(null, user, context);
}
