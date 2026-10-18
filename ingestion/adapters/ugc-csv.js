import { normalizeText, normalizeUrl } from "../normalize.js";

function parseCsvRows(input) {
  const rows = [];
  let row = [];
  let field = "";
  let insideQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    const next = input[i + 1];

    if (insideQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        insideQuotes = false;
      } else {
        field += char;
      }

      continue;
    }

    if (char === '"' && field.length === 0) {
      insideQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && next === "\n") {
        i++;
      }

      row.push(field);
      field = "";

      if (row.some((value) => value.trim() !== "")) {
        rows.push(row);
      }

      row = [];
    } else {
      field += char;
    }
  }

  if (insideQuotes) {
    throw new Error("The CSV contains an unclosed quoted field.");
  }

  if (field.length || row.length) {
    row.push(field);

    if (row.some((value) => value.trim() !== "")) {
      rows.push(row);
    }
  }

  return rows;
}

function normalizeHeader(value) {
  return normalizeText(value)
    .replace(/^\uFEFF/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function getColumn(headers, alternatives) {
  for (const alternative of alternatives) {
    const index = headers.indexOf(normalizeHeader(alternative));

    if (index !== -1) {
      return index;
    }
  }

  return -1;
}

function getValue(row, index) {
  if (index < 0) {
    return "";
  }

  return normalizeText(row[index] ?? "");
}

export function importUgcCsv(csv, options = {}) {
  if (typeof csv !== "string" || !csv.trim()) {
    return {
      ok: false,
      records: [],
      rejected: [],
      errors: ["The CSV file is empty."]
    };
  }

  let rows;

  try {
    rows = parseCsvRows(csv);
  } catch {
    return {
      ok: false,
      records: [],
      rejected: [],
      errors: ["The CSV file could not be parsed."]
    };
  }

  if (rows.length < 2) {
    return {
      ok: false,
      records: [],
      rejected: [],
      errors: ["The CSV does not contain any data rows."]
    };
  }

  const headers = rows[0].map(normalizeHeader);

  const columns = {
    name: getColumn(headers, [
      "Name of the University",
      "University Name",
      "Name"
    ]),
    type: getColumn(headers, ["Type"]),
    address: getColumn(headers, ["Address"]),
    postalCode: getColumn(headers, ["Zip", "PIN Code", "Pincode"]),
    state: getColumn(headers, ["State"]),
    status: getColumn(headers, ["Status"]),
    website: getColumn(headers, [
      "University Website",
      "Website",
      "URL"
    ])
  };

  if (columns.name === -1 || columns.state === -1) {
    return {
      ok: false,
      records: [],
      rejected: [],
      errors: [
        "Required university-name or state columns were not found."
      ]
    };
  }

  const sourceUrl =
    "https://www.ugc.gov.in/universitydetails/university";

  const records = [];
  const rejected = [];

  for (let index = 1; index < rows.length; index++) {
    const row = rows[index];

    const name = getValue(row, columns.name);
    const state = getValue(row, columns.state);
    const type = getValue(row, columns.type);
    const address = getValue(row, columns.address);
    const postalCode = getValue(row, columns.postalCode);
    const status = getValue(row, columns.status);
    const websiteRaw = getValue(row, columns.website);
    const website = normalizeUrl(websiteRaw);

    if (!name || !state) {
      rejected.push({
        row: index + 1,
        reason: "University name or state is missing."
      });

      continue;
    }

    records.push({
      id: `ugc-${index}-${slugify(name)}-${slugify(state)}`,
      name,
      institutionType: type || null,
      address: address || null,
      postalCode: postalCode || null,
      state,
      ugcListedStatus: status || null,
      website,
      source: {
        sourceId: "aishe",
        sourceUrl,
        importedAt: options.importedAt || new Date().toISOString(),
        verificationStatus: "unverified"
      }
    });
  }

  return {
    ok: true,
    records,
    rejected,
    summary: {
      rowsRead: rows.length - 1,
      recordsImported: records.length,
      rowsRejected: rejected.length,
      allRowsImported: rejected.length === 0
    }
  };
}

function slugify(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}