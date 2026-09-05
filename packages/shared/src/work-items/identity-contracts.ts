export type CardKind = "epic" | "feature";
export type EpicDeliveryState = "not-started" | "in-progress" | "completed" | "cancelled";
export type MemoryBankStateFolder =
  | "00_EPICS"
  | "01_SUBMITTED"
  | "02_READY_TO_DEVELOP"
  | "03_IN_PROGRESS"
  | "04_COMPLETED"
  | "05_CANCELLED";
