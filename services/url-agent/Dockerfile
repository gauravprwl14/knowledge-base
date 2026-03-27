FROM python:3.11-slim

WORKDIR /app

# Install dependencies first for better Docker layer caching
# (requirements.txt rarely changes; app code changes often)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code — separate layer so code changes don't bust the pip cache
COPY app/ ./app/

# Health check — curl is not available in slim; use Python's urllib instead
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8004/health')"

EXPOSE 8004
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8004"]
