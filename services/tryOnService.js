import { client } from '@gradio/client';
import { CONFIG } from '../config/config.js';
import { Blob } from 'blob-polyfill';
import axios from 'axios';

// Create a cache for the Gradio client to prevent "Session not found" errors
let gradioClientCache = null;
let lastClientInitTime = 0;

// Function to get a fresh Gradio client
const getGradioClient = async () => {
  const currentTime = Date.now();
  
  // If client is older than 5 minutes or doesn't exist, create a new one
  if (!gradioClientCache || (currentTime - lastClientInitTime > 300000)) {
    console.log('Creating new Gradio client');
    gradioClientCache = await client(CONFIG.GRADIO_URL, {
      hf_token: CONFIG.HF_TOKEN
    });
    lastClientInitTime = currentTime;
    return gradioClientCache;
  }
  
  console.log('Using cached Gradio client');
  return gradioClientCache;
};

// Convert buffer to blob directly
const bufferToBlob = (buffer, mimetype) => {
  return new Blob([buffer], { type: mimetype });
};

export const processImages = async (files) => {
  let retries = 0;
  
  while (retries < CONFIG.MAX_RETRIES) {
    try {
      console.log(`Processing attempt ${retries + 1}/${CONFIG.MAX_RETRIES}`);
      
      // Always get a fresh client on retries
      if (retries > 0) {
        console.log('Forcing new Gradio client to retry');
        gradioClientCache = null;
      }
      
      // Get the Gradio client with caching
      const gradioApp = await Promise.race([
        getGradioClient(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Gradio client initialization timeout')), CONFIG.REQUEST_TIMEOUT)
        )
      ]);
      
      console.log('Gradio client initialized successfully');
      
      // Convert buffers to blobs directly without saving to disk
      const frontBlob = bufferToBlob(files.front[0].buffer, files.front[0].mimetype);
      const garmentBlob = bufferToBlob(files.garment[0].buffer, files.garment[0].mimetype);

      // Fix the parameter that's causing errors (denoising steps)
      const denoisingSteps = Math.min(CONFIG.DENOISING_STEPS, 40);
      
      console.log(`Using denoising steps: ${denoisingSteps}`);
      console.log('Sending request to Gradio API...');

      // Make prediction with timeout
      const result = await Promise.race([
        gradioApp.predict("/tryon", [
          {
            background: frontBlob,
            layers: [],
            composite: null
          },
          garmentBlob,
          "",
          true,
          true,
          denoisingSteps,  
          CONFIG.SEED
        ]),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Prediction timeout')), CONFIG.REQUEST_TIMEOUT * 2)
        )
      ]);

      console.log('Received response from Gradio API:', JSON.stringify(result?.data ? 'has data' : 'no data'));

      if (!result || !result.data) {
        throw new Error("Invalid result data received from Gradio");
      }

      // Handling result format
      let imageBuffer = null;
      
      // Handle array result
      if (Array.isArray(result.data) && result.data.length > 0) {
        console.log(`Result is an array with ${result.data.length} items`);
        
        // Try different positions in the array if needed
        const resultItem = result.data[0]; 
        
        if (resultItem) {
          // Log
          console.log('Result item structure:', Object.keys(resultItem));
          
          if (resultItem.url) {
            console.log(`Found URL: ${resultItem.url}`);
            try {
              imageBuffer = await Promise.race([
                downloadImage(resultItem.url),
                new Promise((_, reject) => 
                  setTimeout(() => reject(new Error('Download timeout')), CONFIG.REQUEST_TIMEOUT)
                )
              ]);
            } catch (downloadError) {
              console.error('Error downloading from primary URL:', downloadError);
              
              // Try alternative data formats if URL download fails
              if (resultItem.data && typeof resultItem.data === 'string') {
                console.log('Attempting to use data field instead of URL');
                return resultItem.data;
              }
              
              throw downloadError;
            }
          } else if (resultItem.data) {
            console.log('Using data field instead of URL');
            return resultItem.data;
          }
        }
      } else if (typeof result.data === 'object') {
        // Handle object format
        console.log('Result is an object');
        
        if (result.data.url) {
          console.log(`Found URL in object: ${result.data.url}`);
          imageBuffer = await downloadImage(result.data.url);
        } else if (result.data.image) {
          // Some Gradio APIs return an 'image' property with base64 data
          console.log('Found image property in object');
          return result.data.image;
        }
      }
      // Handle direct base64 string
      else if (typeof result.data === 'string') {
        console.log('Result is a string (likely base64)');
        
        // Return the string if it looks like base64
        if (result.data.match(/^[A-Za-z0-9+/=]+$/)) {
          return result.data;
        }
        // If it's a URL, try to download it
        else if (result.data.startsWith('http')) {
          console.log(`String appears to be a URL: ${result.data}`);
          imageBuffer = await downloadImage(result.data);
        }
      }
      
      if (imageBuffer) {
        return imageBuffer.toString('base64');
      }

      throw new Error("Could not extract image data from result");
      
    } catch (error) {
      retries++;
      console.error(`Attempt ${retries} failed:`, error);
      
      // If error is about the denoising steps, print a more helpful message
      if (error.message && error.message.includes('Value 50 is greater than maximum value 40')) {
        console.error('The denoising steps parameter is too high, using a lower value');
        
        // Optional: Update the CONFIG here if you want
        CONFIG.DENOISING_STEPS = 40;
      }
      
      // Always reset the Gradio client if we get any error during processing
      console.log('Resetting Gradio client due to error');
      gradioClientCache = null;
      
      if (retries === CONFIG.MAX_RETRIES) {
        throw new Error(`Failed to process images after ${CONFIG.MAX_RETRIES} attempts: ${error.message}`);
      }
      
      // Exponential backoff
      const delay = Math.min(CONFIG.RETRY_DELAY * Math.pow(2, retries - 1), 30000);
      console.log(`Waiting ${delay}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
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