# Multi-stage build for production deployment
FROM python:3.11-slim as backend

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    pkg-config \
    libpq-dev \
    libxml2-dev \
    libxslt-dev \
    libffi-dev \
    libssl-dev \
    zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
# Upgrade pip first
RUN pip install --upgrade pip

# Install core dependencies first (these must succeed)
RUN pip install --no-cache-dir flask==3.0.0 flask-cors==4.0.0 gunicorn==22.0.0 werkzeug==3.0.1
RUN pip install --no-cache-dir openai==1.12.0 tiktoken==0.6.0
RUN pip install --no-cache-dir supabase==2.4.4 psycopg2-binary==2.9.9
RUN pip install --no-cache-dir PyPDF2==3.0.1 python-docx==1.1.0 pandas==2.2.0
RUN pip install --no-cache-dir chardet==5.2.0 langchain-text-splitters==0.0.1 python-dotenv==1.0.1 requests==2.31.0
RUN pip install --no-cache-dir numpy==1.24.3 asyncio-throttle==1.0.2 scikit-learn==1.3.0 scipy==1.11.1

# Install optional advanced packages (allow failures)
RUN pip install --no-cache-dir sentence-transformers==2.2.2 transformers==4.30.0 textstat==0.7.3 networkx==3.1 || echo "Advanced packages failed - using fallbacks"

# Frontend build stage
FROM node:18-alpine as frontend

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Final production stage
FROM python:3.11-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    libpq5 \
    libxml2 \
    libxslt1.1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy Python dependencies from backend stage
COPY --from=backend /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=backend /usr/local/bin /usr/local/bin

# Copy built frontend from frontend stage
COPY --from=frontend /app/dist ./dist

# Copy Python application
COPY *.py ./
COPY requirements.txt ./

# Create non-root user
RUN useradd --create-home --shell /bin/bash app
USER app

EXPOSE 8000

CMD ["gunicorn", "web_server:app", "--bind", "0.0.0.0:8000", "--workers", "2", "--timeout", "300"]