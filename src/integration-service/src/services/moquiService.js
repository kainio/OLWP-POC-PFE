const axios = require("axios");
const logger = require("../utils/logger");

class MoquiService {
  constructor() {
    this.baseUrl = process.env.MOQUI_URL || "http://host.docker.internal:8080";
    this.username = process.env.MOQUI_USERNAME || "admin";
    this.password = process.env.MOQUI_PASSWORD || "admin";
    this.apiPath = "/rest/s1/mantle/party";

    // Configure axios instance with authentication
    this.client = axios.create({
      baseURL: `${this.baseUrl}${this.apiPath}`,
      timeout: 30000,
      auth: {
        username: this.username,
        password: this.password,
      },
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });

    // Add request/response interceptors for logging
    this.client.interceptors.request.use(
      (config) => {
        logger.info(
          `Moqui API Request: ${config.method?.toUpperCase()} ${config.url}`
        );
        return config;
      },
      (error) => {
        logger.error("Moqui API Request Error:", error);
        return Promise.reject(error);
      }
    );

    this.client.interceptors.response.use(
      (response) => {
        logger.info(
          `Moqui API Response: ${response.status} ${response.config.url}`
        );
        return response;
      },
      (error) => {
        logger.error("Moqui API Response Error:", {
          status: error.response?.status,
          message: error.response?.data?.message || error.message,
          url: error.config?.url,
        });
        return Promise.reject(error);
      }
    );
  }

  async createContact(contactData) {
    try {
      // Transform CDM contact data to Moqui Party format
      const moquiPartyData = this.transformToMoquiParty(contactData);

      logger.info("Creating contact in Moqui", {
        contactId: contactData.contactId,
        fullName: contactData.fullName,
      });

      // Create Person in Moqui
      const partyResponse = await this.client.post("/persons", {
        firstName: moquiPartyData.firstName,
        lastName: moquiPartyData.lastName,
        partyTypeEnumId: "PtyPerson",
        statusId: "PtyEnabled",
      });

      const partyId = partyResponse.data.partyId;
      logger.info("Person created in Moqui", {
        partyId,
        contactId: contactData.contactId,
      });

      // Add contact information
      const contactPromises = [];

      // Add email contact
      if (contactData.emailAddress) {
        contactPromises.push(
          this.client.post(`/${partyId}/contactMechs`, {
            contactMechTypeEnumId: "CmtEmailAddress",
            infoString: contactData.emailAddress,
            contactMechPurposeId: "EmailPrimary",
          })
        );
      }

      // Add phone contact
      if (contactData.phoneNumber) {
        contactPromises.push(
          this.client.post(`/${partyId}/contactMechs`, {
            contactMechTypeEnumId: "CmtTelecomNumber",
            countryCode: this.extractCountryCode(contactData.phoneNumber),
            areaCode: "212", // Default area code for Morocco
            contactNumber: contactData.phoneNumber,
            contactMechPurposeId: "PhonePrimary",
          })
        );
      }

      // Add postal address
      if (contactData.addressLine1 || contactData.city) {
        contactPromises.push(
          this.client.post(`/${partyId}/contactMechs`, {
            contactMechTypeEnumId: "CmtPostalAddress",
            address1: contactData.addressLine1 || "",
            address2: contactData.addressLine2 || "",
            city: contactData.city || "",
            stateProvinceGeoId: this.mapStateToGeoId(
              contactData.stateProvince,
              contactData.country
            ),
            postalCode: contactData.postalCode || "",
            countryGeoId: this.mapCountryToGeoId(contactData.country),
            contactMechPurposeId: "PostalPrimary",
          })
        );
      }

      // Execute all contact mechanism creations
      await Promise.all(contactPromises);

      // Add employment information if available
      if (contactData.company) {
        await this.addEmploymentInfo(partyId, contactData);
      }

      // Add custom attributes
      if (contactData.customFields || contactData.notes) {
        await this.addCustomAttributes(partyId, contactData);
      }

      logger.info("Contact successfully created in Moqui", {
        contactId: contactData.contactId,
        moquiPartyId: partyId,
        fullName: contactData.fullName,
      });

      return {
        success: true,
        moquiId: partyId,
        message: "Contact created successfully in Moqui",
        details: {
          partyId,
          contactMechanisms: contactPromises.length,
          hasEmployment: !!contactData.company,
        },
      };
    } catch (error) {
      logger.error("Failed to create contact in Moqui", {
        contactId: contactData.contactId,
        error: error.message,
        stack: error.stack,
      });

      return {
        success: false,
        error: error.message,
        details: {
          status: error.response?.status,
          data: error.response?.data,
        },
      };
    }
  }

