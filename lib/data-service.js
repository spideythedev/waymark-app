const UGC_SOURCE_URL =
  "https://www.ugc.gov.in/universitydetails/university?type=MuOh4z0uqRaY2k8Ag10I0g%3D%3D";

const CACHE_TTL = 60 * 60 * 1000;
const REQUEST_TIMEOUT = 15000;

let cache = {
  records: [],
  fetchedAt: 0
};

function decodeHtml(value = "") {
  return String(value)
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, code) =>
      String.fromCodePoint(Number(code))
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCodePoint(parseInt(code, 16))
    )
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getCellValue(cell) {
  return decodeHtml(cell);
}

function slugify(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeWebsite(value) {
  const website = String(value || "").trim();

  if (!website) return "";

  try {
    const url = new URL(
      /^https?:\/\//i.test(website)
        ? website
        : `https://${website}`
    );

    if (!["http:", "https:"].includes(url.protocol)) {
      return "";
    }

    return url.href;
  } catch {
    return "";
  }
}

function extractWebsite(row) {
  const links = [
    ...row.matchAll(
      /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
    )
  ];

  for (const match of links) {
    const href = decodeHtml(match[1]);
    const label = decodeHtml(match[2]).toLowerCase();

    if (
      !href ||
      href.startsWith("#") ||
      /^javascript:/i.test(href)
    ) {
      continue;
    }

    if (
      label.includes("website") ||
      label.includes("visit") ||
      label.includes("official")
    ) {
      const website = normalizeWebsite(href);

      if (
        website &&
        !website.includes("ugc.gov.in") &&
        !website.includes("ugc.ac.in")
      ) {
        return website;
      }
    }
  }

  return "";
}

function normalizeInstitution(cells, rowHtml) {
  if (cells.length < 7) return null;

  const [serial, type, name, address, pinCode, state, status] =
    cells;

  if (
    !name ||
    !state ||
    !type ||
    /^(type|name of the university|sr\.?no\.?)$/i.test(name)
  ) {
    return null;
  }

  const id = slugify(`${name}-${state}-${pinCode}`);

  if (!id) return null;

  return {
    id,
    name,
    type,
    description: address
      ? `${name}. Address listed by the University Grants Commission: ${address}${pinCode ? `, ${pinCode}` : ""}.`
      : `${name}, listed in the University Grants Commission university directory.`,
    state,
    city: "",
    address,
    pinCode,
    officialUrl: extractWebsite(rowHtml),
    source: {
      id: "ugc-university-directory",
      name: "University Grants Commission",
      url: UGC_SOURCE_URL
    },
    sources: [
      {
        name: "University Grants Commission",
        url: UGC_SOURCE_URL,
        type: "official"
      }
    ],
    verification: {
      status: "source-listed",
      method: "Record retrieved from the UGC university directory",
      lastCheckedAt: new Date().toISOString()
    },
    verified: true,
    verificationScope: "source_listing",
    tags: [type, state].filter(Boolean)
  };
}

function parseUniversityDirectory(html) {
  const tableRows = [
    ...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)
  ];

  const records = [];

  for (const match of tableRows) {
    const rowHtml = match[1];

    const rawCells = [
      ...rowHtml.matchAll(
        /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi
      )
    ];

    const cells = rawCells.map(cell => getCellValue(cell[1]));

    if (cells.length < 7) continue;

    const record = normalizeInstitution(cells, rowHtml);

    if (record) records.push(record);
  }

  const unique = new Map();

  for (const record of records) {
    if (!unique.has(record.id)) {
      unique.set(record.id, record);
    }
  }

  return [...unique.values()];
}

async function fetchUGCRecords() {
  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT
  );

  try {
    const response = await fetch(UGC_SOURCE_URL, {
      method: "GET",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "WAYMARK-Education-Directory/1.0"
      },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`ugc_http_${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";

    if (!contentType.includes("text/html")) {
      throw new Error("ugc_unexpected_content_type");
    }

    const html = await response.text();
    const records = parseUniversityDirectory(html);

    if (!records.length) {
      throw new Error("ugc_no_records_parsed");
    }

    cache = {
      records,
      fetchedAt: Date.now()
    };

    return records;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getEducationData({ refresh = false } = {}) {
  if (
    !refresh &&
    cache.records.length &&
    Date.now() - cache.fetchedAt < CACHE_TTL
  ) {
    return {
      version: "2.0.0",
      lastUpdated: new Date(cache.fetchedAt).toISOString(),
      records: cache.records,
      sourceMode: "live-cache"
    };
  }

  try {
    const records = await fetchUGCRecords();

    return {
      version: "2.0.0",
      lastUpdated: new Date(cache.fetchedAt).toISOString(),
      records,
      sourceMode: "live"
    };
  } catch (error) {
    if (cache.records.length) {
      return {
        version: "2.0.0",
        lastUpdated: new Date(cache.fetchedAt).toISOString(),
        records: cache.records,
        sourceMode: "stale-cache",
        sourceWarning: error.message
      };
    }

    throw new Error(
      `education_source_unavailable: ${error.message}`
    );
  }
}

export async function getSources() {
  return [
    {
      id: "ugc-university-directory",
      name: "University Grants Commission",
      url: UGC_SOURCE_URL,
      status: cache.records.length ? "connected" : "not_checked",
      integration: "live-html-directory"
    }
  ];
}

export async function searchEducation({
  query = "",
  type = "",
  state = ""
} = {}) {
  const data = await getEducationData();

  const normalizedQuery = String(query).trim().toLowerCase();
  const normalizedType = String(type).trim().toLowerCase();
  const normalizedState = String(state).trim().toLowerCase();

  const records = data.records.filter(record => {
    const matchesType =
      !normalizedType ||
      String(record.type || "").toLowerCase() === normalizedType;

    const matchesState =
      !normalizedState ||
      String(record.state || "").toLowerCase() === normalizedState;

    const searchableText = [
      record.id,
      record.name,
      record.type,
      record.description,
      record.address,
      record.state,
      record.city,
      record.pinCode,
      ...(record.tags || [])
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return (
      matchesType &&
      matchesState &&
      (!normalizedQuery || searchableText.includes(normalizedQuery))
    );
  });

  return {
    datasetVersion: data.version,
    lastUpdated: data.lastUpdated,
    sourceMode: data.sourceMode,
    total: records.length,
    records
  };
}