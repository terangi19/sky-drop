import type { MarketplaceDomainModule } from "../types";
import { vehiclesDomain } from "./vehicles";
import { collectiblesDomain } from "./collectibles";
import { electronicsDomain } from "./electronics";
import { fashionDomain } from "./fashion";
import { equipmentDomain } from "./equipment";
import { servicesDomain } from "./services";

/** Pluggable domain registry — order is arbitration tie-break only. */
export const MARKETPLACE_DOMAINS: MarketplaceDomainModule[] = [
  vehiclesDomain,
  collectiblesDomain,
  electronicsDomain,
  fashionDomain,
  equipmentDomain,
  servicesDomain,
];

export {
  vehiclesDomain,
  collectiblesDomain,
  electronicsDomain,
  fashionDomain,
  equipmentDomain,
  servicesDomain,
};
