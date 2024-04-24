module.exports = serverlessConfig => {

  const nonManagedStages = ["prod", "production", "staging"];

  let resources = {};

  if (process.env.FALCON_METRICS_GW_ID) {
    // Used for gateways defined externally to serverless
    // Should match the config in apiGateway.js
    resources.auth0Authorizer = {
      Type: 'AWS::ApiGatewayV2::Authorizer',
      Properties: {
        Name: 'auth0Authorizer',
        ApiId: process.env.FALCON_METRICS_GW_ID,
        AuthorizerType: 'JWT',
        IdentitySource: ['$request.header.Authorization'],
        JwtConfiguration: {
          Audience: [process.env.REACT_APP_API_BASE_URL || "https://api.example.com/"],
          Issuer: 'https://example.auth0.com/',
        },
      },
    };
  }

  if (nonManagedStages.includes(serverlessConfig.service.provider.stage))
    return resources;

  return {
    ...resources,
  };
};
