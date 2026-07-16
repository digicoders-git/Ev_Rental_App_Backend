require('dotenv').config();
const mongoose = require('mongoose');
const Booking = require('./models/bookingModel');
const bookingController = require('./controller/bookingController');

async function testInstallments() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");

    // 1. Fetch any ongoing/confirmed booking
    let bookings = await Booking.find({
      booking_status: { $in: ['ongoing', 'confirmed'] },
    }).populate('user', 'name');

    if (bookings.length === 0) {
      console.log("No active bookings found in the database. Cannot run test.");
      process.exit(0);
    }

    let booking = bookings[0];
    
    // If it doesn't have installments, let's create a mock schedule
    if (!booking.payment_installments || booking.payment_installments.length === 0) {
      console.log(`Setting up mock installments for Booking ID: ${booking.booking_id}`);
      
      const now = new Date();
      // Week 1 (Due 7 days ago - Overdue)
      const week1Due = new Date(now);
      week1Due.setDate(now.getDate() - 7);
      
      // Week 2 (Due tomorrow - Pending)
      const week2Due = new Date(now);
      week2Due.setDate(now.getDate() + 1);
      
      // Week 3 (Due next week - Pending)
      const week3Due = new Date(now);
      week3Due.setDate(now.getDate() + 8);

      booking.payment_installments = [
        { installment_no: 1, amount: 2000, due_date: week1Due, status: 'overdue' },
        { installment_no: 2, amount: 2000, due_date: week2Due, status: 'pending' },
        { installment_no: 3, amount: 2000, due_date: week3Due, status: 'pending' }
      ];
      await booking.save();
    }

    console.log(`\nTesting Booking ID: ${booking.booking_id} (Rider: ${booking.user?.name})`);
    console.log("Current Installments:");
    booking.payment_installments.forEach(inst => {
      console.log(`- Week ${inst.installment_no}: ₹${inst.amount} Due: ${inst.due_date.toDateString()} Status: ${inst.status}`);
    });

    // 2. Test getting next installment (like the controller does)
    const now = new Date();
    booking.payment_installments.forEach(inst => {
      if (inst.status === 'pending' && new Date(inst.due_date) < now) {
        inst.status = 'overdue';
      }
    });
    const pending = booking.payment_installments
      .filter(i => i.status !== 'paid')
      .sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
    
    if (pending.length > 0) {
      console.log(`\nNext Upcoming/Overdue Installment: Week ${pending[0].installment_no} (Status: ${pending[0].status})`);
      
      // 3. Mock a request to pay this installment
      const req = {
        params: { id: booking._id, instId: pending[0]._id },
        body: { transaction_id: 'TXN_CURL_TEST' },
        user: { id: 'admin123', role: 'admin' }
      };
      
      const res = {
        status: function(code) {
          this.statusCode = code;
          return this;
        },
        json: function(data) {
          console.log(`\nResponse from payInstallment (Status ${this.statusCode}):`);
          console.log(JSON.stringify(data, null, 2));
        }
      };

      console.log("\nCalling bookingController.payInstallment()...");
      await bookingController.payInstallment(req, res);

      // 4. Verify in DB
      const updatedBooking = await Booking.findById(booking._id);
      const paidInst = updatedBooking.payment_installments.id(pending[0]._id);
      console.log(`\nVerification in DB:`);
      console.log(`Week ${paidInst.installment_no} Status: ${paidInst.status}`);
      if (paidInst.status === 'paid') {
          console.log("✅ test pass: The system successfully processed the weekly payment dynamically!");
      }

    } else {
      console.log("All installments are already paid!");
    }

    process.exit(0);
  } catch (error) {
    console.error("Test Error:", error);
    process.exit(1);
  }
}

testInstallments();
