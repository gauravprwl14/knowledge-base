# scan-worker Service

**Version**: 2.0
**Last Updated**: 2026-01-07

---

## Overview

The `scan-worker` is a Python-based background worker that discovers and indexes files from connected sources (Google Drive, local file systems, external drives). It operates asynchronously via RabbitMQ queues.

---

## Service Identity

| Property | Value |
|----------|-------|
| **Name** | scan-worker |
| **Language** | Python 3.11+ |
| **Framework** | asyncio + aio-pika |
| **Port** | None (worker) |
| **Type** | Worker Service (Asynchronous) |
| **Queue** | scan.queue |
| **Repository** | /scan-worker |

---

## Responsibilities

### Primary Responsibilities

1. **Source Discovery**
   - Connect to configured sources
   - Enumerate files and folders
   - Track folder hierarchy

2. **File Metadata Extraction**
   - Extract file properties (name, size, type, dates)
   - Calculate file hashes for duplicate detection
   - Identify file MIME types

3. **Incremental Scanning**
   - Track last scan timestamps
   - Detect new, modified, deleted files
   - Support delta syncs

4. **Progress Reporting**
   - Update scan job progress in real-time
   - Report files discovered/processed counts
   - Handle errors gracefully

5. **Pipeline Handoff**
   - Publish discovered files to embed.queue
   - Batch files for efficient processing

---

## Tech Stack

| Category | Library | Version | Purpose |
|----------|---------|---------|---------|
| **Runtime** | Python | 3.11+ | Language runtime |
| **Async** | asyncio | (stdlib) | Async I/O |
| **Queue** | aio-pika | 9.x | RabbitMQ client |
| **Database** | asyncpg | 0.29.x | PostgreSQL driver |
| **ORM** | SQLAlchemy | 2.x | Async ORM |
| **Google API** | google-api-python-client | 2.x | Drive API |
| **OAuth** | google-auth | 2.x | OAuth 2.0 |
| **File System** | aiofiles | 23.x | Async file I/O |
| **Watchdog** | watchdog | 3.x | File system events |
| **Encryption** | cryptography | 41.x | Token encryption |
| **HTTP** | aiohttp | 3.x | Async HTTP client |
| **Validation** | pydantic | 2.x | Data validation |
| **Logging** | structlog | 23.x | Structured logging |
| **Hashing** | hashlib | (stdlib) | SHA-256 hashing |
| **Testing** | pytest-asyncio | 0.21.x | Async testing |

---

## Project Structure

```
scan-worker/
├── app/
│   ├── __init__.py
│   ├── main.py                    # Entry point
│   ├── config.py                  # Configuration
│   ├── worker.py                  # Queue consumer
│   │
│   ├── scanners/
│   │   ├── __init__.py
│   │   ├── base.py               # Scanner interface
│   │   ├── google_drive.py       # Google Drive scanner
│   │   ├── local_fs.py           # Local filesystem scanner
│   │   └── external_drive.py     # USB/external drive scanner
│   │
│   ├── db/
│   │   ├── __init__.py
│   │   ├── session.py            # Database session
│   │   └── models.py             # SQLAlchemy models
│   │
│   ├── services/
│   │   ├── __init__.py
│   │   ├── file_service.py       # File operations
│   │   ├── source_service.py     # Source management
│   │   └── hash_service.py       # File hashing
│   │
│   ├── queue/
│   │   ├── __init__.py
│   │   ├── consumer.py           # Message consumer
│   │   └── publisher.py          # Message publisher
│   │
│   └── utils/
│       ├── __init__.py
│       ├── encryption.py         # Token encryption
│       ├── progress.py           # Progress tracking
│       └── mime_types.py         # MIME type detection
│
├── tests/
│   ├── unit/
│   └── integration/
│
├── requirements.txt
├── Dockerfile
└── README.md
```

---

## Scanner Interface

### Base Scanner (Abstract)

