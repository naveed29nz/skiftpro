import type { SigningProvider } from "./provider.ts";
import { POSTEN_NOT_CONFIGURED } from "../posten/routing.js";

export const postenProvider: SigningProvider = {
  name: "posten",
  active: false,
  inactiveMessage: POSTEN_NOT_CONFIGURED,
};
