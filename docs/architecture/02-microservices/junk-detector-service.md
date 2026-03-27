# junk-detector Service

**Version**: 2.0
**Last Updated**: 2026-01-07

---

## Overview

The `junk-detector` is a Python-based service that identifies and classifies files that are likely unnecessary or low-value. It uses a combination of rule-based detection and (future) machine learning classification.

---

## Service Identity

| Property | Value |
|----------|-------|
| **Name** | junk-detector |
| **Language** | Python 3.11+ |
| **Framework** | asyncio + scikit-learn (future) |
| **Port** | None (service) |
| **Type** | Background Service |
| **Queue** | None (scheduled) |
| **Repository** | /junk-detector |

---

## Responsibilities

### Primary Responsibilities

1. **Temporary File Detection**
   - Identify system temp files (.tmp, ~$*.docx)
   - Detect cache files
   - Find swap and backup files

2. **Empty/Corrupt File Detection**
   - Identify zero-byte files
   - Detect truncated files
   - Find corrupt media files

3. **System File Detection**
   - Identify OS-generated files (.DS_Store, Thumbs.db)
   - Detect hidden system folders
   - Find package manager artifacts

4. **Low-Value Content Detection**
   - Identify auto-generated files
   - Detect placeholder content
   - Find redundant exports

5. **Confidence Scoring**
   - Assign junk probability scores
   - Support user feedback for training

---

## Tech Stack

| Category | Library | Version | Purpose |
|----------|---------|---------|---------|
| **Runtime** | Python | 3.11+ | Language runtime |
| **Rules** | (custom) | - | Rule evaluation engine |
| **Images** | Pillow | 10.x | Image validation |
| **Media** | ffprobe | - | Media file validation |
| **ML (Future)** | scikit-learn | 1.x | Classification models |
| **ML (Future)** | xgboost | 2.x | Gradient boosting |
| **Database** | asyncpg | 0.29.x | PostgreSQL driver |
| **Validation** | pydantic | 2.x | Data validation |
| **Logging** | structlog | 23.x | Structured logging |
| **Scheduler** | APScheduler | 3.x | Task scheduling |

---

## Project Structure

```
junk-detector/
├── app/
│   ├── __init__.py
│   ├── main.py                    # Entry point
│   ├── config.py                  # Configuration
│   ├── detector.py                # Main detector
│   │
│   ├── rules/
│   │   ├── __init__.py
│   │   ├── engine.py             # Rule evaluation engine
│   │   ├── base.py               # Rule interface
│   │   ├── temporary_files.py    # Temp file rules
│   │   ├── empty_files.py        # Empty/corrupt rules
│   │   ├── system_files.py       # OS-generated rules
│   │   ├── cache_files.py        # Cache detection
│   │   └── low_value.py          # Low-value content
│   │
│   ├── validators/
│   │   ├── __init__.py
│   │   ├── image.py              # Image validation
│   │   ├── document.py           # Document validation
│   │   └── media.py              # Audio/video validation
│   │
│   ├── ml/
│   │   ├── __init__.py
│   │   ├── classifier.py         # ML classifier (future)
│   │   ├── features.py           # Feature extraction
│   │   └── training.py           # Model training
│   │
│   ├── storage/
│   │   ├── __init__.py
│   │   └── postgres.py           # Database client
│   │
│   └── utils/
│       ├── __init__.py
│       └── patterns.py           # Pattern matchers
│
├── models/                        # ML models (future)
├── tests/
│   ├── unit/
│   └── integration/
│
├── requirements.txt
├── Dockerfile
└── README.md
```

---

## Rule-Based Detection

### Rule Engine

#### Conceptual Algorithm

```
ALGORITHM: Junk File Detection
INPUT: file_metadata (name, path, size, mime_type, content_hash)
OUTPUT: JunkClassification with confidence score

1. INITIALIZE
   - Load all enabled rules
   - Set up rule priorities

2. EVALUATE RULES
   FOR EACH rule in priority_order DO
     result = rule.evaluate(file_metadata)

     IF result.is_junk THEN
       - Add to matches
       - Accumulate confidence

     IF result.is_definitive THEN
       - BREAK (no need for more rules)

3. AGGREGATE RESULTS
   - IF any definitive match THEN
     - confidence = 1.0
   - ELSE
     - confidence = weighted_average(matches)

4. THRESHOLD CHECK
   - IF confidence >= 0.7 THEN
     - classification = 'junk'
   - ELSE IF confidence >= 0.4 THEN
     - classification = 'suspicious'
   - ELSE
     - classification = 'normal'

5. RETURN JunkClassification(
     classification,
     confidence,
     matched_rules,
     reasons
   )
```

