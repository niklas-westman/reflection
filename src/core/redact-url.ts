const sensitiveParameterPattern = /token|key|secret|password|passwd|auth|session|code|signature|credential/i;

// Report evidence may be shared, so query values that look like credentials are replaced while the rest of the URL stays comparable.
export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    for (const name of [...parsed.searchParams.keys()]) {
      if (sensitiveParameterPattern.test(name)) {
        parsed.searchParams.set(name, '[REDACTED]');
      }
    }
    return parsed.toString();
  } catch {
    return url;
  }
}
