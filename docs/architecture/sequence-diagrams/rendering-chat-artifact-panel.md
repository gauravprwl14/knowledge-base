# Sequence Diagram: Chat Artifact Panel Flow

**Feature**: File Rendering Engine — Chat Artifact Panel (Sprint 3)
**ADRs**: ADR-0031 (MIME registry), ADR-0032 (hybrid UX — mode="artifact")
**Created**: 2026-03-27

---

## Happy Path — AI References a File

```
User         ChatPage      use-chat.ts     ACP (RAG service)    ChatArtifactPanel   FileViewerShell
 |               |               |                |                    |                  |
 |-- send msg -> |               |                |                    |                  |
 |               |-- acpPromptStream(sessionId, question) -->         |                  |
 |               |               |-- POST /acp/v1/sessions/:id/prompt |                  |
 |               |               |                |                    |                  |
 |               |               |<-- SSE: agent_message_chunk {token} (streaming)       |
 |               |<-- onChunk(token) -- |          |                    |                  |
 |<-- text accumulates in ChatMessage   |          |                    |                  |
 |               |               |                |                    |                  |
 |               |               |  [RAG pipeline retrieves chunk from file X]            |
 |               |               |<-- SSE: file_reference {fileId, filename, mimeType}   |
 |               |               |-- onFileReference({fileId, filename, mimeType}) -->   |
 |               |               |                |   setActiveArtifact({fileId, ...}) ->|
 |               |               |                |                    |                  |
 |               |               |                |      ChatArtifactPanel panel opens (if not open)
 |               |               |                |                    |-- GET /files/:id -->
 |               |               |                |                    |<-- KMSFile {}    |
 |               |               |                |                    |-- render <FileViewerShell mode="artifact"> -->
 |               |               |                |                    |                  |-- registry lookup
 |               |               |                |                    |                  |-- lazy load viewer
 |<------------------------------------------------------- artifact panel shows file -----|
 |               |               |                |                    |                  |
 |               |               |<-- SSE: agent_message_chunk (continues)                |
 |<-- text stream continues while artifact is visible                  |                  |
 |               |               |                |                    |                  |
 |               |               |<-- SSE: done   |                    |                  |
 |               |-- stream complete              |                    |                  |
```

---

## Multiple File References in One Session

```
User         ChatPage      use-chat.ts     ChatArtifactPanel    ArtifactPanel.TabBar
 |               |               |                |                    |
 |-- send msg 1 ->               |                |                    |
 |               |               |<-- file_reference {fileId: "A"} --> |
 |               |               |-- setActiveArtifact("A") ---------->|
 |               |               |                |   panel shows file A, tab "A" active
 |               |               |                |                    |
 |-- send msg 2 ->               |                |                    |
 |               |               |<-- file_reference {fileId: "B"} --> |
 |               |               |-- appendArtifact("B") ------------>|
 |               |               |                |   tab "B" added, panel switches to B
 |               |               |                |                    |
 |-- click tab "A" -------------->                |                    |
 |               |               |                |-- setActiveArtifact("A") -> panel shows file A
 |               |               |                |   (file A already loaded, no re-fetch)
```

---

## Mobile — Expandable Inline Card (Viewport < 768px)

```
User          ChatMessage        ExpandableArtifactCard    FileViewerShell
 |                |                      |                       |
 |                |  [file_reference received, viewport is mobile]
 |                |-- render <ExpandableArtifactCard file={} /> -->
 |<-- compact card shown: [🎥 video.mp4  ▶ Preview]             |
 |                |                      |                       |
 |-- tap "Preview" ->                    |                       |
 |                |-- setExpanded(true) ->|                      |
 |                |                      |-- render <FileViewerShell mode="inline"> -->
 |<-- card expands in-place (200ms) with mini VideoPlayer        |
 |                |                      |                       |
 |-- tap to collapse ->                  |                       |
 |                |-- setExpanded(false)->|                      |
```

---

## SSE Protocol Extension

The following SSE event type must be added to `use-chat.ts` and the RAG service:

```ts
// New event type in use-chat.ts SSE handler
type SSEEvent =
  | { type: 'agent_message_chunk'; token: string }
  | { type: 'tool_call_start'; tool: string; args: unknown }
  | { type: 'tool_call_result'; resultCount: number }
  | { type: 'file_reference'; fileId: string; filename: string; mimeType: string }  // NEW
  | { type: 'done' }
  | { type: 'error'; message: string }
```

The RAG service emits `file_reference` when a retrieved chunk's source file should be surfaced to the user. It should emit at most one `file_reference` per unique file per response to avoid flooding the artifact panel.
