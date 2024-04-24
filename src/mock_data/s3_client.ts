import aws from 'aws-sdk';
//this user only has getObject permission from this bucket
const MOCK_DATA_BUCKET = 'falcon-metrics-mock-data';

const initializeS3 = function () {
    return new aws.S3();
};

export const getDataByKey = async (key: string): Promise<string> => {
    const s3Client = initializeS3();
    const data = s3Client
        .getObject({
            Bucket: MOCK_DATA_BUCKET,
            Key: key,
        })
        .promise();
    return (await data).Body!.toString('utf-8');
};
