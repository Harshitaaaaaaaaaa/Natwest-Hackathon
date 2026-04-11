const { generateExecutionPlan } = require('../services/orchestratorService');
const axios = require('axios'); // Remember to run: npm install axios

const processQuery = async (req, res) => {
    try {
        const { query } = req.body;

        if (!query) {
            return res.status(400).json({ message: 'Query text is required' });
        }

        console.log(`[1/3] Compiling query into Execution Plan...`);
        const mlPayload = await generateExecutionPlan(query);

        console.log(`[2/3] Sending Plan to Math Engine (Harshita)...`);
        // Use this when Harshita's server is running:
        // const mathResponse = await axios.post('http://localhost:8000/compute', mlPayload);
        // const pureMathData = mathResponse.data;
        
        // MOCK DATA for testing right now:
        const pureMathData = {
            "query_type": mlPayload.analytical_intent.query_type,
            "intent": mlPayload.analytical_intent.intent,
            "key_metrics": [
                { "name": "current_spending", "value": 118000, "unit": "INR" },
                { "name": "change_percentage", "value": 18, "unit": "%" }
            ],
            "diagnostics": {
                "causes": [
                    { "cause": "Food spending", "impact": "high", "change_pct": 25, "evidence": "Food category rose significantly" }
                ],
                "anomalies": []
            },
            "prediction": null,
            "comparison": {},
            "chart_data": []
        };

        console.log(`[3/3] Passing raw math directly to Frontend (Harsh).`);
        res.status(200).json(pureMathData);

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error processing query', error: error.message });
    }
};

module.exports = { processQuery };