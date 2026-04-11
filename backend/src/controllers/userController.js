const UserProfile = require('../models/UserProfile');

// @desc    Get user profile or create a new one if it doesn't exist
// @route   POST /api/users
const getUserProfile = async (req, res) => {
    try {
        const { username } = req.body;

        if (!username) {
            return res.status(400).json({ message: 'Username is required' });
        }

        // Try to find the user
        let user = await UserProfile.findOne({ username });

        // If user doesn't exist, create a new "everyday" user
        if (!user) {
            user = await UserProfile.create({
                username,
                personaTier: 'everyday',
                complexityScore: 2
            });
        }

        res.status(200).json(user);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

module.exports = { getUserProfile };