const mongoose = require('mongoose');
require('dotenv').config();
const User = require('./models/userModel');
mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ev_rental').then(async () => {
    const users = await User.find({ fcm_token: { $exists: true, $ne: null } }).select('_id name role fcm_token');
    console.log(users);
    process.exit(0);
}).catch(console.error);
