import type { ArtifactRef, ReflectionReport } from './report-schema.js';

export type RunManifest = {
  schemaVersion: 1;
  runId: string;
  createdAt: string;
  project: string;
  status: ReflectionReport['status'];
  mode: ReflectionReport['mode'];
  ci: boolean;
  retention: {
    pinned: boolean;
  };
  files: Array<{
    path: string;
    type: ArtifactRef['type'];
    bytes?: number;
    sha256?: string;
  }>;
};

export function createRunManifest(input: { report: ReflectionReport; files: ArtifactRef[] }): RunManifest {
  return {
    schemaVersion: 1,
    runId: input.report.runId,
    createdAt: input.report.finishedAt,
    project: input.report.project,
    status: input.report.status,
    mode: input.report.mode,
    ci: input.report.ci,
    retention: {
      pinned: false
    },
    files: input.files.map((file) => ({
      path: file.path,
      type: file.type,
      ...(file.bytes !== undefined ? { bytes: file.bytes } : {}),
      ...(file.sha256 !== undefined ? { sha256: file.sha256 } : {})
    }))
  };
}