```python
# app/scanners/base.py - NOT executable - conceptual implementation

from abc import ABC, abstractmethod
from typing import AsyncIterator
from pydantic import BaseModel

class FileInfo(BaseModel):
    """File metadata extracted during scan"""
    source_file_id: str          # Unique ID within source
    name: str
    path: str
    mime_type: str
    size_bytes: int
    created_at: datetime
    modified_at: datetime
    hash_sha256: str | None      # Populated for local files
    parent_folder_id: str | None
    is_folder: bool
    metadata: dict               # Source-specific metadata

class ScanProgress(BaseModel):
    """Progress update"""
    files_discovered: int
    files_processed: int
    folders_scanned: int
    current_path: str
    errors: list[str]

class BaseScanner(ABC):
    """
    Abstract base class for all source scanners.
    Each scanner implementation handles a specific source type.
    """

    def __init__(self, source_config: dict, encryption_key: bytes):
        self.source_config = source_config
        self.encryption_key = encryption_key
        self._progress = ScanProgress(
            files_discovered=0,
            files_processed=0,
            folders_scanned=0,
            current_path="",
            errors=[]
        )

    @abstractmethod
    async def connect(self) -> bool:
        """Establish connection to the source"""
        pass

    @abstractmethod
    async def disconnect(self) -> None:
        """Clean up connection"""
        pass

    @abstractmethod
    async def scan(
        self,
        root_path: str | None = None,
        incremental: bool = True,
        last_scan_time: datetime | None = None
    ) -> AsyncIterator[FileInfo]:
        """
        Scan source and yield file metadata.

        Args:
            root_path: Starting path (None = scan all)
            incremental: Only scan changed files
            last_scan_time: Timestamp of last scan

        Yields:
            FileInfo objects for each discovered file
        """
        pass

    @abstractmethod
    async def get_file_content(self, file_id: str) -> bytes:
        """Download file content for processing"""
        pass

    def get_progress(self) -> ScanProgress:
        """Get current scan progress"""
        return self._progress
```

---

## Google Drive Scanner

### Conceptual Algorithm

```
ALGORITHM: Google Drive Scanner
INPUT: source_config (OAuth tokens, folder_id), last_scan_time
OUTPUT: Iterator of FileInfo objects

1. INITIALIZE
   - Decrypt OAuth tokens using encryption_key
   - Build Google Drive API service client
   - Set up pagination parameters (page_size = 100)

2. AUTHENTICATE
   - Validate access token
   - IF token expired THEN
     - Refresh using refresh_token
     - Update encrypted tokens in database

3. BUILD QUERY
   - IF incremental AND last_scan_time THEN
     - query = "modifiedTime > '{last_scan_time}'"
   - ELSE
     - query = "'root' in parents" OR specific folder

4. PAGINATE FILES
   - WHILE has_next_page DO
     - Call files.list(q=query, pageToken, fields)
     - FOR EACH file in response.files DO
       - Extract metadata (id, name, mimeType, size, etc.)
       - YIELD FileInfo(...)
       - Update progress counter
     - pageToken = response.nextPageToken
     - IF pageToken is None THEN break

5. HANDLE FOLDERS
   - IF file.mimeType == 'application/vnd.google-apps.folder' THEN
     - Add to folder queue for recursive scan
     - Track folder hierarchy in metadata

6. ERROR HANDLING
   - ON RateLimitError: exponential backoff (1s, 2s, 4s, max 60s)
   - ON AuthError: attempt token refresh, then fail
   - ON NetworkError: retry 3 times, then log and skip
```

### High-Level Implementation

```python
# app/scanners/google_drive.py - NOT executable - conceptual implementation

from googleapiclient.discovery import build
from google.oauth2.credentials import Credentials
from typing import AsyncIterator
import asyncio

class GoogleDriveScanner(BaseScanner):
    """
    Scanner for Google Drive sources.
    Uses Google Drive API v3 with OAuth 2.0.
    """

    SCOPES = ['https://www.googleapis.com/auth/drive.readonly']
    PAGE_SIZE = 100
    FIELDS = "nextPageToken, files(id, name, mimeType, size, createdTime, modifiedTime, parents, md5Checksum)"

    async def connect(self) -> bool:
        # Step 1: Decrypt stored OAuth tokens
        encrypted_tokens = self.source_config['encrypted_tokens']
        tokens = self._decrypt_tokens(encrypted_tokens)

        # Step 2: Build credentials object
        self.credentials = Credentials(
            token=tokens['access_token'],
            refresh_token=tokens['refresh_token'],
            token_uri='https://oauth2.googleapis.com/token',
            client_id=self.source_config['client_id'],
            client_secret=self.source_config['client_secret']
        )

        # Step 3: Refresh if expired
        if self.credentials.expired:
            await self._refresh_token()

        # Step 4: Build API service
        self.service = build('drive', 'v3', credentials=self.credentials)
        return True

    async def scan(
        self,
        root_path: str | None = None,
        incremental: bool = True,
        last_scan_time: datetime | None = None
    ) -> AsyncIterator[FileInfo]:
        """Scan Google Drive and yield file metadata"""

        # Build query based on scan type
        query_parts = ["trashed = false"]

        if root_path:
            query_parts.append(f"'{root_path}' in parents")

        if incremental and last_scan_time:
            iso_time = last_scan_time.isoformat()
            query_parts.append(f"modifiedTime > '{iso_time}'")

        query = " and ".join(query_parts)
        page_token = None

        # Paginate through all results
        while True:
            try:
                response = await self._list_files(query, page_token)

                for file_data in response.get('files', []):
                    file_info = self._parse_file(file_data)
                    self._progress.files_discovered += 1
                    yield file_info

                page_token = response.get('nextPageToken')
                if not page_token:
                    break

            except Exception as e:
                await self._handle_api_error(e)

    async def _list_files(self, query: str, page_token: str | None) -> dict:
        """Execute files.list with retry logic"""
        for attempt in range(3):
            try:
                # Run in thread pool (Google API client is sync)
                loop = asyncio.get_event_loop()
                response = await loop.run_in_executor(
                    None,
                    lambda: self.service.files().list(
                        q=query,
                        pageSize=self.PAGE_SIZE,
                        fields=self.FIELDS,
                        pageToken=page_token
                    ).execute()
                )
                return response
            except HttpError as e:
                if e.resp.status == 429:  # Rate limited
                    await asyncio.sleep(2 ** attempt)
                else:
                    raise

    def _parse_file(self, file_data: dict) -> FileInfo:
        """Convert Drive API response to FileInfo"""
        return FileInfo(
            source_file_id=file_data['id'],
            name=file_data['name'],
            path=self._build_path(file_data),
            mime_type=file_data.get('mimeType', 'application/octet-stream'),
            size_bytes=int(file_data.get('size', 0)),
            created_at=self._parse_timestamp(file_data.get('createdTime')),
            modified_at=self._parse_timestamp(file_data.get('modifiedTime')),
            hash_sha256=None,  # Drive uses MD5
            parent_folder_id=file_data.get('parents', [None])[0],
            is_folder=file_data['mimeType'] == 'application/vnd.google-apps.folder',
            metadata={
                'drive_md5': file_data.get('md5Checksum'),
                'drive_id': file_data['id']
            }
        )
```

