# =============================================================================
# backend/Dockerfile - FastAPI Python Backend Container Definition
#
# Purpose:
#   Builds the container image running the WareSwarm Python FastAPI backend server.
#
# Role in the project:
#   Containerizes the simulation engine, planning algorithms, SQLite database,
#   and WebSocket broadcaster on port 8000 for docker-compose deployment.
#
# Key contents:
#   - Base image: python:3.11-slim
#   - Dependencies: Installed from requirements.txt
#   - Application code: Mounted at /app
#   - Entrypoint: Uvicorn ASGI server running app.main:app on port 8000
#
# Talks to:
#   - frontend container (via port 8000)
#   - docker-compose.yml (service 'backend')
# =============================================================================

FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app/ ./app/

# Expose port
EXPOSE 8000

# Run server
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
