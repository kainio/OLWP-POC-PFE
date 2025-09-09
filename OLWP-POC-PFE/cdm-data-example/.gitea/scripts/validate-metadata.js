#!/usr/bin/env node

/**
 * Metadata Validation Script
 * Validates submission metadata and ensures proper audit trail
 */

const { error } = require("console");
const fs = require("fs");
const path = require("path");

function validateMetadata(metadata, filePath) {
  const violations = [];
  let isValid = true;

  // Required metadata fields
  const requiredFields = [
    "submissionId",
    "processedAt",
    "gitBranch",
    "gitCommitMessage",
  ];

  for (const field of requiredFields) {
    if (!metadata[field]) {
      violations.push(`Missing required metadata field: ${field}`);
      isValid = false;
    }
  }

  // Validate submission ID format
  if (metadata.submissionId) {
    const submissionIdPattern = /^\d{13}-[a-z0-9]{9}$/;
    if (!submissionIdPattern.test(metadata.submissionId)) {
      violations.push(`Invalid submissionId format: ${metadata.submissionId}`);
      isValid = false;
    }
  }

  // Validate timestamp format
  if (metadata.processedAt) {
    try {
      const date = new Date(metadata.processedAt);
      if (
        isNaN(date.getTime()) ||
        date.toISOString() !== metadata.processedAt
      ) {
        violations.push(
          `Invalid processedAt timestamp: ${metadata.processedAt}`
        );
        isValid = false;
      }

      // Check if timestamp is reasonable (not in future, not too old)
      const now = new Date();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours

      if (date > now) {
        violations.push("processedAt timestamp cannot be in the future");
        isValid = false;
      }

      // if (now - date > maxAge) {
      //   violations.push('processedAt timestamp is too old (>24 hours)');
      //   isValid = false;
      // }
    } catch (error) {
      violations.push(`Error parsing processedAt timestamp: ${error.message}`);
      isValid = false;
    }
  }

  // Validate git branch naming convention
  if (metadata.gitBranch) {
    const branchPattern =
      /^(contact|feature|hotfix)-[a-z0-9]{8}-\d{4}-\d{2}-\d{2}t\d{2}-\d{2}-\d{2}-\d{3}z$/i;
    if (!branchPattern.test(metadata.gitBranch)) {
      violations.push(
        `Git branch does not follow naming convention: ${metadata.gitBranch}`
      );
      isValid = false;
    }
  }

  // Validate CDM schema version
  if (metadata.version) {
    const versionPattern = /^\d+\.\d+$/;
    if (!versionPattern.test(metadata.version)) {
      violations.push(`Invalid CDM schema version format: ${metadata.version}`);
      isValid = false;
    }
  }

  // Validate namespace format
  if (metadata.namespace) {
    const namespacePattern = /^[a-z]+(\.[a-z]+)*\.[a-z]+$/;
    if (!namespacePattern.test(metadata.namespace)) {
      violations.push(`Invalid CDM namespace format: ${metadata.namespace}`);
      isValid = false;
    }
  }

  // Validate record count
  if (metadata.recordCount !== undefined) {
    if (!Number.isInteger(metadata.recordCount) || metadata.recordCount < 0) {
      violations.push(`Invalid recordCount: ${metadata.recordCount}`);
      isValid = false;
    }
  }

  // Cross-reference with actual data files
  if (metadata.submissionId) {
    const repoRoot = path.resolve(__dirname, "..");
    const contactsDir = path.join(repoRoot, "data/contacts");

    const expectedDataFile = path.join(
      contactsDir,
      `${metadata.contactId}.json`
    );
    if (!fs.existsSync(expectedDataFile)) {
      violations.push(`Referenced data file not found: ${expectedDataFile}`);
      isValid = false;
    }
  }

  return { isValid, violations };
}

function validateFile(filePath) {
  try {
    console.log(`🔍 Validating metadata ${filePath}...`);

    const content = fs.readFileSync(filePath, "utf8");
    const metadata = JSON.parse(content);

    const { isValid, violations } = validateMetadata(metadata, filePath);

    if (!isValid) {
      console.error(`❌ Metadata validation failed for ${filePath}:`);
      violations.forEach((violation) => {
        console.error(`  - ${violation}`);
      });
      return false;
    }

    console.log(`✅ Metadata validation passed for ${filePath}`);
    return true;
  } catch (error) {
    if (error instanceof SyntaxError) {
      console.error(`❌ Invalid JSON in ${filePath}: ${error.message}`);
    } else {
      console.error(`❌ Error processing ${filePath}: ${error.message}`);
    }
    return false;
  }
}

function findMetadataFiles(dir) {
  const files = [];

  const repoRoot = path.resolve(__dirname, "..");
  const contactsDir = path.join(repoRoot, dir);

  if (!fs.existsSync(contactsDir)) {
    console.log(`📁 Directory ${contactsDir} does not exist, skipping...`);
    return files;
  }

  const items = fs.readdirSync(contactsDir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(contactsDir, item.name);
    if (item.isDirectory()) {
      files.push(...findMetadataFiles(fullPath));
    } else if (item.name.endsWith(".json")) {
      files.push(fullPath);
    }
  }
  return files;
}

function main() {
  console.log("🔍 Starting Metadata Validation...");
  console.log("==================================");

  const metadataDir = "metadata/submissions";

  const metadataFiles = findMetadataFiles(metadataDir);

  if (metadataFiles.length === 0) {
    console.log("📝 No metadata files found to validate");
    fs.writeFileSync(
      "metadata-validation.log",
      "No metadata files found to validate\n"
    );
    process.exit(0);
  }

  console.log(`📊 Found ${metadataFiles.length} metadata files to validate`);

  let allValid = true;
  let validCount = 0;
  const errorLines = [];

  for (const file of metadataFiles) {
    const result = validateFile(file);
    if (result) {
      validCount++;
    } else {
      allValid = false;
      errorLines.push(`❌ Invalid metadata: ${file}`);
    }
  }

  // Write validation log
  let log = "";
  log += `Metadata Validation Results\n`;
  log += `==========================\n`;
  log += `Total files: ${metadataFiles.length}\n`;
  log += `Valid files: ${validCount}\n`;
  log += `Invalid files: ${metadataFiles.length - validCount}\n`;
  if (errorLines.length > 0) {
    log += `\nDetails:\n`;
    errorLines.forEach((line) => (log += `${line}\n`));
  }
  log += allValid
    ? "\nAll validation checks passed!\n"
    : "\nvalidation failed!\n";
  fs.writeFileSync("metadata-validation.log", log);

  console.log("\n📊 Metadata Validation Summary:");
  console.log(`   Total files: ${metadataFiles.length}`);
  console.log(`   Valid files: ${validCount}`);
  console.log(`   Invalid files: ${metadataFiles.length - validCount}`);

  if (allValid) {
    console.log("\n🎉 All metadata validation checks passed!");
    process.exit(0);
  } else {
    console.log("\n💥 Metadata validation failed!");
    try {
      throw new Error(
        "❌ Metadata validation failed! Check metadata-validation.log for details."
      );
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  }
}

if (require.main === module) {
  main();
}

module.exports = { validateMetadata };
