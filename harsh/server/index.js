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

// ChatTurn schema
const chatTurnSchema = new mongoose.Schema({
  user_id: { type: String, required: true },
  conversation_id: { type: String, required: true },
  session_id: { type: String, required: true },
  message_id: { type: String, required: true, unique: true },
  turn_index: { type: Number, required: true },
  role: { type: String, required: true, enum: ['user', 'assistant'] },
  
  raw_user_query: String,
  normalized_query: String,
  detected_intent: String,
  entities: mongoose.Schema.Types.Mixed,
  previous_context: String,
  
  ml_request_json: mongoose.Schema.Types.Mixed,
  ml_response_json: mongoose.Schema.Types.Mixed,
  
  simplified_response: String,
  final_interpretation: String,
  related_generic_query_id: String,
  
  created_at: String,
  updated_at: String,
  metadata: mongoose.Schema.Types.Mixed,
});

// Create index for fast cursor pagination and sorting (oldest to newest)
chatTurnSchema.index({ conversation_id: 1, turn_index: 1 });
const ChatTurn = mongoose.model('ChatTurn', chatTurnSchema, 'user_chat_history');


// Conversation schema
const conversationSchema = new mongoose.Schema({
  conversation_id: { type: String, required: true, unique: true },
  user_id: { type: String, required: true },
  title: String,
  persona: String,
  created_at: String,
  last_message_at: String,
  turn_count: Number,
});

conversationSchema.index({ user_id: 1, last_message_at: -1 });
const Conversation = mongoose.model('Conversation', conversationSchema, 'chat_conversations');

// ================================================================
// ROUTES
// ================================================================

// Test endpoint
app.get('/', (req, res) => {
  res.send('Talk2Data Backend Server is running');
});

// Create conversation metadata
app.post('/chat/conversations', async (req, res) => {
  try {
    const record = req.body;
    await Conversation.findOneAndUpdate(
      { conversation_id: record.conversation_id },
      { $set: record },
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
                                      .sort({ last_message_at: -1 });
    res.status(200).json(records);
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ error: error.message });
  }
});

// Save a turn (message)
app.post('/chat/turns', async (req, res) => {
  try {
    const turn = req.body;
    await ChatTurn.findOneAndUpdate(
      { message_id: turn.message_id },
      { $set: turn },
      { upsert: true, new: true }
    );

    // Also update the conversation's last_message_at and turn_count
    await Conversation.findOneAndUpdate(
      { conversation_id: turn.conversation_id },
      { 
        $set: { last_message_at: turn.created_at },
        $inc: { turn_count: 1 } 
      }
    );

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error saving turn:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get history pagination (returns newest N if no cursor, or older N if cursor)
app.get('/chat/history/:convId', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 40;
    const cursor = req.query.cursor; // message_id
    const convId = req.params.convId;

    let query = { conversation_id: convId };

    if (cursor) {
      // Find the turn of the cursor
      const cursorTurn = await ChatTurn.findOne({ message_id: cursor });
      if (cursorTurn) {
        // We want messages BEFORE the cursor (older messages)
        query.turn_index = { $lt: cursorTurn.turn_index };
      }
    }

    // Since we want to paginate backwards, we should sort by turn_index DESC, grab limit, then reverse
    let turns = await ChatTurn.find(query)
      .sort({ turn_index: -1 })
      .limit(limit)
      .lean();

    // Reverse to chronological order
    turns.reverse();

    return res.status(200).json({
      turns,
      hasMore: turns.length === limit,
      nextCursor: turns.length > 0 ? turns[0].message_id : null
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
