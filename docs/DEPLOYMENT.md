# Production Deployment Guide

This guide explains how to deploy Voice App to production on VPS/EC2 using Docker Compose.

## Prerequisites

### Server Requirements

**Minimum Specifications**:
- CPU: 4 cores (8 cores recommended for large-v3 Whisper model)
- RAM: 8GB minimum (16GB recommended)
- Storage: 50GB SSD (for models, temp files, database)
- OS: Ubuntu 20.04+ or similar Linux distribution

**Software Requirements**:
- Docker Engine 20.10+
- Docker Compose V2
- Git (for deployment)

### Domain and SSL

- Domain name pointing to your server IP
- SSL certificate (Let's Encrypt recommended)

## Initial Server Setup

### 1. Install Docker

```bash
# Update system
sudo apt-get update && sudo apt-get upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add user to docker group
sudo usermod -aG docker $USER
newgrp docker

# Install Docker Compose V2
sudo apt-get install docker-compose-plugin

# Verify installation
docker --version
docker compose version
```

### 2. Clone Repository

```bash
cd /opt
sudo git clone https://github.com/yourusername/voice-app.git
cd voice-app
```

### 3. Configure Environment Variables

Create `.env.prod` file:

```bash
cat > .env.prod << 'EOF'
# Database Configuration
POSTGRES_USER=voiceapp
POSTGRES_PASSWORD=CHANGE_THIS_STRONG_PASSWORD
POSTGRES_DB=voiceapp

# RabbitMQ Configuration
RABBITMQ_USER=voiceapp
RABBITMQ_PASS=CHANGE_THIS_STRONG_PASSWORD

# API Keys
GROQ_API_KEY=your_groq_api_key_here
DEEPGRAM_API_KEY=your_deepgram_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here

# Frontend Configuration
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
API_KEY=your_frontend_api_key_here

# Worker Configuration
WORKER_CONCURRENCY=2
JOB_TIMEOUT_MINUTES=60
EOF

# Secure the file
chmod 600 .env.prod
```

### 4. Generate Strong Passwords

```bash
# Generate random passwords
openssl rand -base64 32
# Use output for POSTGRES_PASSWORD and RABBITMQ_PASS
```

## SSL Certificate Setup

### Option 1: Let's Encrypt (Recommended)

```bash
# Install Certbot
sudo apt-get install certbot

# Generate certificate (replace with your domain)
sudo certbot certonly --standalone -d yourdomain.com -d api.yourdomain.com

# Certificates will be in:
# /etc/letsencrypt/live/yourdomain.com/fullchain.pem
# /etc/letsencrypt/live/yourdomain.com/privkey.pem

# Create SSL directory and copy certificates
mkdir -p ssl
sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem ssl/cert.pem
sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem ssl/key.pem
sudo chown $USER:$USER ssl/*
```

### Option 2: Self-Signed (Development Only)

```bash
mkdir -p ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout ssl/key.pem -out ssl/cert.pem \
  -subj "/CN=yourdomain.com"
```

## Nginx Configuration

Create `nginx.conf`:

```nginx
events {
    worker_connections 1024;
}

http {
    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=upload_limit:10m rate=2r/s;

    # Upstream servers
    upstream backend {
        server backend:8000;
    }

    upstream frontend {
        server frontend:3000;
    }

    # Redirect HTTP to HTTPS
    server {
        listen 80;
        server_name yourdomain.com api.yourdomain.com;
        return 301 https://$host$request_uri;
    }

    # Frontend (main domain)
    server {
        listen 443 ssl http2;
        server_name yourdomain.com;

        ssl_certificate /etc/nginx/ssl/cert.pem;
        ssl_certificate_key /etc/nginx/ssl/key.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;

        client_max_body_size 500M;

        location / {
            proxy_pass http://frontend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }

    # Backend API (api subdomain)
    server {
        listen 443 ssl http2;
        server_name api.yourdomain.com;

        ssl_certificate /etc/nginx/ssl/cert.pem;
        ssl_certificate_key /etc/nginx/ssl/key.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;

        client_max_body_size 500M;
        client_body_timeout 300s;
        proxy_read_timeout 300s;
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;

        # API endpoints with rate limiting
        location /api/ {
            limit_req zone=api_limit burst=20 nodelay;

            proxy_pass http://backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # Upload endpoint with stricter rate limiting
        location /api/v1/upload {
            limit_req zone=upload_limit burst=5 nodelay;

            proxy_pass http://backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;

            # Large file upload settings
            client_max_body_size 500M;
            client_body_timeout 600s;
            proxy_read_timeout 600s;
        }

        # API documentation
        location /docs {
            proxy_pass http://backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }
    }
}
```

**Replace `yourdomain.com` with your actual domain.**

## Deployment

### 1. Build and Start Services

```bash
# Load environment variables
export $(cat .env.prod | xargs)

# Build images
docker compose -f docker-compose.prod.yml build

# Start services
docker compose -f docker-compose.prod.yml up -d

# Check status
docker compose -f docker-compose.prod.yml ps
```

### 2. Verify Services

```bash
# Check all services are healthy
docker compose -f docker-compose.prod.yml ps

# Check logs
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml logs -f worker
docker compose -f docker-compose.prod.yml logs -f frontend
docker compose -f docker-compose.prod.yml logs -f nginx
```

### 3. Create API Key

```bash
# Enter backend container
docker compose -f docker-compose.prod.yml exec backend bash

# Create API key
python3 << 'EOF'
import asyncio
import hashlib
import secrets
from app.db.session import AsyncSessionLocal
from app.db.models import APIKey

async def create_key():
    key = secrets.token_urlsafe(32)
    key_hash = hashlib.sha256(key.encode()).hexdigest()
    async with AsyncSessionLocal() as db:
        api_key = APIKey(key_hash=key_hash, name="Production Key", is_active=True)
        db.add(api_key)
        await db.commit()
    print(f"API Key: {key}")

asyncio.run(create_key())
EOF

# Save the output API key securely
# Exit container
exit
```

### 4. Update .env.prod with API Key

```bash
# Add the generated API key to .env.prod
echo "API_KEY=<the_generated_key>" >> .env.prod

# Restart frontend to pick up new API key
docker compose -f docker-compose.prod.yml restart frontend
```

## Database Management

### Backup Database

```bash
# Create backup directory
mkdir -p backups

# Backup database
docker compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U voiceapp voiceapp > backups/backup_$(date +%Y%m%d_%H%M%S).sql

# Compress backup
gzip backups/backup_*.sql
```

### Restore Database

```bash
# Stop services that use database
docker compose -f docker-compose.prod.yml stop backend worker dispatcher

# Restore from backup
gunzip -c backups/backup_20240101_120000.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U voiceapp voiceapp

# Start services
docker compose -f docker-compose.prod.yml start backend worker dispatcher
```

### Database Migrations

```bash
# If you need to run migrations, enter backend container
docker compose -f docker-compose.prod.yml exec backend bash

# Run your migration scripts
python -m alembic upgrade head

# Exit
exit
```

## Monitoring

### View Logs

```bash
# All services
docker compose -f docker-compose.prod.yml logs -f

# Specific service
docker compose -f docker-compose.prod.yml logs -f backend

# Last 100 lines
docker compose -f docker-compose.prod.yml logs --tail=100 worker

# Follow with timestamps
docker compose -f docker-compose.prod.yml logs -f --timestamps
```

### Resource Usage

```bash
# Container stats
docker stats

# Disk usage
docker system df

# Volume usage
docker volume ls
```

### Health Checks

```bash
# Check all services
docker compose -f docker-compose.prod.yml ps

# Check specific service health
docker inspect voice-app-backend-1 | grep -A 10 Health
```

## Maintenance

### Update Application

```bash
# Pull latest code
cd /opt/voice-app
sudo git pull

# Rebuild images
docker compose -f docker-compose.prod.yml build

# Restart services with zero downtime
docker compose -f docker-compose.prod.yml up -d --no-deps backend
docker compose -f docker-compose.prod.yml up -d --no-deps worker
docker compose -f docker-compose.prod.yml up -d --no-deps dispatcher
docker compose -f docker-compose.prod.yml up -d --no-deps frontend
```

### Certificate Renewal

```bash
# Renew Let's Encrypt certificates
sudo certbot renew

# Copy renewed certificates
sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem ssl/cert.pem
sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem ssl/key.pem
sudo chown $USER:$USER ssl/*

# Reload nginx
docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
```

### Clean Up

```bash
# Remove unused images
docker image prune -a

# Remove unused volumes (caution!)
docker volume prune

# Remove unused networks
docker network prune
```

## Security Hardening

### Firewall Configuration

```bash
# Install UFW
sudo apt-get install ufw

# Allow SSH
sudo ufw allow 22/tcp

# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Enable firewall
sudo ufw enable
```

### Automatic Updates

```bash
# Install unattended-upgrades
sudo apt-get install unattended-upgrades

# Enable automatic security updates
sudo dpkg-reconfigure -plow unattended-upgrades
```

### Fail2Ban

```bash
# Install Fail2Ban
sudo apt-get install fail2ban

# Create jail for nginx rate limiting
sudo cat > /etc/fail2ban/jail.local << 'EOF'
[nginx-limit-req]
enabled = true
filter = nginx-limit-req
logpath = /var/log/nginx/error.log
maxretry = 5
findtime = 600
bantime = 3600
EOF

# Restart Fail2Ban
sudo systemctl restart fail2ban
```

## Troubleshooting

### Services Not Starting

**Check logs**:
```bash
docker compose -f docker-compose.prod.yml logs backend
docker compose -f docker-compose.prod.yml logs postgres
```

**Common issues**:
1. Environment variables not set
2. Port conflicts
3. Insufficient resources

### Database Connection Errors

**Check postgres health**:
```bash
docker compose -f docker-compose.prod.yml ps postgres
docker compose -f docker-compose.prod.yml logs postgres
```

**Solution**:
```bash
# Restart postgres
docker compose -f docker-compose.prod.yml restart postgres

# Wait for healthy status
sleep 10

# Restart dependent services
docker compose -f docker-compose.prod.yml restart backend worker dispatcher
```

### Worker Not Processing Jobs

**Check worker logs**:
```bash
docker compose -f docker-compose.prod.yml logs -f worker
```

**Check RabbitMQ**:
```bash
docker compose -f docker-compose.prod.yml logs rabbitmq
```

**Solution**:
```bash
# Restart worker
docker compose -f docker-compose.prod.yml restart worker

# Check queue status (requires rabbitmq management)
docker compose -f docker-compose.prod.yml exec rabbitmq \
  rabbitmqctl list_queues
```

### High Memory Usage

**Check stats**:
```bash
docker stats
```

**Solutions**:
1. Reduce `WORKER_CONCURRENCY` in `.env.prod`
2. Use smaller Whisper model (medium instead of large-v3)
3. Increase swap space
4. Upgrade server RAM

## Scaling

### Horizontal Scaling (Multiple Workers)

```bash
# Scale worker service
docker compose -f docker-compose.prod.yml up -d --scale worker=3
```

### Vertical Scaling (Resource Limits)

Edit `docker-compose.prod.yml`:

```yaml
worker:
  deploy:
    resources:
      limits:
        cpus: '8.0'      # Increase CPU
        memory: 16G      # Increase memory
```

## Backup Strategy

### Automated Daily Backups

Create `/opt/voice-app/backup.sh`:

```bash
#!/bin/bash
BACKUP_DIR="/opt/voice-app/backups"
DATE=$(date +%Y%m%d_%H%M%S)

# Database backup
docker compose -f /opt/voice-app/docker-compose.prod.yml exec -T postgres \
  pg_dump -U voiceapp voiceapp | gzip > "$BACKUP_DIR/db_$DATE.sql.gz"

# Keep only last 7 days
find "$BACKUP_DIR" -name "db_*.sql.gz" -mtime +7 -delete

echo "Backup completed: $DATE"
```

Add to crontab:
```bash
chmod +x /opt/voice-app/backup.sh
crontab -e

# Add line:
0 2 * * * /opt/voice-app/backup.sh >> /var/log/voice-app-backup.log 2>&1
```

## Performance Optimization

### Enable Docker BuildKit

Add to `/etc/docker/daemon.json`:

```json
{
  "features": {
    "buildkit": true
  }
}
```

Restart Docker:
```bash
sudo systemctl restart docker
```

### Optimize Postgres

```bash
# Enter postgres container
docker compose -f docker-compose.prod.yml exec postgres psql -U voiceapp

# Optimize settings
ALTER SYSTEM SET shared_buffers = '2GB';
ALTER SYSTEM SET effective_cache_size = '6GB';
ALTER SYSTEM SET maintenance_work_mem = '512MB';
ALTER SYSTEM SET checkpoint_completion_target = 0.9;
ALTER SYSTEM SET wal_buffers = '16MB';
ALTER SYSTEM SET default_statistics_target = 100;
ALTER SYSTEM SET random_page_cost = 1.1;

# Reload configuration
SELECT pg_reload_conf();
```

## Next Steps

- Set up monitoring (Prometheus, Grafana)
- Configure log aggregation (ELK stack)
- Implement CDN for static assets
- Set up staging environment
- Configure CI/CD pipeline
- Add health check endpoints
- Implement rate limiting at application level

## Support

For issues and questions:
- Check logs: `docker compose -f docker-compose.prod.yml logs`
- Review [DOCKER_DEVELOPMENT.md](./DOCKER_DEVELOPMENT.md)
- Review [DOCKER_TESTING.md](./DOCKER_TESTING.md)
- Check [CLAUDE.md](../CLAUDE.md)
