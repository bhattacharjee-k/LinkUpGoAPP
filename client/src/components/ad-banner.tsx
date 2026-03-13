import { useEffect, useRef } from 'react';
import { ADS_ENABLED, pushAd, getAdClient, getBannerSlot } from '@/lib/ads';

/** Small banner ad for bottom of pages (320x50 or responsive) */
export function AdBanner() {
  const pushed = useRef(false);

  useEffect(() => {
    if (ADS_ENABLED && !pushed.current) {
      pushed.current = true;
      pushAd();
    }
  }, []);

  if (!ADS_ENABLED) return null;

  return (
    <div className="w-full flex justify-center py-2">
      <ins
        className="adsbygoogle"
        style={{ display: 'block', width: '100%', maxWidth: 400, height: 50 }}
        data-ad-client={getAdClient()}
        data-ad-slot={getBannerSlot()}
        data-ad-format="horizontal"
        data-full-width-responsive="false"
      />
    </div>
  );
}
