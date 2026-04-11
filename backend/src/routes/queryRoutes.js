const express = require('express');

const router = express.Router();
const { processQuery } = require('../controllers/queryController');

router.post('/', processQuery);

module.exports = router;
