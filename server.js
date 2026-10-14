const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT) || 3000;
const PAGE = path.join(__dirname, "index.html");
const OPENFIGI = "https://api.openfigi.com/v3/mapping";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8"
};

function send(res, status, body, type) {
  res.writeHead(status, {
    "Content-Type": type || "text/plain; charset=utf-8",
    "Cache-Control": "no-cache"
  });
  res.end(body);
}

function prettyName(raw) {
  return String(raw || "").toLowerCase().replace(/\b([a-z0-9&]+)\b/g, (word) => {
    if (word.length <= 3) return word.toUpperCase();
    return word.charAt(0).toUpperCase() + word.slice(1);
  });
}

async function lookup(ticker, mic) {
  const response = await fetch(OPENFIGI, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.OPENFIGI_API_KEY ? { "X-OPENFIGI-APIKEY": process.env.OPENFIGI_API_KEY } : {})
    },
    body: JSON.stringify([{ idType: "TICKER", idValue: ticker, micCode: mic, marketSecDes: "Equity" }])
  });
  if (!response.ok) {
    const err = new Error("OpenFIGI returned " + response.status);
    err.status = response.status === 429 ? 429 : 502;
    throw err;
  }
  const payload = await response.json();
  const job = Array.isArray(payload) ? payload[0] : null;
  const row = job && Array.isArray(job.data) ? job.data[0] : null;
  if (!row || !row.name) {
    const err = new Error(job && job.warning ? job.warning : "No match for that ticker on this exchange.");
    err.status = 404;
    throw err;
  }
  return { name: prettyName(row.name), ticker: row.ticker || ticker, mic };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/api/lookup") {
    const ticker = (url.searchParams.get("ticker") || "").trim().toUpperCase();
    const mic = (url.searchParams.get("mic") || "").trim().toUpperCase();
    if (!/^[A-Z0-9.]{1,12}$/.test(ticker) || !/^[A-Z0-9]{4}$/.test(mic)) {
      send(res, 400, JSON.stringify({ error: "Enter a ticker and a listed exchange." }), "application/json; charset=utf-8");
      return;
    }
    try {
      const match = await lookup(ticker, mic);
      send(res, 200, JSON.stringify(match), "application/json; charset=utf-8");
    } catch (err) {
      const status = err.status || 502;
      const message = status === 404 ? "No match for that ticker on this exchange." : "Couldn’t reach the lookup service.";
      send(res, status, JSON.stringify({ error: message }), "application/json; charset=utf-8");
    }
    return;
  }

  if (url.pathname !== "/" && url.pathname !== "/index.html") {
    send(res, 404, "Not found");
    return;
  }
  fs.readFile(PAGE, (err, data) => {
    if (err) {
      send(res, 404, "Not found");
      return;
    }
    send(res, 200, data, TYPES[".html"]);
  });
});

server.listen(PORT, () => {
  console.log("Company tracker listening on http://localhost:" + PORT);
});
