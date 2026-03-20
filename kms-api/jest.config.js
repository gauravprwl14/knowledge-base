module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: [
    'src/**/*.(t|j)s',
    '!src/**/*.module.ts',
    '!src/**/*.interface.ts',
    '!src/**/*.dto.ts',
    '!src/**/index.ts',
    '!src/main.ts',
    // Infrastructure / runtime-only — cannot be meaningfully unit tested
    '!src/telemetry/**',
    '!src/queue/publishers/**',
    '!src/database/prisma/**',
    '!src/modules/workflow/workflow.processor.ts',
    '!src/instrumentation.ts',
    // NestJS boilerplate — exception filters, interceptors, guards, decorators, middleware
    '!src/common/**',
    '!src/bootstrap/**',
    '!src/metadata.ts',
    // Repositories — DB-dependent, tested via integration tests
    '!src/database/repositories/**',
    // Config schemas — validated at startup
    '!src/config/**',
    // Error handlers — integration-tested via filter pipeline
    '!src/errors/handlers/**',
    // External adapters — HTTP calls to 3rd-party services
    '!src/modules/acp/external-agent/**',
    // Auth guards/strategies — passport/JWT infrastructure
    '!src/modules/auth/guards/**',
    '!src/modules/auth/strategies/**',
    // Collections repository — DB-dependent
    '!src/modules/collections/collections.repository.ts',
    // Tags repository — DB-dependent
    '!src/modules/tags/tags.repository.ts',
    // Feature flag guard — trivial DI wrapper
    '!src/modules/feature-flags/guards/**',
  ],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  roots: ['<rootDir>/src/', '<rootDir>/test/'],
  testPathIgnorePatterns: ['/node_modules/', '/test/integration/'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@config/(.*)$': '<rootDir>/src/config/$1',
    '^@common/(.*)$': '<rootDir>/src/common/$1',
    '^@database/(.*)$': '<rootDir>/src/database/$1',
    '^@errors/(.*)$': '<rootDir>/src/errors/$1',
    '^@modules/(.*)$': '<rootDir>/src/modules/$1',
    '^@telemetry/(.*)$': '<rootDir>/src/telemetry/$1',
    '^@logger/(.*)$': '<rootDir>/src/logger/$1',
    '^@test/(.*)$': '<rootDir>/test/$1',
  },
  coverageThreshold: {
    global: {
      branches: 35,
      functions: 60,
      lines: 70,
      statements: 70,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  testTimeout: 30000,
};
