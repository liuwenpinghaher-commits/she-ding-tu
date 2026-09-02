import { createContext, useContext } from "react";

export type PaneId = "main" | "split";

export const PaneCtx = createContext<PaneId>("main");

export function usePane(): PaneId {
  return useContext(PaneCtx);
}
