const express = require('express');
const router = express.Router();
const { getUserProfile } = require('../controllers/userController');

// Map the POST request to the controller function
router.post('/', getUserProfile);

module.exports = router;