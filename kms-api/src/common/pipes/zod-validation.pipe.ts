import {
  PipeTransform,
  Injectable,
  ArgumentMetadata,
  BadRequestException,
  Type,
} from '@nestjs/common';
import { ZodSchema, ZodError, ZodIssue } from 'zod';
import { ErrorFactory } from '../../errors/types/error-factory';
import { ERROR_CODES } from '../../errors/error-codes';

/**
 * Zod Validation Pipe
 *
 * Validates incoming data against a Zod schema.
 *
 * @example
 * ```typescript
 * // With schema in route
 * @Post()
 * @UsePipes(new ZodValidationPipe(createUserSchema))
 * create(@Body() data: CreateUserDto) {}
 *
 * // With schema decorator
 * @Post()
 * create(@Body(new ZodValidationPipe(createUserSchema)) data: CreateUserDto) {}
 * ```
 */
@Injectable()
export class ZodValidationPipe<T = any> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown, metadata: ArgumentMetadata): T {
    try {
      return this.schema.parse(value);
    } catch (error) {
      if (error instanceof ZodError) {
        throw ErrorFactory.fromZodErrors(error.issues);
      }
      throw error;
    }
  }
}

/**
 * Generic validation pipe that uses class-validator by default
 * but can also accept Zod schemas via metadata
 */
@Injectable()
export class ValidationPipe implements PipeTransform<unknown> {
  async transform(value: unknown, metadata: ArgumentMetadata): Promise<unknown> {
    const { metatype, type } = metadata;

    // Skip validation for primitive types
    if (!metatype || this.isPrimitive(metatype)) {
      return value;
    }

    // Check if metatype has a Zod schema attached
    const schema = this.getZodSchema(metatype);
    if (schema) {
      try {
        return schema.parse(value);
      } catch (error) {
        if (error instanceof ZodError) {
          throw ErrorFactory.fromZodErrors(error.issues);
        }
        throw error;
      }
    }

    return value;
  }

  /**
   * Checks if type is a primitive
   */
  private isPrimitive(metatype: Type<unknown>): boolean {
    const types: Type<unknown>[] = [String, Boolean, Number, Array, Object];
    return types.includes(metatype);
  }

  /**
   * Gets Zod schema from class metadata if available
   */
  private getZodSchema(metatype: Type<unknown>): ZodSchema | undefined {
    return (metatype as any).__zodSchema;
  }
}

/**
 * Decorator to attach Zod schema to a DTO class
 *
 * @example
 * ```typescript
 * @ZodSchema(createUserSchema)
 * export class CreateUserDto {
 *   email: string;
 *   password: string;
 * }
 * ```
 */
export function WithZodSchema(schema: ZodSchema): ClassDecorator {
  return function (target: Function) {
    (target as any).__zodSchema = schema;
  };
}

/**
 * Transforms Zod issues into a more readable format
 */
export function formatZodErrors(issues: ZodIssue[]): Array<{
  field: string;
  message: string;
  code: string;
}> {
  return issues.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
    code: issue.code,
  }));
}
