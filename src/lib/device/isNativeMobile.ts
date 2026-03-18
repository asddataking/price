/**
 * Detect “native mobile” contexts (Android/iOS apps + in-app webviews).
 *
 * Goal: if the user is in a native wrapper webview, show the full app UI.
 * If they’re on a normal desktop browser, show a landing page.
 */
export function isNativeMobileUserAgent(userAgent: string | null | undefined): boolean {
  const ua = (userAgent ?? "").toLowerCase()

  const isAndroid = ua.includes("android")
  const isIOS = /iphone|ipad|ipod/.test(ua)

  // Many in-app webviews (React Native / Cordova / etc) include `wv`.
  const isWebView = ua.includes(" wv") || ua.includes("wv")

  // Some iOS crawlers/webviews use Safari-like UA with iPhone tokens.
  const isMobile = ua.includes("mobile")

  return (isAndroid || isIOS) && (isWebView || isMobile)
}

