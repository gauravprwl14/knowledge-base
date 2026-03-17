# Stage 1: Base - OS dependencies and system packages
FROM python:3.11-slim AS base

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libmagic1 \
    build-essential \
    cmake \
    ninja-build \
    git \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r appuser && useradd -r -g appuser appuser

# Stage 2: Dependencies - Python packages with cache optimization
FROM base AS dependencies

WORKDIR /app

# Copy only requirements first for better layer caching
COPY requirements.txt .

# Install production dependencies with BuildKit cache mount
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --no-cache-dir -r requirements.txt

# Stage 3: Development - Hot reload with bind mounts
FROM dependencies AS development

WORKDIR /app

# Install test dependencies for development
COPY requirements-test.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --no-cache-dir -r requirements-test.txt

# Copy Alembic config and migrations (source code bind-mounted at runtime)
COPY alembic.ini .
COPY alembic ./alembic/

# Create directories
RUN mkdir -p /app/temp/uploads /app/temp/processed /app/models

# Enable Python output buffering for better logs
ENV PYTHONUNBUFFERED=1

EXPOSE 8000

# Note: Source code is mounted as volume in docker-compose.kms.yml
# This enables hot reload without rebuilding the image
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# Stage 4: Test - Includes test dependencies + postgres client
FROM dependencies AS test

WORKDIR /app

# Install test dependencies and postgres client for integration tests
COPY requirements-test.txt .
RUN apt-get update && apt-get install -y postgresql-client && rm -rf /var/lib/apt/lists/*
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --no-cache-dir -r requirements-test.txt

# Copy application code for testing
COPY . .

# Create directories
RUN mkdir -p /app/temp/uploads /app/temp/processed /app/models

CMD ["pytest", "-v", "--cov=app", "--cov-report=term-missing", "--cov-report=html"]

# Stage 5: Production (default) - Minimal runtime
FROM dependencies AS production

WORKDIR /app

# Copy only application code (not tests, docs, etc.)
COPY app /app/app
COPY alembic.ini .
COPY alembic ./alembic/

# Create directories
RUN mkdir -p /app/temp/uploads /app/temp/processed /app/models

# Set ownership to non-root user
RUN chown -R appuser:appuser /app

# Switch to non-root user for security
USER appuser

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
