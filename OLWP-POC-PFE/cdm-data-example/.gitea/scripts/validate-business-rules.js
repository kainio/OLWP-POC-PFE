#!/usr/bin/env node

/**
 * Business Rules Validation Script
 * Validates contact data against business-specific rules and policies
 */

const fs = require("fs");
const path = require("path");

// Business Rules Configuration
const BUSINESS_RULES = {
  blockedEmailDomains: [
    "tempmail.com",
    "10minutemail.com",
    "throwaway.email",
    "guerrillamail.com",
    "mailinator.com",
    "yopmail.com",
  ],
  requiredFieldsForBusiness: ["company", "jobTitle"],
  maxContactsPerCompany: 1000,
  allowedCountries: ["US", "CA", "UK", "FR", "DE", "AU", "JP", "MA"],
  phoneNumberPatterns: {
    US: /^\+?1?[\-\s]?\(?[0-9]{3}\)?[\-\s]?[0-9]{3}[\-\s]?[0-9]{4}$/,
    CA: /^\+?1?[\-\s]?\(?[0-9]{3}\)?[\-\s]?[0-9]{3}[\-\s]?[0-9]{4}$/,
    UK: /^\+?44[\-\s]?[0-9]{4}[\-\s]?[0-9]{6}$/,
    FR: /^\+?33[\-\s]?[0-9]{1}[\-\s]?[0-9]{8}$/,
    DE: /^\+?49[\-\s]?[0-9]{3,4}[\-\s]?[0-9]{7,8}$/,
    MA: /^\+?212[0-9]{9}$/,
  },
};

function validateBusinessRules(contact, filePath) {
  let isValid = true;
  const violations = [];

  // Rule 1: Email domain validation
  if (contact.emailAddress) {
    const domain = contact.emailAddress.split("@")[1]?.toLowerCase();
    if (BUSINESS_RULES.blockedEmailDomains.includes(domain)) {
      violations.push(`Blocked email domain: ${domain}`);
      isValid = false;
    }
  }

  // Rule 2: Phone number format validation by country
  if (contact.phoneNumber && contact.country) {
    const pattern = BUSINESS_RULES.phoneNumberPatterns[contact.country];
    if (pattern && !pattern.test(contact.phoneNumber)) {
      violations.push(
        `Invalid phone format for ${contact.country}: ${contact.phoneNumber}`
      );
      isValid = false;
    }
  }

  // Rule 3: Business contact requirements
  if (contact.jobTitle && !contact.company) {
    violations.push("Job title requires company name for business contacts");
    isValid = false;
  }

  // Rule 4: Geographic consistency
  if (contact.country === "US" && contact.city && !contact.stateProvince) {
    violations.push("US contacts with city must specify state/province");
    isValid = false;
  }

  // Rule 5: Country restrictions
  if (
    contact.country &&
    !BUSINESS_RULES.allowedCountries.includes(contact.country)
  ) {
    violations.push(`Country not in allowed list: ${contact.country}`);
    isValid = false;
  }

  // Rule 6: Data quality checks
  if (contact.fullName) {
    // Check for suspicious patterns
    if (
      contact.fullName.toLowerCase().includes("test") &&
      !contact.emailAddress?.includes("test")
    ) {
      violations.push(
        'Potential test data detected (name contains "test" but email does not)'
      );
      isValid = false;
    }

    // Check minimum name requirements
    const nameParts = contact.fullName.trim().split(/\s+/);
    if (nameParts.length < 2) {
      violations.push("Full name should include both first and last name");
      isValid = false;
    }
  }

  // Rule 7: Email and company consistency
  if (contact.emailAddress && contact.company) {
    const emailDomain = contact.emailAddress.split("@")[1]?.toLowerCase();
    const companyName = contact.company.toLowerCase();

    // Check for obvious mismatches (simplified heuristic)
    if (
      emailDomain === "gmail.com" ||
      emailDomain === "yahoo.com" ||
      emailDomain === "hotmail.com" ||
      emailDomain === "outlook.com"
    ) {
      // Personal email domains are allowed, but log for review
      console.log(
        `ℹ️  Personal email domain used for business contact: ${contact.emailAddress}`
      );
    }
  }

  // Rule 8: Tags validation
  if (contact.tags && Array.isArray(contact.tags)) {
    const validTags = [
      "customer",
      "prospect",
      "partner",
      "vendor",
      "employee",
      "consultant",
    ];
    const invalidTags = contact.tags.filter(
      (tag) => !validTags.includes(tag.toLowerCase()) && tag.length > 20
    );

    if (invalidTags.length > 0) {
      violations.push(`Invalid or overly long tags: ${invalidTags.join(", ")}`);
      isValid = false;
    }
  }

  // Rule 9: Notes content validation
  if (contact.notes) {
    // Check for potentially sensitive information
    const sensitivePatterns = [
      /\b\d{3}-\d{2}-\d{4}\b/, // SSN pattern
      /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/, // Credit card pattern
      /password/i,
      /ssn/i,
      /social security/i,
    ];

    for (const pattern of sensitivePatterns) {
      if (pattern.test(contact.notes)) {
        violations.push(
          "Notes field contains potentially sensitive information"
        );
        isValid = false;
        break;
      }
    }
  }

  // Rule 10: Duplicate prevention (simplified check)
  if (contact.emailAddress) {
    // This would typically check against existing data
    // For now, we'll just validate email uniqueness within the current batch
    const emailFile = path.join(
      "validation-cache",
      `${contact.emailAddress.replace(/[^a-zA-Z0-9]/g, "_")}.flag`
    );
    if (fs.existsSync(emailFile)) {
      violations.push(
        `Duplicate email address detected: ${contact.emailAddress}`
      );
      isValid = false;
    } else {
      // Create cache directory and flag file
      fs.mkdirSync("validation-cache", { recursive: true });
      fs.writeFileSync(emailFile, filePath);
    }
  }

  return { isValid, violations };
}

