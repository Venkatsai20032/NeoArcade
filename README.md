# 🎮 NeoArcade: Real-Time Cyber Multiplayer Gaming Platform

[![GitHub Pages](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-00f0ff?style=for-the-badge&logo=github)](https://venkatsai20032.github.io/NeoArcade/)
[![Node.js](https://img.shields.io/badge/Node.js-22.x%20LTS-00ff88?style=for-the-badge&logo=node.js)](https://nodejs.org/)
[![Socket.io](https://img.shields.io/badge/Socket.io-v4.8-ff0055?style=for-the-badge&logo=socket.io)](https://socket.io/)
[![SQLite](https://img.shields.io/badge/SQLite-Built--in%20Sync-ffb700?style=for-the-badge&logo=sqlite)](https://nodejs.org/api/sqlite.html)
[![License: MIT](https://img.shields.io/badge/License-MIT-9d00ff?style=for-the-badge)](LICENSE)

An ultra-modern, esports-grade multiplayer cyber gaming platform designed for seamless **Same Wi-Fi LAN play** and instant **Serverless GitHub Pages static hosting**. Built with a sleek dark sci-fi aesthetic, touch-optimized responsive HUDs, procedural Web Audio sound design, dynamic particle animations, 3-round tournament rules with draw-replay mechanics, and local SQLite persistence.

---

## 🌐 Live Static Web Hosting

Play instantly in your browser (no server or setup required):  
👉 **[https://venkatsai20032.github.io/NeoArcade/](https://venkatsai20032.github.io/NeoArcade/)**

---

## 🕹️ Game Library

### 1. ⚔️ NEO-TIC: Tactical Tic-Tac-Toe Arena (Active)
- **3-Round Tournament Progression**: Players battle across a best-of-3 series to claim championship victory.
- **⚡ Clash & Replay Engine**: Draws are treated as high-voltage energy clashes — triggering dramatic sound and visual FX, replaying the round immediately without penalty.
- **📱 True Native Mobile Responsiveness**: Engineered from the ground up for mobile screens ($360\text{px}-480\text{px}$) and minimized desktop windows without ever requiring "Desktop site" mode. Player HUDs arrange side-by-side above a large, prominent square holographic board.
- **🔇 Silent by Default**: Web Audio procedural sound design starts **muted by default** (`🔇`), with an instant audio toggle in the top bar.

### 2. 🚀 Upcoming Games Roadmap
| Game | Status | Description |
|---|---|---|
| **🎱 Cyber Carrom** | *In Development* | Physics-based digital carrom board with laser aim, striker momentum, and 2-to-4 player LAN play. |
| **🐍 Snakes & Ladders: CyberGrid** | *Planned* | Futuristic board race featuring quantum teleporters (ladders) and glitch traps (snakes). |
| **🎲 Ludo Royale** | *Planned* | 4-player cyber tactical conquest with real-time turn sync and custom power-ups. |

---

## ⚡ Combat Protocols ("On & Off the Server")

NeoArcade features a **Dual-Mode Engine** allowing gameplay both with and without a running backend:

| Protocol | Server Required? | Features |
|---|---|---|
| **📶 Wi-Fi LAN Multiplayer** | **YES** (`node server.js`) | Connect any phone, tablet, or PC on the same Wi-Fi network. Auto-detects local LAN IP and displays an in-game QR code for instant 1-tap mobile joins. SQLite persists match history and leaderboards. |
| **🤖 Solo Cyber AI Combat** | **NO** (Static / Offline) | Tactical AI opponent equipped with 3-in-a-row detection, blocking algorithms, center/corner priority, and 3-round tournament rules. |
| **👥 Pass & Play (Local Duel)** | **NO** (Static / Offline) | 2 players take turns on a single shared screen (phone, tablet, or laptop). |
| **🌐 Serverless P2P WebRTC** | **NO** (Static / Offline) | Direct peer-to-peer multiplayer across the internet via PeerJS using a 4-digit room code — zero server cost. |

---

## 📱 Mobile & Responsive Architecture

The gaming arena automatically adapts across all display profiles:
- **Small Mobile Phones (360px - 480px)**: Side-by-side player HUD strip (`grid-template-areas: "p1 p2" "board board"`), prominent 3x3 holographic board (`min(88vw, 360px)`), and compact thumb-friendly docks.
- **Narrow Minimized Desktop / Split-Screen**: Fluid layout adjusts cleanly down to 500px width.
- **Desktop (1024px+)**: Full 3-column arena stage layout with 3D cyber border accents.

---

## 🛠️ Tech Stack

- **Frontend**: Vanilla HTML5, Modern CSS3 (`clamp()`, CSS Grid, Glassmorphism, CSS Custom Properties), JavaScript (ES2022+).
- **Audio Engine**: Web Audio API (procedural synthesizers, laser strikes, gongs, alert chimes — zero audio asset loading).
- **FX Engine**: Custom 2D HTML5 Canvas particle system (floating cyber dust, dynamic confetti bursts).
- **Backend (LAN Mode)**: Node.js, Express, Socket.io 4.8.
- **Database**: Native Node.js `node:sqlite` (`DatabaseSync` - zero external build dependencies).
- **Networking**: `os.networkInterfaces()` LAN resolver + client-side SVG QR code generator.

---

## 🚀 Quick Start (Local & LAN Play)

### Prerequisites
- Node.js 22 LTS or newer installed.

### 1. Clone & Install
```bash
git clone https://github.com/Venkatsai20032/NeoArcade.git
cd NeoArcade
npm install
```

### 2. Start the Arena Server
```bash
npm start
```
The server will output:
```text
====================================================
⚡ NEO-TIC ARENA RUNNING AT:
   Local Machine:  http://localhost:3000
   Same Wi-Fi LAN: http://192.168.1.xxx:3000
====================================================
```

### 3. Connect Other Devices on the Same Wi-Fi
- Open the **Same Wi-Fi LAN** URL on any phone or laptop on the same network.
- Or simply scan the **QR Code** displayed directly inside the desktop lobby!

---

## 🐳 Docker Deployment

Run with Docker Compose:
```bash
docker compose up --build -d
```
Access at `http://localhost:3000`.

---

## 📜 License

MIT License — Copyright (c) 2026 Venkatsai20032
