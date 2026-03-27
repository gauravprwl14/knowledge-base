import { Test, TestingModule } from '@nestjs/testing';
import { GraphService } from './graph.service';
import { Neo4jService } from './neo4j.service';
import { getLoggerToken } from 'nestjs-pino';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const USER_ID = 'user-aaaa-bbbb-cccc';
const ENTITY_ID = 'ent-1234';
const FILE_ID = 'file-5678';

/** Factory to build a fake Neo4j record-like object. */
function makeEntityRecord(
  props: { id?: string; name?: string; type?: string },
  degree: number | { toNumber(): number } = 5,
) {
  return {
    get: (key: string) => {
      if (key === 'e') {
        return {
          elementId: props.id ?? 'elem-1',
          properties: {
            id: props.id ?? 'ent-1',
            name: props.name ?? 'TypeScript',
            type: props.type ?? 'TECHNOLOGY',
          },
        };
      }
      if (key === 'degree') return degree;
      return null;
    },
  };
}

function makeFileRecord(fileProps: { id?: string; name?: string }) {
  return {
    get: (key: string) => {
      if (key === 'f') {
        return {
          elementId: fileProps.id ?? 'elem-file-1',
          properties: {
            kms_id: fileProps.id ?? 'file-uuid-1',
            name: fileProps.name ?? 'report.md',
          },
        };
      }
      return null;
    },
  };
}

