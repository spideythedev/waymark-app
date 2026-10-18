const DEFAULT_TIMEOUT_MS = 12000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

export class SourceFetchError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.name = "SourceFetchError";
    this.code = code;
    this.status = status;
  }
}

function getAllowedHosts(registry) {
  return new Set(
    registry.sources
      .filter((source) => source.status === "registered_not_integrated")
      .map((source) => {
        try {
          return new URL(source.url).hostname.toLowerCase();
        } catch {
          return "";
        }
      })
      .filter(Boolean)
  );
}

export async function fetchSource(source, registry, options = {}) {
  if (!source || typeof source.url !== "string") {
    throw new SourceFetchError(
      "INVALID_SOURCE",
      "The requested data source is not configured.",
      400
    );
  }

  let url;

  try {
    url = new URL(source.url);
  } catch {
    throw new SourceFetchError(
      "INVALID_SOURCE_URL",
      "The data source has an invalid address.",
      400
    );
  }

  if (url.protocol !== "https:") {
    throw new SourceFetchError(
      "UNSAFE_SOURCE_PROTOCOL",
      "Only HTTPS sources are permitted.",
      400
    );
  }

  const allowedHosts = getAllowedHosts(registry);

  if (!allowedHosts.has(url.hostname.toLowerCase())) {
    throw new SourceFetchError(
      "SOURCE_NOT_ALLOWED",
      "This source is not registered for acquisition.",
      403
    );
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "error",
      signal: controller.signal,
      headers: {
        Accept: "text/html, application/json, text/csv, application/pdf",
        "User-Agent": "WAYMARK-DataAcquisition/1.0"
      }
    });

    if (!response.ok) {
      throw new SourceFetchError(
        "SOURCE_HTTP_ERROR",
        `The source returned HTTP ${response.status}.`
      );
    }

    const contentLength = Number(
      response.headers.get("content-length")
    );

    if (
      Number.isFinite(contentLength) &&
      contentLength > MAX_RESPONSE_BYTES
    ) {
      throw new SourceFetchError(
        "SOURCE_TOO_LARGE",
        "The source response exceeds the permitted size."
      );
    }

    const contentType = (
      response.headers.get("content-type") || ""
    ).toLowerCase();

    const supportedTypes = [
      "text/html",
      "application/json",
      "text/csv",
      "application/pdf"
    ];

    if (!supportedTypes.some((type) => contentType.includes(type))) {
      throw new SourceFetchError(
        "UNSUPPORTED_CONTENT_TYPE",
        "The source returned an unsupported content type."
      );
    }

    if (!response.body) {
      throw new SourceFetchError(
        "EMPTY_RESPONSE",
        "The source returned no readable content."
      );
    }

    const reader = response.body.getReader();
    const chunks = [];
    let totalBytes = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        totalBytes += value.byteLength;

        if (totalBytes > MAX_RESPONSE_BYTES) {
          await reader.cancel();

          throw new SourceFetchError(
            "SOURCE_TOO_LARGE",
            "The source response exceeds the permitted size."
          );
        }

        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }

    const bytes = new Uint8Array(totalBytes);
    let offset = 0;

    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return {
      sourceId: source.id,
      sourceUrl: url.toString(),
      retrievedAt: new Date().toISOString(),
      contentType,
      byteLength: totalBytes,
      body: bytes
    };
  } catch (error) {
    if (error instanceof SourceFetchError) {
      throw error;
    }

    if (error.name === "AbortError") {
      throw new SourceFetchError(
        "SOURCE_TIMEOUT",
        "The source took too long to respond."
      );
    }

    throw new SourceFetchError(
      "SOURCE_UNAVAILABLE",
      "The source could not be retrieved."
    );
  } finally {
    clearTimeout(timeout);
  }
}