#### High-Level Implementation

```python
# app/rules/engine.py - NOT executable - conceptual implementation

from typing import List, Optional
from pydantic import BaseModel
from enum import Enum

class JunkClassification(str, Enum):
    JUNK = 'junk'
    SUSPICIOUS = 'suspicious'
    NORMAL = 'normal'

class RuleResult(BaseModel):
    """Result from a single rule evaluation"""
    rule_name: str
    is_junk: bool
    confidence: float            # 0.0 to 1.0
    is_definitive: bool          # If True, skip remaining rules
    reason: str

class JunkResult(BaseModel):
    """Final junk classification result"""
    file_id: str
    classification: JunkClassification
    confidence: float
    matched_rules: List[str]
    reasons: List[str]
    category: str                # 'temporary', 'empty', 'system', etc.

class RuleEngine:
    """
    Rule-based junk file detection engine.
    Evaluates files against a priority-ordered rule set.
    """

    CONFIDENCE_THRESHOLDS = {
        'junk': 0.7,
        'suspicious': 0.4
    }

    def __init__(self, rules: List['BaseRule']):
        # Sort rules by priority (lower = higher priority)
        self.rules = sorted(rules, key=lambda r: r.priority)

    async def evaluate(self, file_metadata: dict) -> JunkResult:
        """
        Evaluate a file against all rules.

        Args:
            file_metadata: Dict with name, path, size, mime_type, etc.

        Returns:
            JunkResult with classification and confidence
        """
        matched_rules = []
        reasons = []
        total_confidence = 0.0
        weights_sum = 0.0

        for rule in self.rules:
            # Check if rule applies to this file type
            if not rule.applies_to(file_metadata):
                continue

            result = await rule.evaluate(file_metadata)

            if result.is_junk:
                matched_rules.append(result.rule_name)
                reasons.append(result.reason)

                # Weight by rule priority and confidence
                weight = 1.0 / (rule.priority + 1)
                total_confidence += result.confidence * weight
                weights_sum += weight

                # Definitive rules short-circuit evaluation
                if result.is_definitive:
                    return JunkResult(
                        file_id=file_metadata['id'],
                        classification=JunkClassification.JUNK,
                        confidence=1.0,
                        matched_rules=matched_rules,
                        reasons=reasons,
                        category=rule.category
                    )

        # Calculate weighted average confidence
        if weights_sum > 0:
            final_confidence = total_confidence / weights_sum
        else:
            final_confidence = 0.0

        # Determine classification
        if final_confidence >= self.CONFIDENCE_THRESHOLDS['junk']:
            classification = JunkClassification.JUNK
        elif final_confidence >= self.CONFIDENCE_THRESHOLDS['suspicious']:
            classification = JunkClassification.SUSPICIOUS
        else:
            classification = JunkClassification.NORMAL

        # Determine primary category
        category = self._determine_category(matched_rules)

        return JunkResult(
            file_id=file_metadata['id'],
            classification=classification,
            confidence=final_confidence,
            matched_rules=matched_rules,
            reasons=reasons,
            category=category
        )
```

---

### Detection Rules

#### Rule Interface

```python
# app/rules/base.py - NOT executable - conceptual implementation

from abc import ABC, abstractmethod
from typing import List

class BaseRule(ABC):
    """
    Abstract base class for junk detection rules.
    Each rule checks for a specific type of junk file.
    """

    name: str                     # Rule identifier
    category: str                 # 'temporary', 'empty', 'system', etc.
    priority: int                 # Lower = higher priority (0-100)
    mime_types: List[str] | None  # Applicable MIME types (None = all)

    def applies_to(self, file_metadata: dict) -> bool:
        """Check if this rule should be applied to the file"""
        if self.mime_types is None:
            return True
        return file_metadata.get('mime_type') in self.mime_types

    @abstractmethod
    async def evaluate(self, file_metadata: dict) -> RuleResult:
        """
        Evaluate the rule against file metadata.

        Args:
            file_metadata: File information dict

        Returns:
            RuleResult with is_junk and confidence
        """
        pass
```

