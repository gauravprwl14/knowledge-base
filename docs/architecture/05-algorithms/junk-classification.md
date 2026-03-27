# Junk Classification Algorithm

**Version**: 2.0
**Last Updated**: 2026-01-07

---

## Problem Statement

Identify files that should be cleaned up or excluded from search:
- Temporary files (cache, build artifacts)
- System files (OS metadata, hidden files)
- Empty or near-empty files
- Corrupted files

Uses a rule-based engine with configurable confidence thresholds.

---

## Conceptual Algorithm

```
ALGORITHM: Rule-Based Junk Classification
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INPUT:
  file_id              : String     // File to classify
  file_metadata        : Object     // Name, path, size, mime_type, etc.
  rules                : List[Rule] // Classification rules
  junk_threshold       : Float      // Threshold for junk (default: 0.7)
  suspicious_threshold : Float      // Threshold for suspicious (default: 0.4)

OUTPUT:
  classification       : Object     // Label, confidence, matched rules

PROCEDURE classify_file(file_id, file_metadata, rules, thresholds):

  1. INITIALIZE SCORES
     ──────────────────
     matched_rules ← []
     total_weight ← 0
     weighted_score ← 0

  2. EVALUATE ALL RULES
     ────────────────────
     FOR EACH rule IN rules DO
       IF NOT rule.is_applicable(file_metadata) THEN
         CONTINUE
       END IF

       result ← rule.evaluate(file_metadata)

       IF result.matches THEN
         append(matched_rules, RuleMatch(
           rule_name = rule.name,
           category = rule.category,
           confidence = result.confidence,
           weight = rule.weight,
           reason = result.reason
         ))

         weighted_score ← weighted_score + (result.confidence × rule.weight)
         total_weight ← total_weight + rule.weight
       END IF
     END FOR

  3. CALCULATE FINAL SCORE
     ───────────────────────
     IF total_weight = 0 THEN
       final_score ← 0
     ELSE
       final_score ← weighted_score / total_weight
     END IF

  4. DETERMINE CLASSIFICATION
     ──────────────────────────
     IF final_score >= junk_threshold THEN
       label ← 'junk'
     ELSE IF final_score >= suspicious_threshold THEN
       label ← 'suspicious'
     ELSE
       label ← 'normal'
     END IF

  5. RETURN Classification(
       file_id = file_id,
       label = label,
       confidence = final_score,
       matched_rules = matched_rules,
       recommendation = get_recommendation(label)
     )

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

HELPER: get_recommendation(label)
  SWITCH label
    CASE 'junk':
      RETURN 'delete'           // Safe to delete
    CASE 'suspicious':
      RETURN 'review'           // User should review
    CASE 'normal':
      RETURN 'keep'             // Keep in system
  END SWITCH
```

---

## High-Level Implementation

