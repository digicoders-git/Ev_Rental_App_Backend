const mongoose = require('mongoose');
const dotenv = require('dotenv');
const FranchiseStore = require('../models/franchiseStoreModel'); // Adjust path if needed

// Load env vars
dotenv.config({ path: './.env' }); // Make sure path to .env is correct

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected...');
    } catch (err) {
        console.error(err.message);
        process.exit(1);
    }
};

const migrateFranchiseIds = async () => {
    try {
        await connectDB();

        // Get all franchises sorted by createdAt
        const franchises = await FranchiseStore.find().sort({ createdAt: 1 });

        console.log(`Found ${franchises.length} total franchises.`);

        let counter = 1;
        for (const franchise of franchises) {
            // Only update if franchise_id is not already set
            if (!franchise.franchise_id) {
                const newId = `FRN${String(counter).padStart(3, '0')}`;
                franchise.franchise_id = newId;
                await franchise.save();
                console.log(`Updated Franchise ${franchise.store_name} with ID: ${newId}`);
                counter++;
            } else {
                console.log(`Franchise ${franchise.store_name} already has ID: ${franchise.franchise_id}. Skipping.`);
                
                // Keep counter synced with existing IDs if they are sequential
                const match = franchise.franchise_id.match(/^FRN(\d+)$/);
                if (match) {
                    const num = parseInt(match[1], 10);
                    if (num >= counter) {
                        counter = num + 1;
                    }
                }
            }
        }

        console.log('Migration Completed Successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
};

migrateFranchiseIds();
