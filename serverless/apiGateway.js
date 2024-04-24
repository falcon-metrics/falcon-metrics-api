module.exports = serverlessConfig => {

    const httpApiConfig = {
        payload: '2.0',
    };

    if (process.env.FALCON_METRICS_GW_ID) {
        httpApiConfig.id = process.env.FALCON_METRICS_GW_ID;
    }
    else {
        // Used for gateways defined by serverless
        // Should match the authorizer config in resources.js
        httpApiConfig.authorizers = {
            auth0Authorizer: {
                name: 'auth0Authorizer',
                identitySource: '$request.header.Authorization',
                issuerUrl: 'https://example.auth0.com/',
                audience: [process.env.REACT_APP_API_BASE_URL || "https://api.example.com/"],
            }
        };
        httpApiConfig.cors = true;
    }

    return httpApiConfig;
};
