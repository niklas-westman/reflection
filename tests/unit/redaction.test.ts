import { describe, expect, it } from 'vitest';
import { createRedactionTransform, redactSensitiveText } from '../../src/core/redaction.js';
import { createTracePolicy } from '../../src/integrations/playwright/trace-policy.js';

describe('redactSensitiveText', () => {
  it('redacts authorization and cookie header values from captured text', () => {
    const input = [
      'Authorization: Bearer super-secret-token',
      'cookie=session=abc123; theme=dark',
      'x-api-key: key_123456789',
      'normal line stays visible'
    ].join('\n');

    const redacted = redactSensitiveText(input);

    expect(redacted).toContain('Authorization: [REDACTED]');
    expect(redacted).toContain('cookie=[REDACTED]');
    expect(redacted).toContain('x-api-key: [REDACTED]');
    expect(redacted).toContain('normal line stays visible');
    expect(redacted).not.toContain('super-secret-token');
    expect(redacted).not.toContain('session=abc123');
    expect(redacted).not.toContain('key_123456789');
  });

  it('redacts JSON-serialized sensitive header fields', () => {
    const input = JSON.stringify({
      authorization: 'Bearer json-secret-token',
      Cookie: 'session=json-session',
      apiKey: 'json-api-key',
      message: 'normal line stays visible'
    });

    const redacted = redactSensitiveText(input);

    expect(redacted).toContain('"authorization":"[REDACTED]"');
    expect(redacted).toContain('"Cookie":"[REDACTED]"');
    expect(redacted).toContain('"apiKey":"[REDACTED]"');
    expect(redacted).toContain('normal line stays visible');
    expect(redacted).not.toContain('json-secret-token');
    expect(redacted).not.toContain('json-session');
    expect(redacted).not.toContain('json-api-key');
  });

  it('redacts JSON sensitive fields that contain escaped quotes', () => {
    const input = JSON.stringify({ authorization: 'Bearer escaped-"quote-secret-suffix' });

    const redacted = redactSensitiveText(input);

    expect(redacted).toContain('"authorization":"[REDACTED]"');
    expect(redacted).not.toContain('escaped');
    expect(redacted).not.toContain('quote-secret-suffix');
  });

  it('redacts sensitive values split across stream chunk boundaries', async () => {
    const transform = createRedactionTransform();
    const chunks: string[] = [];
    transform.setEncoding('utf8');
    transform.on('data', (chunk: string) => chunks.push(chunk));

    transform.write('Authorization: Bearer chunk-');
    transform.write('split-secret\nnormal line\n{"cookie":"split-');
    transform.end('cookie-secret"}\n');

    await new Promise<void>((resolve, reject) => {
      transform.once('end', resolve);
      transform.once('error', reject);
    });

    const output = chunks.join('');
    expect(output).toContain('Authorization: [REDACTED]');
    expect(output).toContain('"cookie":"[REDACTED]"');
    expect(output).toContain('normal line');
    expect(output).not.toContain('chunk-split-secret');
    expect(output).not.toContain('split-cookie-secret');
  });

  it('does not leak long sensitive lines when bounded buffering flushes before newline', async () => {
    const transform = createRedactionTransform();
    const chunks: string[] = [];
    const longSecretTail = 'x'.repeat(5_000);
    transform.setEncoding('utf8');
    transform.on('data', (chunk: string) => chunks.push(chunk));

    transform.write('Authorization: Bearer long-sensitive-prefix-');
    transform.write(longSecretTail);
    transform.end('\npublic-after-secret\n');

    await new Promise<void>((resolve, reject) => {
      transform.once('end', resolve);
      transform.once('error', reject);
    });

    const output = chunks.join('');
    expect(output).toContain('Authorization: [REDACTED]');
    expect(output).toContain('public-after-secret');
    expect(output).not.toContain('long-sensitive-prefix');
    expect(output).not.toContain(longSecretTail.slice(0, 100));
  });
});

describe('trace policy', () => {
  it('keeps traces and videos off by default', () => {
    expect(createTracePolicy()).toEqual({ trace: 'off', video: 'off' });
  });
});
