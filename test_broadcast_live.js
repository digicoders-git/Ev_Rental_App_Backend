const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const FormData = require('form-data');
require('dotenv').config();
const User = require('./models/userModel');

async function run() {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ev_rental');
    
    const admin = await User.findOne({ role: 'admin' });
    const token = jwt.sign({ id: admin._id, role: admin.role }, process.env.JWT_SECRET || 'ev_rental_secret_key', { expiresIn: '1d' });

    console.log('Using Admin Token: ' + token.substring(0, 15) + '...');

    const form = new FormData();
    form.append('title', 'Final Backend Test');
    form.append('message', 'This is a broadcast test directly from the live backend after fixing the token issue!');

    try {
        const res = await axios.post('http://localhost:5002/api/notifications/broadcast', form, {
            headers: {
                'Authorization': `Bearer ${token}`,
                ...form.getHeaders()
            }
        });
        console.log('API Response:', res.data);
    } catch (err) {
        console.error('API Error:', err.response ? err.response.data : err.message);
    }
    
    process.exit(0);
}

run().catch(console.error);