---

## Local Filesystem Scanner

### Conceptual Algorithm

```
ALGORITHM: Local Filesystem Scanner
INPUT: root_path, file_patterns (glob), last_scan_time
OUTPUT: Iterator of FileInfo objects

1. VALIDATE PATH
   - IF not os.path.exists(root_path) THEN
     - RAISE SourceNotFoundError

2. WALK DIRECTORY
   - FOR EACH (dirpath, dirnames, filenames) in os.walk(root_path) DO
     - Update progress.current_path = dirpath
     - Increment progress.folders_scanned

3. FILTER FILES
   - FOR EACH filename in filenames DO
     - full_path = join(dirpath, filename)
     - IF should_skip(filename) THEN continue
     - IF incremental AND modified_time < last_scan_time THEN continue

4. EXTRACT METADATA
   - stat = os.stat(full_path)
   - size = stat.st_size
   - created = stat.st_ctime
   - modified = stat.st_mtime

5. CALCULATE HASH
   - IF size < MAX_HASH_SIZE (100MB) THEN
     - hash = sha256_file(full_path)
   - ELSE
     - hash = sha256_partial(full_path)  # First/last 1MB

6. YIELD FILE
   - YIELD FileInfo(
       source_file_id = full_path,
       name = filename,
       hash_sha256 = hash,
       ...
     )

7. HANDLE SYMLINKS
   - Skip symbolic links to prevent infinite loops
   - Log warning for broken symlinks
```

### High-Level Implementation

