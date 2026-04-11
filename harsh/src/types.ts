// ================================================================
// TALK2DATA — NORMALIZED TYPE SYSTEM
// Single source of truth for all data shapes, personas, and contracts
// ================================================================

// === PERSONA SYSTEM (6 personas per Display Contract spec) ===
export type Persona =
  | 'Beginner'     // Low familiarity, needs reassurance, simple language
  | 'Everyday'     // Practical, quick answers, light explanations
  | 'SME'          // Business/operational relevance, KPI movement, drivers
  | 'Executive'    // Impact-first, strategic, brief, decision-relevant
  | 'Analyst'      // Exact values, filters, methodology, raw data
  | 'Compliance';  // Traceable, literal, auditable, source-cited

// === QUERY INTENT ===
export type QueryType = 'Descriptive' | 'Comparative' | 'Diagnostic' | 'Conversational' | 'Unknown';

// === VISUAL TYPES ===
export type SuggestedVisual =
  | 'Gauge' | 'Line' | 'Bar' | 'DivergingBar' | 'Waterfall'
  | 'Table' | 'Sparkline' | 'Treemap' | 'Bullet' | 'KPI'
  | 'Pie' | 'Scatter' | 'StackedBar' | 'None';

// === CONFIDENCE TAGS (per spec: Verified, Estimated, Transparent) ===
export type ConfidenceState = 'Verified' | 'Estimated' | 'Transparent';

// === ONBOARDING ===
export interface OnboardingAnswers {
  audience: 'me' | 'team' | 'board' | 'regulators';
  trust: 'actionable' | 'trend' | 'raw_math';
  instinct: 'fix' | 'explain' | 'verify';
  visual: 'gauge' | 'line' | 'table';
}

// === GEMINI INTENT (from classification service) ===
export interface GeminiIntent {
  query_type: QueryType;
  metric: string;
  persona_tone: string;
  suggested_visual: SuggestedVisual;
  confidence_score: number;
  user_goal?: string;
  next_action?: string;
  /** True when user explicitly named a chart type (e.g. "show pie chart").
   *  When set, persona-default visual overrides are skipped — user intent wins. */
  explicit_visual_request?: boolean;
}

// ================================================================
// NORMALIZED ML INSIGHT SCHEMA
// All data sources (mock or real API) must conform to this shape.
// The UI only ever reads NormalizedInsight — never raw API or mock data.
// ================================================================

export interface MetricPoint {
  label: string;
  value: number;
  prev_value: number | null;
  category?: string;
  unit?: string;
  delta?: number;
  delta_pct?: number;
}

export interface NormalizedInsight {
  query_type: QueryType;
  persona: Persona;

  // Core answer
  main_summary: string;

  // Data layers
  metrics: MetricPoint[];        // KPI values, current state
  trend: MetricPoint[];          // Time-series data points
  breakdown: MetricPoint[];      // Category breakdown or driver splits

  // Advanced signals
  anomalies: string[];           // Notable exceptions or outliers
  prediction: {                  // Forward-looking estimate (optional)
    label: string;
    value: number;
    confidence: number;
  } | null;

  // Chart contract
  chart: {
    primary: SuggestedVisual;
    secondary: SuggestedVisual | null;   // Max 1 secondary, never null for Analyst/Compliance
    data: MetricPoint[];
    secondary_data: MetricPoint[] | null;
  };

  // Persona-adapted outputs
  recommendations: string[];
  insight_text?: string;

  // Trust layer
  confidence: number;
  limitations: string[];

  // Audit and traceability
  metadata: {
    source: string;
    timestamp: string;
    query: string;
    math_details: string;
    audit_log?: string;
    formula?: string;
    filters?: string;
  };
}

// ================================================================
// LEGACY TYPES (kept for mockDataService compatibility)
// ================================================================

export interface DataPoint {
  label: string;
  value: number;
  prev_value: number | null;
  category?: string;
}

