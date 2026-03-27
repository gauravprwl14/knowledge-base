/**
 * Jest Test Setup
 *
 * Runs before all test files.
 * Sets up global test configuration and utilities.
 */

// Increase test timeout for integration tests
jest.setTimeout(30000);

// Suppress console output during tests (optional)
if (process.env.SUPPRESS_TEST_LOGS === 'true') {
  global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.OTEL_ENABLED = 'false';
