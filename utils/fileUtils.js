import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { CONFIG } from '../config/config.js';
import { Blob } from 'blob-polyfill';
import axios from 'axios';

// Helper function to determine content type
export function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.glb': return 'model/gltf-binary';
    case '.mp4': return 'video/mp4';
    default: return 'application/octet-stream';
  }
}

export const validateImage = (file) => {
  if (!file) throw new Error('File is required');
  if (!CONFIG.ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    throw new Error(`${file.originalname} must be a JPEG or PNG image`);
  }
  if (file.size > CONFIG.MAX_FILE_SIZE) {
    throw new Error(`${file.originalname} exceeds the ${CONFIG.MAX_FILE_SIZE / (1024 * 1024)}MB size limit`);
  }
};

export const downloadImage = async (url) => {
  try {
    console.log(`Attempting to download image from: ${url}`);
    
    // Add retry logic for temporary failures
    let retries = 3;
    let lastError = null;
    
    while (retries > 0) {
      try {
        const response = await axios.get(url, {
          responseType: 'arraybuffer',
          timeout: CONFIG.REQUEST_TIMEOUT,
          maxContentLength: 10 * 1024 * 1024,
          headers: {
            'Accept': 'image/*, application/octet-stream',
            'User-Agent': 'DressifyApp/1.0'
          },
          validateStatus: function (status) {
            return status >= 200 && status < 300; // Reject status outside 2xx range
          }
        });
        
        if (response.status === 200) {
          console.log(`Successfully downloaded image, size: ${response.data.length} bytes`);
          return Buffer.from(response.data);
        }
        
        throw new Error(`Request failed with status code ${response.status}`);
      } catch (err) {
        lastError = err;
        retries--;
        if (retries > 0) {
          console.log(`Download failed (${err.message}), retrying (${retries} attempts left)...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
    
    throw new Error(`Failed to download image after multiple attempts: ${lastError.message}`);
  } catch (error) {
    console.error(`Download error details:`, error);
    throw new Error(`Failed to download result image: ${error.message}`);
  }
};