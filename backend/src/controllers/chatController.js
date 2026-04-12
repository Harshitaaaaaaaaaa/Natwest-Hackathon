const Conversation = require('../models/Conversation');

const createConversation = async (req, res) => {
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
      { upsert: true, returnDocument: 'after' }
    );
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error saving conversation:', error);
    res.status(500).json({ error: error.message });
  }
};

const listConversations = async (req, res) => {
  try {
    const records = await Conversation.find({ user_id: req.params.userId })
      .sort({ created_at: -1 });
    res.status(200).json(records);
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ error: error.message });
  }
};

const saveTurn = async (req, res) => {
  try {
    const { conversation_id, message, behavior_events, user_id } = req.body;
    
    // Attempt to update an existing message with the same ID
    const updateResult = await Conversation.updateOne(
      { conversation_id, "messages.message_id": message.message_id },
      { $set: { "messages.$": message } }
    );

    if (updateResult.matchedCount === 0) {
      // Message doesn't exist yet, push it
      await Conversation.updateOne(
        { conversation_id },
        { $push: { messages: message } },
        { upsert: true }
      );
    }

    // ── Piggybacked behavior scoring ───────────────────────────
    let scoringResult = null;
    if (behavior_events && behavior_events.length > 0 && user_id) {
      try {
        const UserProfile = require('../models/UserProfile');
        const { computeScore } = require('../services/scoringService');

        const user = await UserProfile.findOne({ username: user_id });
        if (user) {
          const { newScore, newTotal, suggestedPersona } = computeScore(
            user.behaviorScore ?? 2.0,
            user.totalInteractions ?? 0,
            behavior_events
          );

          const updateFields = {
            behaviorScore: newScore,
            totalInteractions: newTotal,
          };

          // Only update suggested persona if it differs from current
          if (suggestedPersona !== user.personaTier) {
            updateFields.lastSuggestedPersona = suggestedPersona;
          }

          await UserProfile.updateOne(
            { username: user_id },
            { $set: updateFields }
          );

          scoringResult = {
            behaviorScore: newScore,
            currentPersona: user.personaTier,
            suggestedPersona: suggestedPersona !== user.personaTier ? suggestedPersona : null,
          };
        }
      } catch (scoreErr) {
        // Non-blocking — scoring failure should never break message saving
        console.warn('[chatController] Scoring piggyback failed:', scoreErr.message);
      }
    }

    res.status(200).json({ success: true, scoring: scoringResult });
  } catch (error) {
    console.error('Error saving message:', error);
    res.status(500).json({ error: error.message });
  }
};

const getHistory = async (req, res) => {
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
};

module.exports = { createConversation, listConversations, saveTurn, getHistory };
