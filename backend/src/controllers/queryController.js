const { generateExecutionPlan } = require('../services/orchestratorService');
const axios = require('axios'); // Remember to run: npm install axios

/**
 * Orchestrates the full query pipeline: 
 * 1. Analyzes user intent via LLM.
 * 2. Fetches rigorous computation results from the Python Execution Engine.
 * 3. Returns the synthesized payload.
 */
const processQuery = async (req, res) => {
    try {
        const { query, dataset_ref, target_schema, language = 'en' } = req.body;

        if (!query) {
            return res.status(400).json({ message: 'Query text is required' });
        }

        const mlPayload = await generateExecutionPlan(query, dataset_ref, target_schema, language);

        let pureMathData;
        try {
            const mathResponse = await axios.post('http://localhost:8000/compute', mlPayload);
            pureMathData = mathResponse.data;
        } catch (mathError) {
            if (mathError.code === 'ECONNREFUSED') {
                return res.status(503).json({ 
                    message: 'Execution Engine (Python) is currently down. Please try again later.' 
                });
            }
            throw mathError;
        }

        res.status(200).json(pureMathData);

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error processing query', error: error.message });
    }
};

module.exports = { processQuery };