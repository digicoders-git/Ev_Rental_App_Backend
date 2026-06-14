const mongoose = require('mongoose');
require('dotenv').config();
const User = require('./models/userModel');
const { sendPushNotification } = require('./utils/fcmHelper');

const testNotification = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);

        console.log("Connected to DB, finding admins with FCM tokens...");
        const admins = await User.find({ role: 'admin', fcm_token: { $exists: true, $ne: '' } });
        
        if (admins.length === 0) {
            console.log("No admin found with an FCM token. Make sure you are logged into the admin panel and granted notification permissions.");
            process.exit(0);
        }

        for (const admin of admins) {
            console.log(`Sending notification to admin: ${admin.email} (token: ${admin.fcm_token.substring(0, 20)}...)`);
            await sendPushNotification(admin.fcm_token, "Test Push Notification", "This is a direct push notification from the backend to test FCM!", {
                type: "test",
                message: "Hello Admin!"
            });
            console.log("Notification sent to Firebase.");
        }
        
        // Wait a bit for the async FCM to finish
        setTimeout(() => {
            process.exit(0);
        }, 2000);
    } catch (err) {
        console.error("Error:", err);
        process.exit(1);
    }
};

testNotification();
