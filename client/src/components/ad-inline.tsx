import { useEffect, useRef } from 'react';
import { ADS_ENABLED, pushAd, getAdClient, getInlineSlot } from '@/lib/ads';

/** Inline ad shown during loading screens (medium rectangle, non-intrusive) */
export function AdInline() {
  const pushed = useRef(false);

  useEffect(() => {
    if (ADS_ENABLED && !pushed.current) {
      pushed.current = true;
      pushAd();
    }
  }, []);

  if (!ADS_ENABLED) return null;

  return (
    <div className="w-full flex justify-center mt-6">
      <div className="rounded-xl overflow-hidden bg-white/5 border border-white/10">
        <div className="text-[10px] text-muted-foreground text-center py-1 opacity-50">Sponsored</div>
        <ins
          className="adsbygoogle"
          style={{ display: 'block', width: 300, height: 250 }}
          data-ad-client={getAdClient()}
          data-ad-slot={getInlineSlot()}
          data-ad-format="rectangle"
        />
      </div>
    </div>
  );
}
