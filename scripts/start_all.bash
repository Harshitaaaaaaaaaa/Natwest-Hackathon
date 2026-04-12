#!/bin/bash

# ============================================
#   Talk2Data - Starting All Services
# ============================================

# Get the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "--------------------------------------------"
echo "  Talk2Data - Starting All Services"
echo "--------------------------------------------"

# 1. Start Python Execution Engine (port 8000)
echo "[1/3] Starting Python Execution Engine on port 8000..."
cd "$SCRIPT_DIR/../execution_engine" && python -m uvicorn src.main:app --host 0.0.0.0 --port 8000 &
ENGINE_PID=$!

# Wait for engine to boot
sleep 3

# 2. Start Node.js Backend (port 5000)
echo "[2/3] Starting Node.js Backend on port 5000..."
cd "$SCRIPT_DIR/../backend" && node src/server.js &
BACKEND_PID=$!

# Wait for backend to boot
sleep 2

# 3. Start Vite Frontend (port 5173)
echo "[3/3] Starting Vite Frontend on port 5173..."
cd "$SCRIPT_DIR/../frontend" && npm run dev &
FRONTEND_PID=$!

sleep 3

echo ""
echo "============================================"
echo "   All services started!"
echo "   Open http://localhost:5173 in your browser"
echo "   Press Ctrl+C to stop all services"
echo "============================================"

# Trap SIGINT (Ctrl+C) to kill all background processes on exit
trap "kill $ENGINE_PID $BACKEND_PID $FRONTEND_PID; exit" SIGINT

# Keep the script running so the trap stays active
wait