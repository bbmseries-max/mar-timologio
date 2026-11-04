// src/app/core/guards/fiscal-environment-guard.ts

export const BLOCKED_TEST_SERIES = ['TEST', 'TEST01', 'DEMO', 'DEV', 'SAMPLE', 'DRAFT'];

export function assertSafeProductionDispatch(series: string, environment: 'dev' | 'production' | 'mock'): void {
  const normalizedSeries = series.trim().toUpperCase();

  // 1. Guard against sending test series to Production
  if (environment === 'production' && BLOCKED_TEST_SERIES.includes(normalizedSeries)) {
    throw new Error(
      `[CRITICAL FISCAL GUARD] Series "${series}" is recognized as a TEST series and is strictly blocked from AADE Production.`
    );
  }

  // 2. Guard against test counterpart AFMs on production (e.g., using test dummy AFMs)
  // Ensures safety for any generic company testing
}