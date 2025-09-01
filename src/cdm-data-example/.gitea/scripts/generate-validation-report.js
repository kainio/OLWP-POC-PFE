#!/usr/bin/env node

/**
 * Validation Report Generator
 * Generates comprehensive validation reports for pull requests
 */

const fs = require("fs");
const path = require("path");

function generateReport() {
  const reportData = {
    timestamp: new Date().toISOString(),
    pullRequest: process.env.GITHUB_EVENT_PULL_REQUEST_NUMBER || "unknown",
    repository: process.env.GITHUB_REPOSITORY || "cdm-data",
    branch: process.env.GITHUB_HEAD_REF || "unknown",
    commit: process.env.GITHUB_SHA?.substring(0, 8) || "unknown",
    validationResults: {
      cdmSchema: { status: "unknown", details: [] },
      businessRules: { status: "unknown", details: [] },
      metadata: { status: "unknown", details: [] },
      fileCount: { total: 0, contacts: 0, metadata: 0 },
    },
  };

  // Count files
  reportData.validationResults.fileCount = countFiles();

  // Check for validation outputs (these would be created by previous steps)
  const validationOutputs = [
    { type: "cdmSchema", file: "cdm-validation.log" },
    { type: "businessRules", file: "business-rules-validation.log" },
    { type: "metadata", file: "metadata-validation.log" },
  ];

  for (const { type, file } of validationOutputs) {
    const repoRoot = path.resolve(__dirname, "..");
    const filePath = path.join(repoRoot, file);

    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf8");
      reportData.validationResults[type] = parseValidationOutput(content);
    }
  }

  // Generate markdown report
  const markdownReport = generateMarkdownReport(reportData);

  // Save reports
  fs.writeFileSync(
    "validation-report.json",
    JSON.stringify(reportData, null, 2)
  );
  fs.writeFileSync("validation-report.md", markdownReport);

  console.log("📊 Validation report generated:");
  console.log("   - validation-report.json (machine-readable)");
  console.log("   - validation-report.md (human-readable)");

  return reportData;
}

function countFiles() {
  const counts = { total: 0, contacts: 0, metadata: 0 };
  const repoRoot = path.resolve(__dirname, "..");
  // Count contact files
  const contactsDir = path.join(repoRoot, "data/contacts");

  if (fs.existsSync(path.join(repoRoot, contactsDir))) {
    const contactFiles = fs
      .readdirSync(contactsDir)
      .filter((file) => file.endsWith(".json"));
    counts.contacts = contactFiles.length;
  }

  // Count metadata files
  const metadataDir = path.join(repoRoot, "metadata/submissions");
  if (fs.existsSync(metadataDir)) {
    const metadataFiles = fs
      .readdirSync(metadataDir)
      .filter((file) => file.endsWith(".json"));
    counts.metadata = metadataFiles.length;
  }

  counts.total = counts.contacts + counts.metadata;
  return counts;
}

function parseValidationOutput(content) {
  const lines = content.split("\n");
  const result = { status: "unknown", details: [], summary: "" };

  // Look for success/failure indicators
  if (content.includes("validation checks passed!")) {
    result.status = "passed";
  } else if (content.includes("validation failed!")) {
    result.status = "failed";
  }

  // Extract error details
  const errorLines = lines.filter(
    (line) =>
      line.includes("❌") ||
      line.includes("Error:") ||
      line.includes("violation")
  );

  result.details = errorLines.map((line) => line.trim());

  // Extract summary information
  const summaryLines = lines.filter(
    (line) =>
      line.includes("Total files:") ||
      line.includes("Valid files:") ||
      line.includes("Invalid files:")
  );

  result.summary = summaryLines.join("\n");

  return result;
}