```python
# app/classification/junk_detector.py - NOT executable - conceptual implementation

import re
from abc import ABC, abstractmethod
from typing import List, Optional
from dataclasses import dataclass
from enum import Enum

class JunkCategory(Enum):
    TEMPORARY = "temporary"
    SYSTEM = "system"
    EMPTY = "empty"
    CORRUPTED = "corrupted"


class Recommendation(Enum):
    DELETE = "delete"
    REVIEW = "review"
    KEEP = "keep"


@dataclass
class RuleMatch:
    rule_name: str
    category: JunkCategory
    confidence: float
    weight: float
    reason: str


@dataclass
class Classification:
    file_id: str
    label: str  # 'junk', 'suspicious', 'normal'
    confidence: float
    matched_rules: List[RuleMatch]
    recommendation: Recommendation


class JunkRule(ABC):
    """
    Base class for junk detection rules.

    Each rule:
    - Has a name and category
    - Has a weight (importance)
    - Implements is_applicable() and evaluate()
    """

    name: str
    category: JunkCategory
    weight: float = 1.0

    @abstractmethod
    def is_applicable(self, metadata: dict) -> bool:
        """Check if this rule applies to the file type"""
        pass

    @abstractmethod
    def evaluate(self, metadata: dict) -> Optional[RuleMatch]:
        """Evaluate the file and return match if detected"""
        pass


class TemporaryFilesRule(JunkRule):
    """Detect temporary and cache files"""

    name = "temporary_files"
    category = JunkCategory.TEMPORARY
    weight = 1.0

    TEMP_PATTERNS = [
        r'\.tmp$',
        r'\.temp$',
        r'~$',
        r'\.swp$',
        r'\.swo$',
        r'\.bak$',
        r'\.backup$',
        r'\.cache$',
        r'^~\$',           # Office temp files
        r'\.DS_Store$',
        r'Thumbs\.db$',
        r'\.pyc$',
        r'__pycache__',
        r'node_modules',
        r'\.git/',
        r'\.log$',
    ]

    TEMP_DIRS = [
        '/tmp/',
        '/temp/',
        '/.cache/',
        '/cache/',
        '/node_modules/',
        '/__pycache__/',
        '/build/',
        '/dist/',
        '/.next/',
    ]

    def is_applicable(self, metadata: dict) -> bool:
        return True  # Applies to all files

    def evaluate(self, metadata: dict) -> Optional[RuleMatch]:
        name = metadata.get('name', '').lower()
        path = metadata.get('path', '').lower()

        # Check filename patterns
        for pattern in self.TEMP_PATTERNS:
            if re.search(pattern, name, re.IGNORECASE):
                return RuleMatch(
                    rule_name=self.name,
                    category=self.category,
                    confidence=0.95,
                    weight=self.weight,
                    reason=f"Matches temp pattern: {pattern}"
                )

        # Check directory patterns
        for temp_dir in self.TEMP_DIRS:
            if temp_dir in path:
                return RuleMatch(
                    rule_name=self.name,
                    category=self.category,
                    confidence=0.9,
                    weight=self.weight,
                    reason=f"Located in temp directory: {temp_dir}"
                )

        return None


class EmptyFilesRule(JunkRule):
    """Detect empty or near-empty files"""

    name = "empty_files"
    category = JunkCategory.EMPTY
    weight = 0.8

    EMPTY_THRESHOLD = 0          # Zero bytes
    NEAR_EMPTY_THRESHOLD = 10    # Less than 10 bytes

    def is_applicable(self, metadata: dict) -> bool:
        return 'size_bytes' in metadata

    def evaluate(self, metadata: dict) -> Optional[RuleMatch]:
        size = metadata.get('size_bytes', 0)

        if size <= self.EMPTY_THRESHOLD:
            return RuleMatch(
                rule_name=self.name,
                category=self.category,
                confidence=1.0,
                weight=self.weight,
                reason="File is empty (0 bytes)"
            )

        if size <= self.NEAR_EMPTY_THRESHOLD:
            return RuleMatch(
                rule_name=self.name,
                category=self.category,
                confidence=0.8,
                weight=self.weight,
                reason=f"File is near-empty ({size} bytes)"
            )

        return None


class SystemFilesRule(JunkRule):
    """Detect system and hidden files"""

    name = "system_files"
    category = JunkCategory.SYSTEM
    weight = 0.9

    SYSTEM_PATTERNS = [
        r'^\..*',              # Hidden files (start with .)
        r'desktop\.ini$',
        r'\.DS_Store$',
        r'Thumbs\.db$',
        r'\.Spotlight-V100',
        r'\.Trashes',
        r'\.fseventsd',
        r'Icon\r$',
    ]

    SYSTEM_MIME_TYPES = [
        'application/x-trash',
        'application/x-desktop',
    ]

    def is_applicable(self, metadata: dict) -> bool:
        return True

    def evaluate(self, metadata: dict) -> Optional[RuleMatch]:
        name = metadata.get('name', '')
        mime_type = metadata.get('mime_type', '')

        # Check system patterns
        for pattern in self.SYSTEM_PATTERNS:
            if re.match(pattern, name):
                return RuleMatch(
                    rule_name=self.name,
                    category=self.category,
                    confidence=0.85,
                    weight=self.weight,
                    reason=f"Matches system pattern: {pattern}"
                )

        # Check mime types
        if mime_type in self.SYSTEM_MIME_TYPES:
            return RuleMatch(
                rule_name=self.name,
                category=self.category,
                confidence=0.9,
                weight=self.weight,
                reason=f"System mime type: {mime_type}"
            )

        return None


class DuplicateIndicatorRule(JunkRule):
    """Detect files that indicate copies"""

    name = "duplicate_indicator"
    category = JunkCategory.TEMPORARY
    weight = 0.6  # Lower weight - needs user review

    COPY_PATTERNS = [
        r'\s*\(\d+\)$',           # file (1).txt
        r'\s*-\s*Copy\s*\d*$',    # file - Copy.txt
        r'\s*copy\s*\d*$',        # file copy.txt
        r'_\d{8}_\d{6}$',         # file_20240101_120000.txt
    ]

    def is_applicable(self, metadata: dict) -> bool:
        return True

    def evaluate(self, metadata: dict) -> Optional[RuleMatch]:
        name = metadata.get('name', '')
        # Remove extension for pattern matching
        name_without_ext = re.sub(r'\.[^.]+$', '', name)

        for pattern in self.COPY_PATTERNS:
            if re.search(pattern, name_without_ext, re.IGNORECASE):
                return RuleMatch(
                    rule_name=self.name,
                    category=self.category,
                    confidence=0.7,
                    weight=self.weight,
                    reason=f"Name suggests copy: {pattern}"
                )

        return None


class OldFilesRule(JunkRule):
    """Detect very old files that haven't been accessed"""

    name = "old_files"
    category = JunkCategory.TEMPORARY
    weight = 0.4  # Low weight - age alone doesn't mean junk

    STALE_DAYS = 365 * 2  # 2 years

    def is_applicable(self, metadata: dict) -> bool:
        return 'last_accessed' in metadata or 'last_modified' in metadata

    def evaluate(self, metadata: dict) -> Optional[RuleMatch]:
        from datetime import datetime, timedelta

        now = datetime.utcnow()
        cutoff = now - timedelta(days=self.STALE_DAYS)

        last_accessed = metadata.get('last_accessed')
        last_modified = metadata.get('last_modified')

        # Use most recent activity
        last_activity = max(
            last_accessed or datetime.min,
            last_modified or datetime.min
        )

        if last_activity < cutoff:
            days_old = (now - last_activity).days
            return RuleMatch(
                rule_name=self.name,
                category=self.category,
                confidence=0.5,
                weight=self.weight,
                reason=f"Not accessed in {days_old} days"
            )

        return None


class JunkClassifier:
    """
    Main classifier that applies all rules.

    Configuration:
    - junk_threshold: 0.7 (high confidence = definitely junk)
    - suspicious_threshold: 0.4 (medium confidence = review)
    - Below 0.4 = normal file
    """

    JUNK_THRESHOLD = 0.7
    SUSPICIOUS_THRESHOLD = 0.4

    def __init__(self, custom_rules: List[JunkRule] = None):
        # Default rules
        self.rules = [
            TemporaryFilesRule(),
            EmptyFilesRule(),
            SystemFilesRule(),
            DuplicateIndicatorRule(),
            OldFilesRule(),
        ]

        # Add custom rules
        if custom_rules:
            self.rules.extend(custom_rules)

    async def classify(
        self,
        file_id: str,
        metadata: dict
    ) -> Classification:
        """
        Classify a file based on all applicable rules.

        Process:
        1. Evaluate all applicable rules
        2. Calculate weighted score
        3. Determine classification label
        4. Return classification with recommendations
        """
        matched_rules = []
        total_weight = 0.0
        weighted_score = 0.0

        # Evaluate each rule
        for rule in self.rules:
            if not rule.is_applicable(metadata):
                continue

            match = rule.evaluate(metadata)
            if match:
                matched_rules.append(match)
                weighted_score += match.confidence * match.weight
                total_weight += match.weight

        # Calculate final score
        if total_weight > 0:
            final_score = weighted_score / total_weight
        else:
            final_score = 0.0

        # Determine classification
        if final_score >= self.JUNK_THRESHOLD:
            label = 'junk'
            recommendation = Recommendation.DELETE
        elif final_score >= self.SUSPICIOUS_THRESHOLD:
            label = 'suspicious'
            recommendation = Recommendation.REVIEW
        else:
            label = 'normal'
            recommendation = Recommendation.KEEP

        return Classification(
            file_id=file_id,
            label=label,
            confidence=final_score,
            matched_rules=matched_rules,
            recommendation=recommendation
        )

    async def classify_batch(
        self,
        files: List[dict]
    ) -> List[Classification]:
        """Classify multiple files"""
        results = []
        for file_data in files:
            result = await self.classify(
                file_id=file_data['id'],
                metadata=file_data
            )
            results.append(result)
        return results
```

