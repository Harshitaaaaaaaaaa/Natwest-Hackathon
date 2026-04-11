const mongoose = require('mongoose');

const userProfileSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true
    },
    personaTier: {
        type: String,
        enum: ['beginner', 'everyday', 'manager', 'analyst', 'audit'],
        default: 'everyday'
    },
    complexityScore: {
        type: Number,
        min: 1,
        max: 5,
        default: 2
    }
}, { timestamps: true });

module.exports = mongoose.model('UserProfile', userProfileSchema);