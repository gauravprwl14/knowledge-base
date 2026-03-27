/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'jsdom',
  // setupFilesAfterEnv runs setup files after the test framework (jest-jasmine2/jest-circus)
  // is installed in the environment — this is where @testing-library/jest-dom matchers are loaded.
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: { jsx: 'react-jsx' } }],
  },
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': '<rootDir>/__mocks__/styleMock.js',
  },
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/index.ts'],
  coverageThreshold: { global: { lines: 80 } },
};
