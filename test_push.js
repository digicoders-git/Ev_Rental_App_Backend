const mongoose = require('mongoose');
require('dotenv').config();
const User = require('./models/userModel');
const { sendPushNotification } = require('./utils/fcmHelper');

mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ev_rental').then(async () => {
    console.log('Connected to DB');
    const users = await User.find({ role: 'user', fcm_token: { $exists: true, $ne: null } }).select('_id fcm_token');
    
    const uniqueTokens = [...new Set(users.map(u => u.fcm_token).filter(Boolean))];
    console.log('Found ' + uniqueTokens.length + ' unique FCM tokens.');

    let successCount = 0;
    for (const token of uniqueTokens) {
        try {
            await sendPushNotification(token, 'Test Push', 'This is a test notification from Antigravity!', { type: 'broadcast' });
            successCount++;
        } catch(e) {
            console.error(e);
        }
    }
    console.log('Successfully sent ' + successCount + ' push notifications.');
    process.exit(0);
}).catch(console.error);
