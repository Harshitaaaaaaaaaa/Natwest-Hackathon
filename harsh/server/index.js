import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const MONGO_URI = process.env.MONGO_URI;
const PORT = process.env.PORT || 3001;

// ================================================================
// MONGOOSE SCHEMAS
// ================================================================

// 1. Generic Queries Schema (Common query repository)
const genericQuerySchema = new mongoose.Schema({
  query_text: { type: String, required: true },
  query_type: [String],
  intent: String,
  usage_count: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now },
});
const GenericQuery = mongoose.model('GenericQuery', genericQuerySchema, 'generic_queries');

// 2. User Conversations Schema (Monolithic document with messages array)
const messageSchema = new mongoose.Schema({
  message_id: { type: String, required: true },
  user_query: { type: String, required: true },
  query_type: [String],
  ml_output: mongoose.Schema.Types.Mixed,
  timestamp: { type: String, required: true },
}, { _id: false });

const conversationSchema = new mongoose.Schema({
  conversation_id: { type: String, required: true, unique: true },
  user_id: { type: String, required: true },
  user_type: { type: String, required: true },  // 6 Persona mapping
  dataset_ref: { type: String },
  title: String,
  created_at: { type: String },
  messages: [messageSchema],
});

conversationSchema.index({ user_id: 1 });
const Conversation = mongoose.model('Conversation', conversationSchema, 'user_conversations');

// ================================================================
// ROUTES
// ================================================================

// Test endpoint
app.get('/', (req, res) => {
  res.send('Talk2Data Backend Server is running');
});

// Questionnaire ML Simulation Endpoint
app.post('/api/questionnaire', (req, res) => {
  try {
    const { responses } = req.body;
    // Map existing answers to original 6 Personas based on weights/values
    let user_type = 'Beginner';
    const audience = responses.find(r => r.id === 'audience')?.value;
    const trust = responses.find(r => r.id === 'trust')?.value;
    const instinct = responses.find(r => r.id === 'instinct')?.value;

    if (audience === 'regulators') user_type = 'Compliance';
    else if (audience === 'board') user_type = 'Executive';
    else if (audience === 'me' && (trust === 'raw_math' || instinct === 'verify')) user_type = 'Analyst';
    else if (audience === 'team' && (instinct === 'fix' || instinct === 'explain')) user_type = 'SME';
    else if (audience === 'me' && (trust === 'actionable' || trust === 'trend')) user_type = 'Everyday';
    else if (audience === 'team') user_type = 'Everyday';

    res.status(200).json({
      user_type,
      complexity_level: 3 // generic median
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create conversation metadata
app.post('/chat/conversations', async (req, res) => {
  try {
    const record = req.body;
    await Conversation.findOneAndUpdate(
      { conversation_id: record.conversation_id },
      {
        $set: {
          user_id: record.user_id,
          user_type: record.user_type,
          dataset_ref: record.dataset_ref,
          title: record.title,
          created_at: record.created_at
        }
      },
      { upsert: true, new: true }
    );
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error saving conversation:', error);
    res.status(500).json({ error: error.message });
  }
});

// List conversations for user
app.get('/chat/conversations/:userId', async (req, res) => {
  try {
    const records = await Conversation.find({ user_id: req.params.userId })
      .sort({ created_at: -1 });
    res.status(200).json(records);
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ error: error.message });
  }
});

// Save a turn by pushing to messages array
app.post('/chat/turns', async (req, res) => {
  try {
    const { conversation_id, message } = req.body;

    // Push the newest message into the monolithic conversation document
    await Conversation.findOneAndUpdate(
      { conversation_id: conversation_id },
      { $push: { messages: message } },
      { upsert: true, new: true }
    );

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error saving message:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get monolithic conversation history (no cursor needed anymore, we return the doc)
app.get('/chat/history/:convId', async (req, res) => {
  try {
    const conv = await Conversation.findOne({ conversation_id: req.params.convId }).lean();
    if (!conv) {
      return res.status(200).json({ messages: [] });
    }
    return res.status(200).json({
      messages: conv.messages,
      user_type: conv.user_type,
      dataset_ref: conv.dataset_ref
    });
  } catch (error) {
    console.error('Error fetching history:', error);
    res.status(500).json({ error: error.message });
  }
});

// ================================================================
// BOOTSTRAP
// ================================================================

mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('[MongoDB] Connected successfully');
    app.listen(PORT, () => {
      console.log(`[HTTP] API Server listening on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('[MongoDB] Connection error:', err);
    process.exit(1);
  });
