const admin = require('./firebaseAdmin');

/**
 * Send FCM push notification to a single device token
 * @param {string} fcmToken  - user's device FCM token
 * @param {string} title     - notification title
 * @param {string} body      - notification body
 * @param {object} data      - optional key-value payload (can include image_url)
 */
const sendPushNotification = async (fcmToken, title, body, data = {}) => {
    if (!fcmToken) return;

    // Extract image_url from data if present
    const imageUrl = data.image_url || null;

    // Build clean string-only data payload (FCM requires all values to be strings)
    const cleanData = Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v)])
    );

    try {
        const message = {
            token: fcmToken,
            notification: {
                title,
                body,
                ...(imageUrl ? { imageUrl } : {}),  // ← top-level image for FCM
            },
            data: cleanData,
            android: {
                priority: 'high',
                notification: {
                    sound: 'default',
                    channelId: 'high_importance_channel',
                    ...(imageUrl ? { imageUrl } : {}),  // ← Android big picture style
                },
            },
            apns: {
                payload: { aps: { sound: 'default', badge: 1 } },
                ...(imageUrl ? {
                    fcmOptions: { imageUrl },              // ← iOS image
                } : {}),
            },
        };

        await admin.messaging().send(message);
    } catch (err) {
        // Token expired / invalid — silently log
        console.error(`FCM send failed [${fcmToken?.slice(0, 20)}...]: ${err.message}`);
    }
};

module.exports = { sendPushNotification };

