# Sequence Diagram: File Viewer — Drawer Flow

**Feature**: File Rendering Engine — Hybrid Drawer Mode
**ADRs**: ADR-0031 (MIME registry), ADR-0032 (hybrid UX), ADR-0033 (WebSocket status)
**Created**: 2026-03-27

---

## Happy Path — Indexed File (Image)

```
User              FilesBrowserPage     FilesDrawer       kms-api          FileViewerShell    ImageViewer
 |                      |                   |               |                    |                |
 |-- click FileCard --> |                   |               |                    |                |
 |                      |-- setSelectedFileId(id) -->|     |                    |                |
 |                      |-- render <FilesDrawer /> ->|     |                    |                |
 |                      |                   |               |                    |                |
 |                      |           open drawer (200ms CSS translate)           |                |
 |                      |                   |               |                    |                |
 |                      |                   |-- GET /files/:id --------------->  |                |
 |                      |                   |               |                    |                |
 |                      |                   |<-- KMSFile {mimeType, storageUrl} |                |
 |                      |                   |               |                    |                |
 |                      |                   |-- render <FileViewerShell file={} mode="drawer"> ->|
 |                      |                   |               |                    |                |
 |                      |                   |               |       getViewer('image/jpeg')       |
 |                      |                   |               |       → registry lookup             |
 |                      |                   |               |       → lazy(() => ImageViewer)     |
 |                      |                   |               |                    |                |
 |                      |                   |               |          <Suspense fallback=Skeleton>
 |                      |                   |               |                    |-- lazy load -> |
 |                      |                   |               |                    |                |
 |                      |                   |               |                    |<- ImageViewer loaded
 |                      |                   |               |                    |                |
 |                      |                   |               |                    |-- render(file.storageUrl) -->
 |<--------------------------------------------------------------------- image displayed --------|
 |                      |                   |               |                    |                |
 |-- click "Open full view" -->             |               |                    |                |
 |                      |-- router.push('/files/:id') -->   |                    |                |
```

---

## Processing File — WebSocket Status Updates

```
User              FilesDrawer       kms-api WS        embed-worker       FileViewerShell    ProcessingStatus
 |                    |                  |                  |                    |                |
 |-- click FileCard ->|                  |                  |                    |                |
 |                    |-- GET /files/:id -->                |                    |                |
 |                    |<-- KMSFile {status: 'PROCESSING'}   |                    |                |
 |                    |                  |                  |                    |                |
 |                    |-- render <FileViewerShell mode="drawer"> -->             |                |
 |                    |                  |                  |          status=PROCESSING → mount ProcessingStatus
 |                    |                  |                  |                    |-- render ProgressBar(0%) -->
 |<---------------------------------------------- "Processing..." shown --------|                |
 |                    |                  |                  |                    |                |
 |                    |-- useFileStatus(fileId) opens WS -> |                    |                |
 |                    |                  |-- ws.on('subscribe', {fileId}) -->    |                |
 |                    |                  |-- client.join('file:{fileId}') -->    |                |
 |                    |                  |                  |                    |                |
 |                    |                  |       embed-worker publishes {fileId, progress: 45}    |
 |                    |                  |<-- Redis pub/sub event                |                |
 |                    |                  |-- emit to room 'file:{fileId}' -->    |                |
 |                    |<-- WS event {progress: 45}          |                    |                |
 |                    |                  |                  |          ProcessingStatus updates   |
 |<---------------------------------------------- ProgressBar(45%) shown --------|               |
 |                    |                  |                  |                    |                |
 |                    |                  |       embed-worker publishes {fileId, status: INDEXED} |
 |                    |<-- WS event {status: 'INDEXED', progress: 100}          |                |
 |                    |                  |                  |          status=INDEXED → unmount ProcessingStatus
 |                    |                  |                  |                    |-- refetch file ->
 |                    |-- GET /files/:id -->                |                    |                |
 |                    |<-- KMSFile {status: 'INDEXED', storageUrl: '...'}       |                |
 |                    |                  |                  |          mount correct viewer       |
 |<---------------------------------------------- file now displayed -----------|                |
```

---

## Error Path

```
User              FilesDrawer       kms-api          FileViewerShell    ImageViewer.Error
 |                    |                |                    |                |
 |-- click FileCard ->|                |                    |                |
 |                    |-- GET /files/:id -->                |                |
 |                    |<-- KMSFile {status: 'ERROR'}        |                |
 |                    |-- render <FileViewerShell> -->       |                |
 |                    |                |         status=ERROR → getViewer → ImageViewer
 |                    |                |                    |-- render ErrorState -->
 |<------------------------------------ "Could not load file. [Download]" ---|
 |-- click Download ->|                |                    |                |
 |                    |-- window.open(file.webViewLink) -->  |                |
```
