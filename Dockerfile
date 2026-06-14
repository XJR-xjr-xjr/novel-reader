FROM python:3.11-slim

RUN apt-get update && apt-get install -y curl gnupg && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install scrapling and its browser
RUN pip install scrapling[fetchers] && scrapling install

COPY backend/ .
COPY frontend/ ./frontend/

EXPOSE 8080
ENV PYTHONUNBUFFERED=1
ENV PORT=8080
CMD uvicorn main:app --host 0.0.0.0 --port 8080