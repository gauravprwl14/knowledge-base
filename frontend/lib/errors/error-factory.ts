import { BaseError, ErrorDefinition } from './base-error';
import { ErrorType } from './types';
import { ErrorCategory } from './types';

/**
 * Base Abstract Error Factory
 * All feature-specific error factories should extend this
 */
export abstract class BaseAbstractErrorFactory {
  /**
   * Create a new error instance
   */
  protected static createError(definition: ErrorDefinition): BaseError {
    return new BaseError(definition);
  }

  /**
   * Common error creators
   */
  static notFound(resource: string, id?: string): BaseError {
    return this.createError({
      code: 'GEN1404',
      message: id ? `${resource} with ID ${id} not found` : `${resource} not found`,
      messageKey: 'error.common.not_found',
      errorType: ErrorType.NOT_FOUND,
      errorCategory: ErrorCategory.CLIENT,
      statusCode: 404,
      metadata: { resource, id },
    });
  }

  static validationError(field: string, reason: string): BaseError {
    return this.createError({
      code: 'VAL2000',
      message: `Validation failed for field '${field}': ${reason}`,
      messageKey: 'error.validation.failed',
      errorType: ErrorType.VALIDATION,
      errorCategory: ErrorCategory.CLIENT,
      statusCode: 400,
      metadata: { field, reason },
    });
  }

  static unauthorized(message = 'Unauthorized access'): BaseError {
    return this.createError({
      code: 'AUTH4001',
      message,
      messageKey: 'error.auth.unauthorized',
      errorType: ErrorType.AUTHENTICATION,
      errorCategory: ErrorCategory.CLIENT,
      statusCode: 401,
    });
  }

  static forbidden(message = 'Access forbidden'): BaseError {
    return this.createError({
      code: 'AUTH4003',
      message,
      messageKey: 'error.auth.forbidden',
      errorType: ErrorType.AUTHORIZATION,
      errorCategory: ErrorCategory.CLIENT,
      statusCode: 403,
    });
  }

  static serverError(message = 'Internal server error'): BaseError {
    return this.createError({
      code: 'GEN1001',
      message,
      messageKey: 'error.server.internal',
      errorType: ErrorType.SYSTEM,
      errorCategory: ErrorCategory.SERVER,
      statusCode: 500,
    });
  }

  static networkError(message = 'Network error occurred'): BaseError {
    return this.createError({
      code: 'NET4000',
      message,
      messageKey: 'error.network.failed',
      errorType: ErrorType.NETWORK,
      errorCategory: ErrorCategory.NETWORK,
      statusCode: 0,
    });
  }
}
