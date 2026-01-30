// ... existing imports
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

// ... [Keep existing Middleware, Storage Config, Multer, and Helper functions unchanged] ...
app.use(cors());
app.use(express.json());
const STORAGE_DIR = path.join(__dirname, 'storage');
const UPLOADS_DIR = path.join(STORAGE_DIR, 'uploads');
const DATA_DIR = path.join(STORAGE_DIR, 'data');
const DATA_FILE = path.join(DATA_DIR, 'paintings.json');

if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR);
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

app.use('/uploads', express.static(UPLOADS_DIR));

app.get('/', (req, res) => {
  res.send('<h1>Art Expert Server is Running</h1><p>Status: Online</p>');
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

const readData = () => {
  if (!fs.existsSync(DATA_FILE)) return [];
  try {
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return [];
  }
};

const writeData = (data) => {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
};

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ... [Keep existing Painting Routes (POST, GET, PUT) unchanged] ...
// (Routes 1, 2, 2.5, 2.6, 2.7 are unchanged)
app.post('/api/paintings', upload.single('image'), async (req, res) => {
  // ... [Original code]
  try {
    const { title, description, facts, slug } = req.body;
    const file = req.file;

    if (!file || !title) {
      return res.status(400).json({ error: 'Image and Title are required' });
    }

    const id = uuidv4();
    const imageUrl = `${process.env.BASE_URL}/uploads/${file.filename}`;

    // We still generate text instructions for legacy support, but the Realtime session 
    // will reconstruct them dynamically to avoid "Visual Analysis" text duplication.
    const systemInstructions = `You are an expert art historian analyzing the painting '${title}'. 
    Here are the key facts about this artwork:
    ${facts || 'No specific facts provided.'}
    Description: ${description || ''}
    
    The user is looking at this painting right now. 
    Your goal is to be engaging, educational, and brief. 
    Do not give long lectures. Encourage the user to observe details in the painting.
    Answer any questions they have based on your knowledge and the visual context provided.`;

    const queryParam = slug ? `slug=${slug}` : `id=${id}`;
    let clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    if (!clientUrl.startsWith('http')) {
      clientUrl = `https://${clientUrl}`;
    }
    const visitorUrl = `${clientUrl}/talk?${queryParam}`;

    const qrCodeDataUrl = await QRCode.toDataURL(visitorUrl);

    const newPainting = {
      id,
      slug: slug || null,
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

    // Check for duplicate slug
    if (slug && paintings.some(p => p.slug === slug)) {
      return res.status(400).json({ error: 'Slug already exists' });
    }

    paintings.push(newPainting);
    writeData(paintings);

    res.json(newPainting);
  } catch (error) {
    console.error('Error creating painting:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
app.get('/api/paintings/:id', (req, res) => {
  const paintings = readData();
  const painting = paintings.find(p => p.id === req.params.id);
  if (!painting) return res.status(404).json({ error: 'Painting not found' });
  res.json(painting);
});
app.get('/api/paintings/slug/:slug', (req, res) => {
  const paintings = readData();
  const painting = paintings.find(p => p.slug === req.params.slug);
  if (!painting) return res.status(404).json({ error: 'Painting not found' });
  res.json(painting);
});
app.get('/api/paintings', (req, res) => {
  const paintings = readData();
  res.json(paintings);
});
app.put('/api/paintings/:id', upload.single('image'), async (req, res) => {
  // ... [Keep existing PUT logic mostly same, just ensuring we don't break]
  // For brevity, assuming the existing PUT logic is fine. 
  // The key change is in /api/session below.
  try {
    const { id } = req.params;
    const { title, description, facts, slug } = req.body;
    const file = req.file;

    const paintings = readData();
    const index = paintings.findIndex(p => p.id === id);

    if (index === -1) {
      return res.status(404).json({ error: 'Painting not found' });
    }

    const existingPainting = paintings[index];

    let imageUrl = existingPainting.imageUrl;
    let visualAnalysis = null;

    if (file) {
      imageUrl = `${process.env.BASE_URL}/uploads/${file.filename}`;
      // NOTE: We could still run analyzeImage(file.path) here for legacy fallback, 
      // but for the Realtime SDK version, we don't need it.
    } else {
      // Keep existing analysis if present
      if (existingPainting.systemInstructions && existingPainting.systemInstructions.includes('VISUAL ANALYSIS')) {
        const parts = existingPainting.systemInstructions.split('VISUAL ANALYSIS (Provided by GPT-4o Vision):');
        if (parts.length > 1) {
          visualAnalysis = parts[1].split('The user is looking')[0].trim();
        }
      }
    }

    const systemInstructions = `You are an expert art historian analyzing the painting '${title}'. 
Here are the key facts about this artwork:
${facts || 'No specific facts provided.'}
Description: ${description || ''}

${visualAnalysis ? `VISUAL ANALYSIS (Provided by GPT-4o Vision):
${visualAnalysis}` : ''}

The user is looking at this painting right now. 
Your goal is to be engaging, educational, and brief. 
Do not give long lectures. Encourage the user to observe details in the painting.
Answer any questions they have based on your knowledge and the visual context provided.`;

    paintings[index] = {
      ...existingPainting,
      title,
      slug: slug || existingPainting.slug,
      description,
      facts,
      imageUrl,
      systemInstructions
    };
    // ... (URL generation logic)
    const queryParam = paintings[index].slug ? `slug=${paintings[index].slug}` : `id=${paintings[index].id}`;
    let clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    if (!clientUrl.startsWith('http')) clientUrl = `https://${clientUrl}`;
    const visitorUrl = `${clientUrl}/talk?${queryParam}`;
    const qrCodeDataUrl = await QRCode.toDataURL(visitorUrl);
    paintings[index].visitorUrl = visitorUrl;
    paintings[index].qrCodeDataUrl = qrCodeDataUrl;

    writeData(paintings);
    res.json(paintings[index]);
  } catch (error) {
    console.error('Error updating painting:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


// --- 3. UPDATED Session Route (SDK Compatible) ---
app.get('/api/session', async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OpenAI API Key is missing on server' });
    }

    const { paintingId, slug } = req.query;
    let instructions = "You are a helpful assistant."; // Default

    // Look up painting to generate context
    if (paintingId || slug) {
      const paintings = readData();
      const painting = paintings.find(p => (paintingId && p.id === paintingId) || (slug && p.slug === slug));

      if (painting) {
        // Reconstruct clean instructions WITHOUT the old text-based Visual Analysis.
        // We do this because we will be sending the actual image to the model.
        instructions = `You are an expert art historian analyzing the painting '${painting.title}'. 
Here are the key facts about this artwork:
${painting.facts || 'No specific facts provided.'}
Description: ${painting.description || ''}

The user is looking at this painting right now and the image has been provided to you.
Your goal is to be engaging, educational, and brief. 
Do not give long lectures. Encourage the user to observe details in the painting.
Answer any questions they have based on your knowledge and the visual context provided.`;
      }
    }

    const response = await openai.beta.realtime.sessions.create({
      model: "gpt-realtime",
      voice: "verse",
      instructions: instructions, // Set context at session creation
    });

    res.json(response);

  } catch (error) {
    console.error('Error creating OpenAI session:', error);
    res.status(500).json({ error: 'Failed to create OpenAI session' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});