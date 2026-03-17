/**
 * Auth hooks — barrel export
 */

export { useLogin } from './use-login';
export type { UseLoginOptions } from './use-login';

export { useRegister } from './use-register';
export type { UseRegisterOptions } from './use-register';

export { useLogout } from './use-logout';
export type { UseLogoutOptions } from './use-logout';

export { useMe } from './use-me';

export { useApiKeys, useCreateApiKey, useRevokeApiKey } from './use-api-keys';
export type {
  UseApiKeysOptions,
  UseCreateApiKeyOptions,
  UseRevokeApiKeyOptions,
} from './use-api-keys';
