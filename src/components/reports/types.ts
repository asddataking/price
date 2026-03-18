export type StoreRow = {
  id: string
  name: string
  lat: string | number
  lng: string | number
  address: string | null
  category: string
}

export type ItemRow = {
  id: string
  name: string
  category: string
  variants: string[]
}

