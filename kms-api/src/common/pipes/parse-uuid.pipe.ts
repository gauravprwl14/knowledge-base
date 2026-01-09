import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { ErrorFactory } from '../../errors/types/error-factory';
import { ERROR_CODES } from '../../errors/error-codes';
import { PATTERNS } from '../../config/constants/app.constants';

/**
 * Parse UUID Pipe
 *
 * Validates that a string parameter is a valid UUID.
 *
 * @example
 * ```typescript
 * @Get(':id')
 * findOne(@Param('id', ParseUUIDPipe) id: string) {
 *   return this.service.findById(id);
 * }
 * ```
 */
@Injectable()
export class ParseUUIDPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!PATTERNS.UUID.test(value)) {
      throw ErrorFactory.validation(
        ERROR_CODES.VAL.INVALID_UUID,
        `Value '${value}' is not a valid UUID`,
        [{ field: 'id', message: 'Must be a valid UUID' }],
      );
    }
    return value.toLowerCase();
  }
}
