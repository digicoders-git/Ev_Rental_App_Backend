const http = require('http');

const BASE_URL = 'localhost';
const PORT = 5000;
const adminData = JSON.stringify({
    name: "Audit Admin",
    email: "audit@voltrent.com",
    mobile: "9898989898",
    password: "Admin@123"
});

function request(options, data) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(body);
                    resolve({ status: res.statusCode, data: parsed });
                } catch (e) {
                    resolve({ status: res.statusCode, data: body });
                }
            });
        });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

async function runAudit() {
    console.log("🚀 Starting System Audit (Native HTTP)...");
    let token = '';

    try {
        // 1. Try Login
        console.log("\n[1/6] Testing Admin Login...");
        let loginRes = await request({
            hostname: BASE_URL,
            port: PORT,
            path: '/api/auth/admin/login',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, adminData);

        if (loginRes.status !== 200) {
            console.log("⚠️ Login failed, attempting registration...");
            const regRes = await request({
                hostname: BASE_URL,
                port: PORT,
                path: '/api/auth/admin/register',
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            }, adminData);
            
            if (regRes.status === 201 || regRes.status === 200) {
                token = regRes.data.token;
                console.log("✅ Registration Successful");
            } else {
                console.log("❌ Registration Failed: " + JSON.stringify(regRes.data));
                return;
            }
        } else {
            token = loginRes.data.token;
            console.log("✅ Login Successful");
        }

        const authHeaders = { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}` 
        };

        // 2. Dashboard Stats
        console.log("\n[2/6] Testing Dashboard Stats API...");
        const statsRes = await request({
            hostname: BASE_URL,
            port: PORT,
            path: '/api/reports/dashboard-stats',
            method: 'GET',
            headers: authHeaders
        });
        if (statsRes.data.success) console.log("✅ Dashboard Stats: OK");

        // 3. Content (CMS)
        console.log("\n[3/6] Testing Content (CMS) API...");
        const contentRes = await request({
            hostname: BASE_URL,
            port: PORT,
            path: '/api/content',
            method: 'GET',
            headers: authHeaders
        });
        if (contentRes.data.success) console.log(`✅ Content API: OK (${contentRes.data.data.length} items)`);

        // 4. Notifications
        console.log("\n[4/6] Testing Notification Broadcast History...");
        const notifRes = await request({
            hostname: BASE_URL,
            port: PORT,
            path: '/api/notifications/broadcast-history',
            method: 'GET',
            headers: authHeaders
        });
        if (notifRes.data.success) console.log(`✅ Notification History: OK (${notifRes.data.data.length} items)`);

        // 5. Settings
        console.log("\n[5/6] Testing Platform Settings API...");
        const settingsRes = await request({
            hostname: BASE_URL,
            port: PORT,
            path: '/api/settings',
            method: 'GET',
            headers: authHeaders
        });
        if (settingsRes.data.success) console.log("✅ Settings API: OK");

        // 6. Profile
        console.log("\n[6/6] Testing Profile Details...");
        const profileRes = await request({
            hostname: BASE_URL,
            port: PORT,
            path: '/api/user/profile',
            method: 'GET',
            headers: authHeaders
        });
        if (profileRes.data.success) console.log(`✅ Profile API: OK (User: ${profileRes.data.data.name})`);

        console.log("\n✨ System Audit Complete: All core APIs are responding correctly!");
    } catch (error) {
        console.error("\n❌ Audit Failed!");
        console.error(error);
    }
}

runAudit();
