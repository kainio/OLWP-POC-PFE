const { Client } = require("@opensearch-project/opensearch");
const logger = require("../utils/logger");

class OpenSearchService {
  constructor() {
    this.client = new Client({
      node: process.env.OPENSEARCH_URL || "http://opensearch:9200",
      ssl: {
        rejectUnauthorized: false,
      },
      requestTimeout: 30000,
      pingTimeout: 3000,
      maxRetries: 5,
      sniffOnStart: false,
      sniffInterval: 30000,
      resurrectStrategy: "ping",
      compression: true,
    });

    this.contactsIndex = process.env.OPENSEARCH_INDEX_CONTACTS || "contacts";
    this.referenceIndex =
      process.env.OPENSEARCH_INDEX_REFERENCE || "reference-data";
    this.notificationsIndex =
      process.env.OPENSEARCH_INDEX_NOTIFICATIONS || "notifications";
  }

  async initialize() {
    let retries = 0;
    const maxRetries = 5;
    const retryDelay = 5000;

    while (retries < maxRetries) {
      try {
        const health = await this.client.cluster.health();
        if (health.body.status !== "red") {
          logger.info("Successfully connected to OpenSearch");
          await this.ResetReferenceIndices();
          await this.ensureIndices();
          return;
        }
        throw new Error("Cluster health is red");
      } catch (error) {
        retries++;
        logger.warn(
          `Failed to initialize OpenSearch (attempt ${retries}/${maxRetries}): ${error.message}`
        );
        if (retries === maxRetries) {
          throw new Error(
            "Failed to initialize OpenSearch after multiple retries"
          );
        }
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    }
  }

  async ResetReferenceIndices() {
    // Check if reference data index exists
    // and delete it if it does
    const referencesExists = await this.client.indices.exists({
      index: this.referenceIndex,
    });

    if (referencesExists.body) {
      await this.client.indices.delete({
        index: this.referenceIndex,
      });
      logger.info(`Deleted reference data index: ${this.referenceIndex}`);
    }
  }

  async ResetContactIndices() {
    // Check if contact data index exists
    // and delete it if it does
    const contactsExists = await this.client.indices.exists({
      index: this.contactsIndex,
    });

    if (contactsExists.body) {
      await this.client.indices.delete({
        index: this.contactsIndex,
      });
      logger.info(`Deleted contacts data index: ${this.contactsIndex}`);
    }
  }

  async ensureIndices() {
    try {
      // Create contacts index if it doesn't exist
      const contactsExists = await this.client.indices.exists({
        index: this.contactsIndex,
      });

      if (!contactsExists.body) {
        await this.client.indices.create({
          index: this.contactsIndex,
          body: {
            mappings: {
              properties: {
                contactId: { type: "keyword" },
                fullName: {
                  type: "text",
                  fields: {
                    keyword: { type: "keyword" },
                  },
                },
                emailAddress: { type: "keyword" },
                phoneNumber: { type: "keyword" },
                company: {
                  type: "text",
                  fields: {
                    keyword: { type: "keyword" },
                  },
                },
                city: { type: "keyword" },
                stateProvince: { type: "keyword" },
                country: { type: "keyword" },
                jobTitle: { type: "keyword" },
                department: { type: "keyword" },
                preferredContactMethod: { type: "keyword" },
                isActive: { type: "boolean" },
                tags: { type: "keyword" },
                createdOn: { type: "date" },
                modifiedOn: { type: "date" },
                createdBy: { type: "keyword" },
                modifiedBy: { type: "keyword" },
              },
            },
          },
        });
        logger.info(`Created contacts index: ${this.contactsIndex}`);
      }

      // Create reference data index if it doesn't exist
      const referenceExists = await this.client.indices.exists({
        index: this.referenceIndex,
      });

      if (!referenceExists.body) {
        await this.client.indices.create({
          index: this.referenceIndex,
          body: {
            mappings: {
              properties: {
                type: { type: "keyword" },
                category: { type: "keyword" },
                value: { type: "keyword" },
                label: {
                  type: "text",
                  fields: {
                    keyword: { type: "keyword" },
                    sort: {
                      type: "text",
                      fielddata: true,
                    },
                  },
                },
                description: { type: "text" },
                sortOrder: { type: "integer" },
                isActive: { type: "boolean" },
                metadata: { type: "object" },
                createdAt: { type: "date" },
                updatedAt: { type: "date" },
              },
            },
          },
        });
        logger.info(`Created reference data index: ${this.referenceIndex}`);

        // Seed initial reference data
        await this.seedReferenceData();
      }

      // Create notifications index if it doesn't exist
      const notificationsExists = await this.client.indices.exists({
        index: this.notificationsIndex,
      });

      if (!notificationsExists.body) {
        await this.client.indices.create({
          index: this.notificationsIndex,
          body: {
            mappings: {
              properties: {
                id: { type: "keyword" },
                type: { type: "keyword" },
                title: {
                  type: "text",
                  fields: { keyword: { type: "keyword" } },
                },
                message: { type: "text" },
                metadata: { type: "object" },
                timestamp: { type: "date" },
                status: { type: "keyword" },
                read: { type: "boolean" },
                readAt: { type: "date" },
                results: { type: "object" },
                error: { type: "text" },
              },
            },
          },
        });
        logger.info(`Created notifications index: ${this.notificationsIndex}`);
      }
    } catch (error) {
      const safeError = {
        message: error.message,
        code: error.code,
        status: error.status,
        stack: error.stack,
        meta: error.meta,
      };
      logger.error("Failed to ensure indices:", safeError);
      throw error;
    }
  }

  async seedReferenceData() {
    const referenceData = [
      // Countries
      {
        type: "country",
        category: "geography",
        value: "MA",
        label: "Morocco",
        sortOrder: 1,
      },
      {
        type: "country",
        category: "geography",
        value: "US",
        label: "United States",
        sortOrder: 2,
      },
      {
        type: "country",
        category: "geography",
        value: "CA",
        label: "Canada",
        sortOrder: 3,
      },
      {
        type: "country",
        category: "geography",
        value: "UK",
        label: "United Kingdom",
        sortOrder: 4,
      },
      {
        type: "country",
        category: "geography",
        value: "FR",
        label: "France",
        sortOrder: 5,
      },
      {
        type: "country",
        category: "geography",
        value: "DE",
        label: "Germany",
        sortOrder: 6,
      },

      // MA States
      {
        type: "state",
        category: "geography",
        value: "MA-01",
        label: "Région de Tanger – Tétouan",
        metadata: { country: "MA" },
        sortOrder: 1,
      },
      {
        type: "state",
        category: "geography",
        value: "MA-02",
        label: "Région de l’Oriental et du Rif",
        metadata: { country: "MA" },
        sortOrder: 2,
      },
      {
        type: "state",
        category: "geography",
        value: "MA-03",
        label: "Région de Fès – Meknès",
        metadata: { country: "MA" },
        sortOrder: 3,
      },
      {
        type: "state",
        category: "geography",
        value: "MA-04",
        label: "Région de Rabat – Salé – Kénitra",
        metadata: { country: "MA" },
        sortOrder: 4,
      },
      {
        type: "state",
        category: "geography",
        value: "MA-05",
        label: "Région de Béni Mellal – Khénifra",
        metadata: { country: "MA" },
        sortOrder: 5,
      },
      {
        type: "state",
        category: "geography",
        value: "MA-06",
        label: "Région de Casablanca – Settat",
        metadata: { country: "MA" },
        sortOrder: 6,
      },
      {
        type: "state",
        category: "geography",
        value: "MA-07",
        label: "Région de Marrakech – Safi",
        metadata: { country: "MA" },
        sortOrder: 7,
      },
      {
        type: "state",
        category: "geography",
        value: "MA-08",
        label: "Région de Daraâ – Tafilalet",
        metadata: { country: "MA" },
        sortOrder: 8,
      },
      {
        type: "state",
        category: "geography",
        value: "MA-09",
        label: "Région de Souss – Massa",
        metadata: { country: "MA" },
        sortOrder: 9,
      },
      {
        type: "state",
        category: "geography",
        value: "MA-10",
        label: "Région de Guelmime – Oued Noun",
        metadata: { country: "MA" },
        sortOrder: 10,
      },
      {
        type: "state",
        category: "geography",
        value: "MA-11",
        label: "Région de Laâyoune – Sakia al Hamra",
        metadata: { country: "MA" },
        sortOrder: 11,
      },
      {
        type: "state",
        category: "geography",
        value: "MA-12",
        label: "Région de Ed Dakhla – Oued Dahab",
        metadata: { country: "MA" },
        sortOrder: 12,
      },

      // US States

      {
        type: "state",
        category: "geography",
        value: "CA",
        label: "California",
        metadata: { country: "US" },
        sortOrder: 1,
      },
      {
        type: "state",
        category: "geography",
        value: "NY",
        label: "New York",
        metadata: { country: "US" },
        sortOrder: 2,
      },
      {
        type: "state",
        category: "geography",
        value: "TX",
        label: "Texas",
        metadata: { country: "US" },
        sortOrder: 3,
      },
      {
        type: "state",
        category: "geography",
        value: "FL",
        label: "Florida",
        metadata: { country: "US" },
        sortOrder: 4,
      },

      // Contact Methods
      {
        type: "contactMethod",
        category: "communication",
        value: "email",
        label: "Email",
        sortOrder: 1,
      },
      {
        type: "contactMethod",
        category: "communication",
        value: "phone",
        label: "Phone",
        sortOrder: 2,
      },
      {
        type: "contactMethod",
        category: "communication",
        value: "mail",
        label: "Mail",
        sortOrder: 3,
      },

      // Job Titles
      {
        type: "jobTitle",
        category: "professional",
        value: "CEO",
        label: "Chief Executive Officer",
        sortOrder: 1,
      },
      {
        type: "jobTitle",
        category: "professional",
        value: "CTO",
        label: "Chief Technology Officer",
        sortOrder: 2,
      },
      {
        type: "jobTitle",
        category: "professional",
        value: "Manager",
        label: "Manager",
        sortOrder: 3,
      },
      {
        type: "jobTitle",
        category: "professional",
        value: "Developer",
        label: "Software Developer",
        sortOrder: 4,
      },
      {
        type: "jobTitle",
        category: "professional",
        value: "Analyst",
        label: "Business Analyst",
        sortOrder: 5,
      },

      // Departments
      {
        type: "department",
        category: "organization",
        value: "IT",
        label: "Information Technology",
        sortOrder: 1,
      },
      {
        type: "department",
        category: "organization",
        value: "HR",
        label: "Human Resources",
        sortOrder: 2,
      },
      {
        type: "department",
        category: "organization",
        value: "Finance",
        label: "Finance",
        sortOrder: 3,
      },
      {
        type: "department",
        category: "organization",
        value: "Sales",
        label: "Sales",
        sortOrder: 4,
      },
      {
        type: "department",
        category: "organization",
        value: "Marketing",
        label: "Marketing",
        sortOrder: 5,
      },

      // Industries/Companies
      {
        type: "industry",
        category: "business",
        value: "Technology",
        label: "Technology",
        sortOrder: 1,
      },
      {
        type: "industry",
        category: "business",
        value: "Healthcare",
        label: "Healthcare",
        sortOrder: 2,
      },
      {
        type: "industry",
        category: "business",
        value: "Finance",
        label: "Finance",
        sortOrder: 3,
      },
      {
        type: "industry",
        category: "business",
        value: "Education",
        label: "Education",
        sortOrder: 4,
      },
      {
        type: "industry",
        category: "business",
        value: "Manufacturing",
        label: "Manufacturing",
        sortOrder: 5,
      },
    ];

    const operations = referenceData
      .map((data) => [
        { index: { _index: this.referenceIndex } },
        {
          ...data,
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ])
      .flat();

    try {
      await this.client.bulk({ body: operations });
      logger.info("Reference data seeded successfully");
    } catch (error) {
      const safeError = {
        message: error.message,
        code: error.code,
        status: error.status,
        stack: error.stack,
        meta: error.meta,
      };
      logger.error("Failed to seed reference data:", safeError);
      throw error;
    }
  }

  async getReferenceData(type, category = null) {
    try {
      const query = {
        bool: {
          must: [{ term: { type } }, { term: { isActive: true } }],
        },
      };

      if (category) {
        query.bool.must.push({ term: { category } });
      }

      const response = await this.client.search({
        index: this.referenceIndex,
        body: {
          query,
          sort: [
            { sortOrder: { order: "asc" } },
            { "label.keyword": { order: "asc" } }, // Use keyword field for sorting
          ],
          size: 1000,
        },
      });

      return response.body.hits.hits.map((hit) => hit._source);
    } catch (error) {
      const safeError = {
        message: error.message,
        code: error.code,
        status: error.status,
        stack: error.stack,
        meta: error.meta,
      };
      logger.error(`Failed to get reference data for type ${type}:`, safeError);
      throw error;
    }
  }

  async getFormDropdownData() {
    try {
      const [
        countries,
        states,
        contactMethods,
        jobTitles,
        departments,
        industries,
      ] = await Promise.all([
        this.getReferenceData("country", "geography"),
        this.getReferenceData("state", "geography"),
        this.getReferenceData("contactMethod", "communication"),
        this.getReferenceData("jobTitle", "professional"),
        this.getReferenceData("department", "organization"),
        this.getReferenceData("industry", "business"),
      ]);

      return {
        countries: countries.map((item) => ({
          value: item.value,
          label: item.label,
        })),
        states: states.map((item) => ({
          value: item.value,
          label: item.label,
          country: item.metadata?.country,
        })),
        contactMethods: contactMethods.map((item) => ({
          value: item.value,
          label: item.label,
        })),
        jobTitles: jobTitles.map((item) => ({
          value: item.value,
          label: item.label,
        })),
        departments: departments.map((item) => ({
          value: item.value,
          label: item.label,
        })),
        industries: industries.map((item) => ({
          value: item.value,
          label: item.label,
        })),
      };
    } catch (error) {
      const safeError = {
        message: error.message,
        code: error.code,
        status: error.status,
        stack: error.stack,
        meta: error.meta,
      };
      logger.error("Failed to get form dropdown data:", safeError);
      throw error;
    }
  }

  async indexContact(contactData) {
    try {
      const response = await this.client.index({
        index: this.contactsIndex,
        id: contactData.contactId,
        body: contactData,
      });

      logger.info(`Contact indexed: ${contactData.contactId}`);
      return response.body;
    } catch (error) {
      const safeError = {
        message: error.message,
        code: error.code,
        status: error.status,
        stack: error.stack,
        meta: error.meta,
      };
      logger.error("Failed to index contact:", safeError);
      throw error;
    }
  }

  async searchContacts(query, filters = {}, page = 1, size = 20) {
    try {
      const searchQuery = {
        bool: {
          must: [],
          filter: [],
        },
      };

      // Add text search
      if (query && query.trim()) {
        searchQuery.bool.must.push({
          multi_match: {
            query: query.trim(),
            fields: [
              "fullName^3",
              "emailAddress^2",
              "company^2",
              "jobTitle",
              "department",
            ],
            type: "best_fields",
            fuzziness: "AUTO",
          },
        });
      } else {
        searchQuery.bool.must.push({ match_all: {} });
      }

      // Add filters
      if (filters.company) {
        searchQuery.bool.filter.push({
          term: { "company.keyword": filters.company },
        });
      }
      if (filters.department) {
        searchQuery.bool.filter.push({
          term: { department: filters.department },
        });
      }
      if (filters.country) {
        searchQuery.bool.filter.push({ term: { country: filters.country } });
      }
      if (filters.isActive !== undefined) {
        searchQuery.bool.filter.push({ term: { isActive: filters.isActive } });
      }

      const response = await this.client.search({
        index: this.contactsIndex,
        body: {
          query: searchQuery,
          from: (page - 1) * size,
          size,
          sort: [
            { _score: { order: "desc" } },
            { "fullName.keyword": { order: "asc" } },
          ],
          highlight: {
            fields: {
              fullName: {},
              emailAddress: {},
              company: {},
            },
          },
        },
      });

      const hits = response.body.hits;
      return {
        total: hits.total.value,
        contacts: hits.hits.map((hit) => ({
          ...hit._source,
          _score: hit._score,
          _highlights: hit.highlight,
        })),
        page,
        size,
        totalPages: Math.ceil(hits.total.value / size),
      };
    } catch (error) {
      const safeError = {
        message: error.message,
        code: error.code,
        status: error.status,
        stack: error.stack,
        meta: error.meta,
      };
      logger.error("Failed to search contacts:", safeError);
      throw error;
    }
  }

  async getContactById(contactId) {
    try {
      const response = await this.client.get({
        index: this.contactsIndex,
        id: contactId,
      });

      return response.body._source;
    } catch (error) {
      if (error.body?.found === false) {
        return null;
      }
      const safeError = {
        message: error.message,
        code: error.code,
        status: error.status,
        stack: error.stack,
        meta: error.meta,
      };
      logger.error(`Failed to get contact ${contactId}:`, safeError);
      throw error;
    }
  }

  async updateContact(contactId, updateData) {
    try {
      const response = await this.client.update({
        index: this.contactsIndex,
        id: contactId,
        body: {
          doc: {
            ...updateData,
            modifiedOn: new Date().toISOString(),
          },
        },
      });

      logger.info(`Contact updated: ${contactId}`);
      return response.body;
    } catch (error) {
      const safeError = {
        message: error.message,
        code: error.code,
        status: error.status,
        stack: error.stack,
        meta: error.meta,
      };
      logger.error(`Failed to update contact ${contactId}:`, safeError);
      throw error;
    }
  }

  async deleteContact(contactId) {
    try {
      const response = await this.client.delete({
        index: this.contactsIndex,
        id: contactId,
      });

      logger.info(`Contact deleted: ${contactId}`);
      return response.body;
    } catch (error) {
      const safeError = {
        message: error.message,
        code: error.code,
        status: error.status,
        stack: error.stack,
        meta: error.meta,
      };
      logger.error(`Failed to delete contact ${contactId}:`, safeError);
      throw error;
    }
  }

  async getHealthStatus() {
    try {
      const [clusterHealth, indicesStats] = await Promise.all([
        this.client.cluster.health(),
        this.client.cat.indices({ format: "json" }),
      ]);

      return {
        cluster: clusterHealth.body,
        indices: indicesStats.body.filter(
          (index) =>
            index.index === this.contactsIndex ||
            index.index === this.referenceIndex
        ),
      };
    } catch (error) {
      const safeError = {
        message: error.message,
        code: error.code,
        status: error.status,
        stack: error.stack,
        meta: error.meta,
      };
      logger.error("Failed to get OpenSearch health status:", safeError);
      throw error;
    }
  }
}

module.exports = OpenSearchService;
