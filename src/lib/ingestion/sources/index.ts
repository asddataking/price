import type { AdapterId, SourceAdapter } from "./adapter"
import { gasAdapter } from "./gas"
import { groceryAdapter } from "./grocery"
import { storeMetadataAdapter } from "./storeMetadata"
import { userMergeAdapter } from "./userMerge"

export const sourceAdapters: Record<AdapterId, SourceAdapter> = {
  gas: gasAdapter,
  grocery: groceryAdapter,
  store_metadata: storeMetadataAdapter,
  user_merge: userMergeAdapter,
}

export function getSourceAdapters(ids: AdapterId[]) {
  return ids.map((id) => sourceAdapters[id]).filter(Boolean)
}

