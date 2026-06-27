const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const RechargePlan = require('./models/rechargePlanModel');

mongoose.connect(process.env.MONGO_URI).then(async () => {
    console.log("Connected to MongoDB");

    const plans = [
        { days: "3 days", price: 720, status: "active" },
        { days: "7 days", price: 1610, status: "active" },
        { days: "14 days", price: 3200, status: "active" },
        { days: "28 days", price: 6400, status: "active" }
    ];

    // Clear existing to avoid duplicates if running multiple times
    await RechargePlan.deleteMany({});
    
    await RechargePlan.insertMany(plans);
    console.log("Plans inserted successfully!");
    
    process.exit(0);
}).catch(err => {
    console.error("Error connecting to MongoDB", err);
    process.exit(1);
});
