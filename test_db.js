
const mongoose = require('mongoose');
require('dotenv').config();
mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ev_rental_dev');
require('./models/vehicleModel');
const Booking = require('./models/bookingModel');

async function check() {
  const targetBookingId = '6a5c770cac08b07bfdf3de68';
  let b;
  try {
    b = await Booking.findById(targetBookingId).populate('vehicle');
  } catch(e) {
    b = await Booking.findOne().sort({ createdAt: -1 }).populate('vehicle');
  }
  
  if(!b) { console.log('No booking found'); process.exit(0); }
  console.log('Target Booking:', b._id, 'Status:', b.booking_status);
  console.log('Vehicle:', b.vehicle ? b.vehicle._id : 'null');
  console.log('Start:', b.start_date, 'End:', b.end_date);
  
  if(b.vehicle) {
    const overlaps = await Booking.find({
        _id: { $ne: b._id },
        vehicle: b.vehicle._id,
        booking_status: { $in: ['confirmed', 'ongoing'] }
    });
    console.log('Other confirmed/ongoing bookings for this vehicle:', overlaps.length);
    overlaps.forEach(o => {
      console.log('   ID:', o._id, 'Start:', o.start_date, 'End:', o.end_date);
      // exact logic check
      const overlapsLogic = (o.start_date < b.end_date && o.end_date > b.start_date);
      console.log('   -> Overlaps with target? ', overlapsLogic);
    });
  }
  process.exit(0);
}
check();

