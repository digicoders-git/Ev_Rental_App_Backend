require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/userModel');

mongoose.connect(process.env.MONGO_URI).then(async () => {
  // 1. Clean up duplicate empty string or null values for aadharNumber
  try {
    const result = await User.updateMany(
      { 
        $or: [ 
          { aadharNumber: "" }, 
          { aadharNumber: null } 
        ] 
      }, 
      { $unset: { aadharNumber: 1 } }
    );
    console.log(`Cleaned up ${result.modifiedCount} user documents by unsetting aadharNumber.`);
  } catch(e) {
    console.log('Error cleaning up aadharNumber field:', e.message);
  }

  // 2. Drop the index aadharNumber_1 to clear duplicate constraints
  try {
    await User.collection.dropIndex('aadharNumber_1');
    console.log('Index aadharNumber_1 dropped successfully');
  } catch(e) {
    console.log('Error dropping index aadharNumber_1:', e.message);
  }

  // 3. Drop mobile_1 just in case
  try {
    await User.collection.dropIndex('mobile_1');
    console.log('Index mobile_1 dropped successfully');
  } catch(e) {
    console.log('Error dropping index mobile_1:', e.message);
  }
  
  // 4. Create indexes again based on the updated schema
  try {
    await User.syncIndexes();
    console.log('Indexes synced successfully');
  } catch(e) {
    console.log('Error syncing indexes:', e.message);
  }
  process.exit();
});
