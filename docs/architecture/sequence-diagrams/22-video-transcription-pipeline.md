# Sequence Diagram 22 — Video Transcription Pipeline

## Overview

Shows the fully automated pipeline that takes a video/audio file from discovery through Whisper transcription to Qdrant indexing. No user interaction is involved — the pipeline is driven entirely by AMQP messages.

```mermaid
sequenceDiagram
    participant MQ1 as RabbitMQ (kms.embed)
    participant EW as embed-worker (Python)
    participant MQ2 as RabbitMQ (kms.voice)
    participant VA as voice-app (Python / Whisper)
    participant MQ3 as RabbitMQ (kms.embed)
    participant QD as Qdrant
    participant PG as PostgreSQL

    MQ1->>EW: consume FileDiscoveredMessage<br/>{ file_id, source_id, user_id, file_path, mime_type, ... }

    EW->>EW: Check MIME type (e.g. "video/mp4")

    alt MIME type is audio or video
        EW->>EW: mutagen.File(file_path) → extract metadata<br/>(duration_secs, codec, bitrate)

        EW->>EW: Evaluate filter rules from source configJson:<br/>① voiceTranscription.enabled feature flag = true?<br/>② transcribeVideos = true in source config?<br/>③ file size ≤ maxFileSizeMb?<br/>④ duration ≥ transcriptionMinDurationSecs?<br/>⑤ filename NOT matching excludePatterns?

        alt All filter rules pass
            EW->>MQ2: publish VoiceJobMessage → kms.voice<br/>{ job_id (new UUID), file_id, source_id, user_id,<br/>  file_path, original_filename, mime_type, language: null }
            MQ2-->>EW: ack

            EW->>PG: INSERT INTO kms_voice_jobs<br/>(id=job_id, file_id, source_id, status=PENDING, created_at=now)
            PG-->>EW: Inserted row

            Note over EW,QD: Step 3e: Metadata chunk (title + duration) allows search to return<br/>the video even before transcription completes

            EW->>QD: upsert metadata chunk to kms_chunks collection<br/>payload: { user_id, source_id, file_id, filename,<br/>  content="[Video] {filename} — {duration_secs}s", source_type="video_metadata" }
            QD-->>EW: ack

            EW->>MQ1: ack FileDiscoveredMessage

        else Filter rules NOT met
            EW->>PG: UPDATE kms_files SET status = INDEXED WHERE id = :file_id
            PG-->>EW: Updated row
            EW->>MQ1: ack FileDiscoveredMessage (skipped transcription)
        end

    else MIME type is not audio/video
        Note over EW: Normal text/document extraction path (not shown here)
    end

    MQ2->>VA: consume VoiceJobMessage (prefetch=1)<br/>{ job_id, file_id, source_id, user_id, file_path, original_filename, mime_type, language }

    VA->>PG: UPDATE kms_voice_jobs SET status = PROCESSING, started_at = now WHERE id = :job_id
    PG-->>VA: Updated row

    VA->>VA: Download / read audio file from file_path

    VA->>VA: whisper.transcribe(file_path, language=None)<br/>Auto-detects language<br/>Returns: text (full transcript), language,<br/>segments [{ start_secs, end_secs, text }, ...]

    VA->>MQ3: publish TranscriptionResultMessage → kms.embed<br/>{ scan_job_id=voice_job_id, source_id, user_id,<br/>  file_path, original_filename, mime_type="text/plain",<br/>  extracted_text=full_transcript,<br/>  source_type="voice_transcript",<br/>  source_metadata: { detected_language, audio_duration_seconds,<br/>    voice_job_id, segments: [{ start_secs, end_secs, text }] } }
    MQ3-->>VA: ack

    VA->>PG: UPDATE kms_voice_jobs SET<br/>status = COMPLETED, transcript = text,<br/>language = detected_language,<br/>duration_seconds = audio_duration_seconds<br/>WHERE id = :job_id
    PG-->>VA: Updated row

    VA->>MQ2: ack VoiceJobMessage

    Note over MQ3,EW: Step 12–18: Same embed-worker handles both regular files and<br/>transcription results via source_type discriminator

    MQ3->>EW: consume TranscriptionResultMessage from kms.embed
    EW->>EW: Detect source_type = "voice_transcript"<br/>Treat extracted_text as pre-extracted content (skip file read)

    EW->>EW: Chunk transcript: 512 chars, 64-char overlap<br/>→ N chunks

    loop For each chunk
        Note over EW: Step 15: start_secs aligns chunk to timestamp for deep linking
        EW->>EW: Align chunk to segment timestamps<br/>→ compute start_secs from segments[]
        EW->>EW: BGE-M3 encode(chunk_text) → 1024-dim vector
        EW->>QD: upsert point to kms_chunks collection<br/>payload: { user_id, source_id, file_id, filename,<br/>  content=chunk_text, chunk_index, source_type="voice_transcript",<br/>  start_secs }
        QD-->>EW: ack
    end

    EW->>PG: UPDATE kms_files SET status = INDEXED, chunk_count = N WHERE id = :file_id
    PG-->>EW: Updated row

    EW->>MQ3: ack TranscriptionResultMessage
```

## Key Design Points

| Aspect | Detail |
|--------|--------|
| Filter evaluation | All 5 rules must pass; any failure routes the file to `INDEXED` (skipped) without retrying |
| Prefetch = 1 | voice-app processes one transcription at a time to avoid GPU/CPU memory exhaustion |
| Language detection | `language=None` passed to Whisper; auto-detected language stored in `kms_voice_jobs.language` |
| Metadata pre-indexing | Step 3e indexes a short metadata chunk immediately so search can surface the file during transcription |
| Timestamp alignment | Chunk→segment alignment uses `segments[].start_secs` to enable deep-link playback |
| Source type discriminator | `source_type="voice_transcript"` tells embed-worker to skip file extraction and use `extracted_text` directly |
| Idempotency | Qdrant upsert by point ID ensures re-runs don't duplicate chunks |
