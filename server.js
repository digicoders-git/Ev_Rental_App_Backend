const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const dotenv = require('dotenv');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const connectDB = require('./config/db');


// Load environment variables
dotenv.config();

// Connect to Database
connectDB();

// Start installment reminder scheduler
const { startInstallmentScheduler } = require('./utils/installmentScheduler');
startInstallmentScheduler();

// Start settlement cron
const { startSettlementCron } = require('./utils/settlementCron');
startSettlementCron();


const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// Store io instance globally so controllers can emit
app.set('io', io);

// Socket.IO connection handler
io.on('connection', (socket) => {
    // Customer joins their own room using userId
    socket.on('join', (userId) => {
        socket.join(userId);
        console.log(`User ${userId} joined socket room`);
    });

    socket.on('disconnect', () => {
        console.log('Socket disconnected:', socket.id);
    });
});

// Middleware
app.use(express.json());

// CORS — allow Vercel frontend + localhost dev
const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://ev-rental-app-admin-panel.vercel.app/login',
    /^https:\/\/.*\.vercel\.app$/,   // any Vercel preview/prod URL
];
app.use(cors({
    origin: (origin, callback) => {
        // allow requests with no origin (mobile apps, Postman, curl)
        if (!origin) return callback(null, true);
        const isAllowed =
            allowedOrigins.some(o =>
                typeof o === 'string' ? o === origin : o.test(origin)
            );
        if (isAllowed) return callback(null, true);
        return callback(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(morgan('dev'));

// Static folder for uploads
app.use('/uploads', express.static(path.resolve(__dirname, 'uploads')));

// Basic route
app.get('/', (req, res) => {
    res.json({ message: 'Welcome to EV Rental API' });
});

// Routes
console.log('Registering Category Routes...');
app.use('/api/v-categories', require('./routes/categoryRoutes'));
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
app.use('/api/wallet', require('./routes/walletRoutes'));
app.use('/api/recharge-plans', require('./routes/rechargePlanRoutes'));
app.use('/api/damage-reports', require('./routes/damageReportRoutes'));
app.use('/api/invoices', require('./routes/invoiceRoutes'));
app.use('/api/settlements', require('./routes/settlementRoutes'));
app.use('/api/gig-companies', require('./routes/gigCompanyRoutes'));
app.use('/api', require('./routes/testRoutes'));








// Port
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