---

## Rule Categories

| Category | Examples | Weight | Confidence |
|----------|----------|--------|------------|
| Temporary | .tmp, .cache, node_modules | 1.0 | 0.9-0.95 |
| System | .DS_Store, Thumbs.db, hidden | 0.9 | 0.85-0.9 |
| Empty | 0 bytes, <10 bytes | 0.8 | 0.8-1.0 |
| Duplicate Indicator | file (1).txt, Copy of | 0.6 | 0.7 |
| Old Files | Not accessed in 2+ years | 0.4 | 0.5 |

---

## Classification Thresholds

| Score Range | Label | Recommendation |
|-------------|-------|----------------|
| 0.7 - 1.0 | junk | Delete automatically or with confirmation |
| 0.4 - 0.7 | suspicious | Present to user for review |
| 0.0 - 0.4 | normal | Keep in system |

---

## Complexity Analysis

| Operation | Time | Space |
|-----------|------|-------|
| Rule evaluation | O(r) | O(1) |
| Pattern matching | O(p × n) | O(1) |
| Classification | O(r) | O(m) |

Where:
- r = number of rules
- p = patterns per rule
- n = filename length
- m = matched rules

---

## Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `junk_threshold` | 0.7 | Score for definite junk |
| `suspicious_threshold` | 0.4 | Score for review needed |
| `stale_days` | 730 | Days for old file detection |

