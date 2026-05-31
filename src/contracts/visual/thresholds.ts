export type VisualThreshold = {
  maxDiffPixels?: number;
  maxDiffPixelRatio?: number;
};

export type ThresholdEvaluationInput = {
  diffPixels: number;
  totalPixels: number;
  threshold?: VisualThreshold;
};

export type ThresholdEvaluation = {
  passed: boolean;
  diffRatio: number;
  reason?: 'maxDiffPixels' | 'maxDiffPixelRatio';
};

export function evaluateVisualThreshold(input: ThresholdEvaluationInput): ThresholdEvaluation {
  const diffRatio = input.totalPixels === 0 ? 0 : input.diffPixels / input.totalPixels;

  if (input.threshold?.maxDiffPixels !== undefined && input.diffPixels > input.threshold.maxDiffPixels) {
    return { passed: false, diffRatio, reason: 'maxDiffPixels' };
  }

  if (input.threshold?.maxDiffPixelRatio !== undefined && diffRatio > input.threshold.maxDiffPixelRatio) {
    return { passed: false, diffRatio, reason: 'maxDiffPixelRatio' };
  }

  return { passed: true, diffRatio };
}
