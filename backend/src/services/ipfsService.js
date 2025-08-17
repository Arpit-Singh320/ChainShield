// IPFS Integration Service for Evidence Storage and Retrieval
import { create } from 'ipfs-http-client';
import dotenv from 'dotenv';
import path from 'path';
import axios from 'axios';
import fs from 'fs';

// Load environment variables
dotenv.config({ path: path.resolve('../../.env') });

export class IPFSService {
  constructor() {
    this.projectId = process.env.IPFS_PROJECT_ID;
    this.projectSecret = process.env.IPFS_PROJECT_SECRET;
    
    // Check if we have the required credentials
    if (!this.projectId || !this.projectSecret) {
      console.warn("IPFS credentials not found in .env file. Using public gateway for read operations only.");
      this.writeAccess = false;
    } else {
      this.writeAccess = true;
      
      // Create an authentication header for Infura or Pinata
      const auth = 'Basic ' + Buffer.from(this.projectId + ':' + this.projectSecret).toString('base64');
      
      // Create IPFS client using Infura
      this.ipfs = create({
        host: 'ipfs.infura.io',
        port: 5001,
        protocol: 'https',
        headers: {
          authorization: auth
        }
      });
      
      console.log("IPFS service initialized with write access");
    }
    
    // Public IPFS gateway for retrieving files
    this.ipfsGateway = 'https://ipfs.io/ipfs/';
  }
  
  /**
   * Upload a file to IPFS
   * @param {Buffer|File} fileContent - Content of the file to upload
   * @param {string} fileName - Name of the file
   * @returns {Promise<string>} IPFS hash (CID) of the uploaded file
   */
  async uploadFile(fileContent, fileName) {
    if (!this.writeAccess) {
      throw new Error("Cannot upload files to IPFS without credentials");
    }
    
    try {
      const fileToUpload = {
        path: fileName,
        content: fileContent
      };
      
      const result = await this.ipfs.add(fileToUpload, {
        pin: true, // Pin the file to keep it on the IPFS nodes
        progress: (prog) => console.log(`Upload progress: ${prog}`)
      });
      
      console.log(`File uploaded to IPFS with CID: ${result.cid}`);
      
      // Return the CID (Content Identifier) of the uploaded file
      return result.cid.toString();
    } catch (error) {
      console.error("Error uploading file to IPFS:", error);
      throw error;
    }
  }
  
  /**
   * Upload a JSON object to IPFS
   * @param {Object} jsonData - JSON object to upload
   * @returns {Promise<string>} IPFS hash (CID) of the uploaded JSON
   */
  async uploadJson(jsonData) {
    if (!this.writeAccess) {
      throw new Error("Cannot upload files to IPFS without credentials");
    }
    
    try {
      const jsonString = JSON.stringify(jsonData);
      const jsonBuffer = Buffer.from(jsonString);
      
      const result = await this.ipfs.add(jsonBuffer, {
        pin: true
      });
      
      console.log(`JSON uploaded to IPFS with CID: ${result.cid}`);
      
      return result.cid.toString();
    } catch (error) {
      console.error("Error uploading JSON to IPFS:", error);
      throw error;
    }
  }
  
  /**
   * Upload multiple files to IPFS as a directory
   * @param {Array<{name: string, content: Buffer}>} files - Array of file objects
   * @returns {Promise<string>} IPFS hash (CID) of the uploaded directory
   */
  async uploadDirectory(files) {
    if (!this.writeAccess) {
      throw new Error("Cannot upload files to IPFS without credentials");
    }
    
    try {
      const fileObjects = files.map(file => ({
        path: file.name,
        content: file.content
      }));
      
      const results = await this.ipfs.add(fileObjects, {
        pin: true,
        wrapWithDirectory: true
      });
      
      // Find the directory CID (the last result)
      let dirCid = null;
      for await (const result of results) {
        if (!result.path) {
          dirCid = result.cid.toString();
        }
      }
      
      console.log(`Directory uploaded to IPFS with CID: ${dirCid}`);
      return dirCid;
    } catch (error) {
      console.error("Error uploading directory to IPFS:", error);
      throw error;
    }
  }
  
  /**
   * Retrieve a file from IPFS
   * @param {string} cid - IPFS hash (CID) of the file
   * @returns {Promise<Buffer>} Content of the file
   */
  async retrieveFile(cid) {
    try {
      // Use the public gateway to retrieve the file
      const response = await axios.get(`${this.ipfsGateway}${cid}`, {
        responseType: 'arraybuffer'
      });
      
      return Buffer.from(response.data);
    } catch (error) {
      console.error("Error retrieving file from IPFS:", error);
      throw error;
    }
  }
  
  /**
   * Retrieve and parse a JSON file from IPFS
   * @param {string} cid - IPFS hash (CID) of the JSON file
   * @returns {Promise<Object>} Parsed JSON object
   */
  async retrieveJson(cid) {
    try {
      const response = await axios.get(`${this.ipfsGateway}${cid}`);
      return response.data;
    } catch (error) {
      console.error("Error retrieving JSON from IPFS:", error);
      throw error;
    }
  }
  
  /**
   * Get the URL to access the file in a browser
   * @param {string} cid - IPFS hash (CID) of the file
   * @returns {string} Public gateway URL for the file
   */
  getPublicUrl(cid) {
    return `${this.ipfsGateway}${cid}`;
  }
  
  /**
   * Check if a file exists on IPFS
   * @param {string} cid - IPFS hash (CID) of the file
   * @returns {Promise<boolean>} Whether the file exists
   */
  async checkFileExists(cid) {
    try {
      const response = await axios.head(`${this.ipfsGateway}${cid}`);
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Download a file from IPFS and save it locally
   * @param {string} cid - IPFS hash (CID) of the file
   * @param {string} outputPath - Path to save the file
   * @returns {Promise<string>} Path to the downloaded file
   */
  async downloadFile(cid, outputPath) {
    try {
      const fileBuffer = await this.retrieveFile(cid);
      
      // Create directory if it doesn't exist
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      // Write file to disk
      fs.writeFileSync(outputPath, fileBuffer);
      console.log(`File downloaded from IPFS to ${outputPath}`);
      
      return outputPath;
    } catch (error) {
      console.error("Error downloading file from IPFS:", error);
      throw error;
    }
  }
}
