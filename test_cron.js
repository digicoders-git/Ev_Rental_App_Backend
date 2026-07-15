require('dotenv').config();
const connectDB = require('./config/db');
const { generateDailySettlements } = require('./utils/settlementCron');

async function test() {
    await connectDB();
    console.log("Running manual settlement trigger...");
    await generateDailySettlements();
    console.log("Done.");
    process.exit(0);
}

test();
