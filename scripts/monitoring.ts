export type NumericObservation = number | null | undefined;

export type DriftMetric = {
  featureName: string;
  baselineCount: number;
  currentCount: number;
  baselineMean: number | null;
  currentMean: number | null;
  relativeMeanShift: number | null;
  status: "healthy" | "warning" | "unavailable";
};

export type PerformanceMetric = {
  status: "available" | "unavailable";
  sampleCount: number;
  positiveCount: number;
  brierScore: number | null;
  reason: string | null;
};

function finite(values: NumericObservation[]): number[] {
  return values.filter(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value)
  );
}

function mean(values: number[]): number | null {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

export function missingnessRate(values: NumericObservation[]): number | null {
  if (values.length === 0) return null;
  return (values.length - finite(values).length) / values.length;
}

export function compareNumericFeature(
  featureName: string,
  baseline: NumericObservation[],
  current: NumericObservation[],
  warningThreshold = 0.2
): DriftMetric {
  const baselineValues = finite(baseline);
  const currentValues = finite(current);
  const baselineMean = mean(baselineValues);
  const currentMean = mean(currentValues);
  if (baselineMean === null || currentMean === null) {
    return {
      featureName,
      baselineCount: baselineValues.length,
      currentCount: currentValues.length,
      baselineMean,
      currentMean,
      relativeMeanShift: null,
      status: "unavailable",
    };
  }
  const denominator = Math.max(Math.abs(baselineMean), 1e-9);
  const relativeMeanShift = Math.abs(currentMean - baselineMean) / denominator;
  return {
    featureName,
    baselineCount: baselineValues.length,
    currentCount: currentValues.length,
    baselineMean,
    currentMean,
    relativeMeanShift,
    status: relativeMeanShift > warningThreshold ? "warning" : "healthy",
  };
}

export function brierPerformance(
  predictions: NumericObservation[],
  labels: NumericObservation[]
): PerformanceMetric {
  if (predictions.length !== labels.length || predictions.length === 0) {
    return {
      status: "unavailable",
      sampleCount: 0,
      positiveCount: 0,
      brierScore: null,
      reason:
        "No one-to-one prediction and outcome label alignment is available.",
    };
  }
  const pairs = predictions
    .map((prediction, index) => [prediction, labels[index]] as const)
    .filter(
      (pair): pair is readonly [number, number] =>
        typeof pair[0] === "number" &&
        Number.isFinite(pair[0]) &&
        typeof pair[1] === "number" &&
        Number.isInteger(pair[1]) &&
        (pair[1] === 0 || pair[1] === 1)
    );
  if (pairs.length !== predictions.length) {
    return {
      status: "unavailable",
      sampleCount: pairs.length,
      positiveCount: pairs.filter(([, label]) => label === 1).length,
      brierScore: null,
      reason: "Some predictions do not have valid aligned binary outcomes.",
    };
  }
  return {
    status: "available",
    sampleCount: pairs.length,
    positiveCount: pairs.filter(([, label]) => label === 1).length,
    brierScore:
      pairs.reduce(
        (sum, [prediction, label]) => sum + (prediction - label) ** 2,
        0
      ) / pairs.length,
    reason: null,
  };
}
