#!/usr/bin/env node

/**
 * CDM Schema Validation Script
 * Validates contact data against Microsoft CDM Contact model schema
 */

const fs = require("fs");
const path = require("path");
const Joi = require("joi");

// CDM Contact Schema (same as in integration service)
const cdmContactSchema = Joi.object({
  contactId: Joi.string().default(() => uuidv4()),
  fullName: Joi.string().required().min(1).max(255),
  emailAddress: Joi.string().email().required(),
  phoneNumber: Joi.string()
    .pattern(/^[\+]?[0-9\s\-\(\)]+$/)
    .optional()
    .allow(null, ""),
  company: Joi.string().max(255).optional().allow(null, ""),
  addressLine1: Joi.string().max(255).optional().allow(null, ""),
  addressLine2: Joi.string().max(255).optional().allow(null, ""),
  city: Joi.string().max(100).optional().allow(null, ""),
  stateProvince: Joi.string().max(100).optional().allow(null, ""),
  postalCode: Joi.string().max(20).optional().allow(null, ""),
  country: Joi.string().max(100).optional().allow(null, ""),
  jobTitle: Joi.string().max(255).optional().allow(null, ""),
  department: Joi.string().max(255).optional().allow(null, ""),
  preferredContactMethod: Joi.string()
    .valid("email", "phone", "mail")
    .default("email"),
  isActive: Joi.boolean().default(true),
  notes: Joi.string().max(1000).optional().allow(null, ""),
  tags: Joi.alternatives()
    .try(
      Joi.array().items(Joi.string()),
      Joi.string().valid("", null),
      Joi.allow(null)
    )
    .optional(),
  customFields: Joi.object().optional().allow(null, {}),
  createdOn: Joi.string().max(255).optional().allow(null, ""),
  modifiedOn: Joi.string().max(255).optional().allow(null, ""),
  createdBy: Joi.string().default("system"),
  modifiedBy: Joi.string().default("system"),
});

function validateFile(filePath) {
  try {
    console.log(`🔍 Validating ${filePath}...`);

    const content = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(content);

    const { error, value } = cdmContactSchema.validate(data, {
      abortEarly: false,
      allowUnknown: false,
    });

    if (error) {
      console.error(`❌ CDM schema validation failed for ${filePath}:`);
      error.details.forEach((detail) => {
        console.error(`  - ${detail.path.join(".")}: ${detail.message}`);
      });
      return false;
    }

    // Additional CDM-specific validations
    if (!validateCDMCompliance(value)) {
      return false;
    }

    console.log(`✅ CDM schema validation passed for ${filePath}`);
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

function validateCDMCompliance(contact) {
  let isValid = true;

  // CDM Rule 1: Contact ID must be UUID format
  if (contact.contactId && !isValidUUID(contact.contactId)) {
    console.error(`❌ CDM Compliance: contactId must be valid UUID format`);
    isValid = false;
  }

  // CDM Rule 2: Email must be lowercase
  if (
    contact.emailAddress &&
    contact.emailAddress !== contact.emailAddress.toLowerCase()
  ) {
    console.error(`❌ CDM Compliance: emailAddress must be lowercase`);
    isValid = false;
  }

  // CDM Rule 3: Timestamps must be ISO format
  if (contact.createdOn && !isValidISODate(contact.createdOn)) {
    console.error(`❌ CDM Compliance: createdOn must be valid ISO date`);
    isValid = false;
  }

  if (contact.modifiedOn && !isValidISODate(contact.modifiedOn)) {
    console.error(`❌ CDM Compliance: modifiedOn must be valid ISO date`);
    isValid = false;
  }

  // CDM Rule 4: modifiedOn must be >= createdOn
  if (contact.createdOn && contact.modifiedOn) {
    const created = new Date(contact.createdOn);
    const modified = new Date(contact.modifiedOn);
    if (modified < created) {
      console.error(`❌ CDM Compliance: modifiedOn cannot be before createdOn`);
      isValid = false;
    }
  }

  return isValid;
}

function isValidUUID(uuid) {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

function isValidISODate(dateString) {
  try {
    const date = new Date(dateString);
    return date.toISOString() === dateString;
  } catch {
    return false;
  }
}

function findDataFiles(dir) {
  const files = [];

  const repoRoot = path.resolve(__dirname, "..");
  const fullsDir = path.join(repoRoot, dir);

  if (!fs.existsSync(fullsDir)) {
    console.log(`📁 Directory ${fullsDir} does not exist, skipping...`);
    return files;
  }

  const items = fs.readdirSync(fullsDir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(fullsDir, item.name);
    if (item.isDirectory()) {
      files.push(...findDataFiles(fullPath));
    } else if (item.name.endsWith(".json")) {
      files.push(fullPath);
    }
  }
  return files;
}

function main() {
  console.log("🔍 Starting CDM Schema Validation...");
  console.log("=====================================");

  const dataFiles = findDataFiles("data/contacts");

  if (dataFiles.length === 0) {
    console.log("📝 No contact data files found to validate");
    // Write empty log
    fs.writeFileSync(
      "cdm-validation.log",
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
      // Collect error for log
      errorLines.push(`❌ Invalid: ${file}`);
    }
  }

  // Write validation log
  let log = "";
  log += `CDM Schema Validation Results\n`;
  log += `============================\n`;
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
  fs.writeFileSync("cdm-validation.log", log);

  console.log("\n📊 CDM Schema Validation Summary:");
  console.log(`   Total files: ${dataFiles.length}`);
  console.log(`   Valid files: ${validCount}`);
  console.log(`   Invalid files: ${dataFiles.length - validCount}`);

  if (allValid) {
    console.log("\n🎉 All CDM schema validation checks passed!");
    process.exit(0);
  } else {
    console.log("\n💥 CDM schema validation failed!");
    try {
      throw new Error(
        "❌ CDM schema validation failed! Check cdm-validation.log for details."
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

module.exports = { validateFile, cdmContactSchema };
