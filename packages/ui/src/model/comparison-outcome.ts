import type { Comparison } from 'reflection-projection';

export type ComparisonOutcome = 'passed' | 'failed' | 'not-run';

/** From the proof layers only. A comparison with no layer that ran has not run, whatever its verdict word says. */
export function comparisonOutcome(comparison: Comparison): ComparisonOutcome {
  const layers = Object.values(comparison.proof);
  if (layers.includes('failed')) {
    return 'failed';
  }
  return layers.length > 0 && layers.every((layer) => layer === 'passed') ? 'passed' : 'not-run';
}

export interface ComparisonCounts {
  executed: number;
  passed: number;
  failed: number;
  notRun: number;
}

/** Comparisons, counted in their own unit. Never shown as a ratio against required items. */
export function countComparisons(comparisons: Comparison[]): ComparisonCounts {
  const outcomes = comparisons.map(comparisonOutcome);
  const passed = outcomes.filter((outcome) => outcome === 'passed').length;
  const failed = outcomes.filter((outcome) => outcome === 'failed').length;
  return { executed: passed + failed, passed, failed, notRun: outcomes.length - passed - failed };
}
