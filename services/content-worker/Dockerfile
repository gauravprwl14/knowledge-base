FROM python:3.12-slim AS base
WORKDIR /app

# yt-dlp requires ffmpeg for audio extraction; requests+BS4 needs no extras
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

FROM base AS dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

FROM dependencies AS development
ENV PYTHONUNBUFFERED=1
COPY . .
CMD ["python", "-m", "app.main"]

FROM dependencies AS production
COPY app ./app
ENV PYTHONUNBUFFERED=1
RUN addgroup --system kms && adduser --system --ingroup kms kms
USER kms
EXPOSE 8005
CMD ["python", "-m", "app.main"]
