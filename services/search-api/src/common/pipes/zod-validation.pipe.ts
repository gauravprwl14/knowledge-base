import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { ZodSchema, ZodError } from 'zod';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private schema: ZodSchema) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        errors: result.error.errors.map((e) => ({
          errorCode: 'SRC1000',
          message: e.message,
          type: 'validation_error',
          category: 'input_validation',
          data: { path: e.path.join('.') },
        })),
        meta: { timestamp: new Date().toISOString() },
      });
    }
    return result.data;
  }
}
