// Ads disabled — react-native-google-mobile-ads removed.
// These no-op stubs keep callers working without changes.

export function preloadAd(): Promise<void> {
  return Promise.resolve();
}

export function showAd(): Promise<void> {
  return Promise.resolve();
}

export async function showInterstitialDuringLoad(): Promise<void> {
  // no-op
}
