export type {
  DocumentPatchPlan,
  FeatEpicLinkInput,
  FeatEpicLinkPlan,
  FeatIdentity,
  LinkOperation,
  SectionPatch,
} from "./feature-epic-linking/link-types.js";
export { planFeatMetadataPatch } from "./feature-epic-linking/feature-metadata-patch.js";
export { planEpicChildPatch } from "./feature-epic-linking/epic-child-patch.js";
export { buildFeatEpicLinkPlan } from "./feature-epic-linking/link-plan.js";
