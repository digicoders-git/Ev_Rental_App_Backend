const mongoose = require('mongoose');
require('dotenv').config();
const GlobalSetting = require('./models/globalSettingModel');

async function dumpSettings() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const settings = await GlobalSetting.find({});
        console.log(JSON.stringify(settings, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
dumpSettings();
