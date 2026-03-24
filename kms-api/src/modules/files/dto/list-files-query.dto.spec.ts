import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ListFilesQueryDto } from './list-files-query.dto';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Transforms a plain object into a validated ListFilesQueryDto instance and
 * returns the class-validator errors array.
 */
async function validateDto(plain: Record<string, unknown>) {
  const instance = plainToInstance(ListFilesQueryDto, plain);
  return validate(instance);
}

// ---------------------------------------------------------------------------
// ListFilesQueryDto — sortBy / sortDir validation
// ---------------------------------------------------------------------------

describe('ListFilesQueryDto — sortBy / sortDir validation', () => {
  // -------------------------------------------------------------------------
  // sortBy — valid values
  // -------------------------------------------------------------------------

  describe('sortBy — allowed values', () => {
    it.each(['createdAt', 'updatedAt', 'name', 'sizeBytes'])(
      'passes validation for sortBy="%s"',
      async (value) => {
        const errors = await validateDto({ sortBy: value });

        expect(errors).toHaveLength(0);
      },
    );
  });

  // -------------------------------------------------------------------------
  // sortBy — invalid values
  // -------------------------------------------------------------------------

  describe('sortBy — rejected values', () => {
    it('fails validation for sortBy="invalidField"', async () => {
      const errors = await validateDto({ sortBy: 'invalidField' });

      expect(errors.length).toBeGreaterThan(0);
      const sortByError = errors.find((e) => e.property === 'sortBy');
      expect(sortByError).toBeDefined();
      expect(sortByError!.constraints).toHaveProperty('isIn');
    });

    it('fails validation for sortBy="id" (not in allowlist)', async () => {
      const errors = await validateDto({ sortBy: 'id' });

      expect(errors.length).toBeGreaterThan(0);
      const sortByError = errors.find((e) => e.property === 'sortBy');
      expect(sortByError).toBeDefined();
      expect(sortByError!.constraints).toHaveProperty('isIn');
    });

    it('fails validation for sortBy="userId" (not in allowlist)', async () => {
      const errors = await validateDto({ sortBy: 'userId' });

      const sortByError = errors.find((e) => e.property === 'sortBy');
      expect(sortByError).toBeDefined();
    });

    it('fails validation for sortBy="fileSize" (wrong name — Prisma field is sizeBytes)', async () => {
      // Regression: "fileSize" was incorrectly allowed before; the real Prisma field is "sizeBytes".
      // Allowing "fileSize" causes PrismaClientValidationError (→ VAL0000) at query time.
      const errors = await validateDto({ sortBy: 'fileSize' });

      const sortByError = errors.find((e) => e.property === 'sortBy');
      expect(sortByError).toBeDefined();
      expect(sortByError!.constraints).toHaveProperty('isIn');
    });

    it('fails validation for sortBy="" (empty string)', async () => {
      const errors = await validateDto({ sortBy: '' });

      const sortByError = errors.find((e) => e.property === 'sortBy');
      expect(sortByError).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // sortDir — valid values
  // -------------------------------------------------------------------------

  describe('sortDir — allowed values', () => {
    it.each(['asc', 'desc'])(
      'passes validation for sortDir="%s"',
      async (value) => {
        const errors = await validateDto({ sortDir: value });

        expect(errors).toHaveLength(0);
      },
    );
  });

  // -------------------------------------------------------------------------
  // sortDir — invalid values
  // -------------------------------------------------------------------------

  describe('sortDir — rejected values', () => {
    it('fails validation for sortDir="ascending" (not in allowlist)', async () => {
      const errors = await validateDto({ sortDir: 'ascending' });

      expect(errors.length).toBeGreaterThan(0);
      const sortDirError = errors.find((e) => e.property === 'sortDir');
      expect(sortDirError).toBeDefined();
      expect(sortDirError!.constraints).toHaveProperty('isIn');
    });

    it('fails validation for sortDir="descending" (not in allowlist)', async () => {
      const errors = await validateDto({ sortDir: 'descending' });

      const sortDirError = errors.find((e) => e.property === 'sortDir');
      expect(sortDirError).toBeDefined();
      expect(sortDirError!.constraints).toHaveProperty('isIn');
    });

    it('fails validation for sortDir="ASC" (case-sensitive allowlist)', async () => {
      const errors = await validateDto({ sortDir: 'ASC' });

      const sortDirError = errors.find((e) => e.property === 'sortDir');
      expect(sortDirError).toBeDefined();
    });

    it('fails validation for sortDir="DESC" (case-sensitive allowlist)', async () => {
      const errors = await validateDto({ sortDir: 'DESC' });

      const sortDirError = errors.find((e) => e.property === 'sortDir');
      expect(sortDirError).toBeDefined();
    });

    it('fails validation for sortDir="" (empty string)', async () => {
      const errors = await validateDto({ sortDir: '' });

      const sortDirError = errors.find((e) => e.property === 'sortDir');
      expect(sortDirError).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Optional fields — omitting sortBy / sortDir is valid
  // -------------------------------------------------------------------------

  describe('sortBy and sortDir are optional', () => {
    it('passes validation when both sortBy and sortDir are absent', async () => {
      const errors = await validateDto({});

      expect(errors).toHaveLength(0);
    });

    it('passes validation when only sortBy is provided (sortDir absent)', async () => {
      const errors = await validateDto({ sortBy: 'name' });

      expect(errors).toHaveLength(0);
    });

    it('passes validation when only sortDir is provided (sortBy absent)', async () => {
      const errors = await validateDto({ sortDir: 'asc' });

      expect(errors).toHaveLength(0);
    });

    it('passes validation when sortBy and sortDir are both valid and combined', async () => {
      const errors = await validateDto({ sortBy: 'updatedAt', sortDir: 'asc' });

      expect(errors).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // sortBy + sortDir do not interfere with other fields
  // -------------------------------------------------------------------------

  describe('sortBy / sortDir alongside other valid query params', () => {
    it('passes validation when all fields are valid', async () => {
      const errors = await validateDto({
        limit: 20,
        sortBy: 'createdAt',
        sortDir: 'desc',
        search: 'report',
      });

      expect(errors).toHaveLength(0);
    });

    it('isolates sortBy error without failing unrelated valid fields', async () => {
      const errors = await validateDto({
        limit: 20,
        sortBy: 'badField',
        sortDir: 'desc',
      });

      const propertyNames = errors.map((e) => e.property);
      expect(propertyNames).toContain('sortBy');
      expect(propertyNames).not.toContain('limit');
      expect(propertyNames).not.toContain('sortDir');
    });
  });
});