#### Temporary Files Rule

```python
# app/rules/temporary_files.py - NOT executable - conceptual implementation

import re

class TemporaryFilesRule(BaseRule):
    """
    Detect temporary and backup files.

    Patterns:
    - .tmp, .temp extensions
    - ~$prefix (MS Office temp)
    - .swp, .swo (Vim swap)
    - .bak, .backup extensions
    - #filename# (Emacs auto-save)
    """

    name = 'temporary_files'
    category = 'temporary'
    priority = 10
    mime_types = None  # Applies to all files

    PATTERNS = [
        # Extension patterns
        (r'\.tmp$', 'Temporary file extension', 1.0),
        (r'\.temp$', 'Temporary file extension', 1.0),
        (r'\.bak$', 'Backup file extension', 0.9),
        (r'\.backup$', 'Backup file extension', 0.9),
        (r'\.old$', 'Old version extension', 0.7),

        # Prefix patterns
        (r'^~\$', 'MS Office temporary file', 1.0),
        (r'^\.~', 'Hidden temporary file', 0.9),

        # Editor patterns
        (r'\.swp$', 'Vim swap file', 1.0),
        (r'\.swo$', 'Vim swap file', 1.0),
        (r'^#.*#$', 'Emacs auto-save file', 1.0),

        # Suffix patterns
        (r'~$', 'Backup tilde suffix', 0.8),
    ]

    async def evaluate(self, file_metadata: dict) -> RuleResult:
        """Check if file matches temporary file patterns"""
        filename = file_metadata.get('name', '')

        for pattern, reason, confidence in self.PATTERNS:
            if re.search(pattern, filename, re.IGNORECASE):
                return RuleResult(
                    rule_name=self.name,
                    is_junk=True,
                    confidence=confidence,
                    is_definitive=(confidence >= 1.0),
                    reason=reason
                )

        return RuleResult(
            rule_name=self.name,
            is_junk=False,
            confidence=0.0,
            is_definitive=False,
            reason='No temporary patterns matched'
        )
```

#### Empty Files Rule

```python
# app/rules/empty_files.py - NOT executable - conceptual implementation

class EmptyFilesRule(BaseRule):
    """
    Detect empty and near-empty files.

    Criteria:
    - Zero bytes
    - Only whitespace
    - Below minimum threshold for type
    """

    name = 'empty_files'
    category = 'empty'
    priority = 5
    mime_types = None

    # Minimum expected sizes by file type
    MIN_SIZES = {
        'application/pdf': 100,           # PDF header is ~100 bytes
        'application/vnd.ms-excel': 1024,
        'image/jpeg': 500,
        'image/png': 100,
        'text/plain': 1,                  # Text can be 1 byte
    }

    DEFAULT_MIN_SIZE = 0

    async def evaluate(self, file_metadata: dict) -> RuleResult:
        """Check if file is empty or suspiciously small"""
        size = file_metadata.get('size_bytes', 0)
        mime_type = file_metadata.get('mime_type', '')

        # Zero bytes is definitely junk
        if size == 0:
            return RuleResult(
                rule_name=self.name,
                is_junk=True,
                confidence=1.0,
                is_definitive=True,
                reason='File is empty (0 bytes)'
            )

        # Check against minimum size for type
        min_size = self.MIN_SIZES.get(mime_type, self.DEFAULT_MIN_SIZE)

        if size < min_size:
            confidence = 1.0 - (size / min_size)
            return RuleResult(
                rule_name=self.name,
                is_junk=True,
                confidence=confidence,
                is_definitive=False,
                reason=f'File is suspiciously small ({size} bytes)'
            )

        return RuleResult(
            rule_name=self.name,
            is_junk=False,
            confidence=0.0,
            is_definitive=False,
            reason='File size is normal'
        )
```

#### System Files Rule

