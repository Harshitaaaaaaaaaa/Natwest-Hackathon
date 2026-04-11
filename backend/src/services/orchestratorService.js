const Groq = require('groq-sdk');

const COMPILER_SYSTEM_PROMPT = `
You are the Orchestration Compiler for an analytical data engine.
Your ONLY job is to translate natural language queries into a strict, deterministic JSON Execution Plan.
You do NOT calculate answers. You do NOT invent data.

Available Dataset Context:
- Dataset: "user_transactions.csv"
- Metrics: "amount"
- Dates: "transaction_date"
- Dimensions: ["category", "merchant", "payment_mode"]
- Current Date: "2026-04-11"

JSON Schema Requirements:
You must output a JSON object with EXACTLY these top-level keys:
1. "metadata" (include instruction_id and timestamp)
2. "context" (include the original user_query)
3. "analytical_intent" (query_type MUST be one of: descriptive, diagnostic, comparative, predictive, anomaly_detection, segmentation)
4. "data_blueprint" (include schema_mapping, analysis_focus array, execution_scope with filters and time_frames)
5. "computation_tasks" (boolean flags: run_aggregations, run_variance_analysis, run_anomaly_detection, run_forecasting, run_segmentation)
6. "visualization_requirements" (boolean flags: include_time_series, include_category_breakdown, include_comparison, include_forecast)
7. "output_contract" (boolean flags: include_summary_levels, include_key_metrics, include_trend, include_breakdown, include_diagnostics, include_prediction, include_comparison, include_chart_data, include_recommendations)

Rules:
- Resolve relative timeframes (e.g., "last month") into explicit YYYY-MM-DD "start" and "end" dates in the time_frames.current block.
- Set computation_tasks and output_contract flags to true ONLY if required by the query type.
- Return ONLY valid JSON.
`;

const generateExecutionPlan = async (userText) => {
    try {
        if (!process.env.GROQ_API_KEY) {
            throw new Error('GROQ_API_KEY is not set');
        }

        const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

        const response = await groq.chat.completions.create({
            messages: [
                { role: 'system', content: COMPILER_SYSTEM_PROMPT },
                { role: 'user', content: userText }
            ],
            model: 'llama-3.3-70b-versatile',
            response_format: { type: 'json_object' },
            temperature: 0.1
        });

        return JSON.parse(response.choices[0].message.content);
    } catch (error) {
        console.error('Groq Compiler Error:', error);
        throw new Error(error.message || 'Failed to compile user query');
    }
};

module.exports = { generateExecutionPlan };
