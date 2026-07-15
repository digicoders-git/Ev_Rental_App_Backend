const axios = require('axios');
async function test() {
    try {
        const res = await axios.put('http://localhost:5000/api/support/admin/ticket/60d21b4667d0d8992e610c85', { status: 'in-progress' });
        console.log(res.data);
    } catch (e) {
        console.log("Error:", e.response ? e.response.status + " " + JSON.stringify(e.response.data) : e.message);
    }
}
test();
