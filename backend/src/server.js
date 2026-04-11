require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./utils/db');
const userRoutes = require('./routes/userRoutes'); // <-- Add this import
const queryRoutes = require('./routes/queryRoutes');

const app = express();

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/users', userRoutes); // <-- Add this route middleware
app.use('/api/query', queryRoutes);

// A simple test route
app.get('/', (req, res) => {
    res.send('Talk to Data Backend is running!');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
