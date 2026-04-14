const express = require('express');
const { engineJsonRequest } = require('../utils/engineClient');
const router = express.Router();

// @route   POST /api/dataset/profile
// @desc    Proxies schema profiling request to Python execution engine
router.post('/profile', async (req, res) => {
    try {
        const { dataset_ref } = req.body;
        if (!dataset_ref) {
            return res.status(400).json({ error: 'dataset_ref is required' });
        }

        const { data } = await engineJsonRequest('/analyze_schema', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ dataset_ref }),
        });

        res.status(200).json(data);
    } catch (error) {
        console.error('Dataset Profile Proxy Error:', error.details || error.message);
        res.status(error.status === 400 ? 400 : 503).json({
            error: 'Failed to profile dataset',
            details: error.details || error.message
        });
    }
});

module.exports = router;
