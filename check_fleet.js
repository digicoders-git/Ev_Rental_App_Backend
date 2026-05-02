const mongoose = require('mongoose');
const Booking = require('./models/bookingModel');
const Vehicle = require('./models/vehicleModel');

async function checkStats() {
    try {
        await mongoose.connect('mongodb+srv://digicodersdevelopment_db_user:KoJGvdKsGU9IQQvk@cluster0.9ssqshr.mongodb.net/EV_RentalApp?retryWrites=true&w=majority');
        const vehicles = await Vehicle.find();
        const ongoingBookings = await Booking.find({ booking_status: { $in: ['confirmed', 'ongoing'] } });
        
        console.log('--- ALL VEHICLES ---');
        vehicles.forEach(v => {
            console.log(`ID: ${v._id}, Name: ${v.vehicle_name}, Status: ${v.status}, Reg: ${v.registration_number}`);
        });

        console.log('\n--- ONGOING/CONFIRMED BOOKINGS ---');
        ongoingBookings.forEach(b => {
            console.log(`BookingID: ${b.booking_id}, VehicleID: ${b.vehicle}, Status: ${b.booking_status}`);
        });

        const busyVehicleIds = ongoingBookings.map(b => b.vehicle?.toString());
        const available = vehicles.filter(v => v.status === 'active' && !busyVehicleIds.includes(v._id.toString()));
        
        console.log('\n--- CALCULATION ---');
        console.log('Total Vehicles:', vehicles.length);
        console.log('Active Status Vehicles:', vehicles.filter(v => v.status === 'active').length);
        console.log('Busy Vehicles (In Bookings):', busyVehicleIds.length);
        console.log('Available Count (Calculated):', available.length);

    } catch (err) {
        console.error(err);
    } finally {
        mongoose.disconnect();
    }
}

checkStats();
