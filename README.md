# Introduction

The main reasons for having an api-based architecture are:

* To ensure that access to this data is secure and only accessible to appropriate users;
* To ensure partitioning between organisations is enforced.

Use these reasons when deciding what functionality should reside behind the **api-wall**, and what can be dealt with by the clients of the apis. For example, statistical calculations and data extractions from the data sources should be placed behind the api-wall

# Api scheme notes

API architecture is based on the Serverless Framework with Node.js running in AWS.

Thanks to the Offline plugin for Serverless (and other related plugins) we can deploy the API services locally so we should rarely have the need to spin off sandboxes in AWS to test.

# Database functions
Many metrics are directly calculated at the DB level to enable faster processing.
The DB functions required for the same are present in the database folder.
Please make sure to run those commands to create the db functions if not present.

## Dev env setup

- Clone Repo
- (optional) Install Node Version Manager
- (optional) Install Serverless globally on your machine
  - `npm install -g serverless`
  - As an alternative, the api project will also have serverless installed, and it's more likely to be up to date. To execute just use `./node_modules/.bin/serverless`.
- Install Node Packages
  - `npm install`
- Run local instance of API service
  - `npm run offline`
- Running in windows
  There is a `dev-windows` script, which uses an alternative to linux's env to set the env variables from the .env file. The alternative is called [env-cmd](https://github.com/toddbluhm/env-cmd). To install it, just run `npm install -g env-cmd`. 

> :bulb: **NOTE:** This will pickup local lambda function changes without needing a restart. Occasionally you should restart `npm run offline` for memory reasons.

> :warning: **BUG:** There is a bug in Serverless Offline when the JWT token contains multiple `aud` values (https://github.com/dherault/serverless-offline/pull/1070) until this is fixed you can either checkout the patched version and follow the instructions in `CONTRIBUTING.md` or start the API without authentication by running `env DISABLE_AUTH=1 npm run offline`


### Create AWS Lambda sandbox
`STAGE=<NAME> npm run deploy`

When naming your AWS Lambda env, please include your name
For example

`STAGE=jsoap-dev npm run deploy`


> :bulb: **NOTE:** if you dont specify stage it will default to 'dev'
> :bulb: **NOTE:** Please keep AWS clean and remove your dev sandbox once you're done. You can always spin up a new sandbox quickly next time you need it.

[AWS Console - Application List](https://ap-southeast-2.console.aws.amazon.com/lambda/home?region=ap-southeast-2#/applications)


### AWS Lambda Logs

AWS Lambda function logs are available in CloudWatch.
https://ap-southeast-2.console.aws.amazon.com/cloudwatch/home?region=ap-southeast-2#logs:

`STAGE=<STAGE_NAME> serverless logs -f <FUNCTION_NAME>`


### Remove AWS Lambda environment
> :warning: **WARNING:** If you create a new environment, please remove it when you no longer need it.

`STAGE=<NAME> sls remove`

- This will remove the s3 bucket that we created for the Lambda stack for this environment / stage.
- This will **NOT** remove DynamoDB tables. You need to do this manually via the AWS console


## Build Pipeline

[GitLab CI](https://gitlab.com)


## Versioning

Api versioning should be indicated in the path: `<baseurl>/V1/<rest of api call>`

If no version is included in the path, then latest version is to be assumed.

## Available Scripts

### npm deploy
> :warning: **WARNING: This will deploy to PROD!**

This will deploy to AWS based on [serverless.yml](./serverless.yml) config. Usually we would manage deployment to Prod environment via GitLab CI. GitLab will then setup API Version env vars

### npm test

Launches the test runner in the interactive watch mode.<br />
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### npm run format
This will execute eslint and re-format code according to the lint rules.

## References
* [Microsoft rest guidelines](https://docs.microsoft.com/en-us/azure/architecture/best-practices/api-design "Microsoft guidelines") 

## Points to note
- The application is tightly coupled with certain integration eg: Auth0 for auhentication.
- We have added example configs and helpful comments wherever applicable.
- When you choose to create you accounts in these integrations , you need to replace the example configs in this repo wherever applicable.

### Auth0
- Refer /src/common/dependency_injection.ts - to see what claims the app checks from auth0 jwt
- src/common/security.ts -  to see the role names to set in auth0
- src/datasources/jwtToUser.ts - to also see role name and claim names
- src/signup/handler.ts - Change the default role id , retrieve it from auth0 based on your needs. ( this is the default role assigned on sign up)

### Contact us
- Contact us email should be edited here  - src/contact_us/handler.ts

### Datadog
- Datadog is used to capture user telemetry data.It can be setup here
- src/customer_telemetry/sns_consumers/datadog_consumer.ts

### Slack
- There are certain slack integrations available as well. They can be configured here
- src/customer_telemetry/sns_consumers/slack_consumer.ts

### Logo
- We allow different tenants to store their own logo so that the UI can display the same on the app.
- It is stored in s3 bucket , which can be configured here.
- The same bucker needs to be configured on the front end code for it to take effect.
- Bucket name -  falcon-metrics-settings-logo-storage
- Can be configured here - src/organization-settings/handleSettings.ts

### Demo organisation
- There is some code to avoid and specially handle demo organisation.( where mock data to test the platform can be setup)
- Currently the orgId for the same - falcon-metrics-demo

### Hubspot
- There is a basic hubspot integration on sign up.
- src/hubspot/Hubspot.ts

### Serverless
- The serverless.yml file creates all the api gateways and the lambdas.
- It requires specific configurations related to the AWS instance where the app is meant to be deployed.
- There are helpful comments to replace the examples that are added.

### Mailchimp
- There is mailchimp integration setup to send emails.
- src/contact_us/MailChimpSecret.ts
### Support email : support@falcon-metrics.com
### Owner email : owner@falcon-metrics.com
