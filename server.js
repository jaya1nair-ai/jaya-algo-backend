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
    res.json({ status: 'success', data: response.data.data });
  } catch (error) {
    console.error("Option chain fetch failed:", error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      status: 'error',
      error: error.response?.data || error.message
    });
  }
});

// 4. FETCH EXPIRY LIST
app.post('/expirylist', async (req, res) => {
  const { token, instrumentKey } = req.body;
  if (!token || !instrumentKey) {
    return res.status(400).json({ error: 'Missing token or instrumentKey' });
  }
  try {
    const response = await axios.get('https://api.upstox.com/v2/option/chain', {
      params: { instrument_key: instrumentKey, expiry_date: '2099-01-01' },
      headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${token}` }
    });
    // Upstox returns list of valid expiries even on a bad expiry_date query
    const expiries = response.data?.data?.expiry_dates || [];
    res.json({ status: 'success', data: expiries });
  } catch (error) {
    // Even on error, Upstox sometimes returns expiry list in the error body
    const expiries = error.response?.data?.data?.expiry_dates || [];
    if (expiries.length > 0) {
      return res.json({ status: 'success', data: expiries });
    }
    res.status(error.response?.status || 500).json({
      status: 'error',
      error: error.response?.data || error.message
    });
  }
});

// 5. FETCH INDIA VIX  ← NEW
// Proxies the Upstox market quote for India VIX
// Needed because browser can't fetch Upstox directly due to CORS
app.post('/vix', async (req, res) => {
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ error: 'Missing token' });
  }
  try {
    const response = await axios.get(
      'https://api.upstox.com/v2/market-quote/quotes',
      {
        params: { instrument_key: 'NSE_INDEX|India VIX' },
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      }
    );
    res.json({ status: 'success', data: response.data.data });
  } catch (error) {
    console.error("VIX fetch failed:", error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      status: 'error',
      error: error.response?.data || error.message
    });
  }
});

// 6. FETCH INTRADAY CANDLES  ← NEW
// Returns today's 1min / 5min / 15min candles for an index from Upstox
// Gives real session candles from 9:15 AM instead of synthesized ones
app.post('/candles', async (req, res) => {
  const { token, instrumentKey, interval } = req.body;
  if (!token || !instrumentKey || !interval) {
    return res.status(400).json({ error: 'Missing token, instrumentKey, or interval' });
  }
  try {
    const encoded = encodeURIComponent(instrumentKey);
    const response = await axios.get(
      `https://api.upstox.com/v2/historical-candle/intraday/${encoded}/${interval}`,
      {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      }
    );
    res.json({ status: 'success', data: response.data.data });
  } catch (error) {
    console.error("Candles fetch failed:", error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      status: 'error',
      error: error.response?.data || error.message
    });
  }
});

// 7. GEMINI AI ANALYSIS
app.post('/ai', async (req, res) => {
  const { prompt } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!prompt) return res.status(400).json({ error: 'Missing prompt' });
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY is missing in Render environment variables.' });
  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2 }
      },
      { headers: { 'Content-Type': 'application/json' } }
    );
    const aiText = response.data.candidates[0].content.parts[0].text;
    res.json({ content: [{ text: aiText }] });
  } catch (error) {
    res.status(500).json({
      error: 'AI API Error: ' + (error.response?.data?.error?.message || error.message)
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} - Configured for Upstox & Gemini 2.5 Flash`);
});
