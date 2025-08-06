import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import config from "../config/config.js";
import fs from "fs";
import path from "path";
import { pipeline } from "stream/promises";
import mime from "mime-types";

const { awsCliConfig, awsBucketName } = config;

class S3Service {
  constructor() {
    this.s3Client = new S3Client(awsCliConfig);
    this.bucketName = awsBucketName;
  }

  /**
   * Upload a file to S3
   * @param {string} filePath - Local file path
   * @param {string} key - S3 object key (filename in bucket)
   * @param {Object} metadata - Optional metadata
   * @returns {Promise<Object>} Upload result
   */
  async uploadFile(filePath, key, metadata = {}) {
    try {
      console.log(`Uploading ${filePath} to S3 as ${key}...`);

      const fileBuffer = fs.readFileSync(filePath);
      const contentType = mime.lookup(filePath) || "application/octet-stream";

      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: fileBuffer,
        ContentType: contentType,
        Metadata: metadata,
      });

      const result = await this.s3Client.send(command);
      console.log(`Successfully uploaded ${key}`);

      return {
        success: true,
        key,
        etag: result.ETag,
        location: `s3://${this.bucketName}/${key}`,
      };
    } catch (error) {
      console.error(`Failed to upload ${key}:`, error.message);
      throw error;
    }
  }

  /**
   * Upload a buffer to S3
   * @param {Buffer} buffer - File buffer
   * @param {string} key - S3 object key (filename in bucket)
   * @param {string} contentType - Content type of the file
   * @param {Object} metadata - Optional metadata
   * @returns {Promise<Object>} Upload result
   */
  async uploadBuffer(
    buffer,
    key,
    contentType = "application/octet-stream",
    metadata = {}
  ) {
    try {
      console.log(`Uploading buffer to S3 as ${key}...`);

      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        Metadata: metadata,
      });

      const result = await this.s3Client.send(command);
      console.log(`Successfully uploaded ${key}`);

      return {
        success: true,
        key,
        etag: result.ETag,
        location: `s3://${this.bucketName}/${key}`,
        size: buffer.length,
      };
    } catch (error) {
      console.error(`Failed to upload ${key}:`, error.message);
      throw error;
    }
  }

  /**
   * Download a file from S3
   * @param {string} key - S3 object key
   * @param {string} downloadPath - Local download path
   * @returns {Promise<Object>} Download result
   */
  async downloadFile(key, downloadPath) {
    try {
      console.log(`Downloading ${key} from S3...`);

      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const response = await this.s3Client.send(command);

      // Ensure download directory exists
      const downloadDir = path.dirname(downloadPath);
      if (!fs.existsSync(downloadDir)) {
        fs.mkdirSync(downloadDir, { recursive: true });
      }

      // Stream the response body to file
      const writeStream = fs.createWriteStream(downloadPath);
      await pipeline(response.Body, writeStream);

      console.log(`Successfully downloaded ${key} to ${downloadPath}`);

      return {
        success: true,
        key,
        downloadPath,
        contentType: response.ContentType,
        contentLength: response.ContentLength,
        lastModified: response.LastModified,
        metadata: response.Metadata,
      };
    } catch (error) {
      console.error(`Failed to download ${key}:`, error.message);
      throw error;
    }
  }

  /**
   * List all objects in the bucket
   * @param {string} prefix - Optional prefix to filter objects
   * @param {number} maxKeys - Maximum number of objects to return
   * @returns {Promise<Array>} Array of objects
   */
  async listObjects(prefix = "", maxKeys = 1000) {
    try {
      console.log(`Listing objects in bucket ${this.bucketName}...`);

      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: prefix,
        MaxKeys: maxKeys,
      });

      const response = await this.s3Client.send(command);
      const objects = response.Contents || [];

      console.log(`Found ${objects.length} objects`);

      return objects.map((obj) => ({
        key: obj.Key,
        size: obj.Size,
        lastModified: obj.LastModified,
        etag: obj.ETag,
        storageClass: obj.StorageClass,
      }));
    } catch (error) {
      console.error(`Failed to list objects:`, error.message);
      throw error;
    }
  }

  /**
   * Delete a file from S3
   * @param {string} key - S3 object key
   * @returns {Promise<Object>} Delete result
   */
  async deleteFile(key) {
    try {
      console.log(`Deleting ${key} from S3...`);

      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.s3Client.send(command);
      console.log(`Successfully deleted ${key}`);

      return {
        success: true,
        key,
        message: "Object deleted successfully",
      };
    } catch (error) {
      console.error(`Failed to delete ${key}:`, error.message);
      throw error;
    }
  }

  /**
   * Get object metadata
   * @param {string} key - S3 object key
   * @returns {Promise<Object>} Object metadata
   */
  async getObjectMetadata(key) {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const response = await this.s3Client.send(command);

      return {
        key,
        contentType: response.ContentType,
        contentLength: response.ContentLength,
        lastModified: response.LastModified,
        etag: response.ETag,
        metadata: response.Metadata,
      };
    } catch (error) {
      console.error(`Failed to get metadata for ${key}:`, error.message);
      throw error;
    }
  }

  /**
   * Generate a pre-signed URL for temporary access
   * @param {string} key - S3 object key
   * @param {number} expiresIn - URL expiration time in seconds (default: 1 hour)
   * @returns {Promise<string>} Pre-signed URL
   */
  async generatePresignedUrl(key, expiresIn = 3600) {
    try {
      console.log(`Generating pre-signed URL for ${key}...`);

      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const url = await getSignedUrl(this.s3Client, command, { expiresIn });
      console.log(`Generated pre-signed URL (expires in ${expiresIn} seconds)`);

      return url;
    } catch (error) {
      console.error(
        `Failed to generate pre-signed URL for ${key}:`,
        error.message
      );
      throw error;
    }
  }

  /**
   * Check if an object exists in S3
   * @param {string} key - S3 object key
   * @returns {Promise<boolean>} True if object exists
   */
  async objectExists(key) {
    try {
      await this.getObjectMetadata(key);
      return true;
    } catch (error) {
      if (error.name === "NotFound") {
        return false;
      }
      throw error;
    }
  }
}

export default S3Service;
