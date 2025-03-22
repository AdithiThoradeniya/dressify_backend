import axios from 'axios';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { Blob } from 'blob-polyfill';
import { client } from '@gradio/client';
import { CONFIG } from '../config/config.js';
import { logSystemInfo } from '../utils/systemUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get absolute path to uploads directory (same as in setupMiddleware and tryOnRoutes)
const uploadsDir = path.join(dirname(dirname(__dirname)), 'uploads');

export const generate3DModel = async (imageUrl) => {
  // Log system info for debugging
  logSystemInfo();

  let imageBuffer;
  let gradioApp;

  try {
    console.log("Starting 3D model generation process");
    
    // Handle the image URL
    try {
      if (imageUrl.startsWith('data:image/')) {
        // It's a base64 data URL
        console.log("Processing base64 image data");
        const base64Data = imageUrl.split(',')[1];
        imageBuffer = Buffer.from(base64Data, 'base64');
      } else {
        // It's a regular URL
        console.log(`Downloading image from URL: ${imageUrl}`);
        
        // IMPORTANT FIX: Check if this is a local server URL
        if (imageUrl.includes('localhost') || imageUrl.includes('127.0.0.1')) {
          // Extract the filename from the URL
          const urlParts = imageUrl.split('/');
          const filename = urlParts[urlParts.length - 1];
          
          // Create the full local path
          const localPath = path.join(uploadsDir, filename);
          
          // Check if the file exists locally
          if (fsSync.existsSync(localPath)) {
            console.log(`Reading local file: ${localPath}`);
            imageBuffer = await fs.readFile(localPath);
          } else {
            console.error(`Local file not found: ${localPath}`);
            throw new Error(`File not found: ${localPath}`);
          }
        } else {
          // For external URLs, use axios
          const response = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            timeout: CONFIG.REQUEST_TIMEOUT
          });
          imageBuffer = Buffer.from(response.data);
        }
      }
      console.log("Image data prepared successfully");
    } catch (imageError) {
      console.error("Error processing image:", imageError);
      throw new Error(`Failed to process image: ${imageError.message}`);
    }

    // Initialize the Gradio client
    try {
      console.log(`Initializing Gradio client: ${CONFIG.GRADIO_3D_URL}`);
      gradioApp = await client(CONFIG.GRADIO_3D_URL, {
        hf_token: CONFIG.HF_TOKEN
      });
      console.log("Gradio client initialized successfully");
    } catch (initError) {
      console.error("Error initializing Gradio client:", initError);
      throw new Error(`Failed to initialize Gradio client: ${initError.message}`);
    }

    // Create and verify the image blob
    let imageBlob;
    try {
      imageBlob = new Blob([imageBuffer], { type: 'image/png' });
      console.log("Image blob created:", imageBlob.size, "bytes");
      
      if (imageBlob.size === 0) {
        throw new Error("Created image blob has zero size");
      }
    } catch (blobError) {
      console.error("Error creating image blob:", blobError);
      throw new Error(`Failed to create image blob: ${blobError.message}`);
    }

    // Make the prediction
    let result;
    try {
      console.log("Sending prediction request to Gradio with params:", {
        removeBackground: CONFIG.MODEL_3D_PARAMS.REMOVE_BACKGROUND,
        seed: CONFIG.MODEL_3D_PARAMS.SEED,
        generateVideo: CONFIG.MODEL_3D_PARAMS.GENERATE_VIDEO
      });
      
      result = await gradioApp.predict("/generate3dv2", [
        imageBlob,
        CONFIG.MODEL_3D_PARAMS.REMOVE_BACKGROUND,
        CONFIG.MODEL_3D_PARAMS.SEED,
        CONFIG.MODEL_3D_PARAMS.GENERATE_VIDEO,
        CONFIG.MODEL_3D_PARAMS.REFINE_MULTIVIEW,
        CONFIG.MODEL_3D_PARAMS.EXPANSION_WEIGHT,
        CONFIG.MODEL_3D_PARAMS.MESH_INITIALIZATION
      ]);
      
      console.log("Prediction request completed");
    } catch (predictionError) {
      console.error("Error making prediction:", predictionError);
      throw new Error(`Failed to make prediction: ${predictionError.message}`);
    }

    // Validate the result
    if (!result) {
      throw new Error("Received null result from Gradio");
    }
    
    console.log("Result received:", typeof result, "with keys:", Object.keys(result));
    
    if (!result.data) {
      throw new Error("Result does not contain 'data' property");
    }

    // Process the result data
    const modelData = {};
    
    if (Array.isArray(result.data)) {
      console.log("Result.data is an array with length:", result.data.length);
      
      for (let i = 0; i < result.data.length; i++) {
        const item = result.data[i];
        console.log(`Result item ${i}:`, item);
        
        if (!item || typeof item !== 'object') {
          console.log(`Item ${i} is not an object, skipping`);
          continue;
        }
        
        if (!item.path) {
          console.log(`Item ${i} doesn't have a path property, skipping`);
          continue;
        }
        
        // Process the item based on its file extension
        const path = item.path;
        const isGlb = path.endsWith('.glb');
        const isMp4 = path.endsWith('.mp4');
        
        if (!isGlb && !isMp4) {
          console.log(`Skipping item with path ${path} - not a supported file type`);
          continue;
        }
        
        // Simplified approach: just use the direct URL to the file
        const fileUrl = `https://wuvin-unique3d.hf.space/file=${encodeURIComponent(path)}`;
        
        if (isGlb) {
          modelData.model = fileUrl;
          console.log(`Added model URL: ${fileUrl}`);
        } else if (isMp4) {
          modelData.video = fileUrl;
          console.log(`Added video URL: ${fileUrl}`);
        }
      }
    } else {
      console.log("Result.data is not an array:", typeof result.data);
      throw new Error("Expected result.data to be an array");
    }

    // Verify we have at least one file
    if (Object.keys(modelData).length === 0) {
      throw new Error("No valid files found in the result");
    }
    
    console.log("Successfully processed 3D generation result:", modelData);
    return modelData;

  } catch (error) {
    console.error("3D model generation failed:", error);
    throw new Error(`Failed to generate 3D model: ${error.message}`);
  }
};