# 🦭 Container Guide (Podman)

This project supports **Podman** for both development and production environments. Podman is recommended for its daemonless architecture and enhanced security (rootless containers).

## Prerequisite

- [Podman](https://podman.io/getting-started/) installed.
- [Podman Compose](https://github.com/containers/podman-compose) or the native `podman compose` command.

## 1. Development Environment

Run the development environment with hot-reloading:

```bash
podman compose up app-dev
```

- **Port**: `http://localhost:3000`
- **Hot Reloading**: Enabled via volume mapping.
- **Rootless**: Runs without requiring sudo/root privileges.

## 2. Production Environment (Local Testing)

Test the production-optimized build locally:

```bash
podman compose -f docker-compose.prod.yml up --build
```

- **Port**: `http://localhost:3000`
- **Optimization**: Uses Next.js `standalone` output for a minimal image footprint.
- **Security**: Runs as a non-root user (`nextjs`) within a rootless Podman container.

## 3. Useful Commands

- **Stop all services**: `podman compose down`
- **Rebuild development image**: `podman compose build app-dev`
- **View logs**: `podman logs -f app-dev`
- **Run shell inside container**: `podman exec -it app-dev sh`

## 4. Environment Variables & Ports

You can customize the application behavior and port using a `.env` file.

1. Copy the example file:

   ```bash
   cp .env.example .env
   ```

2. Modify the values in `.env`:
   - `PORT`: Change the port (default: 3000).
   - `NEXT_TELEMETRY_DISABLED`: Disable Next.js telemetry.

The `podman compose` files will automatically pick up the values from `.env` and map the ports accordingly.

## 5. Troubleshooting

### Volume Permissions

If you encounter permission issues on Linux with volume mounts, we have already added the `:Z` flag to the volume mapping in `docker-compose.yml` for SELinux compatibility:

```yaml
volumes:
  - .:/app:Z
```

### node_modules conflicts

If you have local `node_modules` causing issues, clear the container volumes:

```bash
podman compose down -v
podman compose up app-dev
```
