module.exports = serverlessConfig => {
    let authorizer = {
        // matches the authorizer name in apiGateway.js
        name: 'auth0Authorizer',
    };

    if (process.env.FALCON_METRICS_GW_ID) {
        authorizer = {
            id: {
                // matches the authorizer name in resources.js
                Ref: 'auth0Authorizer'
            }
        };
    }

    if (process.env.DISABLE_AUTH) {
        return '';
    }

    return authorizer;
}
