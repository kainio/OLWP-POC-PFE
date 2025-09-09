const Joi = require("joi");
const { v4: uuidv4 } = require("uuid");
const moment = require("moment");

// CDM Contact Model Schema
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
  createdOn: Joi.date().default(() => new Date()),
  modifiedOn: Joi.date().default(() => new Date()),
  createdBy: Joi.string().default("system"),
  modifiedBy: Joi.string().default("system"),
});

// CDM Entity Metadata Schema
const cdmEntityMetadata = {
  entityName: "Contact",
  entityDescription: "Contact entity following Microsoft CDM standard",
  version: process.env.CDM_SCHEMA_VERSION || "1.0",
  namespace: process.env.CDM_NAMESPACE || "com.example.cdm",
  lastModified: new Date().toISOString(),
  attributes: [
    {
      name: "contactId",
      dataType: "string",
      description: "Unique identifier for the contact",
      isRequired: true,
      isPrimaryKey: true,
    },
    {
      name: "fullName",
      dataType: "string",
      description: "Full name of the contact",
      isRequired: true,
      maxLength: 255,
    },
    {
      name: "emailAddress",
      dataType: "string",
      description: "Email address of the contact",
      isRequired: true,
      format: "email",
    },
    {
      name: "phoneNumber",
      dataType: "string",
      description: "Phone number of the contact",
      isRequired: false,
      format: "phone",
    },
    {
      name: "company",
      dataType: "string",
      description: "Company name",
      isRequired: false,
      maxLength: 255,
    },
    {
      name: "addressLine1",
      dataType: "string",
      description: "First line of address",
      isRequired: false,
      maxLength: 255,
    },
    {
      name: "addressLine2",
      dataType: "string",
      description: "Second line of address",
      isRequired: false,
      maxLength: 255,
    },
    {
      name: "city",
      dataType: "string",
      description: "City name",
      isRequired: false,
      maxLength: 100,
    },
    {
      name: "stateProvince",
      dataType: "string",
      description: "State or province",
      isRequired: false,
      maxLength: 100,
    },
    {
      name: "postalCode",
      dataType: "string",
      description: "Postal or ZIP code",
      isRequired: false,
      maxLength: 20,
    },
    {
      name: "country",
      dataType: "string",
      description: "Country name",
      isRequired: false,
      maxLength: 100,
    },
    {
      name: "jobTitle",
      dataType: "string",
      description: "Job title",
      isRequired: false,
      maxLength: 255,
    },
    {
      name: "department",
      dataType: "string",
      description: "Department name",
      isRequired: false,
      maxLength: 255,
    },
    {
      name: "preferredContactMethod",
      dataType: "string",
      description: "Preferred method of contact",
      isRequired: false,
      enum: ["email", "phone", "mail"],
    },
    {
      name: "isActive",
      dataType: "boolean",
      description: "Whether the contact is active",
      isRequired: false,
      default: true,
    },
    {
      name: "notes",
      dataType: "string",
      description: "Additional notes",
      isRequired: false,
      maxLength: 1000,
    },
    {
      name: "tags",
      dataType: "array",
      description: "Tags associated with the contact",
      isRequired: false,
      itemType: "string",
    },
    {
      name: "customFields",
      dataType: "object",
      description: "Custom field values",
      isRequired: false,
    },
    {
      name: "createdOn",
      dataType: "dateTime",
      description: "Creation timestamp",
      isRequired: true,
    },
    {
      name: "modifiedOn",
      dataType: "dateTime",
      description: "Last modification timestamp",
      isRequired: true,
    },
    {
      name: "createdBy",
      dataType: "string",
      description: "User who created the record",
      isRequired: false,
    },
    {
      name: "modifiedBy",
      dataType: "string",
      description: "User who last modified the record",
      isRequired: false,
    },
  ],
};

// Validation function for CDM Contact
const validateCdmContact = (data) => {
  const { error, value } = cdmContactSchema.validate(data, {
    abortEarly: false,
    stripUnknown: true,
    convert: true,
  });

  if (error) {
    throw new Error(
      `CDM Contact validation failed: ${error.details
        .map((d) => d.message)
        .join(", ")}`
    );
  }

  return value;
};

// Transform raw form data to CDM format
const transformToCdmContact = (formData, userId = "system") => {
  const now = new Date();

  const cdmData = {
    contactId: formData.contactId || uuidv4(),
    fullName:
      formData.fullName ||
      `${formData.firstName || ""} ${formData.lastName || ""}`.trim(),
    emailAddress: formData.emailAddress || formData.email,
    phoneNumber: formData.phoneNumber || formData.phone,
    company: formData.company || formData.organization,
    addressLine1: formData.addressLine1 || formData.address1,
    addressLine2: formData.addressLine2 || formData.address2,
    city: formData.city,
    stateProvince: formData.stateProvince || formData.state,
    postalCode: formData.postalCode || formData.zipCode,
    country: formData.country,
    jobTitle: formData.jobTitle || formData.title,
    department: formData.department,
    preferredContactMethod: formData.preferredContactMethod || "email",
    isActive: formData.isActive !== undefined ? formData.isActive : true,
    notes: formData.notes || formData.comments,
    tags: formData.tags || [],
    customFields: formData.customFields || {},
    createdOn: formData.createdOn || now,
    modifiedOn: now,
    createdBy: formData.createdBy || userId,
    modifiedBy: userId,
  };

  return validateCdmContact(cdmData);
};

// Generate CDM-compliant file structure
const generateCdmFileStructure = (contactData) => {
  const metadata = {
    ...cdmEntityMetadata,
    recordCount: Array.isArray(contactData) ? contactData.length : 1,
    generatedOn: new Date().toISOString(),
  };

  return {
    metadata,
    entities: {
      Contact: Array.isArray(contactData) ? contactData : [contactData],
    },
  };
};

module.exports = {
  cdmContactSchema,
  cdmEntityMetadata,
  validateCdmContact,
  transformToCdmContact,
  generateCdmFileStructure,
};
