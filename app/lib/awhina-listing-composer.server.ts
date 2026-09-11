/**
 * Server-only listing composer. Injects the gated OpenAI description writer.
 * Client Components must import sync helpers from `awhina-listing-composer.ts`.
 */
import "server-only";

import { generateGatedDescriptionWriterOutput } from "./awhina-description-writer.server";
import {
  enforcePublicListingDescriptionAsync as enforcePublicListingDescriptionAsyncCore,
  finalizeAwhinaListingDescriptionAsync as finalizeAwhinaListingDescriptionAsyncCore,
} from "./awhina-listing-composer";
import type { ListingDescriptionQuality } from "./awhina-product-ux";
import type { DescriptionWriterRunOptions } from "./awhina-description-writer";
import type { SkyAiListingFill } from "./sky-ai-listing-fill";

export {
  composeListingTitleAndDescription,
  enforcePublicListingDescription,
  finalizeAwhinaListingDescription,
  recomposeListingDescription,
} from "./awhina-listing-composer";

type AsyncComposerOpts = {
  quality?: ListingDescriptionQuality;
  force?: boolean;
  priorDescription?: string;
  writer?: DescriptionWriterRunOptions["generateRawOutput"];
};

export async function finalizeAwhinaListingDescriptionAsync(
  fill: SkyAiListingFill,
  opts?: AsyncComposerOpts
): Promise<SkyAiListingFill> {
  return finalizeAwhinaListingDescriptionAsyncCore(fill, {
    ...opts,
    writer: opts?.writer ?? generateGatedDescriptionWriterOutput,
  });
}

export async function enforcePublicListingDescriptionAsync(
  fill: SkyAiListingFill,
  opts?: AsyncComposerOpts
): Promise<SkyAiListingFill> {
  return enforcePublicListingDescriptionAsyncCore(fill, {
    ...opts,
    writer: opts?.writer ?? generateGatedDescriptionWriterOutput,
  });
}
