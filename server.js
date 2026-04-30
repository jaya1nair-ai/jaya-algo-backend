require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// 1. HEALTH CHECK
app.get('/', (req, res) => {
  res.json({ status: 'live', broker: 'upstox' });
});

// 2. TEST UPSTOX TOKEN
app.post('/testtoken', async (req, res) => {
  const { token } = req.body;
 
  if (!token) {
    return res.status(400).json({ error: 'Missing token' });
  }

  try {
    // Upstox Profile API to verify token validity
    const response = await axios.get('https://api.upstox.com/v2/user/profile', {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
    res.json({ status: 'success', data: response.data.data });
  } catch (error) {
    console.error("Token test failed:", error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      status: 'error',
      error: error.response?.data || error.message
    });
  }
});

// 3. FETCH UPSTOX OPTION CHAIN
app.post('/optionchain', async (req, res) => {
  // Notice we no longer ask for clientId here!
  const { token, instrumentKey, expiry } = req.body;
 
  if (!token || !instrumentKey || !expiry) {
    return res.status(400).json({ error: 'Missing token, instrumentKey, or expiry payload' });
  }

  try {
    const response = await axios.get('https://api.upstox.com/v2/option/chain', {
      params: {
        instrument_key: instrumentKey,
        expiry_date: expiry
      },
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
   
    // Upstox wraps the chain inside a data object
    res.json({ status: 'success', data: response.data.data });
  } catch (error) {
    console.error("Option chain fetch failed:", error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      status: 'error',
      error: error.response?.data || error.message
    });
  }
});

// 5. GEMINI AI ANALYSIS
app.post('/ai', async (req, res) => {
  const { prompt } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!prompt) return res.status(400).json({ error: 'Missing prompt' });
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY is missing in Render environment variables.' });

  try {
    // UPDATED: Pointing to gemini-2.5-flash instead of the deprecated 1.5 version
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash_lite:generateContent?key=${apiKey}`,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2 }
      },
      { headers: { 'Content-Type': 'application/json' } }
    );

    const aiText = response.data.candidates[0].content.parts[0].text;
    res.json({ content: [ { text: aiText } ] });
  } catch (error) {
    res.status(500).json({ 
      error: 'AI API Error: ' + (error.response?.data?.error?.message || error.message) 
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} - Configured for Upstox & Gemini 2.5 Flash`);
});