function generateMarkdownReport(data) {
  const { validationResults, timestamp, pullRequest, branch } = data;

  let report = `# CDM Validation Report\n\n`;

  // Header information
  report += `**Generated:** ${timestamp}\n`;
  report += `**Pull Request:** #${pullRequest}\n`;
  report += `**Branch:** ${branch}\n`;
  report += `**Repository:** ${data.repository}\n`;
  report += `**Commit:** ${data.commit}\n\n`;

  // Overall status
  const allPassed = Object.values(validationResults)
    .filter((result) => result.status !== undefined)
    .every((result) => result.status === "passed");

  report += `## Overall Status\n\n`;
  if (allPassed) {
    report += `✅ **PASSED** - All validation checks successful\n\n`;
  } else {
    report += `❌ **FAILED** - One or more validation checks failed\n\n`;
  }

  // File statistics
  report += `## File Statistics\n\n`;
  report += `- **Total Files:** ${validationResults.fileCount.total}\n`;
  report += `- **Contact Data Files:** ${validationResults.fileCount.contacts}\n`;
  report += `- **Metadata Files:** ${validationResults.fileCount.metadata}\n\n`;

  // Validation results
  report += `## Validation Results\n\n`;

  const validationTypes = [
    { key: "cdmSchema", title: "CDM Schema Validation", emoji: "📋" },
    { key: "businessRules", title: "Business Rules Validation", emoji: "📏" },
    { key: "metadata", title: "Metadata Validation", emoji: "📊" },
  ];

  for (const { key, title, emoji } of validationTypes) {
    const result = validationResults[key];
    report += `### ${emoji} ${title}\n\n`;

    if (result.status === "passed") {
      report += `✅ **Status:** PASSED\n\n`;
    } else if (result.status === "failed") {
      report += `❌ **Status:** FAILED\n\n`;

      if (result.details.length > 0) {
        report += `**Issues Found:**\n`;
        result.details.forEach((detail) => {
          report += `- ${detail}\n`;
        });
        report += `\n`;
      }
    } else {
      report += `⚠️ **Status:** UNKNOWN (validation did not run)\n\n`;
    }

    if (result.summary) {
      report += `**Summary:**\n\`\`\`\n${result.summary}\n\`\`\`\n\n`;
    }
  }

  // Next steps
  report += `## Next Steps\n\n`;

  if (allPassed) {
    report += `This pull request has passed all validation checks and is ready for review and merge.\n\n`;
    report += `### Automated Actions\n`;
    report += `- ✅ CDM schema compliance verified\n`;
    report += `- ✅ Business rules compliance verified\n`;
    report += `- ✅ Metadata integrity verified\n`;
    report += `- ✅ Ready for Phase 4 (Moqui Integration) upon merge\n\n`;
  } else {
    report += `This pull request has validation failures that must be addressed before merge.\n\n`;
    report += `### Required Actions\n`;
    report += `- ❌ Fix validation errors listed above\n`;
    report += `- 🔄 Push corrected files to trigger re-validation\n`;
    report += `- 👀 Request review once all validations pass\n\n`;
  }

  // Footer
  report += `---\n`;
  report += `*This report was automatically generated by the CDM validation pipeline.*\n`;

  return report;
}

function main() {
  console.log("📊 Generating validation report...");

  try {
    const reportData = generateReport();

    // Output summary to console
    console.log("\n📋 Validation Summary:");
    console.log(
      `   Files processed: ${reportData.validationResults.fileCount.total}`
    );

    const validationTypes = ["cdmSchema", "businessRules", "metadata"];
    for (const type of validationTypes) {
      const result = reportData.validationResults[type];
      const status =
        result.status === "passed"
          ? "✅"
          : result.status === "failed"
          ? "❌"
          : "⚠️";
      console.log(`   ${type}: ${status} ${result.status.toUpperCase()}`);
    }

    // Set exit code based on overall status
    const allPassed = validationTypes.every(
      (type) => reportData.validationResults[type].status === "passed"
    );

    if (allPassed) {
      console.log(
        "\n🎉 All validations passed! Report generated successfully."
      );
      process.exit(0);
    } else {
      console.log(
        "\n💥 Some validations failed. Check the report for details."
      );
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ Error generating validation report:", error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { generateReport };
