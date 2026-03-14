import React, { useState, useEffect } from 'react';
import { View } from 'react-native';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';

const AD_UNIT_ID = __DEV__
  ? TestIds.ADAPTIVE_BANNER
  : 'ca-app-pub-7221066669944864/7069868704';

interface Props {
  size?: BannerAdSize;
}

/**
 * Safe wrapper around BannerAd that:
 * - Delays rendering to let AdMob SDK initialize
 * - Catches load errors silently
 * - Returns null on failure instead of crashing
 */
export function SafeBannerAd({ size = BannerAdSize.ANCHORED_ADAPTIVE_BANNER }: Props) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // Delay ad rendering to ensure SDK is initialized
    const timer = setTimeout(() => setReady(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  if (!ready || failed) return null;

  return (
    <View>
      <BannerAd
        unitId={AD_UNIT_ID}
        size={size}
        onAdFailedToLoad={() => setFailed(true)}
      />
    </View>
  );
}