  transformToMoquiParty(contactData) {
    // Split full name into first and last name
    const nameParts = contactData.fullName.trim().split(" ");
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || "";

    return {
      firstName,
      lastName,
      partyTypeEnumId: "PtyPerson",
      statusId: contactData.isActive !== false ? "PtyEnabled" : "PtyDisabled",
    };
  }

  async addEmploymentInfo(partyId, contactData) {
    try {
      // Create or find organization
      let organizationId = await this.findOrCreateOrganization(
        contactData.company
      );

      // Create employment relationship
      await this.client.post("/relationships", {
        fromPartyId: partyId,
        toPartyId: organizationId,
        partyRelationshipTypeEnumId: "PrtEmployee",
        fromDate: new Date().toISOString(),
        statusId: "PrActive",
        comments: contactData.jobTitle
          ? `Job Title: ${contactData.jobTitle}`
          : undefined,
      });

      // Add role information
      if (contactData.jobTitle) {
        await this.client.post(`/${partyId}/roles`, {
          roleTypeId: "Employee",
          fromDate: new Date().toISOString(),
        });
      }

      logger.info("Employment information added", {
        partyId,
        organizationId,
        jobTitle: contactData.jobTitle,
      });
    } catch (error) {
      logger.error("Failed to add employment info", {
        partyId,
        error: error.message,
      });
      // Don't throw - this is not critical
    }
  }

  async findOrCreateOrganization(companyName) {
    try {
      // Search for existing organization
      const searchResponse = await this.client.get("/organizations", {
        params: { organizationName: companyName },
      });

      if (searchResponse.data && searchResponse.data.length > 0) {
        return searchResponse.data[0].partyId;
      }

      // Create new organization
      const createResponse = await this.client.post("/organizations", {
        organizationName: companyName,
        partyTypeEnumId: "PtyOrganization",
        statusId: "PtyEnabled",
      });

      return createResponse.data.partyId;
    } catch (error) {
      logger.error("Failed to find/create organization", {
        companyName,
        error: error.message,
      });
      throw error;
    }
  }

  async addCustomAttributes(partyId, contactData) {
    try {
      const attributes = [];

      if (contactData.notes) {
        attributes.push({
          partyId,
          attrName: "notes",
          attrValue: contactData.notes,
          attrDescription: "Contact Notes",
        });
      }

      if (contactData.department) {
        attributes.push({
          partyId,
          attrName: "department",
          attrValue: contactData.department,
          attrDescription: "Department",
        });
      }

      if (contactData.preferredContactMethod) {
        attributes.push({
          partyId,
          attrName: "preferredContactMethod",
          attrValue: contactData.preferredContactMethod,
          attrDescription: "Preferred Contact Method",
        });
      }

      if (contactData.tags && contactData.tags.length > 0) {
        attributes.push({
          partyId,
          attrName: "tags",
          attrValue: contactData.tags.join(","),
          attrDescription: "Contact Tags",
        });
      }

      // Add custom fields
      if (contactData.customFields) {
        Object.entries(contactData.customFields).forEach(([key, value]) => {
          attributes.push({
            partyId,
            attrName: `custom_${key}`,
            attrValue: String(value),
            attrDescription: `Custom Field: ${key}`,
          });
        });
      }

      // Create all attributes
      for (const attr of attributes) {
        await this.client.post(`/${partyId}/attributes`, attr);
      }

      logger.info("Custom attributes added", {
        partyId,
        attributeCount: attributes.length,
      });
    } catch (error) {
      logger.error("Failed to add custom attributes", {
        partyId,
        error: error.message,
      });
      // Don't throw - this is not critical
    }
  }

