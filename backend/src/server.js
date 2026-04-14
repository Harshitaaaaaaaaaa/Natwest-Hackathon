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
const { allowedOrigins } = require('./config/runtime');
const { waitForEngineReady } = require('./utils/engineClient');

const app = express();

const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;

  try {
    const { hostname, protocol } = new URL(origin);
    const isLocalProtocol = protocol === 'http:' || protocol === 'https:';
    const isLocalHost =
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '[::1]' ||
      hostname === '::1';

    return isLocalProtocol && isLocalHost;
  } catch {
    return false;
  }
};

// Middleware (must be registered BEFORE routes)
const CORS_OPTIONS = {
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, Postman, server-to-server)
    if (!origin) return callback(null, true);
    if (isAllowedOrigin(origin)) {
      return callback(null, true);
    }
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (isAllowedOrigin(origin)) {
    if (origin) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Vary', 'Origin');
    }
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
  }

  return next();
});

app.use(cors(CORS_OPTIONS));

app.use(express.json());

// Routes
app.use('/api/users', userRoutes);
app.use('/api/query', queryRoutes);
app.use('/chat', chatRoutes);
app.use('/api/questionnaire', questionnaireRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/dataset', datasetRoutes);

// Health-check routes
app.get('/', (req, res) => {
    res.send('Bolt Backend is running!');
});

app.get('/health', (req, res) => {
    res.json({
        service: 'backend',
        status: 'ok',
        timestamp: new Date().toISOString(),
    });
});

app.get('/health/ready', async (req, res) => {
    try {
        await waitForEngineReady();
        res.json({
            service: 'backend',
            status: 'ready',
            engine: 'ready',
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        res.status(503).json({
            service: 'backend',
            status: 'warming',
            engine: 'warming',
            message: error.details || error.message,
            timestamp: new Date().toISOString(),
        });
    }
});

// Connect to MongoDB, then start listening
const PORT = process.env.PORT || 5000;
connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
});

