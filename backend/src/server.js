const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const connectDB = require('./utils/db');
const userRoutes = require('./routes/userRoutes');
const queryRoutes = require('./routes/queryRoutes');
const chatRoutes = require('./routes/chatRoutes');
const questionnaireRoutes = require('./routes/questionnaireRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const datasetRoutes = require('./routes/datasetRoutes');

const app = express();

// Middleware (must be registered BEFORE routes)
// Allow any localhost port (dev) + production domains — prevents CORS errors
// when Vite picks port 3001/3002 because 3000 is already in use.
const CORS_OPTIONS = {
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, Postman, server-to-server)
    if (!origin) return callback(null, true);
    // Allow any localhost / 127.0.0.1 origin on any port
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    // Extend here for production: e.g. 'https://your-app.vercel.app'
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
app.use(cors(CORS_OPTIONS));

app.use(express.json());

// Routes
app.use('/api/users', userRoutes);
app.use('/api/query', queryRoutes);
app.use('/chat', chatRoutes);
app.use('/api/questionnaire', questionnaireRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/dataset', datasetRoutes);

// Health-check route
app.get('/', (req, res) => {
    res.send('Talk to Data Backend is running!');
});

// Connect to MongoDB, then start listening
const PORT = process.env.PORT || 5000;
connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
});
