/**
 * SCORING SERVICE — EMA-based behavior proficiency scoring.
 *
 * Each UI event maps to a weighted proficiency signal.
 * The score is updated via Exponential Moving Average (EMA)
 * so recent behavior weighs more than old behavior.
 *
 * Score range: 1.0 (beginner) → 5.0 (compliance/audit-level)
 */

// ── Signal Weights ──────────────────────────────────────────────
const SIGNAL_WEIGHTS = {
    // Query complexity
    query_simple:           1,
    query_diagnostic:       3,
    query_comparative:      3,
    query_predictive:       4,

    // UI engagement
    persona_switch:         2,
    persona_switch_advanced: 3,  // Switched to Analyst/Compliance
    evidence_opened:        3,
    methodology_clicked:    2,
    action_followed:        2,

    // Confusion / simplification signals
    confusion_clicked:     -1,
};

// ── EMA smoothing factor ────────────────────────────────────────
// α = 0.3 means ~30% weight on new data, 70% on historical score
const ALPHA = 0.3;

// ── Persona thresholds ──────────────────────────────────────────
const PERSONA_THRESHOLDS = [
    { max: 1.8, persona: 'Beginner' },
    { max: 2.5, persona: 'Everyday' },
    { max: 3.2, persona: 'SME' },
    { max: 3.8, persona: 'Executive' },
    { max: 4.5, persona: 'Analyst' },
    { max: 5.0, persona: 'Compliance' },
];

/**
 * Compute the updated behavior score given a batch of events.
 *
 * @param {number} currentScore  — user's existing EMA score (1.0–5.0)
 * @param {number} totalInteractions — total events processed so far
 * @param {Array<{type: string}>} events — batch of new behavioral events
 * @returns {{ newScore: number, newTotal: number, suggestedPersona: string }}
 */
function computeScore(currentScore, totalInteractions, events) {
    if (!events || events.length === 0) {
        return {
            newScore: currentScore,
            newTotal: totalInteractions,
            suggestedPersona: resolvePersona(currentScore),
        };
    }

    // Compute weighted average of this batch
    let weightSum = 0;
    let scoreSum = 0;

    for (const event of events) {
        const weight = SIGNAL_WEIGHTS[event.type];
        if (weight === undefined) continue; // Skip unknown event types

        // Map weight to score-space:
        // negative weights → push toward 1.0 (beginner)
        // positive weights → push toward 5.0 (advanced)
        const normalized = Math.max(1.0, Math.min(5.0, currentScore + (weight * 0.3)));
        scoreSum += normalized;
        weightSum += 1;
    }

    if (weightSum === 0) {
        return {
            newScore: currentScore,
            newTotal: totalInteractions,
            suggestedPersona: resolvePersona(currentScore),
        };
    }

    const batchAvg = scoreSum / weightSum;

    // EMA update: newScore = α * batchAvg + (1 - α) * currentScore
    let newScore = ALPHA * batchAvg + (1 - ALPHA) * currentScore;

    // Clamp to [1.0, 5.0]
    newScore = Math.max(1.0, Math.min(5.0, Math.round(newScore * 100) / 100));

    const newTotal = totalInteractions + events.length;
    const suggestedPersona = resolvePersona(newScore);

    return { newScore, newTotal, suggestedPersona };
}

/**
 * Resolve persona tier from a numeric score.
 */
function resolvePersona(score) {
    for (const tier of PERSONA_THRESHOLDS) {
        if (score <= tier.max) return tier.persona;
    }
    return 'Compliance';
}

module.exports = { computeScore, resolvePersona, SIGNAL_WEIGHTS };
