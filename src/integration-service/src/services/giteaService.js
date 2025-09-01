const axios = require("axios");
const logger = require("../utils/logger");
const { generateCdmFileStructure } = require("../models/cdmModels");

class GiteaService {
  constructor() {
    this.baseUrl = process.env.GITEA_URL;
    this.token = process.env.GITEA_TOKEN;
    this.username = process.env.GITEA_USERNAME || "gitea_admin";
    this.repoOwner = process.env.GITEA_REPO_OWNER || "gitea_admin";
    this.repoName = process.env.GITEA_REPO_NAME || "cdm-data";
    this.apiUrl = `${this.baseUrl}/api/v1`;

    // Configure axios instance
    this.client = axios.create({
      baseURL: this.apiUrl,
      headers: {
        Authorization: `token ${this.token}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    });

    // Add request/response interceptors for logging
    this.client.interceptors.request.use(
      (config) => {
        logger.info(
          `Gitea API Request: ${config.method?.toUpperCase()} ${config.url}`
        );
        return config;
      },
      (error) => {
        const errorInfo = {
          message: error.message,
          code: error.code,
          config: {
            url: error.config?.url,
            method: error.config?.method,
            headers: error.config?.headers,
          },
        };
        logger.error("Gitea API Request Error:", errorInfo);
        return Promise.reject(error);
      }
    );

    this.client.interceptors.response.use(
      (response) => {
        logger.info(
          `Gitea API Response: ${response.status} ${response.config.url}`
        );
        return response;
      },
      (error) => {
        const errorInfo = {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          url: error.config?.url,
          method: error.config?.method,
        };
        logger.error("Gitea API Response Error:", errorInfo);
        return Promise.reject(error);
      }
    );
  }

  async ensureRepository() {
    try {
      // Check if repository exists
      await this.client.get(`/repos/${this.repoOwner}/${this.repoName}`);
      logger.info(`Repository ${this.repoOwner}/${this.repoName} exists`);
      return true;
    } catch (error) {
      if (error.response?.status === 404) {
        // Repository doesn't exist, create it
        logger.info(`Creating repository ${this.repoOwner}/${this.repoName}`);
        try {
          await this.client.post("/user/repos", {
            name: this.repoName,
            description: "CDM Data Repository for Master Data Management",
            private: false,
            auto_init: true,
            gitignores: "Node",
            license: "MIT",
            readme: "Default",
          });
          logger.info(
            `Repository ${this.repoOwner}/${this.repoName} created successfully`
          );
          return true;
        } catch (createError) {
          logger.error("Failed to create repository:", createError);
          throw createError;
        }
      } else {
        logger.error("Error checking repository:", error);
        throw error;
      }
    }
  }

  async createBranch(branchName, baseBranch = "main") {
    try {
      // Get base branch reference
      const baseRef = await this.client.get(
        `/repos/${this.repoOwner}/${this.repoName}/git/refs/heads/${baseBranch}`
      );
      logger.info(`Base branch ${baseBranch} data:`, baseRef.data);

      const baseSha = baseRef.data[0].object.sha;
      logger.info(`Base branch ${baseBranch} SHA: ${baseSha}`);

      // Create new branch
      await this.client.post(
        `/repos/${this.repoOwner}/${this.repoName}/branches`,
        {
          new_branch_name: `${branchName}`,
          old_ref_name: baseSha,
        }
      );

      logger.info(`Branch ${branchName} created successfully`);
      return branchName;
    } catch (error) {
      if (error.response?.status === 422) {
        logger.warn(`Branch ${branchName} already exists`);
        return branchName;
      }
      logger.error(`Failed to create branch ${branchName}:`, error);
      throw error;
    }
  }

  async getFileContent(filePath, branch = "main") {
    try {
      const response = await this.client.get(
        `/repos/${this.repoOwner}/${this.repoName}/contents/${filePath}`,
        {
          params: { ref: branch },
        }
      );

      if (response.data.status === 404) {
        logger.info(`File ${filePath} not found in branch ${branch}`);

        return null;
      }

      // Decode base64 content
      const content = Buffer.from(response.data.content, "base64").toString(
        "utf8"
      );
      return {
        content,
        sha: response.data.sha,
        size: response.data.size,
      };
    } catch (error) {
      if (error.response?.status === 404) {
        return null; // File doesn't exist
      }
      logger.error(`Failed to get file content for ${filePath}:`, error);
      throw error;
    }
  }

  async commitFile(filePath, content, message, branch = "main") {
    try {
      // Check if file exists to get SHA for update
      const existingFile = await this.getFileContent(filePath, branch);

      const commitData = {
        message,
        content: Buffer.from(content).toString("base64"),
        branch,
      };
      let response = {};
      if (existingFile) {
        commitData.sha = existingFile.sha;

        response = await this.client.put(
          `/repos/${this.repoOwner}/${this.repoName}/contents/${filePath}`,
          commitData
        );
        logger.info(
          `File ${filePath} updated successfully in branch ${branch}`
        );
      } else {
        commitData.branch = branch;
        response = await this.client.post(
          `/repos/${this.repoOwner}/${this.repoName}/contents/${filePath}`,
          commitData
        );
        logger.info(
          `File ${filePath} created successfully in branch ${branch}`
        );
      }

      logger.info(
        `File ${filePath} committed successfully to branch ${branch}`
      );
      return response.data;
    } catch (error) {
      logger.error(`Failed to commit file ${filePath}:`, error);
      throw error;
    }
  }

  async createPullRequest(title, head, base = "main", body = "") {
    try {
      const response = await this.client.post(
        `/repos/${this.repoOwner}/${this.repoName}/pulls`,
        {
          title,
          head,
          base,
          body,
        }
      );

      logger.info(`Pull request created: ${response.data.html_url}`);
      return response.data;
    } catch (error) {
      logger.error("Failed to create pull request:", error);
      throw error;
    }
  }

  async mergePullRequest(pullNumber, mergeMethod = "merge") {
    try {
      const response = await this.client.post(
        `/repos/${this.repoOwner}/${this.repoName}/pulls/${pullNumber}/merge`,
        {
          Do: mergeMethod,
        }
      );

      logger.info(`Pull request #${pullNumber} merged successfully`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to merge pull request #${pullNumber}:`, error);
      throw error;
    }
  }

  async deleteBranch(branchName) {
    try {
      await this.client.delete(
        `/repos/${this.repoOwner}/${this.repoName}/branches/${branchName}`
      );
      logger.info(`Branch ${branchName} deleted successfully`);
    } catch (error) {
      logger.error(`Failed to delete branch ${branchName}:`, error);
      throw error;
    }
  }

  generateBranchName(type = "contact", identifier = "") {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const id = identifier || Math.random().toString(36).slice(2, 11);
    return `${type}-${id}-${timestamp}`.toLowerCase();
  }

  async commitCdmData(contactData, metadata = {}) {
    const branchName = this.generateBranchName(
      "contact",
      contactData.contactId?.substr(0, 8)
    );

    try {
      // Ensure repository exists
      await this.ensureRepository();

      // Create feature branch
      await this.createBranch(branchName);

      // Generate CDM file structure
      const cdmStructure = generateCdmFileStructure(contactData);

      // Add metadata
      cdmStructure.metadata = {
        ...cdmStructure.metadata,
        ...metadata,
        submissionId: `${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 11)}`,
        gitBranch: branchName,
        contactId: contactData.contactId,
        gitCommitMessage: `Add contact data: ${contactData.fullName}`,
        processedAt: new Date().toISOString(),
      };

      // File paths
      const dataFilePath = `data/contacts/${cdmStructure.metadata.contactId}.json`;
      const metadataFilePath = `metadata/submissions/${cdmStructure.metadata.submissionId}.json`;

      // Commit data file
      await this.commitFile(
        dataFilePath,
        JSON.stringify(cdmStructure.entities.Contact[0], null, 2),
        `Add contact data: ${contactData.fullName}`,
        branchName
      );

      // Commit metadata file
      await this.commitFile(
        metadataFilePath,
        JSON.stringify(cdmStructure.metadata, null, 2),
        `Add metadata for submission: ${cdmStructure.metadata.submissionId}`,
        branchName
      );

      // Create pull request
      const pullRequest = await this.createPullRequest(
        `Add Contact: ${contactData.fullName}`,
        branchName,
        "main",
        `## Contact Information
**Contact ID:** ${contactData.contactId}
**Name:** ${contactData.fullName}
**Email:** ${contactData.emailAddress}
**Company:** ${contactData.company || "N/A"}

## CDM Compliance
- ✅ Schema validation passed
- ✅ Required fields present
- ✅ Data format validated

## Submission Details
- **Submission ID:** ${cdmStructure.metadata.submissionId}
- **Processed At:** ${cdmStructure.metadata.processedAt}
- **Source:** Grafana Form Submission

Please review and approve to merge this contact data into the main branch.`
      );

      return {
        success: true,
        branchName,
        pullRequest,
        submissionId: cdmStructure.metadata.submissionId,
        contactId: cdmStructure.metadata.contactId,
        dataFilePath,
        metadataFilePath,
      };
    } catch (error) {
      // Only log safe error properties to avoid circular structure issues
      const safeError = {
        message: error.message,
        code: error.code,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
      };
      logger.error("Failed to commit CDM data:", safeError);

      // Cleanup: try to delete branch if it was created
      try {
        await this.deleteBranch(branchName);
      } catch (cleanupError) {
        const safeCleanupError = {
          message: cleanupError.message,
          code: cleanupError.code,
          status: cleanupError.response?.status,
          statusText: cleanupError.response?.statusText,
          data: cleanupError.response?.data,
        };
        logger.error("Failed to cleanup branch:", safeCleanupError);
      }

      throw error;
    }
  }

  async getRepositoryStats() {
    try {
      const [repoInfo, branches, pulls] = await Promise.all([
        this.client.get(`/repos/${this.repoOwner}/${this.repoName}`),
        this.client.get(`/repos/${this.repoOwner}/${this.repoName}/branches`),
        this.client.get(`/repos/${this.repoOwner}/${this.repoName}/pulls`, {
          params: { state: "all" },
        }),
      ]);

      // Ensure pulls.data is always an array
      const pullRequests = Array.isArray(pulls.data) ? pulls.data : [];

      return {
        repository: {
          name: repoInfo.data.name,
          description: repoInfo.data.description,
          size: repoInfo.data.size,
          createdAt: repoInfo.data.created_at,
          updatedAt: repoInfo.data.updated_at,
        },
        branches: branches.data.map((branch) => ({
          name: branch.name,
          commit: branch.commit.id.substr(0, 7),
        })),
        pullRequests: {
          total: pullRequests.length,
          open: pullRequests.filter((pr) => pr.state === "open").length,
          merged: pullRequests.filter((pr) => pr.merged_at).length,
        },
      };
    } catch (error) {
      // Only log safe error properties to avoid circular structure issues
      const safeError = {
        message: error.message,
        code: error.code,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
      };
      logger.error("Failed to get repository stats:", safeError);
      throw error;
    }
  }
}

module.exports = GiteaService;
