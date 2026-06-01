export type TracePolicy = {
  trace: 'off' | 'retain-on-failure' | 'on';
  video: 'off' | 'retain-on-failure' | 'on';
};

export function createTracePolicy(overrides: Partial<TracePolicy> = {}): TracePolicy {
  return {
    trace: overrides.trace ?? 'off',
    video: overrides.video ?? 'off'
  };
}
