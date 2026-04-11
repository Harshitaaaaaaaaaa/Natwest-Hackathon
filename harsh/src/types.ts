// ================================================================
// TALK2DATA — UNIFIED TYPE SYSTEM v2
// Single source of truth for all data shapes, personas, and contracts
// ================================================================

// === PERSONA SYSTEM (6 display personas) ===
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

// === CONFIDENCE TAGS ===
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
  /** True when user explicitly named a chart type — persona overrides are skipped */
  explicit_visual_request?: boolean;
}

// ================================================================
// ML OUTPUT CONTRACT — strict JSON from backend
// Frontend ONLY renders this. It does NOT compute anything.
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

export interface ChartDataContract {
  id: string;
  type: SuggestedVisual;
  title: string;
  data: MetricPoint[];
}

export interface MLOutputContract {
  query_type: string[];                    // e.g. ['Diagnostic', 'Descriptive']
  key_metrics: MetricPoint[];
  trend: MetricPoint[];
  breakdown: MetricPoint[];
  diagnostics: string[];                   // Human-readable driver/anomaly strings
  prediction: {
    label: string;
    value: number;
    confidence: number;
  } | null;
  comparison: MetricPoint[];
  chart_data: ChartDataContract[];         // Chart specs — one per intent
  recommendations: string[];
  confidence: number;                      // 0.0–1.0
  limitations: string[];
  warnings: string[];
  summary: string;                         // Full analytical summary
  summary_levels: {
    simple: string;                        // For Beginner/Everyday
    medium: string;                        // For SME/Executive
    advanced: string;                      // For Analyst/Compliance
  };
}

// ================================================================
// RENDERED RESPONSE — output of responseMapper (persona-shaped)
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

export interface EvidenceData {
  source: string;
  timestamp: string;
  confidence: number;
  notes: string;
  rawValues: MetricPoint[];
  formula?: string;
  auditLog?: string;
  filters?: string;
  limitations?: string[];
}

export interface RenderedResponse {
  blocks: ResponseBlock[];
  confidenceLabel: ConfidenceState;
  personaLabel: string;
  queryType: string[];
  ttsHeadline: string;
  suggestedVisual?: SuggestedVisual;
  evidence: EvidenceData;
  /** Preserved strict payload for instant persona re-render */
  _originalInsight?: MLOutputContract;
  _persona?: Persona;
}

// ================================================================
// CHAT MESSAGE — UI state only
// ================================================================

export interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text?: string;
  response?: RenderedResponse;
  isLoading?: boolean;
  /** Raw ML contract — enables instant persona re-rendering without new API call */
  rawInsight?: MLOutputContract;
  rawQuery?: string;
}

// ================================================================
// PERSISTENCE — MongoDB collection types
// ================================================================

/** Message stored in user_conversations.messages[] */
export interface ConversationMessage {
  message_id: string;
  role: 'user' | 'assistant';
  user_query: string;
  query_type: string[];
  ml_output: MLOutputContract | Record<string, unknown>;
  simplified_response: string;
  timestamp: string;
}

/** One document in the user_conversations collection */
export interface UserConversationRecord {
  conversation_id: string;
  user_id: string;
  user_type: string;             // Persona string from questionnaire
  dataset_ref: string | null;    // CSV path or enterprise dataset ID
  title: string;
  created_at: string;
  messages: ConversationMessage[];
}

/** generic_queries collection — canonical query cache */
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
