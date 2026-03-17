# PRD: M09 — Knowledge Graph

## Status

`Approved`

**Created**: 2026-03-17
**Depends on**: M00, M03 (chunks available), M04 (embeddings optional)
**Feature gate**: `features.graph.enabled`

---

## Business Context

Files don't exist in isolation — they're connected through shared topics, entities, and concepts. The knowledge graph makes these relationships explicit: a meeting note mentions "Project Helios" which also appears in 12 other files. The graph lets users discover connections they didn't know existed, navigate by concept rather than filename, and understand their knowledge base's structure holistically.

---

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-01 | Entity extraction: spaCy `en_core_web_sm` — PERSON, ORG, GPE, EVENT, PRODUCT | Must |
| FR-02 | Neo4j nodes: `File`, `Folder`, `Entity`, `Concept`, `Chunk` | Must |
| FR-03 | Relationships: `CONTAINS`, `MENTIONS`, `CO_OCCURS_WITH` (within same chunk), `BELONGS_TO_FOLDER` | Must |
| FR-04 | Community detection: Neo4j GDS Leiden algorithm | Should |
| FR-05 | `GET /api/v1/graph/entities` — list entities (paginated, filter by type) | Must |
| FR-06 | `GET /api/v1/graph/entity/{id}/related` — files + entities related to this entity | Must |
| FR-07 | `GET /api/v1/graph/file/{id}/neighbors` — graph neighbors of a file (depth=2) | Must |
| FR-08 | `GET /api/v1/graph/communities` — community clusters | Should |
| FR-09 | `GET /api/v1/graph/path?from=&to=` — shortest path between two nodes | Could |
| FR-10 | Feature gate: `features.graph.enabled = false` → skip all graph ops | Must |

---

## Non-Functional Requirements

| Concern | Requirement |
|---------|-------------|
| Entity extraction | ≥ 50 chunks/min |
| Graph query | `GET /entity/{id}/related` < 500ms (Neo4j indexed) |
| Community detection | Run as batch job (not per-file) |
| Neo4j version | 5.x Community Edition |

---

## Neo4j Schema

```cypher
// Constraints
CREATE CONSTRAINT file_id FOR (f:File) REQUIRE f.id IS UNIQUE;
CREATE CONSTRAINT entity_unique FOR (e:Entity) REQUIRE (e.name, e.type) IS UNIQUE;
CREATE CONSTRAINT folder_id FOR (f:Folder) REQUIRE f.id IS UNIQUE;

// Indexes
CREATE INDEX file_user_id FOR (f:File) ON (f.user_id);
CREATE INDEX entity_type FOR (e:Entity) ON (e.type);

// Example nodes
(:File { id, name, user_id, source_id, mime_type })
(:Entity { name, type })  // type: PERSON | ORG | GPE | EVENT
(:Folder { id, path, user_id })
(:Concept { name, community_id })

// Example relationships
(:File)-[:MENTIONS]->(:Entity)
(:Entity)-[:CO_OCCURS_WITH { weight: N }]->(:Entity)
(:File)-[:BELONGS_TO_FOLDER]->(:Folder)
(:Folder)-[:CONTAINS]->(:Folder)
```

---

## Queue Message

```python
class GraphBuildMessage(BaseModel):
    file_id: str
    chunk_ids: list[str]
    user_id: str
    source_id: str
```

---

## Testing Plan

| Test | Key Cases |
|------|-----------|
| Unit: EntityExtractor | "Elon Musk founded SpaceX" → PERSON + ORG entities |
| Unit: GraphBuilder | Node creation, relationship creation, duplicate handling |
| Integration | graph-worker → Neo4j: nodes created, can be queried |
| E2E | Index file with known entities → GET /graph/entities → entity appears |

---

## ADR Links

- [ADR-0011](../architecture/decisions/0011-neo4j-graph-db.md) (Neo4j official driver)
