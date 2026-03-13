// Google AdSense ad management for web
// Supports banner ads and inline loading ads (non-intrusive)

const AD_CLIENT = import.meta.env.VITE_ADSENSE_CLIENT || '';
const BANNER_SLOT = import.meta.env.VITE_ADSENSE_BANNER_SLOT || '';
const INLINE_SLOT = import.meta.env.VITE_ADSENSE_INLINE_SLOT || '';
export const ADS_ENABLED = !!(AD_CLIENT && (BANNER_SLOT || INLINE_SLOT));

/** Load the AdSense script if not already present */
export function initAds(): void {
  if (!AD_CLIENT) return;
  if (document.getElementById('adsense-script')) return;

  const script = document.createElement('script');
  script.id = 'adsense-script';
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${AD_CLIENT}`;
  document.head.appendChild(script);
}

/** Push an ad unit after it's been added to the DOM */
export function pushAd(): void {
  try {
    ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
  } catch {
    // Ad push failed — silently ignore
  }
}

export function getAdClient(): string {
  return AD_CLIENT;
}

export function getBannerSlot(): string {
  return BANNER_SLOT;
}

export function getInlineSlot(): string {
  return INLINE_SLOT;
}
