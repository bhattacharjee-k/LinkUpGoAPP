import {
  InterstitialAd,
  AdEventType,
  TestIds,
} from 'react-native-google-mobile-ads';

// Use test IDs in development, real IDs in production
const INTERSTITIAL_AD_UNIT = __DEV__
  ? TestIds.INTERSTITIAL
  : 'ca-app-pub-xxxxxxxxxxxxxxxx/yyyyyyyyyy'; // Replace with real ad unit ID

let interstitial: InterstitialAd | null = null;
let adLoaded = false;
let adLoading = false;

// Frequency cap: minimum 5 minutes between interstitials
const MIN_INTERVAL_MS = 5 * 60 * 1000;
let lastShownAt = 0;

function createAndLoadAd(): void {
  if (adLoading) return;
  adLoading = true;
  adLoaded = false;

  interstitial = InterstitialAd.createForAdRequest(INTERSTITIAL_AD_UNIT, {
    keywords: ['nightlife', 'restaurants', 'events', 'social'],
  });

  const loadedUnsub = interstitial.addAdEventListener(AdEventType.LOADED, () => {
    adLoaded = true;
    adLoading = false;
  });

  const errorUnsub = interstitial.addAdEventListener(AdEventType.ERROR, () => {
    adLoaded = false;
    adLoading = false;
  });

  const closedUnsub = interstitial.addAdEventListener(AdEventType.CLOSED, () => {
    adLoaded = false;
    // Preload next ad after this one closes
    setTimeout(createAndLoadAd, 1000);
  });

  interstitial.load();
}

/** Preload an interstitial ad so it's ready when needed */
export function preloadAd(): Promise<void> {
  createAndLoadAd();
  return Promise.resolve();
}

/** Show an interstitial ad. Resolves when closed or if unavailable. */
export function showAd(): Promise<void> {
  return new Promise((resolve) => {
    // Frequency cap
    const now = Date.now();
    if (now - lastShownAt < MIN_INTERVAL_MS) return resolve();

    if (!interstitial || !adLoaded) return resolve();

    const closedUnsub = interstitial.addAdEventListener(AdEventType.CLOSED, () => {
      lastShownAt = Date.now();
      closedUnsub();
      resolve();
    });

    try {
      interstitial.show();
    } catch {
      closedUnsub();
      resolve();
    }
  });
}

/**
 * Show interstitial during plan creation loading.
 * Runs in parallel with session creation — has a timeout so it never blocks.
 */
export async function showInterstitialDuringLoad(): Promise<void> {
  return Promise.race([
    showAd(),
    new Promise<void>((resolve) => setTimeout(resolve, 12000)),
  ]);
}

/**
 * Show interstitial after a completed action (e.g., feedback submission).
 */
export async function showInterstitialAfterAction(): Promise<void> {
  return Promise.race([
    showAd(),
    new Promise<void>((resolve) => setTimeout(resolve, 15000)),
  ]);
}
