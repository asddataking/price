import HomeMap from "./home-map"

export default function Home() {
  const googleMapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? ""
  return <HomeMap googleMapsKey={googleMapsKey} />
}
