const admin = require('./firebaseAdmin');

/**
 * Send FCM push notification to a single device token
 * @param {string} fcmToken  - user's device FCM token
 * @param {string} title     - notification title
 * @param {string} body      - notification body
 * @param {object} data      - optional key-value payload
 */
const sendPushNotification = async (fcmToken, title, body, data = {}) => {
    if (!fcmToken) return;
    try {
        await admin.messaging().send({
            token: fcmToken,
            notification: { title, body },
            data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
            android: { priority: 'high', notification: { sound: 'default', channelId: 'ev_rental_payments' } },
            apns: { payload: { aps: { sound: 'default', badge: 1 } } },
        });
    } catch (err) {
        // Token expired / invalid — silently log
        console.error(`FCM send failed [${fcmToken?.slice(0, 20)}...]: ${err.message}`);
    }
};

module.exports = { sendPushNotification };
