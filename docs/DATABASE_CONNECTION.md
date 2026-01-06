# PostgreSQL Database Connection Information

## External Database Connection

Yes, you can connect to the PostgreSQL database from outside the Docker container!

### Connection Details

Based on your `docker-compose.yml`, the database is exposed on port `5432`:

```yaml
postgres:
  ports:
    - "5432:5432"  # Host:Container port mapping
```

### Connection Strings

#### Standard Connection String
```
postgresql://voiceapp:voiceapp@localhost:5432/voiceapp
```

#### Component Breakdown
- **Host**: `localhost` (or `127.0.0.1`)
- **Port**: `5432`
- **Database**: `voiceapp`
- **Username**: `voiceapp`
- **Password**: `voiceapp`

### Connection Methods

#### 1. Using psql CLI
```bash
psql -h localhost -p 5432 -U voiceapp -d voiceapp
# When prompted, enter password: voiceapp
```

Or with password in command:
```bash
PGPASSWORD=voiceapp psql -h localhost -p 5432 -U voiceapp -d voiceapp
```

#### 2. Using Python (psycopg2)
```python
import psycopg2

conn = psycopg2.connect(
    host="localhost",
    port=5432,
    database="voiceapp",
    user="voiceapp",
    password="voiceapp"
)
cursor = conn.cursor()
cursor.execute("SELECT * FROM jobs WHERE status = 'processing';")
results = cursor.fetchall()
conn.close()
```

#### 3. Using SQLAlchemy
```python
from sqlalchemy import create_engine

DATABASE_URL = "postgresql://voiceapp:voiceapp@localhost:5432/voiceapp"
engine = create_engine(DATABASE_URL)

# Use with your application
```

#### 4. Using DBeaver / pgAdmin / DataGrip
```
Host: localhost
Port: 5432
Database: voiceapp
Username: voiceapp
Password: voiceapp
```

#### 5. Using Node.js (pg library)
```javascript
const { Client } = require('pg');

const client = new Client({
  host: 'localhost',
  port: 5432,
  database: 'voiceapp',
  user: 'voiceapp',
  password: 'voiceapp',
});

await client.connect();
const res = await client.query('SELECT * FROM jobs');
await client.end();
```

### Quick Test Connection

Test if the database is accessible:

```bash
# Simple connection test
psql postgresql://voiceapp:voiceapp@localhost:5432/voiceapp -c "\dt"

# Or
pg_isready -h localhost -p 5432 -U voiceapp
```

### Environment Variables

For external applications, set these environment variables:

```bash
export DB_HOST=localhost
export DB_PORT=5432
export DB_NAME=voiceapp
export DB_USER=voiceapp
export DB_PASSWORD=voiceapp
export DATABASE_URL=postgresql://voiceapp:voiceapp@localhost:5432/voiceapp
```

### Connection from Docker Container to Host

If you need to connect FROM a Docker container TO the host's PostgreSQL:
- Use `host.docker.internal` instead of `localhost`
- Connection string: `postgresql://voiceapp:voiceapp@host.docker.internal:5432/voiceapp`

### Security Notes

⚠️ **Important**: These credentials are for development only!
- In production, use strong passwords
- Restrict access by IP address
- Use SSL/TLS connections
- Consider using connection pooling
- Store credentials in environment variables, never in code

### Common Issues

1. **Connection refused**: Make sure the Docker containers are running:
   ```bash
   podman ps | grep postgres
   ```

2. **Port already in use**: If port 5432 is already used, change the host port in docker-compose.yml:
   ```yaml
   ports:
     - "5433:5432"  # Use 5433 on host instead
   ```

3. **Permission denied**: Ensure the user has proper privileges:
   ```sql
   GRANT ALL PRIVILEGES ON DATABASE voiceapp TO voiceapp;
   GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO voiceapp;
   ```