export interface DummyMLResult {
  status: 'success' | 'error' | 'no_data';
  headline: string;
  data_points: DataPoint[];
  confidence: number;
  source_citation: string;
  timestamp: string;
  notes: string;
  math_details?: string;
  driver_details?: any[];
}

// ================================================================
// RENDERED RESPONSE (Segmented Blocks — output of responseMapper)
// ================================================================

export interface ResponseBlock {
  type: 'headline' | 'chart' | 'kpi' | 'insight' | 'action' | 'table' | 'audit' | 'secondary_chart';
  content: string;
  chartData?: MetricPoint[];
  chartType?: SuggestedVisual;
  simplified?: string;
  tableData?: MetricPoint[];
  auditContent?: string;
}

export interface RenderedResponse {
  blocks: ResponseBlock[];
  confidenceLabel: ConfidenceState;
  suggestedVisual: SuggestedVisual;
  ttsHeadline: string;
  personaLabel: string;
  queryType: QueryType;
  evidence: {
    source: string;
    timestamp: string;
    confidence: number;
    notes: string;
    rawValues: MetricPoint[];
    formula?: string;
    auditLog?: string;
    filters?: string;
    limitations?: string[];
  };
  // Preserved for persona re-rendering without a new API call
  _originalInsight?: NormalizedInsight;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text?: string;
  response?: RenderedResponse;
  isLoading?: boolean;
  // Preserved raw insight enables instant persona re-rendering
  rawInsight?: NormalizedInsight;
  rawQuery?: string;
}

// ================================================================
// PERSISTENCE — SESSION + MONGODB TYPES
// These match the MongoDB collection schemas exactly.
// Swapping localStorage → real API requires no type changes.
// ================================================================

/** The 5 required identifiers used in every stored record. */
export interface SessionIdentifiers {
  user_id: string;
  conversation_id: string;
  session_id: string;
  message_id: string;
  turn_index: number;
}

/**
 * One row in the `user_chat_history` MongoDB collection.
 * Represents a single message (user OR assistant).
 * A full exchange = two records: role:'user' + role:'assistant'.
 */
export interface ChatTurn {
  _id?: string;                          // MongoDB ObjectId (set by backend)
  user_id: string;
  conversation_id: string;
  session_id: string;
  message_id: string;
  turn_index: number;
  role: 'user' | 'assistant';

  // Raw query preservation — original wording never overwritten
  raw_user_query: string;
  normalized_query: string;

  // Intelligence layer
  detected_intent: string;               // e.g. 'Diagnostic', 'Comparative'
  entities: Record<string, string | number | boolean>;  // extracted names/dates/values
  previous_context: string;             // summary of last N turns for continuity

  // ML pipeline traceability
  ml_request_json: Record<string, unknown>;   // exact payload sent to ML
  ml_response_json: Record<string, unknown>;  // exact raw ML response

  // Response layer
  simplified_response: string;           // human-readable answer (ttsHeadline)
  final_interpretation: string;          // full insight block text
  related_generic_query_id?: string;     // link to generic_queries collection

  created_at: string;                    // ISO timestamp
  updated_at: string;

  // Slimmed-down metadata for query/filter
  metadata: {
    persona: string;
    query_type: string;
    confidence: number;
    source: string;
    chart_type?: string;
  };
}

/**
 * One row in the `chat_conversations` MongoDB collection.
 * Created once when a conversation is started.
 */
export interface ConversationRecord {
  conversation_id: string;
  user_id: string;
  title: string;             // First query, truncated to 60 chars
  persona: string;
  created_at: string;
  last_message_at: string;
  turn_count: number;
}

/**
 * generic_queries collection shape.
 * Stores reusable canonical query patterns independent of any user.
 */
export interface GenericQuery {
  _id?: string;
  query_text: string;
  normalized_query: string;
  intent: string;
  entities: Record<string, unknown>;
  tags: string[];
  ml_request_json: Record<string, unknown>;
  ml_response_json: Record<string, unknown>;
  final_simplified_response: string;
  created_at: string;
  updated_at: string;
  usage_count: number;
  example_context?: string;
  status: 'active' | 'deprecated';
}

