const express = require("express");
const { ethers } = require("ethers");
const NodeCache = require("node-cache");

const app = express();
const cache = new NodeCache({ stdTTL: 300 }); // 5-min cache

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const CONTRACT_ADDRESS = "0x4a7a72b0d8bbbe5a218f079bccd74861591f9b50";
const CHAIN_ID = 1; // Ethereum mainnet
const RPC_URL = process.env.ETH_RPC_URL || "https://eth.llamarpc.com";
const PORT = process.env.PORT || 3000;

// ─── ABI (ERC-721 + tokenURI) ─────────────────────────────────────────────────
const ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function totalSupply() view returns (uint256)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
  "function tokenByIndex(uint256 index) view returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
];

// ─── PROVIDER & CONTRACT ──────────────────────────────────────────────────────
const provider = new ethers.JsonRpcProvider(RPC_URL);
const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function decodeTokenURI(raw) {
  // On-chain SVG — may be base64 data URI or plain JSON
  if (raw.startsWith("data:application/json;base64,")) {
    const json = Buffer.from(raw.split(",")[1], "base64").toString("utf-8");
    return JSON.parse(json);
  }
  if (raw.startsWith("data:application/json,")) {
    return JSON.parse(decodeURIComponent(raw.split(",")[1]));
  }
  if (raw.startsWith("data:application/json;utf8,")) {
    return JSON.parse(raw.split(",")[1]);
  }
  return { raw }; // fallback
}

async function getTokenMeta(tokenId) {
  const key = `token_${tokenId}`;
  if (cache.has(key)) return cache.get(key);

  const [uri, owner] = await Promise.all([
    contract.tokenURI(tokenId),
    contract.ownerOf(tokenId),
  ]);

  const metadata = decodeTokenURI(uri);
  const result = { tokenId: Number(tokenId), owner, ...metadata };
  cache.set(key, result);
  return result;
}

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});

// ─── ROUTES ───────────────────────────────────────────────────────────────────

/**
 * GET /
 * Health check
 */
app.get("/", (req, res) => {
  res.json({
    name: "Fleshlike Pepes API",
    contract: CONTRACT_ADDRESS,
    chain: "ethereum",
    chainId: CHAIN_ID,
    docs: "https://github.com/your-repo/fleshlike-pepes-api",
  });
});

/**
 * GET /collection
 * Collection-level stats pulled live from the contract
 */