```python
# app/scanners/local_fs.py - NOT executable - conceptual implementation

import os
import hashlib
import aiofiles
from pathlib import Path
from typing import AsyncIterator

class LocalFilesystemScanner(BaseScanner):
    """
    Scanner for local filesystem sources.
    Supports incremental scanning and file hashing.
    """

    MAX_HASH_SIZE = 100 * 1024 * 1024  # 100MB
    PARTIAL_HASH_SIZE = 1024 * 1024    # 1MB
    SKIP_PATTERNS = {'.git', '__pycache__', 'node_modules', '.DS_Store'}

    async def scan(
        self,
        root_path: str | None = None,
        incremental: bool = True,
        last_scan_time: datetime | None = None
    ) -> AsyncIterator[FileInfo]:
        """Walk filesystem and yield file metadata"""

        scan_root = Path(root_path or self.source_config['root_path'])

        if not scan_root.exists():
            raise SourceNotFoundError(f"Path does not exist: {scan_root}")

        # Walk directory tree
        for dirpath, dirnames, filenames in os.walk(scan_root):
            # Skip hidden and system directories
            dirnames[:] = [d for d in dirnames if not self._should_skip(d)]

            self._progress.current_path = dirpath
            self._progress.folders_scanned += 1

            for filename in filenames:
                if self._should_skip(filename):
                    continue

                full_path = Path(dirpath) / filename

                # Skip symlinks
                if full_path.is_symlink():
                    continue

                try:
                    file_info = await self._extract_file_info(
                        full_path,
                        scan_root,
                        incremental,
                        last_scan_time
                    )
                    if file_info:
                        self._progress.files_discovered += 1
                        yield file_info

                except PermissionError:
                    self._progress.errors.append(f"Permission denied: {full_path}")
                except Exception as e:
                    self._progress.errors.append(f"Error scanning {full_path}: {e}")

    async def _extract_file_info(
        self,
        path: Path,
        root: Path,
        incremental: bool,
        last_scan_time: datetime | None
    ) -> FileInfo | None:
        """Extract metadata from a single file"""

        stat = path.stat()
        modified = datetime.fromtimestamp(stat.st_mtime)

        # Skip if not modified since last scan
        if incremental and last_scan_time and modified < last_scan_time:
            return None

        # Calculate hash
        file_hash = await self._calculate_hash(path, stat.st_size)

        return FileInfo(
            source_file_id=str(path),
            name=path.name,
            path=str(path.relative_to(root)),
            mime_type=self._detect_mime_type(path),
            size_bytes=stat.st_size,
            created_at=datetime.fromtimestamp(stat.st_ctime),
            modified_at=modified,
            hash_sha256=file_hash,
            parent_folder_id=str(path.parent),
            is_folder=False,
            metadata={
                'permissions': oct(stat.st_mode),
                'inode': stat.st_ino
            }
        )

    async def _calculate_hash(self, path: Path, size: int) -> str:
        """Calculate SHA-256 hash of file"""
        hasher = hashlib.sha256()

        async with aiofiles.open(path, 'rb') as f:
            if size <= self.MAX_HASH_SIZE:
                # Full file hash
                while chunk := await f.read(65536):
                    hasher.update(chunk)
            else:
                # Partial hash (first + last 1MB)
                first_chunk = await f.read(self.PARTIAL_HASH_SIZE)
                hasher.update(first_chunk)

                await f.seek(-self.PARTIAL_HASH_SIZE, 2)
                last_chunk = await f.read(self.PARTIAL_HASH_SIZE)
                hasher.update(last_chunk)

                # Include size in hash for uniqueness
                hasher.update(str(size).encode())

        return hasher.hexdigest()

    def _should_skip(self, name: str) -> bool:
        """Check if file/folder should be skipped"""
        return (
            name.startswith('.') or
            name in self.SKIP_PATTERNS or
            name.endswith('.tmp')
        )
```

---

## Queue Integration

### Message Format

**Incoming (scan.queue)**:
```json
{
  "event_type": "SCAN_REQUESTED",
  "correlation_id": "uuid",
  "timestamp": "2026-01-07T10:00:00Z",
  "payload": {
    "scan_job_id": "uuid",
    "source_id": "uuid",
    "source_type": "google_drive",
    "config": {
      "root_folder_id": "folder_id",
      "incremental": true
    }
  }
}
```

**Outgoing (embed.queue)**:
```json
{
  "event_type": "FILE_DISCOVERED",
  "correlation_id": "uuid",
  "timestamp": "2026-01-07T10:00:05Z",
  "payload": {
    "file_id": "uuid",
    "scan_job_id": "uuid",
    "source_file_id": "drive_file_id",
    "name": "document.pdf",
    "mime_type": "application/pdf",
    "size_bytes": 1048576,
    "hash_sha256": "abc123..."
  }
}
```

---

## Database Tables (Accessed)

| Table | Access | Purpose |
|-------|--------|---------|
| `kms_sources` | READ | Source configuration |
| `kms_scan_jobs` | READ/WRITE | Job status updates |
| `kms_files` | WRITE | Insert discovered files |

---

## Configuration

```yaml
# Environment variables
RABBITMQ_URL: amqp://guest:guest@rabbitmq:5672
DATABASE_URL: postgresql://user:pass@postgres:5432/kms
ENCRYPTION_KEY: 32-byte-hex-key

# Scanner settings
SCAN_BATCH_SIZE: 100
SCAN_CONCURRENT_SOURCES: 3
SCAN_TIMEOUT_MINUTES: 60
MAX_FILE_SIZE_BYTES: 5368709120  # 5GB

# Google Drive
GOOGLE_CLIENT_ID: xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET: xxx
```

---

## Error Handling

| Error | Action |
|-------|--------|
| OAuth token expired | Refresh token, retry |
| Rate limit (429) | Exponential backoff |
| File not found | Log warning, continue |
| Permission denied | Log error, skip file |
| Network timeout | Retry 3 times, then fail |
| Database error | Fail job, send to DLX |

---

## Scaling Strategy

| Metric | Threshold | Action |
|--------|-----------|--------|
| Queue depth | > 100 jobs | Scale up workers |
| Processing time | > 30 min/job | Investigate, scale |
| Memory usage | > 80% | Scale up |
| Worker instances | 1-4 | Auto-scale on queue depth |

---

## Health Monitoring

Workers report health via:
- RabbitMQ consumer acknowledgments
- Periodic heartbeat to Redis
- Database connection checks
- Progress updates in scan_jobs table

