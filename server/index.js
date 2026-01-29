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
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Configure Multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

// Database path
const DATA_FILE = path.join(__dirname, 'data', 'paintings.json');

// Helper to read/write data
const readData = () => {
  if (!fs.existsSync(DATA_FILE)) return [];
  return JSON.parse(fs.readFileSync(DATA_FILE));
};

const writeData = (data) => {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
};

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// --- Routes ---

// 1. Upload Painting & Create Profile
app.post('/api/paintings', upload.single('image'), async (req, res) => {
  try {
    const { title, description, facts } = req.body;
    const file = req.file;

    if (!file || !title) {
      return res.status(400).json({ error: 'Image and Title are required' });
    }

    const id = uuidv4();
    const imageUrl = `${process.env.BASE_URL}/uploads/${file.filename}`;

    // Generate System Instructions
    const systemInstructions = `You are an expert art historian analyzing the painting '${title}'. 
Here are the key facts about this artwork:
${facts || 'No specific facts provided.'}
Description: ${description || ''}

The user is looking at this painting right now. 
Your goal is to be engaging, educational, and brief. 
Do not give long lectures. Encourage the user to observe details in the painting.
Answer any questions they have based on your knowledge and the visual context provided.`;

    // Generate QR Code
    // Points to the client visitor page
    const visitorUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/talk?id=${id}`;
    const qrCodeDataUrl = await QRCode.toDataURL(visitorUrl);

    const newPainting = {
      id,
      title,
      description,
      facts,
      imageUrl,
      systemInstructions,
      visitorUrl,
      qrCodeDataUrl,
      createdAt: new Date().toISOString()
    };

    const paintings = readData();
    paintings.push(newPainting);
    writeData(paintings);

    res.json(newPainting);
  } catch (error) {
    console.error('Error creating painting:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 2. Get Painting Details (for Visitor)
app.get('/api/paintings/:id', (req, res) => {
  const paintings = readData();
  const painting = paintings.find(p => p.id === req.params.id);

  if (!painting) {
    return res.status(404).json({ error: 'Painting not found' });
  }

  res.json(painting);
});

// 3. Ephemeral Token Exchange (for WebRTC)
app.get('/api/session', async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.includes('PLACE_YOUR_KEY')) {
      return res.status(500).json({ error: 'OpenAI API Key is missing on server' });
    }

    const response = await openai.beta.realtime.sessions.create({
      model: "gpt-4o-realtime-preview-2024-12-17",
      voice: "verse",
    });

    res.json(response);

  } catch (error) {
    console.error('Error creating OpenAI session:', error);
    res.status(500).json({ error: 'Failed to create OpenAI session' });
  }
});

// Ensure directories exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