```python
# app/rules/system_files.py - NOT executable - conceptual implementation

class SystemFilesRule(BaseRule):
    """
    Detect OS-generated system files.

    Types:
    - macOS: .DS_Store, .Spotlight-V100, .Trashes
    - Windows: Thumbs.db, desktop.ini, $RECYCLE.BIN
    - Linux: .directory, lost+found
    """

    name = 'system_files'
    category = 'system'
    priority = 10
    mime_types = None

    SYSTEM_FILES = {
        # macOS
        '.DS_Store': ('macOS folder metadata', 1.0),
        '.Spotlight-V100': ('Spotlight index', 1.0),
        '.Trashes': ('Trash folder', 1.0),
        '.fseventsd': ('File system events', 1.0),
        '.TemporaryItems': ('Temporary items', 1.0),
        '._*': ('macOS resource fork', 0.9),

        # Windows
        'Thumbs.db': ('Windows thumbnails', 1.0),
        'Desktop.ini': ('Windows folder settings', 1.0),
        '$RECYCLE.BIN': ('Windows recycle bin', 1.0),
        'pagefile.sys': ('Windows page file', 1.0),
        'hiberfil.sys': ('Windows hibernate file', 1.0),

        # Linux
        '.directory': ('KDE folder settings', 0.9),
        'lost+found': ('Filesystem recovery', 0.8),

        # General
        '.gitkeep': ('Git placeholder', 0.6),
        '.npmignore': ('NPM ignore file', 0.4),
    }

    SYSTEM_PATHS = [
        '/node_modules/',
        '/.git/',
        '/__pycache__/',
        '/.venv/',
        '/venv/',
        '/.cache/',
    ]

    async def evaluate(self, file_metadata: dict) -> RuleResult:
        """Check if file is a system-generated file"""
        name = file_metadata.get('name', '')
        path = file_metadata.get('path', '')

        # Check filename against known system files
        for pattern, (reason, confidence) in self.SYSTEM_FILES.items():
            if pattern.endswith('*'):
                if name.startswith(pattern[:-1]):
                    return RuleResult(
                        rule_name=self.name,
                        is_junk=True,
                        confidence=confidence,
                        is_definitive=(confidence >= 1.0),
                        reason=reason
                    )
            elif name == pattern:
                return RuleResult(
                    rule_name=self.name,
                    is_junk=True,
                    confidence=confidence,
                    is_definitive=(confidence >= 1.0),
                    reason=reason
                )

        # Check if file is in a system path
        for sys_path in self.SYSTEM_PATHS:
            if sys_path in path:
                return RuleResult(
                    rule_name=self.name,
                    is_junk=True,
                    confidence=0.8,
                    is_definitive=False,
                    reason=f'File in system directory: {sys_path}'
                )

        return RuleResult(
            rule_name=self.name,
            is_junk=False,
            confidence=0.0,
            is_definitive=False,
            reason='Not a system file'
        )
```

---

## File Validation

### Image Validator

```python
# app/validators/image.py - NOT executable - conceptual implementation

from PIL import Image
import io

class ImageValidator:
    """
    Validate image files for corruption or low quality.

    Checks:
    - File can be opened
    - Dimensions are reasonable
    - Not a placeholder image
    """

    MIN_DIMENSION = 10            # Minimum width/height
    MAX_DIMENSION = 50000         # Maximum dimension

    async def validate(self, file_path: str) -> dict:
        """
        Validate an image file.

        Returns:
            dict with is_valid, issues, metadata
        """
        issues = []
        metadata = {}

        try:
            with Image.open(file_path) as img:
                width, height = img.size
                metadata['width'] = width
                metadata['height'] = height
                metadata['format'] = img.format
                metadata['mode'] = img.mode

                # Check dimensions
                if width < self.MIN_DIMENSION or height < self.MIN_DIMENSION:
                    issues.append(f'Image too small: {width}x{height}')

                if width > self.MAX_DIMENSION or height > self.MAX_DIMENSION:
                    issues.append(f'Image dimensions suspicious: {width}x{height}')

                # Check for single-color images (potential placeholders)
                if self._is_single_color(img):
                    issues.append('Image appears to be a placeholder (single color)')

                # Check for corrupt image data
                try:
                    img.verify()
                except Exception as e:
                    issues.append(f'Image verification failed: {e}')

        except Exception as e:
            issues.append(f'Could not open image: {e}')
            return {
                'is_valid': False,
                'issues': issues,
                'metadata': metadata
            }

        return {
            'is_valid': len(issues) == 0,
            'issues': issues,
            'metadata': metadata
        }

    def _is_single_color(self, img: Image) -> bool:
        """Check if image is a single color"""
        # Sample pixels to check for uniformity
        colors = img.getcolors(maxcolors=10)
        if colors and len(colors) == 1:
            return True
        return False
```

