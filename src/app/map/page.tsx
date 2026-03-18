import HomeMap from "@/app/home-map"
import WPriceBrandingShell from "@/components/branding/WPriceBrandingShell"

export default function MapPage() {
  const googleMapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? ""
  return (
    <WPriceBrandingShell>
      <main className="relative z-10 mx-auto w-full max-w-xl">
        <HomeMap googleMapsKey={googleMapsKey} />
      </main>
    </WPriceBrandingShell>
  )
}

