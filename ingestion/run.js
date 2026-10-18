import registry from "../data/source-registry.json" with { type: "json" };

import { fetchSource } from "./fetch-source.js";
import { validateSourceRegistry } from "./validate-source.js";

export async function runAcquisition(sourceId) {
  const registryResult = validateSourceRegistry(registry);

  if (!registryResult.valid) {
    return {
      ok: false,
      stage: "configuration",
      code: "INVALID_SOURCE_REGISTRY",
      message: "The data source configuration needs attention."
    };
  }

  const source = registry.sources.find(
    (item) => item.id === sourceId
  );

  if (!source) {
    return {
      ok: false,
      stage: "configuration",
      code: "SOURCE_NOT_FOUND",
      message: "The requested data source is not registered."
    };
  }

  try {
    const result = await fetchSource(source, registry);

    return {
      ok: true,
      stage: "acquisition",
      sourceId: result.sourceId,
      sourceUrl: result.sourceUrl,
      retrievedAt: result.retrievedAt,
      contentType: result.contentType,
      byteLength: result.byteLength,
      content: result.body
    };
  } catch (error) {
    return {
      ok: false,
      stage: "acquisition",
      code: error.code || "ACQUISITION_FAILED",
      message: "WAYMARK couldn't retrieve this source. Please try again later."
    };
  }
}