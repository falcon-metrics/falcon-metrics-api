import AWS from 'aws-sdk';
import { DatasourceId } from './Providers';

type Type = {
    provider: string;
    organisationId: string;
    namespace: string;
};

export default async function SecretsManager({
    provider,
    organisationId,
    namespace,
}: Type) {
    const id = await DatasourceId({
        provider,
        organisationId,
        namespace,
    });
    const secretsmanager = new AWS.SecretsManager();
    const SecretId = `datasource-secret/${organisationId}/${id}`;

    async function secret() {
        const secretValueObj = await secretsmanager
            .getSecretValue({ SecretId })
            .promise();

        if (!secretValueObj || !secretValueObj.SecretString || typeof secretValueObj.SecretString !== "string") {
            throw new Error("Secret manager does not contain a valid 'SecretString' property");
        }
        const obj = JSON.parse(secretValueObj.SecretString);
        const secret = obj['accessToken'];
        if (typeof secret !== "string") {
            throw new Error("Could not retrieve access token from AWS secret manager");
        }
        return secret;
    }

    function save(secret: string) {
        const SecretString = JSON.stringify({ accessToken: secret });
        return secretsmanager
            .createSecret({
                Name: SecretId,
                SecretString,
            })
            .promise()
            .catch(() =>
                secretsmanager
                    .putSecretValue({
                        SecretId,
                        SecretString,
                    })
                    .promise(),
            );
    }

    return {
        secretId: SecretId,
        secret,
        save,
    };
}
