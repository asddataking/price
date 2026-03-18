import HomeFeed from "@/components/home/home-feed"
import WPriceBrandingShell from "@/components/branding/WPriceBrandingShell"

export default function App() {
  return (
    <WPriceBrandingShell>
      <div className="relative min-h-screen">
        {/* Blurred background copy: makes the surrounding UI feel like a “blur of the app itself”. */}
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
          <div className="absolute inset-0 transform scale-[1.03] blur-2xl opacity-35">
            <HomeFeed renderMode="blurred" />
          </div>
        </div>

        {/* Foreground live app. */}
        <div className="relative z-10">
          <HomeFeed renderMode="live" />
        </div>
      </div>
    </WPriceBrandingShell>
  )
}