app.get("/collection", async (req, res) => {
  try {
    const cacheKey = "collection_info";
    if (cache.has(cacheKey)) return res.json(cache.get(cacheKey));

    const [name, symbol, totalSupply] = await Promise.all([
      contract.name(),
      contract.symbol(),
      contract.totalSupply(),
    ]);

    const info = {
      name,
      symbol,
      totalSupply: Number(totalSupply),
      contract: CONTRACT_ADDRESS,
      chain: "ethereum",
      chainId: CHAIN_ID,
      standard: "ERC-721",
      imageType: "SVG (fully on-chain)",
      opensea: "https://opensea.io/collection/fleshlike-pepes",
    };
    cache.set(cacheKey, info, 60);
    res.json(info);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /tokens?page=1&limit=20
 * Paginated list of tokens with metadata
 */
app.get("/tokens", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const totalSupply = Number(await contract.totalSupply());
    const start = (page - 1) * limit;
    const end = Math.min(start + limit, totalSupply);

    if (start >= totalSupply) {
      return res.status(400).json({ error: "Page out of range" });
    }

    const ids = Array.from({ length: end - start }, (_, i) => start + i + 1);
    const tokens = await Promise.all(ids.map((id) => getTokenMeta(id)));

    res.json({
      page,
      limit,
      total: totalSupply,
      pages: Math.ceil(totalSupply / limit),
      tokens,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /token/:id
 * Single token metadata (decoded from on-chain tokenURI)
 */
app.get("/token/:id", async (req, res) => {
  try {
    const tokenId = parseInt(req.params.id);
    if (isNaN(tokenId) || tokenId < 1) {
      return res.status(400).json({ error: "Invalid token ID" });
    }
    const meta = await getTokenMeta(tokenId);
    res.json(meta);
  } catch (err) {
    if (err.message.includes("nonexistent") || err.code === "CALL_EXCEPTION") {
      return res.status(404).json({ error: "Token not found" });
    }
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /token/:id/image
 * Serves the raw SVG image for a token
 */
app.get("/token/:id/image", async (req, res) => {
  try {
    const tokenId = parseInt(req.params.id);
    if (isNaN(tokenId) || tokenId < 1) {
      return res.status(400).json({ error: "Invalid token ID" });
    }

    const cacheKey = `image_${tokenId}`;
    let svg = cache.get(cacheKey);

    if (!svg) {
      const uri = await contract.tokenURI(tokenId);
      const meta = decodeTokenURI(uri);

      if (!meta.image) {
        return res.status(404).json({ error: "No image in token metadata" });
      }

      if (meta.image.startsWith("data:image/svg+xml;base64,")) {
        svg = Buffer.from(meta.image.split(",")[1], "base64").toString("utf-8");
      } else if (meta.image.startsWith("data:image/svg+xml,")) {
        svg = decodeURIComponent(meta.image.split(",")[1]);
      } else {
        svg = meta.image;
      }
      cache.set(cacheKey, svg, 600);
    }

    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(svg);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /token/:id/owner
 * Current owner of a token
 */
app.get("/token/:id/owner", async (req, res) => {
  try {
    const tokenId = parseInt(req.params.id);
    if (isNaN(tokenId) || tokenId < 1) {
      return res.status(400).json({ error: "Invalid token ID" });
    }
    const owner = await contract.ownerOf(tokenId);
    res.json({ tokenId, owner });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /owner/:address
 * All tokens held by a wallet address
 */
app.get("/owner/:address", async (req, res) => {
  try {
    const address = req.params.address;
    if (!ethers.isAddress(address)) {
      return res.status(400).json({ error: "Invalid Ethereum address" });
    }

    const cacheKey = `owner_${address.toLowerCase()}`;
    if (cache.has(cacheKey)) return res.json(cache.get(cacheKey));

    const balance = Number(await contract.balanceOf(address));
    if (balance === 0) {
      return res.json({ address, balance: 0, tokens: [] });
    }

    // Enumerate tokens via tokenOfOwnerByIndex
    const idPromises = Array.from({ length: balance }, (_, i) =>
      contract.tokenOfOwnerByIndex(address, i)
    );
    const tokenIds = await Promise.all(idPromises);
    const tokens = await Promise.all(
      tokenIds.map((id) => getTokenMeta(Number(id)))
    );

    const result = {
      address,
      balance,
      tokens,
    };
    cache.set(cacheKey, result, 60);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /traits
 * Returns all known trait types for the collection
 */
app.get("/traits", (req, res) => {
  // Trait types sourced from the OpenSea collection page
  const traits = [
    "aloha", "background", "bellybutton", "bridged", "button",
    "count", "development", "dollars", "electricaltape", "eyeball",
    "face", "gaze", "iris", "looking", "markings", "mouth",
    "mucousmembrane", "nip", "nips", "pupil", "shirt", "shorts",
    "skin", "snot", "spittle", "spot", "stripe", "tail", "tooth", "wrag",
  ];
  res.json({ traits });
});

/**
 * GET /token/:id/traits
 * Traits (attributes) for a single token
 */
app.get("/token/:id/traits", async (req, res) => {
  try {
    const tokenId = parseInt(req.params.id);
    if (isNaN(tokenId) || tokenId < 1) {
      return res.status(400).json({ error: "Invalid token ID" });
    }
    const meta = await getTokenMeta(tokenId);
    res.json({
      tokenId,
      attributes: meta.attributes || [],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /transfer-events?fromBlock=&toBlock=&limit=
 * Recent Transfer events (mints, sales, transfers)
 */
app.get("/transfer-events", async (req, res) => {
  try {
    const limit = Math.min(100, parseInt(req.query.limit) || 50);
    const latestBlock = await provider.getBlockNumber();
    const fromBlock = parseInt(req.query.fromBlock) || latestBlock - 5000;
    const toBlock = parseInt(req.query.toBlock) || latestBlock;

    const filter = contract.filters.Transfer();
    const events = await contract.queryFilter(filter, fromBlock, toBlock);

    const result = events.slice(-limit).map((e) => ({
      txHash: e.transactionHash,
      blockNumber: e.blockNumber,
      from: e.args[0],
      to: e.args[1],
      tokenId: Number(e.args[2]),
      type:
        e.args[0] === ethers.ZeroAddress
          ? "mint"
          : e.args[1] === ethers.ZeroAddress
          ? "burn"
          : "transfer",
    }));

    res.json({ fromBlock, toBlock, count: result.length, events: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// ─── START ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║   Fleshlike Pepes API                    ║
║   Contract: ${CONTRACT_ADDRESS}  ║
║   Running on http://localhost:${PORT}         ║
╚══════════════════════════════════════════╝
  `);
});
