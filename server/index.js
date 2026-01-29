const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const OpenAI = require('openai');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
// Serve static files from uploads directory
// --- Storage Configuration ---
// We consolidate uploads and data into a single "storage" directory
// This makes it easier to mount a single volume in hosting providers like Railway
const STORAGE_DIR = path.join(__dirname, 'storage');
const UPLOADS_DIR = path.join(STORAGE_DIR, 'uploads');
const DATA_DIR = path.join(STORAGE_DIR, 'data');
const DATA_FILE = path.join(DATA_DIR, 'paintings.json');

// Ensure storage structure exists
if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR);
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

// Serve uploads from the new location
app.use('/uploads', express.static(UPLOADS_DIR));

// Root route for health check
app.get('/', (req, res) => {
  res.send('<h1>Art Expert Server is Running</h1><p>Status: Online</p>');
});

// Configure Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
