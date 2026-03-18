import HomeMap from "@/app/home-map"

export default function MapPage() {
  const googleMapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? ""
  return <HomeMap googleMapsKey={googleMapsKey} />
}

