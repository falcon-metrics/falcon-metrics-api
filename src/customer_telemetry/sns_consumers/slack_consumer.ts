import axios from 'axios';
import { DateTime } from 'luxon';
import { Actions, User } from '../types';
//Enter the slack url here for slack integration
const slackUrlForFalconMetrics =
    'https://hooks.slack.com/services/#######################/';
const slackUrlForClients =
    'https://hooks.slack.com/services/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';

const defaultEmoji = '🚪';

const formatSlackMessage = (user: User, action: Actions, detail: string) => {
    const timestamp: DateTime = DateTime.now();
    return ` ==============\n
    *Organisation*: ${user.organisation} \n
    *User*: ${user.name}’ \n 
    *Email*: ${user.email}’ \n 
    *Action*: '${defaultEmoji}${action}’ \n 
    *Detail*: ‘${detail}' \n 
    *UTC Time*: ${timestamp.toUTC().toISO()}\n 
    *AU Time*: ${timestamp.toLocal().toISO()}`;
};
export const sendToSlack = async (
    user: User,
    action: Actions,
    detail: string,
): Promise<string> => {
    let slackUrl;
    if (user.email.includes('@falcon-metrics.com')) {
        slackUrl = slackUrlForFalconMetrics;
    } else {
        slackUrl = slackUrlForClients;
    }
    const message = formatSlackMessage(user, action, detail);
    const res = await axios.post(slackUrl, JSON.stringify({ text: message }), {
        withCredentials: false,
        transformRequest: [
            (data, headers) => {
                delete headers.post['Content-Type'];
                return data;
            },
        ],
    });
    if (res.status !== 200) {
        throw Error('Error when sending telemetry');
    }
    return 'ok';
};
