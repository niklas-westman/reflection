// The outcome of a comparison, and comparison counts, are defined once in the projection package so the viewer,
// the release diff and any provider read a comparison the same way.
export { comparisonOutcome, countComparisons } from 'reflection-projection';
export type { ComparisonCounts, ComparisonOutcome } from 'reflection-projection';