function validateFile(filePath) {
  try {
    console.log(`🔍 Checking business rules for ${filePath}...`);

    const content = fs.readFileSync(filePath, "utf8");
    const contact = JSON.parse(content);

    const { isValid, violations } = validateBusinessRules(contact, filePath);

    if (!isValid) {
      console.error(`❌ Business rule violations in ${filePath}:`);
      violations.forEach((violation) => {
        console.error(`  - ${violation}`);
      });
      return false;
    }

    console.log(`✅ Business rules validation passed for ${filePath}`);
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

function findDataFiles(dir) {
  const files = [];
  const repoRoot = path.resolve(__dirname, "..");
  const fullDir = path.join(repoRoot, dir);

  if (!fs.existsSync(fullDir)) {
    console.log(`📁 Directory ${fullDir} does not exist, skipping...`);
    return files;
  }

  const items = fs.readdirSync(fullDir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(fullDir, item.name);
    if (item.isDirectory()) {
      files.push(...findDataFiles(fullPath));
    } else if (item.name.endsWith(".json")) {
      files.push(fullPath);
    }
  }
  return files;
}

function cleanup() {
  // Clean up validation cache
  if (fs.existsSync("validation-cache")) {
    fs.rmSync("validation-cache", { recursive: true, force: true });
  }
}

function main() {
  console.log("🔍 Starting Business Rules Validation...");
  console.log("=========================================");

  // Clean up any previous validation cache
  cleanup();

  const dataFiles = findDataFiles("data/contacts");

  if (dataFiles.length === 0) {
    console.log("📝 No contact data files found to validate");
    fs.writeFileSync(
      "business-rules-validation.log",
      "No contact data files found to validate\n"
    );
    process.exit(0);
  }

  console.log(`📊 Found ${dataFiles.length} contact data files to validate`);

  let allValid = true;
  let validCount = 0;
  const errorLines = [];

  for (const file of dataFiles) {
    const result = validateFile(file);
    if (result) {
      validCount++;
    } else {
      allValid = false;
      errorLines.push(`❌ Rule violation: ${file}`);
    }
  }

  // Write validation log
  let log = "";
  log += `Business Rules Validation Results\n`;
  log += `===============================\n`;
  log += `Total files: ${dataFiles.length}\n`;
  log += `Valid files: ${validCount}\n`;
  log += `Invalid files: ${dataFiles.length - validCount}\n`;
  if (errorLines.length > 0) {
    log += `\nDetails:\n`;
    errorLines.forEach((line) => (log += `${line}\n`));
  }
  log += allValid
    ? "\nAll validation checks passed!\n"
    : "\nvalidation failed!\n";
  fs.writeFileSync("business-rules-validation.log", log);

  // Clean up validation cache
  cleanup();

  console.log("\n📊 Business Rules Validation Summary:");
  console.log(`   Total files: ${dataFiles.length}`);
  console.log(`   Valid files: ${validCount}`);
  console.log(`   Rule violations: ${dataFiles.length - validCount}`);

  if (allValid) {
    console.log("\n🎉 All business rules validation checks passed!");
    process.exit(0);
  } else {
    console.log("\n💥 Business rules validation failed!");
    try {
      throw new Error(
        "❌ Business rules validation failed! Check business-rules-validation.log for details."
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

module.exports = { validateBusinessRules, BUSINESS_RULES };
