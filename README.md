# Fleshlike Pepes API 🐸

A fully on-chain REST API for the **Fleshlike Pepes** ERC-721 collection on Ethereum.

- **Contract:** `0x4a7a72b0d8bbbe5a218f079bccd74861591f9b50`
- **Chain:** Ethereum Mainnet
- **Supply:** 2,290 tokens
- **Images:** Fully on-chain SVGs (no IPFS dependency)

---

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Health check + API info |
| GET | `/collection` | Name, symbol, total supply, chain info |
| GET | `/tokens?page=1&limit=20` | Paginated token list with metadata |
| GET | `/token/:id` | Single token metadata (decoded from chain) |
| GET | `/token/:id/image` | Raw SVG image served as `image/svg+xml` |
| GET | `/token/:id/owner` | Current owner address |
| GET | `/token/:id/traits` | Attributes array for a token |
| GET | `/owner/:address` | All tokens held by a wallet |
| GET | `/traits` | All known trait type names |
| GET | `/transfer-events?fromBlock=&toBlock=&limit=` | Recent Transfer events |

---

## Quick Start (Local)

```bash
# 1. Clone / download this folder
git clone https://github.com/your-name/fleshlike-pepes-api.git
cd fleshlike-pepes-api

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env if you want a custom RPC URL

# 4. Start the server
npm start
# → http://localhost:3000
```

Test it instantly:
```bash
curl http://localhost:3000/collection
curl http://localhost:3000/token/1
curl http://localhost:3000/token/1/image   # returns SVG
```

---

## Publish to Railway (Free, 5 min)

Railway is the fastest way to get this live with zero config.

```bash
# 1. Install Railway CLI
npm install -g @railway/cli

# 2. Login
railway login

# 3. Inside the project folder, initialize
railway init

# 4. Set your env var (optional — default public RPC works)
railway variables set ETH_RPC_URL=https://eth.llamarpc.com

# 5. Deploy
railway up

# 6. Get your public URL
railway open
```

Your API will be live at `https://your-project.up.railway.app`.

---

## Publish to Render (Free Tier)

1. Push this folder to a GitHub repo.
2. Go to [render.com](https://render.com) → **New Web Service**.
3. Connect your GitHub repo.
4. Settings:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Environment:** Add `ETH_RPC_URL` if desired.
5. Click **Deploy** — you'll get a `https://your-api.onrender.com` URL.

---

## Publish to Fly.io

```bash
# Install Fly CLI: https://fly.io/docs/hands-on/install-flyctl/
flyctl auth login

# From the project folder
flyctl launch          # auto-detects Node.js
flyctl secrets set ETH_RPC_URL=https://eth.llamarpc.com
flyctl deploy

# Get URL
flyctl open
```

---

## Publish to Vercel (Serverless)

Wrap the app with a small adapter:

```bash
npm install --save-dev vercel
```

Create `api/index.js`:
```js
const app = require('../server');
module.exports = app;
```

Create `vercel.json`:
```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/api/index" }]
}
```

```bash
npx vercel --prod
```

---

## Using a Free RPC (No Key Required)

The default RPC `https://eth.llamarpc.com` works out of the box with no sign-up.
For higher rate limits, grab a free key from:

- [Alchemy](https://alchemy.com) — 300M compute units/month free
- [Infura](https://infura.io) — 100k requests/day free
- [Ankr](https://ankr.com) — 500 requests/day free, no key required at `https://rpc.ankr.com/eth`

---

## Example Responses

### `GET /collection`
```json
{
  "name": "Fleshlike Pepes",
  "symbol": "PEPE",
  "totalSupply": 2290,
  "contract": "0x4a7a72b0d8bbbe5a218f079bccd74861591f9b50",
  "chain": "ethereum",
  "chainId": 1,
  "standard": "ERC-721",
  "imageType": "SVG (fully on-chain)"
}
```

### `GET /token/1`
```json
{
  "tokenId": 1,
  "owner": "0xabc...def",
  "name": "Fleshlike Pepes #1",
  "description": "...",
  "image": "data:image/svg+xml;base64,...",
  "attributes": [
    { "trait_type": "background", "value": "blue" },
    { "trait_type": "skin", "value": "green" }
  ]
}
```

### `GET /token/1/image`
Returns raw `image/svg+xml` — embed directly in `<img src="...">` or `<iframe>`.

---

## Caching

All on-chain reads are cached in-memory (5 minutes default) to avoid hammering the RPC. Token images cache for 10 minutes. You can tune `stdTTL` in `server.js`.

---

## License

MIT
