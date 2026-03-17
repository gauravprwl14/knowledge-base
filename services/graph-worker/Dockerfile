FROM python:3.12-slim AS base
WORKDIR /app

# spaCy needs build tools for some tokenizer extensions
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

FROM base AS dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

FROM dependencies AS development
ENV PYTHONUNBUFFERED=1
COPY . .
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8012", "--reload"]

FROM dependencies AS production
COPY app ./app
ENV PYTHONUNBUFFERED=1
RUN addgroup --system kms && adduser --system --ingroup kms kms
USER kms
EXPOSE 8012
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8012"]
