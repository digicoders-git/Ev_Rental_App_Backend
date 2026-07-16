require('dotenv').config();
const mongoose = require('mongoose');
const Booking = require('./models/bookingModel');

async function testVehicleIds() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const bookings = await Booking.find({ booking_status: { $in: ['ongoing', 'confirmed'] } }).lean();
        
        console.log(`Found ${bookings.length} ongoing/confirmed bookings.`);
        bookings.forEach(b => {
            console.log(`Booking ${b._id}: Vehicle ID in DB is ${b.vehicle}`);
        });

        // Pick the first booking and assign it a VALID vehicle ID
        const Vehicle = require('./models/vehicleModel');
        const validVehicle = await Vehicle.findOne({ status: 'active' });
        if (validVehicle && bookings.length > 0) {
            await Booking.findByIdAndUpdate(bookings[0]._id, { vehicle: validVehicle._id });
            console.log(`Assigned valid vehicle ${validVehicle.registration_number} to Booking ${bookings[0]._id}`);
        }

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
testVehicleIds();
