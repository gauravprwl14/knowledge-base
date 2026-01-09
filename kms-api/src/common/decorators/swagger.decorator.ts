import { applyDecorators, HttpStatus, Type } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiSecurity,
  ApiBody,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiExtraModels,
  getSchemaPath,
} from '@nestjs/swagger';

/**
 * Options for API endpoint documentation
 */
export interface ApiEndpointOptions {
  /** Operation summary */
  summary: string;
  /** Operation description */
  description?: string;
  /** Response type for successful response */
  responseType?: Type<any>;
  /** Whether response is an array */
  isArray?: boolean;
  /** Custom success status code (default: 200) */
  successStatus?: HttpStatus;
  /** Additional response descriptions */
  responses?: Array<{
    status: HttpStatus;
    description: string;
    type?: Type<any>;
  }>;
  /** Deprecation message */
  deprecated?: boolean;
}

/**
 * Combined API documentation decorator
 *
 * @example
 * ```typescript
 * @ApiEndpoint({
 *   summary: 'Get user by ID',
 *   description: 'Returns a single user',
 *   responseType: UserResponseDto,
 *   responses: [
 *     { status: HttpStatus.NOT_FOUND, description: 'User not found' },
 *   ],
 * })
 * @Get(':id')
 * findOne(@Param('id') id: string) {}
 * ```
 */
export function ApiEndpoint(options: ApiEndpointOptions) {
  const decorators: MethodDecorator[] = [
    ApiOperation({
      summary: options.summary,
      description: options.description,
      deprecated: options.deprecated,
    }),
  ];

  // Success response
  if (options.responseType) {
    decorators.push(
      ApiResponse({
        status: options.successStatus || HttpStatus.OK,
        description: 'Successful response',
        type: options.responseType,
        isArray: options.isArray,
      }),
    );
  } else {
    decorators.push(
      ApiResponse({
        status: options.successStatus || HttpStatus.OK,
        description: 'Successful response',
      }),
    );
  }

  // Additional responses
  if (options.responses) {
    for (const response of options.responses) {
      decorators.push(
        ApiResponse({
          status: response.status,
          description: response.description,
          type: response.type,
        }),
      );
    }
  }

  // Common error responses
  decorators.push(
    ApiResponse({
      status: HttpStatus.BAD_REQUEST,
      description: 'Invalid input',
    }),
    ApiResponse({
      status: HttpStatus.UNAUTHORIZED,
      description: 'Authentication required',
    }),
    ApiResponse({
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      description: 'Internal server error',
    }),
  );

  return applyDecorators(...decorators);
}

/**
 * API authentication decorators
 */
export const ApiAuth = () =>
  applyDecorators(ApiBearerAuth('jwt'), ApiSecurity('api-key'));

export const ApiBearerAuthOnly = () => ApiBearerAuth('jwt');

export const ApiKeyAuthOnly = () => ApiSecurity('api-key');

/**
 * Paginated response documentation
 *
 * @example
 * ```typescript
 * @ApiPaginatedResponse(UserDto)
 * @Get()
 * findAll() {}
 * ```
 */
export function ApiPaginatedResponse(type: Type<any>) {
  return applyDecorators(
    ApiExtraModels(type),
    ApiResponse({
      status: HttpStatus.OK,
      description: 'Paginated list',
      schema: {
        allOf: [
          {
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'array',
                items: { $ref: getSchemaPath(type) },
              },
              meta: {
                type: 'object',
                properties: {
                  total: { type: 'number', example: 100 },
                  page: { type: 'number', example: 1 },
                  limit: { type: 'number', example: 10 },
                  totalPages: { type: 'number', example: 10 },
                  hasNextPage: { type: 'boolean', example: true },
                  hasPreviousPage: { type: 'boolean', example: false },
                },
              },
              timestamp: { type: 'string', example: '2024-01-01T00:00:00.000Z' },
            },
          },
        ],
      },
    }),
  );
}

/**
 * Common pagination query parameters
 */
export function ApiPaginationQuery() {
  return applyDecorators(
    ApiQuery({ name: 'page', required: false, type: Number, example: 1 }),
    ApiQuery({ name: 'limit', required: false, type: Number, example: 10 }),
    ApiQuery({ name: 'sortBy', required: false, type: String, example: 'createdAt' }),
    ApiQuery({
      name: 'sortOrder',
      required: false,
      enum: ['asc', 'desc'],
      example: 'desc',
    }),
  );
}
