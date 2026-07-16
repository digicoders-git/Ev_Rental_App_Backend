require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/userModel');
const Booking = require('./models/bookingModel');
const Vehicle = require('./models/vehicleModel');

async function testUsers() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB");

        const users = await User.find({ role: 'user' })
            .populate('referred_by', 'name driver_id mobile')
            .lean()
            .sort({ createdAt: -1 });
        
        console.log(`Found ${users.length} users`);

        const ongoingBookings = await Booking.find({ booking_status: { $in: ['ongoing', 'confirmed'] } })
            .populate('vehicle', 'registration_number vehicle_name')
            .lean();

        console.log(`Found ${ongoingBookings.length} ongoing/confirmed bookings`);
        
        const bookingsMap = {};
        ongoingBookings.forEach(b => {
            console.log(`Booking ID: ${b._id}, User: ${b.user}, Vehicle: ${b.vehicle}`);
            if (b.user && b.vehicle) {
                bookingsMap[b.user.toString()] = b.vehicle;
            }
        });

        const usersWithVehicle = users.map(u => {
            u.assigned_vehicle = bookingsMap[u._id.toString()] || null;
            return u;
        });

        const assignedUsers = usersWithVehicle.filter(u => u.assigned_vehicle);
        console.log(`Users with assigned vehicle: ${assignedUsers.length}`);
        if (assignedUsers.length > 0) {
            console.log(assignedUsers.map(u => ({ name: u.name, vehicle: u.assigned_vehicle.registration_number || u.assigned_vehicle.vehicle_name })));
        }

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
testUsers();
