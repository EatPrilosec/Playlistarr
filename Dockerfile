# ===== FRONTEND DEV STAGE =====
FROM node:20-alpine AS frontend-dev
WORKDIR /app
COPY frontend/package*.json ./
RUN npm install
COPY frontend .
CMD ["npm", "run", "dev", "--", "--host"]

# ===== FRONTEND BUILD STAGE =====
FROM node:20-alpine AS frontend-build
WORKDIR /app
COPY frontend/package*.json ./
RUN npm install
COPY frontend .
RUN npm run build

# ===== BACKEND / PROD STAGE =====
FROM python:3.11-slim AS backend
WORKDIR /app

# Install dependencies
COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy backend code
COPY backend ./backend

# Copy built frontend from previous stage into a static directory if serving together,
# but for now we run uvicorn on the backend.
# (If we want FastAPI to serve the React build, we can mount it here)
COPY --from=frontend-build /app/dist ./frontend/dist

EXPOSE 8670
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8670"]
