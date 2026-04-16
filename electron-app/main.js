const { app, BrowserWindow, Menu, Tray, dialog, desktopCapturer, session, nativeImage } = require("electron");
const path = require("path");
const express = require("express");
const cors = require("cors");

// Use the multi-provider server modules
const { generate, transcribe } = require(path.join(__dirname, "..", "server", "providers"));
const { buildSystemPrompt } = require(path.join(__dirname, "..", "server", "prompts"));

let mainWindow;
let tray;
const PORT = 35550;

// ── Embedded Express Server ─────────────────────────────────────────────────
function startServer() {
  const srv = express();
  srv.use(cors());
  srv.use(express.json({ limit: "50mb" }));
  srv.use(express.static(path.join(__dirname, "frontend-build")));

  srv.get("/api/health", (_req, res) => res.json({ status: "ok" }));

  srv.post("/api/test-connection", async (req, res) => {
    try {
      const { provider, apiKey, baseUrl, model } = req.body;
      if (!provider || !model) return res.status(400).json({ error: "Provider and model are required" });

      const systemPrompt = "Respond with exactly: Connection successful";
      await generate({ provider, apiKey, baseUrl, model, systemPrompt, userMessage: "Test" });
      res.json({ success: true, message: `Connected to ${provider}/${model}` });
    } catch (err) {
      res.status(err.status || 500).json({ success: false, error: err.message || "Connection failed" });
    }
  });

  srv.post("/api/generate", async (req, res) => {
    try {
      const { provider, apiKey, baseUrl, model, transcript, interviewType, customContext } = req.body;
      if (!provider || !model || !transcript?.trim()) {
        return res.status(400).json({ error: "Missing required fields: provider, model, transcript" });
      }

      const systemPrompt = buildSystemPrompt(interviewType, customContext);
      const response = await generate({ provider, apiKey, baseUrl, model, systemPrompt, userMessage: transcript });
      res.json({ response });
    } catch (err) {
      console.error("Generate error:", err.message);
      res.status(err.status || 500).json({ error: err.message || "Failed to generate response" });
    }
  });

  srv.post("/api/transcribe", async (req, res) => {
    try {
      const { provider, apiKey, baseUrl, model, audio } = req.body;
      if (!audio) return res.status(400).json({ error: "No audio data provided" });
      if (!provider || !apiKey) return res.status(400).json({ error: "Provider and API key required" });

      const text = await transcribe({ provider, apiKey, baseUrl, model, audio });
      res.json({ text });
    } catch (err) {
      console.error("Transcribe error:", err.message);
      res.status(err.status || 500).json({ error: err.message || "Transcription failed" });
    }
  });

  srv.get("*", (_req, res) => res.sendFile(path.join(__dirname, "frontend-build", "index.html")));

  srv.listen(PORT, () => console.log(`Electron server running on http://localhost:${PORT}`));
}

// ── Window ──────────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    backgroundColor: "#111827",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.loadURL(`http://localhost:${PORT}`);
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("close", (e) => {
    if (!app.isQuitting) { e.preventDefault(); mainWindow.hide(); }
  });

  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "File",
        submenu: [
          { label: "About", click: () => dialog.showMessageBox({ title: "AI Interview Assistant", message: "v2.0.0" }) },
          { type: "separator" },
          { role: "quit" },
        ],
      },
      {
        label: "View",
        submenu: [{ role: "reload" }, { role: "toggleDevTools" }, { type: "separator" }, { role: "togglefullscreen" }],
      },
    ])
  );
}

// ── Tray ────────────────────────────────────────────────────────────────────
function createTray() {
  try {
    tray = new Tray(nativeImage.createEmpty());
    tray.setToolTip("AI Interview Assistant");
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "Open", click: () => mainWindow?.show() },
        { type: "separator" },
        { label: "Quit", click: () => { app.isQuitting = true; app.quit(); } },
      ])
    );
    tray.on("click", () => (mainWindow?.isVisible() ? mainWindow.hide() : mainWindow?.show()));
  } catch (err) {
    console.error("Tray error:", err);
  }
}

