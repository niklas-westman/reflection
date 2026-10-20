// A generated page provider for the demo set, shaped like a whole-page capture tool with a presentation hint:
// states captured on several devices, app screens and rendered emails in separate sections. Used for the large
// mixed bundle (200 required items, every outcome) and for one where every check fails. Illustrative data.
import { bindingForComparisons, projectionSchema, type Projection } from 'reflection-projection';

interface Screen {
  state: string;
  device: string;
  surface: 'app' | 'email';
}

const SIZES: Record<string, { width: number; height: number }> = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 834, height: 1194 },
  mobile: { width: 390, height: 844 },
  phone: { width: 390, height: 1268 }
};

const LONG_STATE = 'payment-method-declined-after-three-retries-with-saved-card-and-billing-address-mismatch';

export interface ScreensDemoOptions {
  pageId: string;
  label: string;
  appStates: number;
  appDevices: string[];
  emailStates: number;
  emailDevices: string[];
  allFailing?: boolean;
  // Adds the two review cases a provider can import: app states still checked against an older export that was
  // superseded, and a raised limit the owner accepted for a few passing screens.
  withHistory?: boolean;
}

/** The outcome of the n-th screen in the mixed demo: mostly passing, with every other kind spread through it. */
function outcomeOf(index: number, allFailing: boolean): 'passed' | 'failed' | 'error' | 'none' {
  if (allFailing) return 'failed';
  if (index % 17 === 5) return 'failed';
  if (index % 23 === 7) return 'error';
  if (index % 29 === 11) return 'none';
  return 'passed';
}

function approvalOf(index: number, boundTo: string): Record<string, unknown> {
  if (index % 31 === 3) return { state: 'lapsed', attestation: 'delegated', by: 'Owner', recordedBy: 'Assistant', at: '2026-10-01T10:00:00Z', causes: ['the reference export changed'], note: 'Approved in review.' };
  if (index % 13 === 2) return { state: 'holds', attestation: 'agent', by: 'import-script', at: '2026-10-10T10:00:00Z', boundTo };
  return { state: 'holds', attestation: 'delegated', by: 'Owner', recordedBy: 'Assistant', at: '2026-10-12T10:00:00Z', boundTo, note: index % 2 === 0 ? 'The owner said: "these frames are right".' : 'Approved on the call; recorded on that basis.' };
}

export function screensDemo(options: ScreensDemoOptions): Projection {
  const screens: Screen[] = [];
  for (let n = 0; n < options.appStates; n += 1) {
    const state = n === 9 ? LONG_STATE : `step-${String(n + 1).padStart(2, '0')}`;
    for (const device of options.appDevices) screens.push({ state, device, surface: 'app' });
  }
  for (let n = 0; n < options.emailStates; n += 1) {
    for (const device of options.emailDevices) screens.push({ state: `email-${String(n + 1).padStart(2, '0')}`, device, surface: 'email' });
  }

  const snapshotId = `${options.pageId}-references`;
  const boundTo = 'c'.repeat(64);
  const requirements = screens.map((screen) => ({
    id: `${options.pageId}/${screen.state}.${screen.device}`,
    label: `${screen.state}.${screen.device}`,
    subject: { kind: 'page', id: options.pageId, state: screen.state, viewport: `${SIZES[screen.device]!.width}x${SIZES[screen.device]!.height}`, dimensions: { device: screen.device, surface: screen.surface } },
    requiredProofs: ['visual'],
    enrolled: true,
    design: { availability: 'available', snapshotId }
  }));

  const comparisons = screens.flatMap((screen, index) => {
    const outcome = outcomeOf(index, options.allFailing ?? false);
    if (outcome === 'none') return [];
    const requirement = requirements[index]!;
    const size = SIZES[screen.device]!;
    const file = `${screen.state}.${screen.device}`;
    const failed = outcome === 'failed';
    return [
      {
        id: `${requirement.id}/visual`,
        requirementId: requirement.id,
        subject: requirement.subject,
        snapshotId,
        runId: 'run-1',
        reference: { artifact: { role: 'reference', path: `references/${file}.png`, ...size }, baselineSha256: 'b'.repeat(64), approval: approvalOf(index, boundTo) },
        actual: { role: 'actual', path: `actual/${file}.png`, ...size },
        ...(outcome === 'error'
          ? {}
          : { diff: { artifact: { role: 'diff', path: `diff/${file}.png`, ...size }, metric: { name: 'match-percent', value: failed ? 91.4 : 99.6, label: 'Match', unit: '%', direction: 'higher-is-better', passAt: 95 }, threshold: { minMatchPercent: 95, pixelThreshold: 0.1 } } }),
        proof: { visual: outcome === 'error' ? 'not-run' : outcome },
        verdict: outcome === 'error' ? { status: 'error', severity: 'blocking', failureClass: 'capture-error' } : failed ? { status: 'fail', severity: 'blocking', failureClass: 'visual-mismatch' } : { status: 'pass', severity: 'info' },
        nativeOutcome: outcome,
        ...(outcome === 'error' ? { limitations: ['The page did not finish loading before the capture timed out'] } : {})
      }
    ];
  });

  const oldSnapshotId = `${options.pageId}-references-june`;
  const history = options.withHistory ?? false;
  if (history) {
    // The last three app states were never re-run after the new export.
    const stale = new Set(screens.filter((screen) => screen.surface === 'app').slice(-3 * options.appDevices.length).map((screen) => `${options.pageId}/${screen.state}.${screen.device}/visual`));
    for (const comparison of comparisons) if (stale.has(comparison.id)) comparison.snapshotId = oldSnapshotId;
  }
  const acceptedIds = comparisons.filter((comparison) => comparison.proof.visual === 'passed' && comparison.subject.dimensions.device === 'mobile').slice(0, 4).map((comparison) => comparison.id);
  const draft = { requirements, comparisons };

  return projectionSchema.parse({
    schemaVersion: 1,
    project: { id: `${options.pageId}-demo`, name: options.label },
    provider: { name: 'page-capture', readinessConcepts: { needsDesign: false, notEnrolled: false }, capabilities: [] },
    generatedAt: '2026-10-18T12:00:00Z',
    inventory: 'full',
    snapshots: [
      { id: snapshotId, kind: 'design-export', role: 'proof-source', label: `Design export of the ${options.label} frames`, capturedAt: '2026-10-12T09:00:00Z', sha256: boundTo },
      ...(history ? [{ id: oldSnapshotId, kind: 'design-export', role: 'proof-source', label: `June export of the ${options.label} frames`, capturedAt: '2026-06-12T09:00:00Z', supersededBy: snapshotId }] : [])
    ],
    runs: [{ id: 'run-1', finishedAt: '2026-10-14T09:00:00Z', engine: { name: 'pixel-compare', version: '1.0.0' }, nativeValidity: 'current' }],
    requirements,
    comparisons,
    subjects: [{ id: options.pageId, kind: 'page', label: options.label, presentation: { groupBy: 'state', columns: 'device', sections: 'surface' } }],
    decisions: history
      ? [
          {
            id: `${options.pageId}-raised-mobile-limit`,
            kind: 'accept-deviation',
            bundleId: `${options.pageId}-earlier-build`,
            by: 'Owner',
            recordedBy: 'Assistant',
            at: '2026-10-13T10:00:00Z',
            attestation: 'delegated',
            comment: 'The owner said: "mobile label wrapping differs by a few pixels, accept up to 2 % for these screens".',
            scope: { comparisonIds: acceptedIds },
            binding: bindingForComparisons(draft as unknown as Projection, acceptedIds)
          }
        ]
      : []
  });
}