---

## Extensibility

### Adding Custom Rules

```python
class LargeMediaRule(JunkRule):
    """Custom rule for large media files"""

    name = "large_media"
    category = JunkCategory.TEMPORARY
    weight = 0.3  # Low weight - large doesn't mean junk

    SIZE_THRESHOLD = 100 * 1024 * 1024  # 100MB

    MEDIA_EXTENSIONS = ['.mp4', '.avi', '.mov', '.mkv']

    def is_applicable(self, metadata: dict) -> bool:
        ext = metadata.get('extension', '').lower()
        return ext in self.MEDIA_EXTENSIONS

    def evaluate(self, metadata: dict) -> Optional[RuleMatch]:
        size = metadata.get('size_bytes', 0)

        if size > self.SIZE_THRESHOLD:
            return RuleMatch(
                rule_name=self.name,
                category=self.category,
                confidence=0.4,
                weight=self.weight,
                reason=f"Large media file ({size // (1024*1024)}MB)"
            )

        return None

# Usage
classifier = JunkClassifier(custom_rules=[LargeMediaRule()])
```

---

## Use Cases

| Scenario | Expected Result |
|----------|-----------------|
| `.tmp` file | junk (0.95) |
| `.DS_Store` | junk (0.85) |
| `file (1).pdf` | suspicious (0.7) |
| `report.pdf` (2 years old) | suspicious (0.5) |
| `presentation.pptx` (recent) | normal (0.0) |
| Empty `notes.txt` | junk (1.0) |

