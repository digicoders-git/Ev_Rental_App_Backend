require('dotenv').config();
const mongoose = require('mongoose');

// 1. MUST mock Razorpay BEFORE importing controllers that use it
const Razorpay = require('razorpay');
const OriginalRazorpay = Razorpay;
function MockRazorpay(options) {
    if (!options.key_id) throw new Error("key_id is mandatory");
    this.api = { key_id: options.key_id };
    this.orders = {
        create: function(payload) {
            console.log("\n📦 --- RAZORPAY ORDER CREATION INTERCEPTED ---");
            console.log(`🔑 Key ID Used: ${options.key_id}`);
            console.log(`📄 Payload Sent to Razorpay:`);
            console.log(JSON.stringify(payload, null, 2));
            console.log("----------------------------------------------\n");
            return Promise.resolve({ id: `order_mock_${Date.now()}` });
        }
    };
}
require.cache[require.resolve('razorpay')].exports = MockRazorpay;

// 2. Mock Notification to prevent errors
const sinon = require('sinon');
const notificationHelper = require('./utils/notificationHelper');
sinon.stub(notificationHelper, 'sendNotification').resolves();

// 3. Now import controllers
const User = require('./models/userModel');
const FranchiseStore = require('./models/franchiseStoreModel');
const Vehicle = require('./models/vehicleModel');
const RentalPlan = require('./models/planModel');
const GlobalSetting = require('./models/globalSettingModel');
const { createBooking } = require('./controller/bookingController');

async function testPaymentModes() {
    process.env.RAZORPAY_KEY_ID = "rzp_test_super_admin_key";
    process.env.RAZORPAY_KEY_SECRET = "super_admin_secret";

    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected successfully.\n");

        // 1. Setup Mock Franchise
        const franchiseId = `STORE-TEST-${Date.now()}`;
        const franchise = await FranchiseStore.create({
            store_id: franchiseId,
            store_name: "Test Payment Franchise",
            owner_name: "Test Owner",
            mobile: `9999${Math.floor(Math.random()*1000000)}`,
            email: `test${Date.now()}@ev.com`,
            address: "Test Address",
            city: "Test City",
            state: "Test State",
            password: "password123",
            payment_model: "direct", // In the old system, it was per-franchise. Now overridden by Global.
            franchise_share_percentage: 80,
            razorpay_linked_account_id: "acc_test_linked_account_123", // Used in Central Split
            razorpay_key_id: "rzp_test_franchise_direct_key", // Used in Direct
            razorpay_key_secret: "fake_secret_456"
        });
        console.log(`✅ Created Test Franchise (ID: ${franchise._id})`);

        // 2. Setup Vehicle for this Franchise
        const vehicle = await Vehicle.create({
            vehicle_name: "Test EV Bike",
            brand: "TestBrand",
            vehicle_type: "bike",
            registration_number: `TS-${Math.floor(Math.random() * 10000)}`,
            franchise: franchise._id,
            status: "active"
        });

        // 3. Setup Rental Plan
        const plan = await RentalPlan.create({
            plan_name: "Test Daily Plan",
            pricing_type: "daily",
            duration: 1,
            price: 500,
            security_deposit: 100,
            status: "active"
        });

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

        // 5. Mock Express Request/Response
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
            status: function(s) { this.statusCode = s; return this; },
            json: function(data) { 
                console.log(`[Response] Status: ${this.statusCode} | Data:`, JSON.stringify(data, null, 2));
            }
        };

        // --- TEST 1: CENTRAL COLLECTION MODE ---
        console.log("\n=======================================================");
        console.log("🛠️ TEST 1: CENTRAL COLLECTION MODE (Sab payment Super Admin ko)");
        console.log("=======================================================");
        await GlobalSetting.findOneAndUpdate(
            { key: 'global_payment_mode' },
            { value: 'central', description: 'Global Settlement Mode' },
            { upsert: true, new: true }
        );
        console.log("✅ Set Global Mode to 'central'");
        console.log("Expectation: Should use SUPER ADMIN keys (platform), and include Razorpay Route `transfers` payload to auto-payout to 'acc_test_linked_account_123'.");
        await createBooking(req, res);

        
        // Let's modify request dates slightly to avoid overlap error for Test 2
        req.body.start_date = new Date(Date.now() + 86400000 * 2).toISOString();
        req.body.end_date = new Date(Date.now() + 86400000 * 3).toISOString();

        // --- TEST 2: DIRECT SETTLEMENT MODE ---
        console.log("\n=======================================================");
        console.log("🛠️ TEST 2: DIRECT SETTLEMENT MODE (Payment seedha Franchise ko)");
        console.log("=======================================================");
        await GlobalSetting.findOneAndUpdate(
            { key: 'global_payment_mode' },
            { value: 'direct' },
            { upsert: true, new: true }
        );
        console.log("✅ Set Global Mode to 'direct'");
        console.log("Expectation: Should use FRANCHISE keys ('rzp_test_franchise_direct_key'), and have NO `transfers` payload.");
        await createBooking(req, res);

    } catch (e) {
        console.error("Test Error:", e);
    } finally {
        console.log("\nDisconnecting DB...");
        await mongoose.disconnect();
    }
}

testPaymentModes();