// ── App Lifecycle ───────────────────────────────────────────────────────────
app.whenReady().then(() => {
  // Auto-approve getDisplayMedia with system loopback audio
  session.defaultSession.setDisplayMediaRequestHandler((req, cb) => {
    desktopCapturer.getSources({ types: ["screen"] }).then((sources) => {
      cb({ video: sources[0], audio: "loopback" });
    });
  });

  startServer();
  createWindow();
  createTray();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("before-quit", () => { app.isQuitting = true; });
const { app, BrowserWindow, Menu, Tray, dialog, desktopCapturer, session, nativeImage } = require("electron");
const path = require("path");
const express = require("express");
const cors = require("cors");

const aiService = require(path.join(__dirname, "..", "backend", "aiService"));

let mainWindow;
let tray;
const PORT = 35550;

// â”€â”€â”€ Embedded Express Server â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function startServer() {
  const srv = express();
  srv.use(cors());
  srv.use(express.json({ limit: "25mb" }));
  srv.use(express.static(path.join(__dirname, "frontend-build")));

  srv.post("/api/transcribe", async (req, res) => {
    const { audio, apiKey } = req.body;
    if (!audio || !apiKey) return res.status(400).json({ error: "audio and apiKey are required" });

    try {
      const mistralRes = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "voxtral-mini-latest",
          messages: [{
            role: "user",
            content: [
              { type: "input_audio", input_audio: audio },
              { type: "text", text: "Transcribe this audio exactly. Return only the spoken words, nothing else." },
            ],
          }],
        }),
      });

      const data = await mistralRes.json();
      if (data.error) return res.status(400).json({ error: data.error.message || data.error });
      const text = data.choices?.[0]?.message?.content || "";
      res.json({ text: text.trim() });
    } catch (err) {
      console.error("Transcription error:", err);
      res.status(500).json({ error: "Transcription failed: " + err.message });
    }
  });

  srv.post("/api/generate-response", async (req, res) => {
    const { transcript, apiKey } = req.body;
    if (!transcript) return res.status(400).json({ error: "transcript is required" });
    try {
      res.json({ response: await aiService.generateResponse(transcript, apiKey) });
    } catch (err) {
      console.error("AI error:", err);
      res.status(500).json({ error: "Failed to generate response" });
    }
  });

  srv.get("*", (_req, res) => res.sendFile(path.join(__dirname, "frontend-build", "index.html")));
  srv.listen(PORT, () => console.log(`Electron server â†’ http://localhost:${PORT}`));
}

// â”€â”€â”€ Window â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    backgroundColor: "#111827",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.loadURL(`http://localhost:${PORT}`);
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("close", (e) => {
    if (!app.isQuitting) { e.preventDefault(); mainWindow.hide(); }
  });

  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "File",
        submenu: [
          { label: "About", click: () => dialog.showMessageBox({ title: "AI Interview Assistant", message: "v1.0.0" }) },
          { type: "separator" },
          { role: "quit" },
        ],
      },
      {
        label: "View",
        submenu: [{ role: "reload" }, { role: "toggleDevTools" }, { type: "separator" }, { role: "togglefullscreen" }],
      },
    ])
  );
}

// â”€â”€â”€ Tray â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function createTray() {
  try {
    tray = new Tray(nativeImage.createEmpty());
    tray.setToolTip("AI Interview Assistant");
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "Open", click: () => mainWindow?.show() },
        { type: "separator" },
        { label: "Quit", click: () => { app.isQuitting = true; app.quit(); } },
      ])
    );
    tray.on("click", () => (mainWindow?.isVisible() ? mainWindow.hide() : mainWindow?.show()));
  } catch (err) {
    console.error("Tray error:", err);
  }
}

// â”€â”€â”€ App Lifecycle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.whenReady().then(() => {
  // Auto-approve getDisplayMedia with system loopback audio (no picker in Electron)
  session.defaultSession.setDisplayMediaRequestHandler((req, cb) => {
    desktopCapturer.getSources({ types: ["screen"] }).then((sources) => {
      cb({ video: sources[0], audio: "loopback" });
    });
  });

  startServer();
  createWindow();
  createTray();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("before-quit", () => { app.isQuitting = true; });
// Main process file for Electron application