---

## Processing Pipeline

### Scheduled Processing

```python
# app/detector.py - NOT executable - conceptual implementation

from apscheduler.schedulers.asyncio import AsyncIOScheduler

class JunkDetector:
    """
    Main junk detection service.
    Runs on schedule to process new files.
    """

    def __init__(self, db_client, rule_engine):
        self.db = db_client
        self.engine = rule_engine
        self.scheduler = AsyncIOScheduler()

    async def start(self):
        """Start the scheduled detector"""
        # Run every 5 minutes
        self.scheduler.add_job(
            self.process_pending_files,
            'interval',
            minutes=5
        )
        self.scheduler.start()

    async def process_pending_files(self):
        """Process files that haven't been checked for junk"""
        files = await self.db.get_unchecked_files(limit=100)

        for file_meta in files:
            result = await self.engine.evaluate(file_meta)

            # Update database with result
            await self.db.update_junk_status(
                file_id=file_meta['id'],
                classification=result.classification,
                confidence=result.confidence,
                reasons=result.reasons,
                category=result.category
            )

            # If definitely junk, update UI flag
            if result.classification == JunkClassification.JUNK:
                await self.db.mark_as_junk(file_meta['id'])
```

---

## Database Updates

### Junk Classification Storage

```sql
-- Update file with junk classification
UPDATE kms_files
SET
    is_junk = $1,
    junk_confidence = $2,
    junk_reasons = $3,
    junk_category = $4,
    junk_checked_at = NOW()
WHERE id = $5;

-- Query junk files for cleanup UI
SELECT
    f.id,
    f.name,
    f.path,
    f.size_bytes,
    f.junk_confidence,
    f.junk_reasons,
    f.junk_category,
    s.name AS source_name
FROM kms_files f
JOIN kms_sources s ON f.source_id = s.id
WHERE f.is_junk = true
  AND f.user_id = $1
  AND f.is_deleted = false
ORDER BY f.junk_confidence DESC, f.size_bytes DESC;
```

---

## Configuration

```yaml
# Environment variables
DATABASE_URL: postgresql://user:pass@postgres:5432/kms

# Detection settings
JUNK_CONFIDENCE_THRESHOLD: 0.7
SUSPICIOUS_THRESHOLD: 0.4
BATCH_SIZE: 100
CHECK_INTERVAL_MINUTES: 5

# Rule settings
ENABLE_TEMPORARY_RULES: true
ENABLE_EMPTY_RULES: true
ENABLE_SYSTEM_RULES: true
ENABLE_LOW_VALUE_RULES: true

# Future ML settings
ML_ENABLED: false
ML_MODEL_PATH: /app/models/junk_classifier.pkl
ML_CONFIDENCE_WEIGHT: 0.5
```

---

## Junk Categories

| Category | Description | Examples |
|----------|-------------|----------|
| `temporary` | Temp/backup files | .tmp, ~$file.docx, .swp |
| `empty` | Zero/minimal content | 0 bytes, whitespace only |
| `system` | OS-generated | .DS_Store, Thumbs.db |
| `cache` | Cache/build artifacts | node_modules/, __pycache__/ |
| `duplicate` | Redundant copies | File (1).pdf, Copy of... |
| `low_value` | Auto-generated | Placeholder images |

---

## Future: ML Classification

### Feature Extraction

```python
# app/ml/features.py - NOT executable - future implementation

class FeatureExtractor:
    """Extract features for ML classification"""

    def extract(self, file_metadata: dict) -> List[float]:
        features = [
            # Size features
            file_metadata['size_bytes'],
            len(file_metadata['name']),
            len(file_metadata['path'].split('/')),

            # Name features
            self._has_version_pattern(file_metadata['name']),
            self._has_date_pattern(file_metadata['name']),
            self._starts_with_dot(file_metadata['name']),

            # Type features
            self._mime_type_category(file_metadata['mime_type']),

            # Location features
            self._folder_depth(file_metadata['path']),
            self._is_in_system_folder(file_metadata['path']),
        ]
        return features
```

---

## Scaling Strategy

| Metric | Threshold | Action |
|--------|-----------|--------|
| Processing backlog | > 10000 files | Increase batch size |
| Processing time | > 10s/file | Investigate |
| Memory usage | > 60% | Optimize |
| Instances | 1-2 | Manual scaling |

