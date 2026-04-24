const express = require('express');
const cors    = require('cors');
const fetch   = (...args) => import('node-fetch').then(({default: f}) => f(...args));

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'Jaya AlgoTrader Backend is running ✅' });
});

// ── OPTION CHAIN PROXY ─────────────────────────────────────
app.post('/optionchain', async (req, res) => {
  const { token, clientId, underlyingScrip, underlyingSeg, expiry } = req.body;

  if (!token || !clientId) {
    return res.status(400).json({ error: 'Missing token or clientId' });
  }

  try {
    const response = await fetch('https://api.dhan.co/v2/optionchain', {
      method: 'POST',
      headers: {
        'access-token': token,
        'client-id':    clientId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        UnderlyingScrip: underlyingScrip,
        UnderlyingSeg:   underlyingSeg || 'IDX_I',
        Expiry:          expiry,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data });
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── QUOTE / LTP PROXY ──────────────────────────────────────
app.post('/quote', async (req, res) => {
  const { token, clientId, securities } = req.body;

  if (!token || !clientId) {
    return res.status(400).json({ error: 'Missing token or clientId' });
  }

  try {
    const response = await fetch('https://api.dhan.co/v2/marketfeed/ltp', {
      method: 'POST',
      headers: {
        'access-token': token,
        'client-id':    clientId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ securities }),
    });

    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Jaya AlgoTrader backend running on port ${PORT}`);
});
