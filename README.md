<div align="center">

<img width="1867" height="929" alt="image" src="https://github.com/user-attachments/assets/731df674-fca3-4b6d-98a7-5477c33c290e" />


# LinkIt

**Peer-to-peer file sharing, straight from your browser — no server ever touches your files.**

[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-Express-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-signaling-010101?logo=socket.io&logoColor=white)](https://socket.io/)
[![WebRTC](https://img.shields.io/badge/WebRTC-P2P-333333?logo=webrtc&logoColor=white)](https://webrtc.org/)
[![Zod](https://img.shields.io/badge/Zod-runtime%20validation-3E67B1)](https://zod.dev/)

</div>

---

## What is this?

LinkIt lets two people share files directly, browser to browser, using **WebRTC**. A lightweight signaling server helps the two browsers discover each other and exchange connection details (SDP offers/answers and ICE candidates). Once the WebRTC peer connection is established, file data flows directly between browsers — your files never touch or pass through the server. No upload limits, no cloud storage, and zero server bandwidth costs for file payload transfers.

## Screenshots

| Landing | Connected |
|---|---|
| ![Landing screen](docs/screenshots/landing.png) | ![Connected](docs/screenshots/connected.png) |

| Transferring | Received |
|---|---|
| ![Transfer in progress](docs/screenshots/transfer.png) | ![Received file](docs/screenshots/received.png) |

<div align="center">

| Mobile |
|---|
| ![Mobile view](docs/screenshots/mobile.png) |

</div>

## Table of contents

- [Features](#features)
- [How it works](#how-it-works)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Available scripts](#available-scripts)
- [Known limitations](#known-limitations)
- [Roadmap](#roadmap)
- [Troubleshooting & solution details](#troubleshooting--solution-details)
- [License](#license)

---

## Features

- 🔒 **True Peer-to-Peer Transfer** — Files stream directly between browser sessions using `RTCDataChannel`. No file bytes ever reach or pass through the signaling server.
- 🌐 **NAT Traversal & Fallback** — Uses STUN for direct network paths and dynamically fetched TURN credentials (via Metered.ca) for restrictive NATs/firewalls.
- 🔁 **Resumable Transfers** — If the connection drops mid-transfer, re-establishing connection allows the transfer to resume from the last received chunk offset rather than starting over.
- ✅ **Boundary Validation** — Every signaling payload and DataChannel control message (metadata, resume requests, completion signals) is validated with [Zod](https://zod.dev/) before execution.
- ⚡ **Flow & Backpressure Control** — Files are split into 16KB chunks with active `bufferedAmount` monitoring to avoid overwhelming client memory.
- 🎯 **Interactive & Modern UI** — Built with React, Tailwind CSS, and 3D background elements (OGL/Three) with responsive mobile and desktop layouts.

---

## How it works

Direct browser-to-browser communication requires exchange of network endpoints and connection parameters. LinkIt uses an Express + Socket.IO server as a signaling broker:

```
┌──────────┐      1. join room       ┌──────────────────┐      1. join room           ┌──────────┐
│ Browser A│ ───────────────────────▶│  Signaling Server │◀───────────────────────   │ Browser B│
│          │      2. offer/answer     │ (Express+Socket.IO)│      2. offer/answer     │          │
│          │◀──────────────────────▶ │   (relay only —    │ ◀──────────────────────▶│          │
│          │      3. ICE candidates   │  never sees files) │      3. ICE candidates   │          │
└────┬─────┘                          └───────────────────┘                           └────┬─────┘
     │                                                                                     │
     │                    4. Direct P2P connection (WebRTC DataChannel)                    │
     └─────────────────────────────────────────────────────────────────────────────────────┘
                                  File bytes flow here — server never involved
```

1. **Join Room** — Both browsers join the same room using a generated or custom code (intent is checked to prevent accidental room collisions).
2. **Offer / Answer Exchange** — Initiating peer generates an SDP offer; remote peer responds with an SDP answer, relayed via Socket.IO.
3. **ICE Candidate Discovery** — Peers gather ICE candidates (via public STUN and Metered.ca TURN servers) and send them through the signaling server.
4. **Direct Connection Established** — Once candidates match, a direct `RTCPeerConnection` and `RTCDataChannel` are opened.
5. **Streaming Transfer** — Files are read via FileReader, sliced into 16KB chunks, and transmitted over `RTCDataChannel`. Receivers reconstruct chunks into a downloadable `Blob`.

---

## Tech stack

| Layer | Technology |
|---|---|
| **Client** | React 18 + TypeScript + Vite + Tailwind CSS + OGL / Three.js |
| **Signaling Server** | Express + Socket.IO + TypeScript + `tsx` |
| **Shared Validation** | Zod (shared schemas across workspaces) |
| **P2P Protocol** | Native WebRTC API (`RTCPeerConnection`, `RTCDataChannel`) |
| **NAT Traversal** | STUN (Google) + Dynamic TURN (Metered.ca API) |
| **Monorepo Management** | npm Workspaces |

---

## Project structure

```
.
├── README.md
├── Agent.md
├── soution.md
├── docs/
│   └── screenshots/          # Application screenshot assets
└── linkit/                   # Core application monorepo
    ├── package.json          # Root workspace configuration
    ├── shared/               # Shared Zod schemas & TypeScript types
    │   └── src/
    │       └── schemas.ts    # Single source of truth for messages & signals
    ├── server/               # Express + Socket.IO signaling server
    │   └── src/
    │       ├── index.ts      # Socket event handlers with Zod validation
    │       └── rooms.ts      # In-memory room management
    └── client/               # Vite + React frontend application
        └── src/
            ├── components/   # FileTransfer, JoinRoom, Backgrounds & Scenes
            ├── hooks/        # useSocket, useWebRTC, useToast, useMediaQuery
            ├── lib/          # Utilities (roomId generator, etc.)
            └── App.tsx       # Main application container
```

---

## Getting started

### Prerequisites
- **Node.js 18+** and **npm 9+**
- *(Optional but recommended)* A free [Metered.ca](https://dashboard.metered.ca/signup) account for private TURN credentials.

### Installation

Clone the repository and install workspace dependencies:

```bash
git clone <repository-url>
cd linkit
npm install
```

### Environment Configuration

Configure client environment variables by copying the example file:

```bash
cp client/.env.example client/.env
```

Edit `linkit/client/.env`:

```env
VITE_METERED_APP_NAME=your-app-name
VITE_METERED_API_KEY=your-api-key
VITE_FORCE_RELAY=false
```

*Note: If Metered credentials are not provided, the app falls back to shared demo TURN credentials.*

### Running locally

Start both the signaling server (`http://localhost:3001`) and Vite client (`http://localhost:5173`) in development mode:

```bash
npm run dev
```

Open `http://localhost:5173` in two separate browser tabs or devices on your local network to test file transfer.

---

## Environment variables

Configured in `linkit/client/.env`:

| Variable | Required | Default | Description |
|---|---|---|---|
| `VITE_METERED_APP_NAME` | Optional | Demo fallback | Your Metered.ca application name for dynamic TURN fetching |
| `VITE_METERED_API_KEY` | Optional | Demo fallback | Your Metered.ca TURN server API key |
| `VITE_FORCE_RELAY` | Optional | `false` | When set to `true`, forces WebRTC traffic through TURN relay only (useful for testing NAT scenarios) |

---

## Available scripts

Run from the `linkit/` directory:

| Command | Action |
|---|---|
| `npm run dev` | Runs signaling server and Vite client concurrently |
| `npm run build` | Builds `shared` workspace then `client` workspace for production |
| `npm run build:shared` | Compiles `shared` TypeScript definitions |

---

## Known limitations

- **In-Memory Signaling State** — Room management in `server/src/rooms.ts` is in-memory. Restarting the signaling server clears active rooms.
- **Single File Transfer** — Supports sending one file at a time per active session.
- **Max 2 Peers per Room** — Rooms are strictly peer-to-peer (1 sender, 1 receiver).

---

## Roadmap

- [ ] Folder and multi-file batch transfers
- [ ] Redis pub/sub integration for horizontally scalable signaling
- [ ] Room access tokens / passwords
- [ ] Transfer speed / ETA indicators and bandwidth throttling controls

---

## Troubleshooting & solution details

Detailed phase-by-phase implementation plans, WebRTC connection debugging, TURN setup, backpressure handling, and validation design choices are documented in [`soution.md`](soution.md). Refer to `soution.md` for architectural context and interview-ready engineering explanations.

---

## License

Distributed under the MIT License. See `LICENSE` for details.
