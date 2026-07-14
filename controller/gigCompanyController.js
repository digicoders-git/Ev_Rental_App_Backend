const GigCompany = require('../models/gigCompanyModel');

// @desc    Get all gig companies
// @route   GET /api/gig-companies
// @access  Public (for app registration)
const getGigCompanies = async (req, res) => {
    try {
        const companies = await GigCompany.find({ isActive: true }).sort({ name: 1 });
        res.status(200).json(companies);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get all gig companies (Admin - includes inactive)
// @route   GET /api/gig-companies/admin
// @access  Private/Admin
const getGigCompaniesAdmin = async (req, res) => {
    try {
        const companies = await GigCompany.find({}).sort({ name: 1 });
        res.status(200).json(companies);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Create new gig company
// @route   POST /api/gig-companies
// @access  Private/Admin
const createGigCompany = async (req, res) => {
    try {
        const { name, logo, isActive } = req.body;

        const companyExists = await GigCompany.findOne({ name });
        if (companyExists) {
            return res.status(400).json({ message: 'Company already exists' });
        }

        const company = await GigCompany.create({
            name,
            logo,
            isActive
        });

        res.status(201).json(company);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Update gig company
// @route   PUT /api/gig-companies/:id
// @access  Private/Admin
const updateGigCompany = async (req, res) => {
    try {
        const { name, logo, isActive } = req.body;
        const company = await GigCompany.findById(req.params.id);

        if (!company) {
            return res.status(404).json({ message: 'Company not found' });
        }

        company.name = name || company.name;
        company.logo = logo !== undefined ? logo : company.logo;
        company.isActive = isActive !== undefined ? isActive : company.isActive;

        const updatedCompany = await company.save();
        res.status(200).json(updatedCompany);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Delete gig company
// @route   DELETE /api/gig-companies/:id
// @access  Private/Admin
const deleteGigCompany = async (req, res) => {
    try {
        const company = await GigCompany.findById(req.params.id);

        if (!company) {
            return res.status(404).json({ message: 'Company not found' });
        }

        await company.deleteOne();
        res.status(200).json({ message: 'Company removed' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getGigCompanies,
    getGigCompaniesAdmin,
    createGigCompany,
    updateGigCompany,
    deleteGigCompany
};
