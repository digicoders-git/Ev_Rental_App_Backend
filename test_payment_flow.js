require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/userModel');
const FranchiseStore = require('./models/franchiseStoreModel');
const Vehicle = require('./models/vehicleModel');
const RentalPlan = require('./models/planModel');
const { createBooking } = require('./controller/bookingController');

async function testPaymentFlow() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected successfully.\n");

        // 1. Setup Mock Franchise
        const franchiseId = `STORE-TEST-${Date.now()}`;
        const franchise = await FranchiseStore.create({
            store_id: franchiseId,
            store_name: "Test Direct Franchise",
            owner_name: "Test Owner",
            mobile: `9999${Math.floor(Math.random()*1000000)}`,
            email: `test${Date.now()}@ev.com`,
            address: "Test Address",
            city: "Test City",
            state: "Test State",
            password: "password123",
            payment_model: "direct", // <--- Testing Direct Model
            razorpay_key_id: "rzp_test_fake_franchise_key_123", // Fake key
            razorpay_key_secret: "fake_secret_456"
        });
        console.log("✅ Created Test Franchise with Direct Payment Model.");

        // 2. Setup Vehicle for this Franchise
        const vehicle = await Vehicle.create({
            vehicle_name: "Test EV Bike",
            brand: "TestBrand",
            vehicle_type: "bike",
            registration_number: `TS-${Math.floor(Math.random() * 10000)}`,
            franchise: franchise._id,
            status: "active"
        });
        console.log("✅ Created Test Vehicle linked to Franchise.");

        // 3. Setup Rental Plan
        const plan = await RentalPlan.create({
            plan_name: "Test Daily Plan",
            pricing_type: "daily",
            duration: 1,
            price: 500,
            security_deposit: 100,
            status: "active"
        });
        console.log("✅ Created Test Rental Plan.");

        // 4. Setup User
        const user = await User.create({
            name: "Test Rider",
            mobile: `8888${Math.floor(Math.random()*1000000)}`,
            email: `rider${Date.now()}@test.com`,
            password: "password"
        });
        const KYC = require('./models/kycModel');
        await KYC.create({ 
            user: user._id, 
            status: 'approved',
            name: user.name,
            mobileNumber: user.mobile,
            aadharFront: "dummy.jpg",
            aadharBack: "dummy.jpg",
            panCard: "dummy.jpg",
            selfie: "dummy.jpg"
        });
        console.log("✅ Created Test User (Rider) with Approved KYC.\n");

        // 5. Mock Express Request/Response to hit the Controller
        const req = {
            user: { id: user._id.toString() },
            body: {
                vehicle: vehicle._id.toString(),
                plan: plan._id.toString(),
                start_date: new Date().toISOString(),
                end_date: new Date(Date.now() + 86400000).toISOString(),
                payment_method: "online"
            }
        };

        const res = {
            status: function(s) { 
                this.statusCode = s; 
                return this; 
            },
            json: function(data) { 
                console.log("============== API RESPONSE ==============");
                console.log(`Status Code: ${this.statusCode}`);
                console.log(JSON.stringify(data, null, 2));
                console.log("==========================================");
            }
        };

        console.log("🚀 Testing createBooking API...");
        console.log("Expectation: It should try to use 'rzp_test_fake_franchise_key_123' and throw an authentication error from Razorpay since the key is fake. This PROVES the direct gateway routing is working.\n");
        
        await createBooking(req, res);

    } catch (e) {
        console.error("Test Error:", e);
    } finally {
        console.log("\nDisconnecting DB...");
        await mongoose.disconnect();
    }
}

testPaymentFlow();
