require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();
app.use(cors());
app.use(express.json());
const PORT = process.env.PORT || 3000;

const CLIENT_ID     = process.env.UPSTOX_CLIENT_ID;
const CLIENT_SECRET = process.env.UPSTOX_CLIENT_SECRET;
const REDIRECT_URI  = process.env.UPSTOX_REDIRECT_URI;

let cachedToken = null;
let tokenGeneratedAt = null;

// 1. HEALTH CHECK
app.get('/', (req, res) => {
  res.json({ status: 'live', broker: 'upstox' });
});

// 2. LOGIN PAGE — visit this each morning to get today's token
app.get('/login', (req, res) => {
  const authUrl = `https://api.upstox.com/v2/login/authorization/dialog?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
  res.send(`<!DOCTYPE html><html><head><title>JAYA — Get Token</title>
  <style>body{background:#0a0a0a;color:#fff;font-family:monospace;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0}
  h1{font-size:18px;letter-spacing:.2em;color:#00e676;margin-bottom:8px}p{color:#888;font-size:12px;margin-bottom:32px}
  a{background:#00e676;color:#000;padding:14px 32px;border-radius:4px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:.1em}</style></head>
  <body><h1>ALGO / JAYA</h1><p>Click below to log in with Upstox and generate today's token</p>
  <a href="${authUrl}">LOG IN WITH UPSTOX →</a>
  ${cachedToken ? `<p style="margin-top:24px;color:#00e676;font-size:12px">✓ Token already active today (${new Date(tokenGeneratedAt).toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata'})} IST)</p>` : ''}
  </body></html>`);
});

// 3. CALLBACK — Upstox redirects here after login
app.get('/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error || !code) {
    return res.send(`<html><body style="background:#0a0a0a;color:red;font-family:monospace;padding:40px">
      <h2>Login failed</h2><p>${error || 'No code received'}</p>
      <a href="/login" style="color:#00e676">Try again</a></body></html>`);
  }
  try {
    const response = await axios.post(
      'https://api.upstox.com/v2/login/authorization/token',
      new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code'
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' } }
    );
    cachedToken = response.data.access_token;
    tokenGeneratedAt = Date.now();
    res.send(`<!DOCTYPE html><html><head><title>JAYA — Token Ready</title>
    <style>body{background:#0a0a0a;color:#fff;font-family:monospace;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}
    h1{color:#00e676;font-size:20px;letter-spacing:.2em;margin-bottom:8px}p{color:#888;font-size:12px;margin-bottom:24px}
    .token{background:#111;border:1px solid #333;border-radius:4px;padding:16px;max-width:580px;word-break:break-all;font-size:11px;color:#aaa;margin-bottom:24px}
    button{background:#00e676;color:#000;border:none;padding:12px 28px;border-radius:4px;font-weight:700;font-size:13px;cursor:pointer;letter-spacing:.1em}</style></head>
    <body><h1>✓ TOKEN READY</h1>
    <p>Token saved. Open the JAYA tool — it connects automatically.<br>Or copy below to paste manually.</p>
    <div class="token">${cachedToken}</div>
    <button onclick="navigator.clipboard.writeText('${cachedToken}').then(()=>this.textContent='✓ COPIED!')">COPY TOKEN</button>
    <p style="margin-top:20px;color:#555">Valid until 3:30 AM tomorrow IST</p>
    </body></html>`);
  } catch (err) {
    console.error('Token exchange failed:', err.response?.data || err.message);
    res.send(`<html><body style="background:#0a0a0a;color:red;font-family:monospace;padding:40px">
      <h2>Token exchange failed</h2>
      <pre>${JSON.stringify(err.response?.data || err.message, null, 2)}</pre>
      <a href="/login" style="color:#00e676">Try again</a></body></html>`);
  }
});

// 4. GET CACHED TOKEN — called automatically by the JAYA tool on startup
app.get('/gettoken', (req, res) => {
  if (!cachedToken) {
    return res.status(404).json({ status: 'error', error: 'No token yet. Visit /login first.' });
  }
  res.json({ status: 'success', token: cachedToken, generatedAt: tokenGeneratedAt });
});

// 5. TEST TOKEN
app.post('/testtoken', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Missing token' });
  try {
    const response = await axios.get('https://api.upstox.com/v2/user/profile', {
      headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${token}` }
    });
    res.json({ status: 'success', data: response.data.data });
  } catch (error) {
    console.error("Token test failed:", error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      status: 'error', error: error.response?.data || error.message
    });
  }
});

// 6. FETCH OPTION CHAIN
app.post('/optionchain', async (req, res) => {
  const { token, instrumentKey, expiry } = req.body;
  if (!token || !instrumentKey || !expiry) {
    return res.status(400).json({ error: 'Missing token, instrumentKey, or expiry' });
  }
  try {
    const response = await axios.get('https://api.upstox.com/v2/option/chain', {
      params: { instrument_key: instrumentKey, expiry_date: expiry },
      headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${token}` }
    });
    res.json({ status: 'success', data: response.data.data });
  } catch (error) {
    console.error("Option chain fetch failed:", error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      status: 'error', error: error.response?.data || error.message
    });
  }
});

// 7. FETCH EXPIRY LIST
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
    const expiries = response.data?.data?.expiry_dates || [];
    res.json({ status: 'success', data: expiries });
  } catch (error) {
    const expiries = error.response?.data?.data?.expiry_dates || [];
    if (expiries.length > 0) return res.json({ status: 'success', data: expiries });
    res.status(error.response?.status || 500).json({
      status: 'error', error: error.response?.data || error.message
    });
  }
});

// 8. FETCH INDIA VIX
app.post('/vix', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Missing token' });
  try {
    const response = await axios.get('https://api.upstox.com/v2/market-quote/quotes', {
      params: { instrument_key: 'NSE_INDEX|India VIX' },
      headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${token}` }
    });
    res.json({ status: 'success', data: response.data.data });
  } catch (error) {
    console.error("VIX fetch failed:", error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      status: 'error', error: error.response?.data || error.message
    });
  }
});

// 9. FETCH INTRADAY CANDLES
app.post('/candles', async (req, res) => {
  const { token, instrumentKey, interval } = req.body;
  if (!token || !instrumentKey || !interval) {
    return res.status(400).json({ error: 'Missing token, instrumentKey, or interval' });
  }
  try {
    const encoded = encodeURIComponent(instrumentKey);
    const response = await axios.get(
      `https://api.upstox.com/v2/historical-candle/intraday/${encoded}/${interval}`,
      { headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${token}` } }
    );
    res.json({ status: 'success', data: response.data.data });
  } catch (error) {
    console.error("Candles fetch failed:", error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      status: 'error', error: error.response?.data || error.message
    });
  }
});

// 10. GEMINI AI
app.post('/ai', async (req, res) => {
  const { prompt } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!prompt) return res.status(400).json({ error: 'Missing prompt' });
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY missing in Render environment variables.' });
  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
      { contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2 } },
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
  console.log(`Server running on port ${PORT}`);
  console.log(`Login page: https://jaya-algo-backend.onrender.com/login`);
});
