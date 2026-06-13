require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/userModel');

mongoose.connect(process.env.MONGO_URI).then(async () => {
  try {
    await User.collection.dropIndex('mobile_1');
    console.log('Index mobile_1 dropped successfully');
  } catch(e) {
    console.log('Error dropping index:', e.message);
  }
  
  // Create indexes again based on schema
  try {
    await User.syncIndexes();
    console.log('Indexes synced');
  } catch(e) {
    console.log('Error syncing indexes:', e.message);
  }
  process.exit();
});
