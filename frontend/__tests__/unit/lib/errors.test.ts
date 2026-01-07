/**
 * Unit tests for error handling utilities
 */

import {
  AppError,
  NetworkError,
  ErrorType,
  ErrorCategory,
  ErrorCodes,
  parseErrorResponse,
} from '@/lib/errors';
import {
  getErrorMessage,
  logError,
  isRetryableError,
  isAuthError,
  formatErrorForToast,
} from '@/lib/errors';

describe('AppError', () => {
  const mockApiError = {
    errorCode: 'JOB1001',
    statusCode: 404,
    errorType: ErrorType.VALIDATION,
    errorCategory: ErrorCategory.CLIENT,
    message: 'Job not found',
    messageKey: 'error.job.JOB1001.not_found',
  };

  it('should create AppError from API error', () => {
    const error = new AppError(mockApiError);

    expect(error.errorCode).toBe('JOB1001');
    expect(error.statusCode).toBe(404);
    expect(error.message).toBe('Job not found');
    expect(error.errorType).toBe(ErrorType.VALIDATION);
  });

  it('should check if error matches code', () => {
    const error = new AppError(mockApiError);

    expect(error.is('JOB1001')).toBe(true);
    expect(error.is('JOB1002')).toBe(false);
  });

  it('should identify client errors', () => {
    const error = new AppError(mockApiError);

    expect(error.isClientError()).toBe(true);
    expect(error.isServerError()).toBe(false);
  });

  it('should identify server errors', () => {
    const serverError = new AppError({
      ...mockApiError,
      errorCode: 'JOB1010',
      statusCode: 500,
    });

    expect(serverError.isServerError()).toBe(true);
    expect(serverError.isClientError()).toBe(false);
  });

  it('should convert to JSON', () => {
    const error = new AppError(mockApiError);
    const json = error.toJSON();

    expect(json.errorCode).toBe('JOB1001');
    expect(json.message).toBe('Job not found');
    expect(json.statusCode).toBe(404);
  });

  it('should include additional data', () => {
    const errorWithData = new AppError({
      ...mockApiError,
      data: { jobId: '123', userId: '456' },
    });

    expect(errorWithData.data).toEqual({ jobId: '123', userId: '456' });
  });
});

describe('NetworkError', () => {
  it('should create NetworkError', () => {
    const error = new NetworkError('Connection failed');

    expect(error.message).toBe('Connection failed');
    expect(error.name).toBe('NetworkError');
  });

  it('should have default message', () => {
    const error = new NetworkError();

    expect(error.message).toBe('Network error occurred');
  });
});

describe('parseErrorResponse', () => {
  it('should parse axios error with response', () => {
    const axiosError = {
      response: {
        status: 404,
        statusText: 'Not Found',
        data: {
          errors: [{
            errorCode: 'JOB1001',
            statusCode: 404,
            errorType: ErrorType.VALIDATION,
            errorCategory: ErrorCategory.CLIENT,
            message: 'Job not found',
            messageKey: 'error.job.JOB1001.not_found',
          }],
        },
      },
    };

    const error = parseErrorResponse(axiosError);

    expect(error).toBeInstanceOf(AppError);
    if (error instanceof AppError) {
      expect(error.errorCode).toBe('JOB1001');
    }
  });

  it('should parse axios error without response', () => {
    const axiosError = {
      request: {},
      message: 'Network Error',
    };

    const error = parseErrorResponse(axiosError);

    expect(error).toBeInstanceOf(NetworkError);
  });

  it('should parse timeout error', () => {
    const axiosError = {
      code: 'ECONNABORTED',
      message: 'timeout of 5000ms exceeded',
    };

    const error = parseErrorResponse(axiosError);

    expect(error).toBeInstanceOf(NetworkError);
    expect(error.message).toContain('timeout');
  });

  it('should handle generic error response', () => {
    const axiosError = {
      response: {
        status: 500,
        statusText: 'Internal Server Error',
        data: {
          message: 'Something went wrong',
        },
      },
    };

    const error = parseErrorResponse(axiosError);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain('Something went wrong');
  });

  it('should return already parsed errors', () => {
    const appError = new AppError({
      errorCode: 'JOB1001',
      statusCode: 404,
      errorType: ErrorType.VALIDATION,
      errorCategory: ErrorCategory.CLIENT,
      message: 'Job not found',
      messageKey: 'error.job.JOB1001.not_found',
    });

    const error = parseErrorResponse(appError);

    expect(error).toBe(appError);
  });
});

