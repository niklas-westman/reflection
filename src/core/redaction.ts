import { Transform, type TransformCallback } from 'node:stream';

const REDACTION = '[REDACTED]';
const streamingTailLength = 4096;
const sensitiveHeaderNames = ['authorization', 'cookie', 'set-cookie', 'x-api-key', 'api[-_]?key', 'access[-_]?token'];
const sensitiveFieldStartPattern = new RegExp(`["']?(?:${sensitiveHeaderNames.join('|')})["']?\\s*[:=]`, 'i');
const incompleteSensitiveFieldPattern = new RegExp(
  `(["']?(?:${sensitiveHeaderNames.join('|')})["']?\\s*[:=]\\s*["']?)[\\s\\S]*`,
  'i'
);

const doubleQuotedValuePattern = new RegExp(
  `("(?:${sensitiveHeaderNames.join('|')})"\\s*:\\s*")(?:\\\\.|[^"\\\\\\r\\n])*(")`,
  'gi'
);
const singleQuotedValuePattern = new RegExp(
  `('(?:${sensitiveHeaderNames.join('|')})'\\s*:\\s*')(?:\\\\.|[^'\\\\\\r\\n])*(')`,
  'gi'
);

const headerLinePatterns = [
  /\b(authorization\s*[:=]\s*)[^\r\n]+/gi,
  /\b(cookie\s*[:=]\s*)[^\r\n]+/gi,
  /\b(set-cookie\s*[:=]\s*)[^\r\n]+/gi,
  /\b(x-api-key\s*[:=]\s*)[^\r\n]+/gi,
  /\b(api[-_]?key\s*[:=]\s*)[^\s&\r\n]+/gi,
  /\b(access[-_]?token\s*[:=]\s*)[^\s&\r\n]+/gi
];

export function redactSensitiveText(text: string): string {
  const redactedDoubleQuotedValues = text.replace(doubleQuotedValuePattern, `$1${REDACTION}$2`);
  const redactedQuotedValues = redactedDoubleQuotedValues.replace(singleQuotedValuePattern, `$1${REDACTION}$2`);
  return headerLinePatterns.reduce((value, pattern) => value.replace(pattern, `$1${REDACTION}`), redactedQuotedValues);
}

export function createRedactionTransform(): Transform {
  let pending = '';
  let suppressingSensitiveLine = false;

  return new Transform({
    transform(chunk: Buffer | string, _encoding: BufferEncoding, callback: TransformCallback) {
      let text = chunk.toString();

      if (suppressingSensitiveLine) {
        const lineBreak = text.indexOf('\n');
        if (lineBreak === -1) {
          callback();
          return;
        }

        text = text.slice(lineBreak + 1);
        suppressingSensitiveLine = false;
      }

      pending += text;
      const lastLineBreak = pending.lastIndexOf('\n');

      if (lastLineBreak === -1 && pending.length <= streamingTailLength) {
        callback();
        return;
      }

      if (lastLineBreak === -1 && sensitiveFieldStartPattern.test(pending)) {
        const redacted = redactIncompleteSensitiveLine(pending);
        pending = '';
        suppressingSensitiveLine = true;
        callback(null, redacted);
        return;
      }

      const flushThrough = lastLineBreak === -1 ? Math.max(0, pending.length - streamingTailLength) : lastLineBreak + 1;
      const ready = pending.slice(0, flushThrough);
      pending = pending.slice(flushThrough);
      callback(null, redactSensitiveText(ready));
    },
    flush(callback: TransformCallback) {
      callback(null, suppressingSensitiveLine ? '' : redactSensitiveText(pending));
    }
  });
}

function redactIncompleteSensitiveLine(text: string): string {
  return text.replace(incompleteSensitiveFieldPattern, `$1${REDACTION}`);
}