  // Utility methods for phone number parsing
  extractCountryCode(phoneNumber) {
    const match = phoneNumber.match(/^\+(\d{1,3})/);
    return match ? match[1] : "212"; // Default to Morocco
  }

  // Utility methods for geographic mapping
  mapStateToGeoId(state, country = "MA") {
    const stateMappings = {
      US: {
        CA: "USA_CA",
        NY: "USA_NY",
        TX: "USA_TX",
        FL: "USA_FL",
      },
      MA: {
        "01": "MAR_TNG", // 1. Tanger-Tetouan-Al Hoceima
        "02": "MAR_OUJ", // 2. Oriental
        "03": "MAR_FES", // 3. Fès-Meknès
        "04": "MAR_RBA", // 4. Rabat-Salé-Kénitra
        "05": "MAR_BES", // 5. Béni Mellal-Khénifra
        "06": "MAR_CAS", // 6. Casablanca-Settat
        "07": "MAR_MRA", // 7. Marrakech-Safi
        "08": "MAR_DRS", // 8. Drâa-Tafilalet
        "09": "MAR_SOU", // 9. Souss-Massa
        10: "MAR_GUI", // 10. Guelmim-Oued Noun
        11: "MAR_LAA", // 11. Laâyoune-Sakia El Hamra
        12: "MAR_DAK", // 12. Dakhla-Oued Ed-Dahab
      },
      FR: {
        75: "FRA_PAR", // Paris
        69: "FRA_RHO", // Rhône-Alpes
        93: "FRA_SEN", // Seine-Saint-Denis
      },
    };

    return stateMappings[country]?.[state] || state;
  }

  mapCountryToGeoId(country) {
    const countryMappings = {
      US: "USA",
      FR: "FRA",
      MA: "MAR",
    };

    return countryMappings[country] || country;
  }

  async updateContact(moquiPartyId, contactData) {
    try {
      logger.info("Updating contact in Moqui", {
        moquiPartyId,
        contactId: contactData.contactId,
      });

      // Update person information
      const moquiPartyData = this.transformToMoquiParty(contactData);
      await this.client.put(`/persons/${moquiPartyId}`, moquiPartyData);

      // Note: For a complete implementation, you'd also update contact mechanisms
      // This is a simplified version

      return {
        success: true,
        moquiId: moquiPartyId,
        message: "Contact updated successfully in Moqui",
      };
    } catch (error) {
      logger.error("Failed to update contact in Moqui", {
        moquiPartyId,
        error: error.message,
      });

      return {
        success: false,
        error: error.message,
      };
    }
  }

  async deleteContact(moquiPartyId) {
    try {
      logger.info("Deleting contact in Moqui", { moquiPartyId });

      // Moqui typically uses soft deletes by changing status
      await this.client.put(`/persons/${moquiPartyId}`, {
        statusId: "PtyDisabled",
      });

      return {
        success: true,
        moquiId: moquiPartyId,
        message: "Contact disabled in Moqui",
      };
    } catch (error) {
      logger.error("Failed to delete contact in Moqui", {
        moquiPartyId,
        error: error.message,
      });

      return {
        success: false,
        error: error.message,
      };
    }
  }

  async getHealthStatus() {
    try {
      // Simple health check - try to get system info
      const response = await this.client.get("/status", { timeout: 5000 });

      return {
        status: "healthy",
        version: response.data?.version || "unknown",
        uptime: response.data?.uptime || 0,
        responseTime: Date.now(),
      };
    } catch (error) {
      return {
        status: "unhealthy",
        error: error.message,
        lastChecked: new Date().toISOString(),
      };
    }
  }
}

module.exports = MoquiService;
