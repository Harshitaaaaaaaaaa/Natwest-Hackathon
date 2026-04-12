const UserProfile = require('../models/UserProfile');

// @desc    Get or create user profile. Returns isNewUser flag so frontend knows
//          whether to show onboarding or restore the returning user's persona.
// @route   POST /api/users
const getUserProfile = async (req, res) => {
    try {
        const { username } = req.body;

        if (!username) {
            return res.status(400).json({ message: 'Username is required' });
        }

        // Check if user already exists
        let user = await UserProfile.findOne({ username });
        let isNewUser = false;

        if (!user) {
            // Create new user
            user = await UserProfile.create({
                username,
                personaTier: 'Beginner',
                complexityScore: 2,
            });
            isNewUser = true;
        }

        res.status(200).json({ ...user.toObject(), isNewUser });
    } catch (error) {
        console.error('[userController] Error:', error.message);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

module.exports = { getUserProfile };