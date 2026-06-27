const fetch = require('node-fetch');

async function test() {
    try {
        const response = await fetch('http://localhost:5000/api/recharge-plans');
        const data = await response.json();
        console.log("Status:", response.status);
        console.log("Response:", JSON.stringify(data, null, 2));
    } catch (e) {
        console.log("Error:", e);
    }
}

test();
