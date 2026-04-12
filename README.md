# Talk2Data — Unified Analytical Platform

> Ask questions in plain language. Get rigorous, persona-aware insights powered by a Python execution engine, Node.js orchestrator, and React frontend — with full multilingual support for 11 languages.

---

## Architecture

```
talk2data/
├── frontend/          React 19 + Vite + i18n (11 languages) + Blind Mode
├── backend/           Node.js + Express — LLM orchestrator (Groq)
└── execution_engine/  Python + FastAPI — pure-math computation engine
```

| Layer | Port | Purpose |
|-------|------|---------|
| **Frontend** | `5173` | React SPA — persona switcher, language switcher, voice I/O, chart rendering |
| **Backend** | `5000` | Node.js orchestrator — intent classification via Groq LLM, MongoDB persistence |
| **Execution Engine** | `8000` | Python FastAPI — descriptive, diagnostic, predictive, comparative analytics |

---

## Quick Start

### Prerequisites
- **Node.js** ≥ 18
- **Python** ≥ 3.10
- **MongoDB Atlas** connection string (or local MongoDB)
- **Groq API Key** (free at [console.groq.com](https://console.groq.com))

### 1. Clone & configure environment

```bash
git clone <repo-url> talk2data && cd talk2data

# Backend
cp backend/.env.example backend/.env
# Edit backend/.env → set MONGODB_URI and GROQ_API_KEY

# Frontend
cp frontend/.env.example frontend/.env
# Edit frontend/.env → set VITE_GROQ_API_KEY
```

### 2. Install dependencies

```bash
# Backend
cd backend && npm install && cd ..

# Frontend
cd frontend && npm install && cd ..

# Execution Engine
cd execution_engine && pip install -r requirements.txt && cd ..
```

### 3. Start all services

**Option A — Manual (3 terminals):**

```bash
# Terminal 1: Python Engine
cd execution_engine && python -m uvicorn src.main:app --port 8000

# Terminal 2: Node Backend
cd backend && node src/server.js

# Terminal 3: React Frontend
cd frontend && npm run dev
```

**Option B — Single script (Windows):**

```bat
scripts\start_all.bat
```

### 4. Open the app

Navigate to **http://localhost:5173** in your browser.

---

## Key Features

### From Harsh's Engine
- **Universal CSV Loader** — 5 encodings × 7 date formats (auto-detected)
- **Z-Score Anomaly Detection** — identifies statistical outliers with root-cause analysis
- **6-Month Multi-Period Forecast** — with MAPE calculation and confidence intervals
- **Period-Over-Period Comparison** — delta charts with dynamic metric-aware titles
- **Advanced ChartRenderer** — 8+ chart types including Waterfall and DivergingBar

### From Shrey's Frontend
- **11-Language i18n** — English, Hindi, Bengali, Telugu, Marathi, Tamil, Spanish, French, Mandarin, Arabic, German
- **RTL Support** — full Arabic layout support
- **Blind Mode** — hold spacebar 5s to activate self-voicing (Web Speech API)
- **Voice Input** — speak queries via microphone
- **Language-Aware LLM** — AI responses generated natively in the selected language

### Shared
- **6 Personas** — Beginner, Everyday, SME, Executive, Analyst, Compliance
- **Instant Persona Re-rendering** — switch personas without re-querying the API
- **Session Persistence** — MongoDB-backed conversation history with localStorage cache
- **Dynamic Schema Detection** — auto-profiles uploaded CSVs for intelligent query generation

---

## Environment Variables

### Backend (`backend/.env`)
| Variable | Required | Description |
|----------|----------|-------------|
| `MONGODB_URI` | ✅ | MongoDB Atlas connection string |
| `GROQ_API_KEY` | ✅ | Groq API key for LLM intent classification |
| `PORT` | ❌ | Server port (default: `5000`) |

### Frontend (`frontend/.env`)
| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_GROQ_API_KEY` | ✅ | Groq API key for Gemini intent classification |
| `VITE_CHAT_API_URL` | ❌ | Backend URL (default: `http://localhost:5000`) |

---

## Project Structure

```
├── backend/
│   └── src/
│       ├── controllers/     queryController.js
│       ├── models/          UserProfile, Conversation (Mongoose)
│       ├── routes/          query, upload, chat, dataset, user, questionnaire
│       ├── services/        orchestratorService.js (LLM pipeline)
│       ├── utils/           db.js (MongoDB connection)
│       └── server.js        Express app entry point
│
├── execution_engine/
│   ├── data/                Superstore.csv (enterprise demo dataset)
│   ├── uploads/             User-uploaded CSVs
│   └── src/
│       ├── api/             routes.py, profiler.py
│       ├── core/            model_handler.py
│       ├── models/          descriptive, diagnostic, predictive, comparative, utils
│       └── main.py          FastAPI app entry point
│
├── frontend/
│   └── src/
│       ├── components/      FileUploader, PresentationShell, LanguageSwitcher, ResponseCard/
│       ├── hooks/           useBlindMode.ts
│       ├── locales/         11 JSON translation files
│       ├── services/        insightAdapter, geminiService, mongoService, sessionService
│       ├── stores/          appStore.tsx (global state)
│       ├── types/           TypeScript interfaces
│       ├── utils/           responseMapper
│       ├── i18n.ts          i18next configuration
│       └── main.tsx         React entry point
│
└── scripts/
    └── start_all.bat        Windows launcher
```

---

## Deployment Notes

- **Frontend Build**: `cd frontend && npm run build` → outputs to `frontend/dist/`
- **Serve frontend**: Use any static file server (Nginx, Vercel, Netlify) for `dist/`
- **Backend**: Deploy to any Node.js host (Railway, Render, AWS EC2)
- **Engine**: Deploy to any Python host (Railway, Render, AWS EC2) with `uvicorn src.main:app --port 8000`

---

## License

Internal use — NatWest Hackathon 2026.
