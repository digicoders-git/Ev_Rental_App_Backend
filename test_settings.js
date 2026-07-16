const mongoose = require('mongoose');
require('dotenv').config();

const globalSettingSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
    description: { type: String }
}, { timestamps: true });

const GlobalSetting = mongoose.model('GlobalSetting', globalSettingSchema);

async function testSave() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const settings = {
            security_deposit: "1000",
            late_fee_per_day: "100",
            gst_percentage: "2",
            service_fee: "40"
        };
        const promises = Object.keys(settings).map(key => {
            return GlobalSetting.findOneAndUpdate(
                { key },
                { key, value: settings[key] },
                { upsert: true, new: true }
            );
        });
        await Promise.all(promises);
        console.log("Success!");
        process.exit(0);
    } catch (err) {
        console.error("Error:", err);
        process.exit(1);
    }
}
testSave();
