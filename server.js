const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const connectDB = require('./config/db');


// Load environment variables
dotenv.config();

// Connect to Database
connectDB();


const app = express();

// Middleware
app.use(express.json());
app.use(cors());
app.use(morgan('dev'));

// Static folder for uploads
app.use('/uploads', express.static(path.resolve(__dirname, 'uploads')));

// Basic route
app.get('/', (req, res) => {
    res.json({ message: 'Welcome to EV Rental API' });
});

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/user', require('./routes/userRoutes'));
app.use('/api/vehicles', require('./routes/vehicleRoutes'));
app.use('/api/offers', require('./routes/offerRoutes'));
app.use('/api/franchise-enquiry', require('./routes/franchiseRoutes'));
app.use('/api/plans', require('./routes/planRoutes'));
app.use('/api/bookings', require('./routes/bookingRoutes'));
app.use('/api/kyc', require('./routes/kycRoutes'));
app.use('/api/tracking', require('./routes/trackingRoutes'));
app.use('/api/support', require('./routes/supportRoutes'));
app.use('/api/reviews', require('./routes/reviewRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/reports', require('./routes/reportRoutes'));
app.use('/api/content', require('./routes/contentRoutes'));
app.use('/api/documents', require('./routes/documentRoutes'));
app.use('/api/settings', require('./routes/settingRoutes'));
app.use('/api', require('./routes/testRoutes'));








// Port
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
