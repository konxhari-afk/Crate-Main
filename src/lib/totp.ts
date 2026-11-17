import crypto from 'crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

export function base32Decode(encoded: string): Buffer {
  const cleaned = encoded.toUpperCase().replace(/[\s=-]+/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const char of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) {
      throw new Error(`Invalid Base32 character: ${char}`);
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

export function generateBase32Secret(byteLength = 20): string {
  return base32Encode(crypto.randomBytes(byteLength));
}

export function generateTotpCode(
  secretBase32: string,
  timeMs = Date.now(),
  periodSeconds = 30,
  digits = 6
): string {
  const key = base32Decode(secretBase32);
  const counter = Math.floor(timeMs / 1000 / periodSeconds);

  const counterBuf = Buffer.alloc(8);
  const high = Math.floor(counter / 0x100000000);
  const low = counter >>> 0;
  counterBuf.writeUInt32BE(high, 0);
  counterBuf.writeUInt32BE(low, 4);

  const hmac = crypto.createHmac('sha1', key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = binary % 10 ** digits;
  return String(otp).padStart(digits, '0');
}

export function verifyTotpCode(
  secretBase32: string,
  candidate: string,
  timeMs = Date.now(),
  windowSteps = 1,
  periodSeconds = 30,
  digits = 6
): boolean {
  const cleaned = candidate.replace(/\s+/g, '');
  if (!new RegExp(`^\\d{${digits}}$`).test(cleaned)) {
    return false;
  }

  const candidateBuf = Buffer.from(cleaned, 'utf8');
  for (let step = -windowSteps; step <= windowSteps; step++) {
    const expected = generateTotpCode(
      secretBase32,
      timeMs + step * periodSeconds * 1000,
      periodSeconds,
      digits
    );
    const expectedBuf = Buffer.from(expected, 'utf8');
    if (
      expectedBuf.length === candidateBuf.length &&
      crypto.timingSafeEqual(expectedBuf, candidateBuf)
    ) {
      return true;
    }
  }
  return false;
}

export function buildOtpAuthUri({
  issuer,
  accountName,
  secret,
}: {
  issuer: string;
  accountName: string;
  secret: string;
}): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}`;
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
