FROM python:3.12-slim AS base
WORKDIR /app

FROM base AS dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

FROM dependencies AS development
ENV PYTHONUNBUFFERED=1
COPY . .
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8002", "--reload"]

FROM dependencies AS production
COPY app ./app
ENV PYTHONUNBUFFERED=1
RUN addgroup --system kms && adduser --system --ingroup kms kms
USER kms
EXPOSE 8002
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8002"]
