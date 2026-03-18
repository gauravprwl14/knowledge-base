import { TokenEncryptionService } from './token-encryption.service';

describe('TokenEncryptionService', () => {
  let service: TokenEncryptionService;

  beforeEach(() => {
    service = new TokenEncryptionService();
  });

  describe('encrypt / decrypt round-trip', () => {
    it('decrypts back to the original plaintext', () => {
      const plaintext = JSON.stringify({ access_token: 'tok_abc', refresh_token: 'ref_xyz' });
      const ciphertext = service.encrypt(plaintext);
      expect(service.decrypt(ciphertext)).toBe(plaintext);
    });

    it('produces different ciphertext for the same plaintext (random IV)', () => {
      const plaintext = 'same-input';
      const a = service.encrypt(plaintext);
      const b = service.encrypt(plaintext);
      expect(a).not.toBe(b);
      // but both decrypt correctly
      expect(service.decrypt(a)).toBe(plaintext);
      expect(service.decrypt(b)).toBe(plaintext);
    });

    it('handles empty string', () => {
      const ciphertext = service.encrypt('');
      expect(service.decrypt(ciphertext)).toBe('');
    });

    it('handles unicode content', () => {
      const plaintext = '{"token":"日本語テスト🔑"}';
      expect(service.decrypt(service.encrypt(plaintext))).toBe(plaintext);
    });
  });

  describe('decrypt error paths', () => {
    it('throws when ciphertext is tampered', () => {
      const ciphertext = service.encrypt('sensitive');
      // Flip the last byte to invalidate the auth tag
      const buf = Buffer.from(ciphertext, 'base64');
      buf[buf.length - 1] ^= 0xff;
      const tampered = buf.toString('base64');
      expect(() => service.decrypt(tampered)).toThrow();
    });

    it('throws on random garbage input', () => {
      expect(() => service.decrypt('not-valid-base64!!!')).toThrow();
    });
  });

  describe('ciphertext format', () => {
    it('is valid base64', () => {
      const ciphertext = service.encrypt('test');
      expect(() => Buffer.from(ciphertext, 'base64')).not.toThrow();
    });

    it('is at least 28 bytes (12 IV + 16 tag)', () => {
      const ciphertext = service.encrypt('x');
      const raw = Buffer.from(ciphertext, 'base64');
      expect(raw.length).toBeGreaterThanOrEqual(28);
    });
  });
});