describe('getErrorMessage', () => {
  it('should get message from AppError', () => {
    const error = new AppError({
      errorCode: 'JOB1001',
      statusCode: 404,
      errorType: ErrorType.VALIDATION,
      errorCategory: ErrorCategory.CLIENT,
      message: 'Job not found',
      messageKey: 'error.job.JOB1001.not_found',
    });

    expect(getErrorMessage(error)).toBe('Job not found');
  });

  it('should get message from NetworkError', () => {
    const error = new NetworkError('Connection failed');

    expect(getErrorMessage(error)).toBe('Unable to connect to the server. Please check your internet connection.');
  });

  it('should get message from generic Error', () => {
    const error = new Error('Generic error');

    expect(getErrorMessage(error)).toBe('Generic error');
  });

  it('should handle unknown error', () => {
    const error = { something: 'unknown' };

    expect(getErrorMessage(error)).toBe('An unexpected error occurred');
  });
});

describe('isRetryableError', () => {
  it('should identify server errors as retryable', () => {
    const error = new AppError({
      errorCode: 'JOB1010',
      statusCode: 500,
      errorType: ErrorType.DATABASE,
      errorCategory: ErrorCategory.DATABASE,
      message: 'Database error',
      messageKey: 'error.job.JOB1010.database_error',
    });

    expect(isRetryableError(error)).toBe(true);
  });

  it('should identify network errors as retryable', () => {
    const error = new NetworkError();

    expect(isRetryableError(error)).toBe(true);
  });

  it('should not retry client errors', () => {
    const error = new AppError({
      errorCode: 'JOB1001',
      statusCode: 404,
      errorType: ErrorType.VALIDATION,
      errorCategory: ErrorCategory.CLIENT,
      message: 'Job not found',
      messageKey: 'error.job.JOB1001.not_found',
    });

    expect(isRetryableError(error)).toBe(false);
  });
});

describe('isAuthError', () => {
  it('should identify 401 as auth error', () => {
    const error = new AppError({
      errorCode: 'AUTH1001',
      statusCode: 401,
      errorType: ErrorType.AUTHENTICATION,
      errorCategory: ErrorCategory.AUTHENTICATION,
      message: 'Unauthorized',
      messageKey: 'error.auth.AUTH1001.unauthorized',
    });

    expect(isAuthError(error)).toBe(true);
  });

  it('should identify 403 as auth error', () => {
    const error = new AppError({
      errorCode: 'JOB1002',
      statusCode: 403,
      errorType: ErrorType.AUTHORIZATION,
      errorCategory: ErrorCategory.SECURITY,
      message: 'Forbidden',
      messageKey: 'error.job.JOB1002.unauthorized',
    });

    expect(isAuthError(error)).toBe(true);
  });

  it('should not identify other errors as auth errors', () => {
    const error = new AppError({
      errorCode: 'JOB1001',
      statusCode: 404,
      errorType: ErrorType.VALIDATION,
      errorCategory: ErrorCategory.CLIENT,
      message: 'Not found',
      messageKey: 'error.job.JOB1001.not_found',
    });

    expect(isAuthError(error)).toBe(false);
  });
});

describe('formatErrorForToast', () => {
  it('should format AppError for toast', () => {
    const error = new AppError({
      errorCode: 'JOB1001',
      statusCode: 404,
      errorType: ErrorType.VALIDATION,
      errorCategory: ErrorCategory.CLIENT,
      message: 'Job not found',
      messageKey: 'error.job.JOB1001.not_found',
    });

    const result = formatErrorForToast(error);

    expect(result.title).toBe('Error');
    expect(result.message).toBe('Job not found');
  });

  it('should format NetworkError for toast', () => {
    const error = new NetworkError('Connection failed');

    const result = formatErrorForToast(error);

    expect(result.title).toBe('Network Error');
    expect(result.message).toBe('Connection failed');
  });

  it('should format generic error for toast', () => {
    const error = new Error('Something went wrong');

    const result = formatErrorForToast(error);

    expect(result.title).toBe('Error');
    expect(result.message).toBe('Something went wrong');
  });
});

describe('ErrorCodes', () => {
  it('should have all job error codes', () => {
    expect(ErrorCodes.JOB_NOT_FOUND).toBe('JOB1001');
    expect(ErrorCodes.JOB_UNAUTHORIZED).toBe('JOB1002');
    expect(ErrorCodes.JOB_BULK_LIMIT_EXCEEDED).toBe('JOB1008');
  });
});

describe('logError', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('should log AppError with context', () => {
    const error = new AppError({
      errorCode: 'JOB1001',
      statusCode: 404,
      errorType: ErrorType.VALIDATION,
      errorCategory: ErrorCategory.CLIENT,
      message: 'Job not found',
      messageKey: 'error.job.JOB1001.not_found',
    });

    logError(error, 'test-context');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[test-context] AppError:',
      error.toJSON()
    );
  });

  it('should log generic error', () => {
    const error = new Error('Test error');

    logError(error, 'test-context');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[test-context] Error:',
      'Test error',
      error
    );
  });

  it('should log without context', () => {
    const error = new Error('Test error');

    logError(error);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      ' Error:',
      'Test error',
      error
    );
  });
});
