const fetch = require('node-fetch');

async function test() {
    const payload = {
        plan_name: "dailly", 
        pricing_type: "daily", 
        price: 299, 
        status: "active", 
        description: "best",
        features: ["bste"],
        late_fee_per_hour: 100,
        security_deposit: 0
    };

    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5ZmMzN2QwOTYzNmU3ZWMyODAwZjEyYiIsImlhdCI6MTc4MTUxMTgxOCwiZXhwIjoxNzg0MTAzODE4fQ.XhzVpLkkGfYKcj-_rlfpejFAZISCmRv8pNkvWAxNqpA';

    try {
        const response = await fetch('http://localhost:5000/api/plans', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        console.log("Status:", response.status);
        console.log("Response:", data);
    } catch (e) {
        console.log("Error:", e);
    }
}

test();
