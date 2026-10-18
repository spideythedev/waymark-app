import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import registry from "../data/source-registry.json" with {
  type: "json"
};

import { importUgcCsv } from "../ingestion/adapters/ugc-csv.js";
import { findDuplicateGroups } from "../ingestion/deduplicate.js";
import { validateSourceRegistry } from "../ingestion/validate-source.js";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

function parseArguments(args) {
  const options = {};

  for (let index = 0; index < args.length; index++) {
    const argument = args[index];

    if (argument === "--input") {
      options.input = args[++index];
    } else if (argument === "--help") {
      options.help = true;
    } else {
      throw new Error("An unsupported command-line option was provided.");
    }
  }

  return options;
}

function printHelp() {
  process.stdout.write(`
WAYMARK UGC CSV Importer

Usage:
  node scripts/import-ugc.js --input path/to/ugc-export.csv

Options:
  --input   Path to a genuine UGC directory CSV export.
  --help    Show this help message.

The importer does not automatically verify university information.
Imported records remain unverified until independently checked.
`);
}

function safeInputPath(input) {
  const resolved = path.resolve(projectRoot, input);
  const relative = path.relative(projectRoot, resolved);

  if (
    relative.startsWith("..") ||
    path.isAbsolute(relative)
  ) {
    throw new Error("The input file must be inside the project directory.");
  }

  return resolved;
}

function createTimestamp() {
  return new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

async function writeJson(filePath, data) {
  await writeFile(
    filePath,
    `${JSON.stringify(data, null, 2)}\n`,
    {
      encoding: "utf8",
      flag: "wx"
    }
  );
}

async function main() {
  const options = parseArguments(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  if (!options.input) {
    printHelp();
    process.exitCode = 1;
    return;
  }

  const registryResult = validateSourceRegistry(registry);

  if (!registryResult.valid) {
    throw new Error(
      "The source registry is invalid. Correct its configuration before importing."
    );
  }

  const source = registry.sources.find(
    (item) => item.id === "ugc"
  );

  if (!source) {
    throw new Error(
      "UGC is not registered as a data source."
    );
  }

  const inputPath = safeInputPath(options.input);
  const csv = await readFile(inputPath, "utf8");

  const result = importUgcCsv(csv, {
    importedAt: new Date().toISOString()
  });

  if (!result.ok) {
    process.stderr.write(
      `Import failed: ${result.errors.join(" ")}\n`
    );

    process.exitCode = 1;
    return;
  }

  const records = result.records.map((record) => ({
    ...record,
    source: {
      ...record.source,
      sourceId: "ugc",
      sourceUrl: source.url,
      verificationStatus: "unverified"
    }
  }));

  const duplicateGroups = findDuplicateGroups(records);
  const timestamp = createTimestamp();

  const importDirectory = path.join(
    projectRoot,
    "data",
    "imports"
  );

  await mkdir(importDirectory, { recursive: true });

  const dataPath = path.join(
    importDirectory,
    `ugc-universities-${timestamp}.json`
  );

  const reportPath = path.join(
    importDirectory,
    `ugc-import-report-${timestamp}.json`
  );

  const importedData = {
    schemaVersion: "1.0.0",
    dataset: "ugc-university-directory-import",
    sourceId: "ugc",
    sourceUrl: source.url,
    importedAt: new Date().toISOString(),
    verificationStatus: "unverified",
    completeness: {
      status: "unknown",
      note: "The source export's coverage has not been independently established."
    },
    records
  };

  const report = {
    schemaVersion: "1.0.0",
    sourceId: "ugc",
    sourceUrl: source.url,
    generatedAt: new Date().toISOString(),
    result: "imported_unverified",
    inputFileName: path.basename(inputPath),
    summary: {
      rowsRead: result.summary.rowsRead,
      recordsImported: records.length,
      rowsRejected: result.rejected.length,
      duplicateGroups: duplicateGroups.length,
      allRowsImported: result.summary.allRowsImported
    },
    rejectedRows: result.rejected,
    duplicateGroups,
    warnings: [
      "Imported records have not been independently verified.",
      "The completeness of the source export has not been established.",
      "Missing fields have not been inferred or fabricated.",
      "This import must not be presented as a complete nationwide directory."
    ]
  };

  await writeJson(dataPath, importedData);
  await writeJson(reportPath, report);

  process.stdout.write(`
WAYMARK import completed.

Records imported: ${records.length}
Rows rejected: ${result.rejected.length}
Potential duplicate groups: ${duplicateGroups.length}
Verification: UNVERIFIED
Coverage: UNKNOWN

Data: ${path.relative(projectRoot, dataPath)}
Report: ${path.relative(projectRoot, reportPath)}

The imported records are not yet approved for verified public recommendations.
`);
}

main().catch(() => {
  process.stderr.write(
    "Import failed. Check the input file, source registry, and project configuration."
  );

  process.stderr.write("\n");
  process.exitCode = 1;
});