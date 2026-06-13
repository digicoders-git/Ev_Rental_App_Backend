require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/userModel');
const KYC = require('./models/kycModel');

async function check() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to DB");
  
  const users = await User.find({});
  console.log(`Total users: ${users.length}`);
  
  const kycs = await KYC.find({});
  console.log(`Total KYCs: ${kycs.length}`);
  
  for (const kyc of kycs) {
    const user = users.find(u => u._id.toString() === kyc.user.toString());
    console.log(`KYC: ${kyc._id}, User: ${kyc.user}, Phone: ${user ? user.mobile : 'UNKNOWN'}, Status: ${kyc.status}`);
  }
  
  process.exit(0);
}

check().catch(console.error);