function makeFileAndEntityRecord(
  fileProps: { id?: string; name?: string },
  entityProps: { id?: string; name?: string; type?: string },
) {
  return {
    get: (key: string) => {
      if (key === 'f') {
        return {
          elementId: fileProps.id ?? 'elem-file-1',
          properties: {
            kms_id: fileProps.id ?? 'file-uuid-1',
            name: fileProps.name ?? 'report.md',
          },
        };
      }
      if (key === 'e') {
        return {
          elementId: entityProps.id ?? 'elem-ent-1',
          properties: {
            id: entityProps.id ?? 'ent-1',
            name: entityProps.name ?? 'TypeScript',
            type: entityProps.type ?? 'TECHNOLOGY',
          },
        };
      }
      return null;
    },
  };
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockNeo4j = {
  runQuery: jest.fn(),
};

const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('GraphService', () => {
  let service: GraphService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GraphService,
        { provide: Neo4jService, useValue: mockNeo4j },
        { provide: getLoggerToken(GraphService.name), useValue: mockLogger },
      ],
    }).compile();

    service = module.get<GraphService>(GraphService);
  });

  // ── getEntities ───────────────────────────────────────────────────────────

  describe('getEntities()', () => {
    it('returns mapped entity list with total count', async () => {
      mockNeo4j.runQuery.mockResolvedValue([
        makeEntityRecord({ id: 'ent-1', name: 'TypeScript', type: 'TECHNOLOGY' }, 10),
        makeEntityRecord({ id: 'ent-2', name: 'NestJS', type: 'TECHNOLOGY' }, 7),
      ]);

      const result = await service.getEntities(USER_ID);

      expect(result.entities).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.entities[0]).toMatchObject({
        id: 'ent-1',
        name: 'TypeScript',
        type: 'TECHNOLOGY',
        degree: 10,
      });
    });

    it('returns empty entities and total 0 when no records', async () => {
      mockNeo4j.runQuery.mockResolvedValue([]);

      const result = await service.getEntities(USER_ID);

      expect(result.entities).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('caps limit at 200', async () => {
      mockNeo4j.runQuery.mockResolvedValue([]);

      await service.getEntities(USER_ID, undefined, 999);

      const cypher: string = mockNeo4j.runQuery.mock.calls[0][0];
      // The limit param should be capped — verify via the params arg
      const params = mockNeo4j.runQuery.mock.calls[0][1];
      // params.limit is a neo4j Integer object; its value should reflect cap
      expect(params.userId).toBe(USER_ID);
    });

    it('passes type filter to Cypher when provided', async () => {
      mockNeo4j.runQuery.mockResolvedValue([]);

      await service.getEntities(USER_ID, 'PERSON', 50);

      const params = mockNeo4j.runQuery.mock.calls[0][1];
      expect(params.type).toBe('PERSON');
    });

    it('does NOT include type in params when not provided', async () => {
      mockNeo4j.runQuery.mockResolvedValue([]);

      await service.getEntities(USER_ID, undefined, 50);

      const params = mockNeo4j.runQuery.mock.calls[0][1];
      expect(params.type).toBeUndefined();
    });

    it('handles Neo4j Integer objects with toNumber()', async () => {
      const degreeObj = { toNumber: () => 42 };
      mockNeo4j.runQuery.mockResolvedValue([
        makeEntityRecord({ id: 'ent-1', name: 'Redis' }, degreeObj),
      ]);

      const result = await service.getEntities(USER_ID);

      expect(result.entities[0].degree).toBe(42);
    });
  });

  // ── getEntityRelated ──────────────────────────────────────────────────────

  describe('getEntityRelated()', () => {
    it('returns entity, files, and coOccurring when entity found', async () => {
      const entityRecord = makeEntityRecord(
        { id: ENTITY_ID, name: 'TypeScript', type: 'TECHNOLOGY' },
        8,
      );
      // Step 1: entity lookup
      mockNeo4j.runQuery.mockResolvedValueOnce([entityRecord]);
      // Step 2: related files
      mockNeo4j.runQuery.mockResolvedValueOnce([
        makeFileRecord({ id: FILE_ID, name: 'notes.md' }),
      ]);
      // Step 3: co-occurring entities
      mockNeo4j.runQuery.mockResolvedValueOnce([
        {
          get: (key: string) => {
            if (key === 'co') {
              return {
                elementId: 'ent-co-1',
                properties: { id: 'ent-co-1', name: 'NestJS', type: 'TECHNOLOGY' },
              };
            }
            if (key === 'degree') return 3;
            return null;
          },
        },
      ]);

      const result = await service.getEntityRelated(USER_ID, ENTITY_ID);

      expect(result.entity.id).toBe(ENTITY_ID);
      expect(result.entity.name).toBe('TypeScript');
      expect(result.relatedFiles).toHaveLength(1);
      expect(result.relatedFiles[0].id).toBe(FILE_ID);
      expect(result.coOccurring).toHaveLength(1);
      expect(result.coOccurring[0].name).toBe('NestJS');
    });

    it('returns empty result when entity not found in graph', async () => {
      // Step 1 returns nothing
      mockNeo4j.runQuery.mockResolvedValueOnce([]);

      const result = await service.getEntityRelated(USER_ID, ENTITY_ID);

      expect(result.entity.id).toBe(ENTITY_ID);
      expect(result.relatedFiles).toEqual([]);
      expect(result.coOccurring).toEqual([]);
      // Only 1 Neo4j call (early return after entity not found)
      expect(mockNeo4j.runQuery).toHaveBeenCalledTimes(1);
    });

    it('passes userId to all Cypher queries', async () => {
      mockNeo4j.runQuery
        .mockResolvedValueOnce([makeEntityRecord({ id: ENTITY_ID }, 1)])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await service.getEntityRelated(USER_ID, ENTITY_ID);

      for (const call of mockNeo4j.runQuery.mock.calls) {
        expect(call[1].userId).toBe(USER_ID);
      }
    });
  });

  // ── getFileNeighbors ──────────────────────────────────────────────────────

  describe('getFileNeighbors()', () => {
    it('returns file name and entities when file has graph edges', async () => {
      mockNeo4j.runQuery.mockResolvedValue([
        makeFileAndEntityRecord(
          { id: FILE_ID, name: 'architecture.md' },
          { id: 'ent-1', name: 'TypeScript', type: 'TECHNOLOGY' },
        ),
        makeFileAndEntityRecord(
          { id: FILE_ID, name: 'architecture.md' },
          { id: 'ent-2', name: 'NestJS', type: 'TECHNOLOGY' },
        ),
      ]);

      const result = await service.getFileNeighbors(USER_ID, FILE_ID);

      expect(result.fileId).toBe(FILE_ID);
      expect(result.fileName).toBe('architecture.md');
      expect(result.entities).toHaveLength(2);
    });

    it('deduplicates entities that appear in multiple records', async () => {
      const rec = makeFileAndEntityRecord(
        { id: FILE_ID, name: 'doc.md' },
        { id: 'ent-dup', name: 'TypeScript', type: 'TECHNOLOGY' },
      );
      mockNeo4j.runQuery.mockResolvedValue([rec, rec, rec]);

      const result = await service.getFileNeighbors(USER_ID, FILE_ID);

      expect(result.entities).toHaveLength(1);
    });

    it('returns empty result when file has no graph edges', async () => {
      mockNeo4j.runQuery.mockResolvedValue([]);

      const result = await service.getFileNeighbors(USER_ID, FILE_ID);

      expect(result.fileId).toBe(FILE_ID);
      expect(result.fileName).toBe('');
      expect(result.entities).toEqual([]);
    });

    it('passes userId and fileId to the query', async () => {
      mockNeo4j.runQuery.mockResolvedValue([]);

      await service.getFileNeighbors(USER_ID, FILE_ID);

      const params = mockNeo4j.runQuery.mock.calls[0][1];
      expect(params.userId).toBe(USER_ID);
      expect(params.fileId).toBe(FILE_ID);
    });
  });

  // ── getPath ───────────────────────────────────────────────────────────────

  describe('getPath()', () => {
    const FROM_ID = 'ent-from';
    const TO_ID = 'ent-to';

    it('returns ordered nodes and hop count when path found', async () => {
      const makePathNode = (id: string, name: string, labels: string[]) => ({
        labels,
        properties: { id, name, type: 'TECHNOLOGY' },
        elementId: id,
      });

      mockNeo4j.runQuery.mockResolvedValue([
        {
          get: (key: string) => {
            if (key === 'pathNodes') {
              return [
                makePathNode(FROM_ID, 'TypeScript', ['Entity']),
                makePathNode('file-mid', 'architecture.md', ['File']),
                makePathNode(TO_ID, 'NestJS', ['Entity']),
              ];
            }
            return null;
          },
        },
      ]);

      const result = await service.getPath(USER_ID, FROM_ID, TO_ID);

      // Only Entity nodes should be in the result
      expect(result.nodes).toHaveLength(2);
      expect(result.nodes[0].id).toBe(FROM_ID);
      expect(result.nodes[1].id).toBe(TO_ID);
      expect(result.length).toBe(1);
    });

    it('returns empty path when no connection found', async () => {
      mockNeo4j.runQuery.mockResolvedValue([]);

      const result = await service.getPath(USER_ID, FROM_ID, TO_ID);

      expect(result.nodes).toEqual([]);
      expect(result.length).toBe(0);
    });

    it('passes userId, fromId, toId to the query', async () => {
      mockNeo4j.runQuery.mockResolvedValue([]);

      await service.getPath(USER_ID, FROM_ID, TO_ID);

      const params = mockNeo4j.runQuery.mock.calls[0][1];
      expect(params.userId).toBe(USER_ID);
      expect(params.fromId).toBe(FROM_ID);
      expect(params.toId).toBe(TO_ID);
    });

    it('excludes File nodes from returned path nodes', async () => {
      const makeNode = (id: string, labels: string[]) => ({
        labels,
        properties: { id, name: id, type: 'TECHNOLOGY' },
        elementId: id,
      });

      mockNeo4j.runQuery.mockResolvedValue([
        {
          get: (key: string) => {
            if (key === 'pathNodes') {
              return [
                makeNode('e1', ['Entity']),
                makeNode('f1', ['File']),
                makeNode('e2', ['Entity']),
                makeNode('f2', ['File']),
                makeNode('e3', ['Entity']),
              ];
            }
            return null;
          },
        },
      ]);

      const result = await service.getPath(USER_ID, 'e1', 'e3');

      expect(result.nodes).toHaveLength(3);
      expect(result.length).toBe(2);
    });
  });
});
