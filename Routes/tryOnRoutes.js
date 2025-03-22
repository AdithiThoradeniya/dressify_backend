import path from 'path';
import express from 'express';
import fs from 'fs/promises';
import fsSync from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { upload } from '../middleware/setUpMiddleware.js';
import { processImages } from '../services/tryOnService.js';
import { validateImage, cleanupFiles } from '../utils/fileUtils.js';
import { CONFIG } from '../config/config.js';
import Image from '../models/Clothing.js';
import { ensureAuthenticated } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(express.json()); // For parsing JSON request bodies
app.use(express.urlencoded({ extended: true }));

// Ensure uploads directory exists
const uploadsDir = path.join(dirname(dirname(__dirname)), 'uploads');
if (!fsSync.existsSync(uploadsDir)) {
  fsSync.mkdirSync(uploadsDir, { recursive: true });
}

// Track ongoing requests to prevent duplicates
const ongoingRequests = new Map();

export const tryOnRoutes = (app) => {
  // Add a debug route to verify authentication
  app.get("/api/auth-check", ensureAuthenticated, (req, res) => {
    res.json({
      success: true,
      message: "Authentication successful",
      user: {
        id: req.user._id,
        email: req.user.email
      }
    });
  });

  app.post("/api/tryon", ensureAuthenticated, upload.fields([
    { name: "front", maxCount: 1 },
    { name: "garment", maxCount: 1 }
  ]), async (req, res) => {
    try {
      console.log("Received file upload request for virtual try-on");
      console.log("Authenticated user:", req.user._id);

      // Check if files exist before trying to access them
      if (!req.files || !req.files.front || !req.files.garment) {
        return res.status(400).json({
          error: "Missing files. Please upload both front view and garment images.",
          success: false
        });
      }

      // Better duplicate request detection with file information
      const frontFilename = req.files.front[0] ? req.files.front[0].filename : '';
      const garmentFilename = req.files.garment[0] ? req.files.garment[0].filename : '';
      const requestSignature = `${req.user._id}-${frontFilename}-${garmentFilename}`;
      
      // Check for exact duplicate requests (same user and files)
      for (const [userId, requestInfo] of ongoingRequests.entries()) {
        if (typeof requestInfo === 'object' && 
            requestInfo.signature === requestSignature && 
            Date.now() - requestInfo.timestamp < 10000) {
          console.log("Exact duplicate request detected (same files), ignoring");
          return res.status(429).json({
            error: "A request with these exact files is already being processed",
            success: false
          });
        }
      }
      
      // Also check for rapid requests from same user
      const userLatestRequest = ongoingRequests.get(req.user._id);
      const currentTime = Date.now();
      if (userLatestRequest) {
        const timestamp = typeof userLatestRequest === 'object' ? 
          userLatestRequest.timestamp : userLatestRequest;
        
        if (currentTime - timestamp < 5000) {
          console.log("Duplicate request detected within 5 second window, ignoring");
          return res.status(429).json({
            error: "Please wait before submitting another request",
            success: false
          });
        }
      }
      
      // Mark this user as having an ongoing request with more information
      ongoingRequests.set(req.user._id, {
        timestamp: currentTime,
        signature: requestSignature
      });
      
      // Create a function to clear the ongoing request
      const clearOngoingRequest = () => {
        ongoingRequests.delete(req.user._id);
      };

      const { front, garment } = req.files;

      try {
        validateImage(front[0]);
        validateImage(garment[0]);
      } catch (error) {
        cleanupFiles(req.files);
        clearOngoingRequest();
        return res.status(400).json({
          error: error.message,
          success: false
        });
      }

      let result;
      try {
        console.log("Calling processImages service...");
        result = await processImages(req.files);
        console.log("ProcessImages service returned successfully");
      } catch (processingError) {
        console.error("Error in processing service:", processingError);
        clearOngoingRequest();
        throw new Error(`Image processing failed: ${processingError.message}`);
      }

      if (!result || typeof result !== 'string') {
        clearOngoingRequest();
        throw new Error("Invalid image data received from model");
      }

      // Verify the result is base64 data before writing to file
      if (!result.match(/^[A-Za-z0-9+/=]+$/)) {
        console.error("Result is not valid base64 data:", result.substring(0, 100) + "...");
        clearOngoingRequest();
        throw new Error("Invalid base64 data received from model");
      }

      const outputFilename = `generated-${Date.now()}.png`;
      const outputImagePath = path.join(uploadsDir, outputFilename);
      
      console.log(`Saving generated image to: ${outputImagePath}`);
      try {
        await fs.writeFile(outputImagePath, Buffer.from(result, 'base64'));
        console.log("Image saved successfully");
      } catch (fileError) {
        console.error("Error saving file:", fileError);
        clearOngoingRequest();
        throw new Error(`Failed to save generated image: ${fileError.message}`);
      }
      
      // Save image references to MongoDB with user ID
      try {
        // First check if images are already saved
        const [existingFront, existingGarment, existingGenerated] = await Promise.all([
          Image.findOne({ 
            filename: front[0].filename, 
            userId: req.user._id, 
            type: 'front'
          }),
          Image.findOne({
            filename: garment[0].filename,
            userId: req.user._id,
            type: 'garment'
          }),
          Image.findOne({
            filename: outputFilename,
            userId: req.user._id,
            type: 'generated'
          })
        ]);
        
        // Only insert documents that don't already exist
        const imagesToInsert = [];
        
        if (!existingFront) {
          // Check if this came from the shop 
          const isFromShop = front[0].originalname && front[0].originalname.includes('shop_');
          
          imagesToInsert.push({ 
            filename: front[0].filename, 
            fileUrl: `${CONFIG.BACKEND_URL}/uploads/${front[0].filename}`, 
            type: 'front', 
            userId: req.user._id,
            isFromShop: isFromShop || false
          });
        }
        
        if (!existingGarment) {
          // Check if this garment came from the shop
          const isFromShop = garment[0].originalname && garment[0].originalname.includes('shop_');
          
          imagesToInsert.push({ 
            filename: garment[0].filename, 
            fileUrl: `${CONFIG.BACKEND_URL}/uploads/${garment[0].filename}`, 
            type: 'garment', 
            userId: req.user._id,
            isFromShop: isFromShop || false
          });
        }
        
        // Only add the generated image if it doesn't already exist
        if (!existingGenerated) {
          imagesToInsert.push({ 
            filename: outputFilename, 
            fileUrl: `${CONFIG.BACKEND_URL}/uploads/${outputFilename}`, 
            type: 'generated', 
            userId: req.user._id 
          });
        }
        
        // Use insertMany with ordered: false to skip duplicates
        if (imagesToInsert.length > 0) {
          // Use a findOneAndUpdate with upsert for each image to guarantee no duplicates
          await Promise.all(imagesToInsert.map(image => 
            Image.findOneAndUpdate(
              { filename: image.filename, userId: image.userId, type: image.type },
              image,
              { upsert: true, new: true }
            )
          ));
          
          console.log(`Saved ${imagesToInsert.length} image references to database`);
        } else {
          console.log("No new images to save to database");
        }
      } catch (dbError) {
        console.error("Failed to save image references to database:", dbError);
        // Continue with the response even if DB save fails
      }
      
      // Clear the ongoing request marker since processing is complete
      clearOngoingRequest();
      
      res.json({
        success: true,
        imageUrl: `${CONFIG.BACKEND_URL}/uploads/${outputFilename}`,
        imageData: `data:image/png;base64,${result}`
      });

    } catch (error) {
      console.error("Error processing try-on request:", error);
      // Make sure to remove user from ongoing requests on error
      ongoingRequests.delete(req.user._id);
      if (req.files) cleanupFiles(req.files);
      res.status(500).json({
        error: error.message || "An unexpected error occurred while processing your request.",
        success: false
      });
    }
  });
};