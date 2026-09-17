# ⚔️ NEO-TIC: Tactical Multiplayer Arena

> An ultra-modern, cinematic, real-time multiplayer Tic-Tac-Toe gaming platform designed for seamless LAN / same Wi-Fi play, instant Docker self-hosting, and 1-click cloud deployment.

![Neo-Tic Arena](public/index.html)

---

## ⚡ Core Features & Mechanics

1. **Same Wi-Fi Real-Time Play**:
   - Automatic local LAN IP detection (`os.networkInterfaces`).
   - Generates an in-app dynamic **QR Code** and direct LAN URL (`http://<your-lan-ip>:3000`) so friends on phones, tablets, or laptops on the same Wi-Fi join in 1 click without installing any apps.
2. **Real-Time Presence & 1-Click Quick Match**:
   - Continuous Socket.io synchronization with auto-reconnect.
   - **`⚡ QUICK CONNECT & PLAY`** hero banner automatically matches you with available players on your Wi-Fi network.
   - Real-time audio alert & floating toast notification whenever an opponent enters the lobby.
3. **Responsive, Scalable & Minimizable Design**:
   - **Scalable**: Fluid holographic board scales dynamically across 4K monitors, desktops, laptops, tablets, and phones (down to 320px width).
   - **Minimizable Panels**:
     - Collapse player stats banner into a compact chip (`▲ / ▼`) to maximize arena room.
     - Collapse/Expand side panel (`⛶`) to give 100% width to active warriors.
     - Arena Fullscreen / Scaled Mode (`⛶`) for distraction-free combat.
   - **Mobile Touch Optimized**: Zero tap delay (`touch-action: manipulation`), safe-area padding for mobile notches.
4. **Challenge & 30-Second Countdown Dial**:
   - Send combat invitations directly to any warrior in the lobby.
   - 30-second animated SVG countdown ring on receiver's screen with alert audio.
   - Connection established sequence upon acceptance.
5. **Interactive Symbol Chooser ("X" / "O")**:
   - Host chooses "X" (Strikes First) or "O" (Tactical Second) before Round 1 with live mirroring.
6. **5-Second Battle Countdown**:
   - Fullscreen holographic countdown (5, 4, 3, 2, 1, ENGAGE!) with audio beeps and fight gong.
7. **Clean Cyberpunk Arena Layout**:
   - **Board in the middle**: 3x3 holographic glass grid with laser cuts, plasma bursts, and glowing winning strike vectors.
   - **Player 1 on Left side**: Live Cyber HUD, score counter, and pulsing active-turn aura.
   - **Player 2 on Right side**: Mirrored Cyber HUD.
   - **Bottom Chooser dock**: Status ribbon with assigned symbol and tactical actions.
8. **3-Round Tournament Battle System**:
   - Progression: `ROUND 1` ➔ `ROUND 2` ➔ `FINAL ROUND`.
   - **Draw / Clash Replay Mechanics**: If a round ends in a tie/draw, a "CLASH DETECTED" alarm triggers and the **same round is immediately replayed** until a decisive victor emerges!
9. **Victory Ceremony & Celebrations**:
   - Canvas particle confetti fireworks, victory fanfare, and final score presentation.
   - Achievement unlocks (*First Blood*, *Tactical Champion*, *Flawless Dominance*, *Clash Survivor*, *Seasoned Gladiator*).
10. **Zero-Dependency SQLite Persistence**:
    - Uses Node.js native `node:sqlite` for persistent storage without native compilation hurdles.
11. **Procedural Web Audio API Engine**:
    - 100% synthesized sound effects generated on-the-fly (zero external audio file downloads).

---

## 🐳 1-Click Self-Hosting (Docker & Docker Compose)

NEO-TIC Arena is completely self-contained with zero external database dependencies.

### Option A: Docker Compose (Recommended)

```bash
# Clone the repository
git clone https://github.com/Venkatsai20032/TTT.git
cd TTT

# Start in background
docker compose up -d
```

Your server is now live at `http://localhost:3000` and accessible to all devices on your Wi-Fi! Player stats and database persist in the `arena-data` volume.

### Option B: Docker CLI

```bash
# Build Docker image
docker build -t neo-tic-arena .

# Run container with SQLite volume persistence
docker run -d \
  --name neo-tic \
  -p 3000:3000 \
  -v neo-tic-data:/app/data \
  --restart unless-stopped \
  neo-tic-arena
```

---

## 🚀 Bare-Metal / Node.js Host

### Prerequisites
- Node.js v22.0.0 or higher (v24 recommended)
- Both devices connected to the same Wi-Fi network

```bash
# 1. Clone repository
git clone https://github.com/Venkatsai20032/TTT.git
cd TTT

# 2. Install dependencies
npm install

# 3. Start the server
npm start
```

### Running in Production with PM2

```bash
npm install -g pm2
pm2 start server.js --name "neo-tic"
pm2 save
pm2 startup
```

---

## 📱 Playing Over Same Wi-Fi LAN

1. Start the server on your computer (`npm start` or `docker compose up -d`).
2. Terminal prints:
   ```text
   ====================================================
   ⚡ NEO-TIC ARENA RUNNING AT:
      Local Machine:  http://localhost:3000
      Same Wi-Fi LAN: http://192.168.x.x:3000
   ====================================================
   ```
3. Open `http://localhost:3000` on your PC.
4. On your mobile phone (connected to same Wi-Fi):
   - Scan the **Wi-Fi QR Code** displayed in the app header (`📶 Wi-Fi Connect`), OR
   - Type `http://<your-lan-ip>:3000` into mobile Safari/Chrome.
5. Enter your callsign, pick an avatar, and click **`⚔️ QUICK CONNECT & PLAY`**!

---

## ☁️ 1-Click Git Cloud Deployment

### Deploy to Render
1. Fork or push this repo to your GitHub account (`https://github.com/Venkatsai20032/TTT`).
2. In [Render.com](https://render.com) ➔ New **Web Service** ➔ Select repository.
3. Settings:
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
4. Click **Deploy**!

### Deploy to Railway
1. In [Railway.app](https://railway.app) ➔ **New Project** ➔ **Deploy from GitHub repo**.
2. Railway detects Node.js and starts automatically.

---

## ⚙️ Environment Variables

Copy `.env.example` to `.env` to configure:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port to bind the HTTP/WebSocket server |
| `HOST` | `0.0.0.0` | Network interface to bind |
| `DATABASE_PATH` | `./arena_game.db` | Path to persistent SQLite database file |
| `NODE_ENV` | `production` | Environment mode |

---

## 🛠️ Technology Stack

- **Server**: Node.js, Express, Socket.io
- **Database**: Node.js native `node:sqlite` (zero C++ node-gyp build requirements)
- **Frontend**: Vanilla HTML5, CSS3 Modern Glassmorphism & Cyber Glows, ES6 JavaScript
- **Sound**: Web Audio API Procedural Synthesizer
- **Graphics**: HTML5 Canvas Particle Engine
- **Container**: Docker multi-stage Alpine image

---

## 📄 License

MIT License — Feel free to customize and enjoy! Built by [Venkatsai20032](https://github.com/Venkatsai20032).
