const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// Define execution_engine uploads directory
const UPLOADS_DIR = path.resolve(__dirname, '../../../execution_engine/uploads');

// Ensure directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
        // Sanitize and append timestamp to prevent collisions
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const originalName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        cb(null, uniqueSuffix + '-' + originalName);
    }
});

const upload = multer({ 
    storage,
    limits: { fileSize: 50 * 1024 * 1024 } // 50 MB limit
});

// @route   POST /api/upload
// @desc    Upload a dataset
router.post('/', upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }
        
        // Return relative dataset_ref as execution_engine/utils.py expects
        // "uploads/filename.csv" resolves to <project_root>/uploads/filename.csv
        const safeRef = `uploads/${req.file.filename}`;
        
        res.status(200).json({
            message: 'File uploaded successfully',
            dataset_ref: safeRef,
            filename: req.file.filename,
            size: req.file.size
        });
    } catch (error) {
        console.error('Upload Error:', error);
        res.status(500).json({ message: 'Server Error processing upload', error: error.message });
    }
});

module.exports = router;
