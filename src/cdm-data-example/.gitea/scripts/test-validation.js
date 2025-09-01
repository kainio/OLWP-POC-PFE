#!/usr/bin/env node

/**
 * Test Validation Scripts
 * Creates test data and runs all validation scripts to ensure they work properly
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

function createTestData() {
  console.log("🧪 Creating test data for validation...");

  // Create directories
  fs.mkdirSync("data/contacts", { recursive: true });
  fs.mkdirSync("metadata/submissions", { recursive: true });

  // Valid contact data
  const validContact = {
    contactId: "123e4567-e89b-12d3-a456-426614174000",
    fullName: "John Doe",
    emailAddress: "john.doe@example.com",
    phoneNumber: "+1-555-123-4567",
    company: "Tech Corp",
    jobTitle: "Developer",
    department: "IT",
    country: "US",
    stateProvince: "CA",
    city: "San Francisco",
    preferredContactMethod: "email",
    isActive: true,
    createdOn: new Date().toISOString(),
    modifiedOn: new Date().toISOString(),
    createdBy: "test-user",
    modifiedBy: "test-user",
  };

  // Invalid contact data (for testing validation failures)
  const invalidContact = {
    contactId: "invalid-uuid",
    fullName: "", // Empty name
    emailAddress: "invalid-email", // Invalid email
    phoneNumber: "123", // Invalid phone
    country: "XX", // Invalid country
    jobTitle: "Manager", // Job title without company
    createdOn: "invalid-date", // Invalid date
    modifiedOn: new Date().toISOString(),
  };

  // Valid metadata
  const validMetadata = {
    submissionId: `${Date.now()}-abcd12345`,
    processedAt: new Date().toISOString(),
    gitBranch: "contact-12345678-2024-01-01t12-00-00-000z",
    gitCommitMessage: "Add contact: John Doe",
    version: "1.0",
    namespace: "com.example.cdm",
    recordCount: 1,
    entityName: "Contact",
  };

  // Invalid metadata
  const invalidMetadata = {
    submissionId: "invalid-format",
    processedAt: "invalid-date",
    gitBranch: "invalid branch name",
    // Missing required fields
  };

  // Write test files
  fs.writeFileSync(
    "data/contacts/valid-contact.json",
    JSON.stringify(validContact, null, 2)
  );
  fs.writeFileSync(
    "data/contacts/invalid-contact.json",
    JSON.stringify(invalidContact, null, 2)
  );
  fs.writeFileSync(
    "metadata/submissions/valid-metadata.json",
    JSON.stringify(validMetadata, null, 2)
  );
  fs.writeFileSync(
    "metadata/submissions/invalid-metadata.json",
    JSON.stringify(invalidMetadata, null, 2)
  );

  console.log("✅ Test data created:");
  console.log("   - data/contacts/valid-contact.json");
  console.log("   - data/contacts/invalid-contact.json");
  console.log("   - metadata/submissions/valid-metadata.json");
  console.log("   - metadata/submissions/invalid-metadata.json");
}

function runValidationTest(scriptName, expectFailure = false) {
  console.log(`\n🧪 Testing ${scriptName}...`);
  console.log("=".repeat(50));

  try {
    execSync(`node ${scriptName}`, {
      stdio: "inherit",
      cwd: __dirname,
    });

    if (expectFailure) {
      console.log(`❌ Expected ${scriptName} to fail, but it passed`);
      return false;
    } else {
      console.log(`✅ ${scriptName} passed as expected`);
      return true;
    }
  } catch (error) {
    if (expectFailure) {
      console.log(
        `✅ ${scriptName} failed as expected (exit code: ${error.status})`
      );
      return true;
    } else {
      console.log(
        `❌ ${scriptName} failed unexpectedly (exit code: ${error.status})`
      );
      return false;
    }
  }
}

function cleanup() {
  console.log("\n🧹 Cleaning up test data...");

  try {
    if (fs.existsSync("data")) {
      fs.rmSync("data", { recursive: true, force: true });
    }
    if (fs.existsSync("metadata")) {
      fs.rmSync("metadata", { recursive: true, force: true });
    }
    if (fs.existsSync("validation-cache")) {
      fs.rmSync("validation-cache", { recursive: true, force: true });
    }
    console.log("✅ Test data cleaned up");
  } catch (error) {
    console.log("⚠️  Cleanup warning:", error.message);
  }
}

function main() {
  console.log("🧪 CDM Validation Scripts Test Suite");
  console.log("=====================================\n");

  // Ensure we're in the right directory
  process.chdir(__dirname);

  // Install dependencies if needed
  if (!fs.existsSync("node_modules")) {
    console.log("📦 Installing dependencies...");
    execSync("npm install", { stdio: "inherit" });
  }

  let testResults = [];

  try {
    // Test 1: With valid data only (should pass)
    console.log("\n📋 Test 1: Valid Data Only");
    console.log("==========================");

    createTestData();

    // Remove invalid files for this test
    fs.unlinkSync("data/contacts/invalid-contact.json");
    fs.unlinkSync("metadata/submissions/invalid-metadata.json");

    testResults.push({
      name: "CDM Schema (valid data)",
      passed: runValidationTest("validate-cdm-schema.js", false),
    });

    testResults.push({
      name: "Business Rules (valid data)",
      passed: runValidationTest("validate-business-rules.js", false),
    });

    testResults.push({
      name: "Metadata (valid data)",
      passed: runValidationTest("validate-metadata.js", false),
    });

    testResults.push({
      name: "Report Generation (valid data)",
      passed: runValidationTest("generate-validation-report.js", false),
    });

    cleanup();

    // Test 2: With invalid data (should fail)
    console.log("\n📋 Test 2: Invalid Data (Expected Failures)");
    console.log("============================================");

    createTestData();

    // Remove valid files for this test
    fs.unlinkSync("data/contacts/valid-contact.json");
    fs.unlinkSync("metadata/submissions/valid-metadata.json");

    testResults.push({
      name: "CDM Schema (invalid data)",
      passed: runValidationTest("validate-cdm-schema.js", true),
    });

    testResults.push({
      name: "Business Rules (invalid data)",
      passed: runValidationTest("validate-business-rules.js", true),
    });

    testResults.push({
      name: "Metadata (invalid data)",
      passed: runValidationTest("validate-metadata.js", true),
    });

    cleanup();

    // Test 3: Mixed data (should fail overall)
    console.log("\n📋 Test 3: Mixed Valid/Invalid Data");
    console.log("===================================");

    createTestData(); // Creates both valid and invalid files

    testResults.push({
      name: "CDM Schema (mixed data)",
      passed: runValidationTest("validate-cdm-schema.js", true),
    });

    testResults.push({
      name: "Business Rules (mixed data)",
      passed: runValidationTest("validate-business-rules.js", true),
    });

    testResults.push({
      name: "Metadata (mixed data)",
      passed: runValidationTest("validate-metadata.js", true),
    });

    cleanup();

    // Test 4: No data (should pass with empty results)
    console.log("\n📋 Test 4: No Data");
    console.log("==================");

    testResults.push({
      name: "CDM Schema (no data)",
      passed: runValidationTest("validate-cdm-schema.js", false),
    });

    testResults.push({
      name: "Business Rules (no data)",
      passed: runValidationTest("validate-business-rules.js", false),
    });

    testResults.push({
      name: "Metadata (no data)",
      passed: runValidationTest("validate-metadata.js", false),
    });
  } catch (error) {
    console.error("❌ Test suite error:", error.message);
    cleanup();
    process.exit(1);
  }

  // Final cleanup
  cleanup();

  // Results summary
  console.log("\n📊 Test Results Summary");
  console.log("=======================");

  const passedTests = testResults.filter((test) => test.passed);
  const failedTests = testResults.filter((test) => !test.passed);

  console.log(`Total tests: ${testResults.length}`);
  console.log(`Passed: ${passedTests.length}`);
  console.log(`Failed: ${failedTests.length}`);

  if (failedTests.length > 0) {
    console.log("\n❌ Failed tests:");
    failedTests.forEach((test) => {
      console.log(`   - ${test.name}`);
    });
  }

  if (passedTests.length === testResults.length) {
    console.log("\n🎉 All validation scripts are working correctly!");
    console.log(
      "The modular validation system is ready for use in Gitea CI/CD."
    );
    process.exit(0);
  } else {
    console.log("\n💥 Some validation scripts are not working correctly.");
    console.log("Please review the failed tests and fix the issues.");
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
