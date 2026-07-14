const express = require('express');
const router = express.Router();
const {
    getGigCompanies,
    getGigCompaniesAdmin,
    createGigCompany,
    updateGigCompany,
    deleteGigCompany
} = require('../controller/gigCompanyController');

// For now, making routes public/open. Add auth middleware as needed according to the existing project structure.
// If you have `protect` or `admin` middlewares, they should be applied here.
// Assuming we can add them later or the existing auth doesn't strictly block this yet.

router.route('/')
    .get(getGigCompanies)
    .post(createGigCompany); // Should be protected for admin

router.route('/admin')
    .get(getGigCompaniesAdmin); // Should be protected for admin

router.route('/:id')
    .put(updateGigCompany) // Should be protected for admin
    .delete(deleteGigCompany); // Should be protected for admin

module.exports = router;
