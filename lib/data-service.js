import { readFileSync } from "node:fs";

const UGC_SOURCE_URL =
"https://www.ugc.gov.in/universitydetails/university?type=MuOh4z0uqRaY2k8Ag10I0g%3D%3D";

const CACHE_TTL = 60 * 60 * 1000;
const REQUEST_TIMEOUT = 12000;

let cache = {
records: [],
fetchedAt: 0
};

let localDataset;

function loadLocalDataset() {
if (localDataset) return localDataset;

try {
const fileUrl = new URL("../data/education.json", import.meta.url);
const contents = readFileSync(fileUrl, "utf8");
const parsed = JSON.parse(contents);

if (!parsed || !Array.isArray(parsed.records)) {
  throw new Error("invalid_local_education_dataset");
}

const records = parsed.records.filter(
  record =>
    record &&
    typeof record.id === "string" &&
    typeof record.name === "string" &&
    record.name.trim()
);

localDataset = {
  version: parsed.version || "1.0.0",
  lastUpdated: parsed.lastUpdated || null,
  records
};

return localDataset;

} catch (error) {
console.error("WAYMARK local education dataset failed:", error.message);
return {
version: "1.0.0",
lastUpdated: null,
records: []
};
}
}

function decodeHtml(value = "") {
return String(value)
.replace(/&/gi, "&")
.replace(/"/gi, '"')
.replace(/'|'/gi, "'")
.replace(/</gi, "<")
.replace(/>/gi, ">")
.replace(/ /gi, " ")
.replace(/&#(\d+);/g, (, code) => {
const number = Number(code);
return number <= 0x10ffff ? String.fromCodePoint(number) : "";
})
.replace(/&#x([0-9a-f]+);/gi, (, code) => {
const number = parseInt(code, 16);
return number <= 0x10ffff ? String.fromCodePoint(number) : "";
})
.replace(/<[^>]*>/g, " ")
.replace(/\s+/g, " ")
.trim();
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
/^https?:///i.test(website)
? website
: "https://${website}"
);

if (!["http:", "https:"].includes(url.protocol)) {
  return "";
}

return url.href;

} catch {
return "";
}
}

function extractWebsite(rowHtml) {
const links = [
...rowHtml.matchAll(
/<a\b[^>]href\s=\s*""'" ([^"']+)["'][^>]>([\s\S]?)</a>/gi
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
  !label.includes("website") &&
  !label.includes("visit") &&
  !label.includes("official")
) {
  continue;
}

const website = normalizeWebsite(href);

if (
  website &&
  !website.includes("ugc.gov.in") &&
  !website.includes("ugc.ac.in")
) {
  return website;
}

}

return "";
}

function normalizeInstitution(cells, rowHtml) {
if (cells.length < 7) return null;

const [, type, name, address, pinCode, state] = cells;

if (
!name ||
!state ||
!type ||
/^(type|name of the university|sr.?no.?)$/i.test(name)
) {
return null;
}

const id = slugify("${name}-${state}-${pinCode}");

if (!id) return null;

return {
id,
name,
type,
description: address
? "${name}. Address listed by the University Grants Commission: ${address}${pinCode ? ", ${pinCode}" : ""}."
: "${name}, listed in the University Grants Commission university directory.",
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
const rows = [
...html.matchAll(/<tr\b[^>]>([\s\S]?)</tr>/gi)
];

const records = [];

for (const rowMatch of rows) {
const rowHtml = rowMatch[1];

const cells = [
  ...rowHtml.matchAll(
    /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi
  )
].map(cell => decodeHtml(cell[1]));

const record = normalizeInstitution(cells, rowHtml);

if (record) records.push(record);

}

return [
...new Map(records.map(record => [record.id, record])).values()
];
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

if (!contentType.toLowerCase().includes("text/html")) {
  throw new Error("ugc_unexpected_content_type");
}

const html = await response.text();
const records = parseUniversityDirectory(html);

if (!records.length) {
  throw new Error("ugc_no_records_parsed");
}

return records;

} finally {
clearTimeout(timeout);
}
}

function mergeRecords(primary, fallback) {
const records = new Map();

for (const record of fallback) {
records.set(record.id, record);
}

for (const record of primary) {
records.set(record.id, record);
}

return [...records.values()];
}

function buildResult(records, sourceMode, sourceWarning = null) {
const local = loadLocalDataset();

return {
version: local.version,
lastUpdated: local.lastUpdated,
records,
sourceMode,
sourceWarning
};
}

export async function getEducationData({ refresh = false } = {}) {
const local = loadLocalDataset();

if (
!refresh &&
cache.records.length &&
Date.now() - cache.fetchedAt < CACHE_TTL
) {
return buildResult(
mergeRecords(cache.records, local.records),
"live-cache"
);
}

try {
const liveRecords = await fetchUGCRecords();

cache = {
  records: liveRecords,
  fetchedAt: Date.now()
};

return buildResult(
  mergeRecords(liveRecords, local.records),
  "live"
);

} catch (error) {
console.warn(
"WAYMARK UGC request failed; using available local data:",
error.message
);

if (cache.records.length) {
  return buildResult(
    mergeRecords(cache.records, local.records),
    "stale-cache",
    "The official directory could not be refreshed. Cached and local records are being shown."
  );
}

if (local.records.length) {
  return buildResult(
    local.records,
    "local-fallback",
    "The live UGC directory is temporarily unavailable. Showing the locally maintained dataset instead."
  );
}

throw new Error(
  `education_source_unavailable: ${error.message}`
);

}
}

export async function getSources() {
const local = loadLocalDataset();

return [
{
id: "ugc-university-directory",
name: "University Grants Commission",
url: UGC_SOURCE_URL,
status: cache.records.length ? "connected" : "not_checked",
integration: "live-html-directory"
},
{
id: "waymark-local-dataset",
name: "WAYMARK Local Education Dataset",
url: "https://github.com/spideythedev/waymark-app/blob/main/data/education.json",
status: local.records.length ? "available" : "empty",
integration: "local-json",
recordCount: local.records.length
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
  ...(Array.isArray(record.tags) ? record.tags : [])
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
sourceWarning: data.sourceWarning,
total: records.length,
records
};
}