const test = require('node:test');
const assert = require('node:assert/strict');
const OTPAuth = require('../lib/otpauth.js');

test('matches the RFC 4226 HOTP vector at counter zero', () => {
  const secret = OTPAuth.Secret.fromLatin1('12345678901234567890');
  const token = OTPAuth.HOTP.generate({
    secret,
    algorithm: 'SHA1',
    digits: 6,
    counter: 0
  });

  assert.equal(token, '755224');
});

test('matches RFC 6238 vectors for SHA-1, SHA-256, and SHA-512', () => {
  const vectors = [
    ['SHA1', '12345678901234567890', '94287082'],
    ['SHA256', '12345678901234567890123456789012', '46119246'],
    ['SHA512', '1234567890123456789012345678901234567890123456789012345678901234', '90693936']
  ];

  vectors.forEach(([algorithm, rawSecret, expected]) => {
    const token = OTPAuth.TOTP.generate({
      secret: OTPAuth.Secret.fromLatin1(rawSecret),
      algorithm,
      digits: 8,
      period: 30,
      timestamp: 59000
    });
    assert.equal(token, expected);
  });
});

test('parses non-default URI parameters without falling back to defaults', () => {
  const otp = OTPAuth.URI.parse(
    'otpauth://totp/Example:user?secret=JBSWY3DPEHPK3PXP&issuer=Example&algorithm=SHA512&digits=8&period=60'
  );

  assert.equal(otp.algorithm, 'SHA512');
  assert.equal(otp.digits, 8);
  assert.equal(otp.period, 60);
});
