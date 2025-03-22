import express from 'express';
import { upload } from '../middleware/setUpMiddleware.js';
import { processImages } from '../services/tryOnService.js';
import { validateImage } from '../utils/fileUtils.js';
import { CONFIG } from '../config/config.js';
import Image from '../models/Clothing.js';
import { ensureAuthenticated } from '../middleware/auth.js';
import mongoose from 'mongoose';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
      const frontFilename = req.files.front[0] ? req.files.front[0].originalname : '';
      const garmentFilename = req.files.garment[0] ? req.files.garment[0].originalname : '';
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
        clearOngoingRequest();
        return res.status(400).json({
          error: error.message,
          success: false
        });
      }

      // Store images in MongoDB immediately
      const frontBuffer = front[0].buffer;
      const garmentBuffer = garment[0].buffer;
      
      // Check if this front/garment came from the shop
      const frontIsFromShop = front[0].originalname && front[0].originalname.includes('shop_');
      const garmentIsFromShop = garment[0].originalname && garment[0].originalname.includes('shop_');
      
      // Generate unique filenames
      const frontFilenameDb = `front_${req.user._id}_${Date.now()}_${front[0].originalname}`;
      const garmentFilenameDb = `garment_${req.user._id}_${Date.now()}_${garment[0].originalname}`;
      
      // Create MongoDB documents for front and garment
      let frontImageDoc, garmentImageDoc;
      
      try {
        // Save images to MongoDB
        [frontImageDoc, garmentImageDoc] = await Promise.all([
          Image.create({
            filename: frontFilenameDb,
            fileUrl: `${CONFIG.BACKEND_URL}/api/images/${frontFilenameDb}`, 
            type: 'front',
            userId: req.user._id,
            isFromShop: frontIsFromShop || false,
            data: frontBuffer
          }),
          Image.create({
            filename: garmentFilenameDb,
            fileUrl: `${CONFIG.BACKEND_URL}/api/images/${garmentFilenameDb}`,
            type: 'garment',
            userId: req.user._id,
            isFromShop: garmentIsFromShop || false,
            data: garmentBuffer
          })
        ]);
        
        console.log("Successfully saved front and garment images to MongoDB");
      } catch (dbError) {
        console.error("Failed to save images to MongoDB:", dbError);
        clearOngoingRequest();
        return res.status(500).json({
          error: "Failed to store uploaded images",
          success: false
        });
      }

      // Create modified files object with the MongoDB IDs
      const processFiles = {
        front: [{ 
          buffer: frontBuffer,
          mimetype: front[0].mimetype,
          mongoId: frontImageDoc._id 
        }],
        garment: [{ 
          buffer: garmentBuffer,
          mimetype: garment[0].mimetype,
          mongoId: garmentImageDoc._id 
        }]
      };

      let result;
      try {
        console.log("Calling processImages service...");
        result = await processImages(processFiles);
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

      // Verify the result is base64 data
      if (!result.match(/^[A-Za-z0-9+/=]+$/)) {
        console.error("Result is not valid base64 data:", result.substring(0, 100) + "...");
        clearOngoingRequest();
        throw new Error("Invalid base64 data received from model");
      }

      // Convert base64 to buffer for MongoDB storage
      const generatedBuffer = Buffer.from(result, 'base64');
      const outputFilename = `generated-${Date.now()}.png`;
      
      // Save generated image to MongoDB
      let generatedImageDoc;
      try {
        generatedImageDoc = await Image.create({
          filename: outputFilename,
          fileUrl: `${CONFIG.BACKEND_URL}/api/images/${outputFilename}`,
          type: 'generated',
          userId: req.user._id,
          data: generatedBuffer
        });
        
        console.log("Successfully saved generated image to MongoDB");
      } catch (dbError) {
        console.error("Failed to save generated image to MongoDB:", dbError);
        // Continue with the response even if DB save fails for the generated image
      }
      
      // Clear the ongoing request marker since processing is complete
      clearOngoingRequest();
      
      res.json({
        success: true,
        imageUrl: `${CONFIG.BACKEND_URL}/api/images/${outputFilename}`,
        imageData: `data:image/png;base64,${result}`
      });

    } catch (error) {
      console.error("Error processing try-on request:", error);
      // Make sure to remove user from ongoing requests on error
      ongoingRequests.delete(req.user._id);
      res.status(500).json({
        error: error.message || "An unexpected error occurred while processing your request.",
        success: false
      });
    }
  });
  
  // Add a route to serve images directly from MongoDB
  app.get("/api/images/:filename", ensureAuthenticated, async (req, res) => {
    try {
      const image = await Image.findOne({ filename: req.params.filename });
      
      if (!image || !image.data) {
        return res.status(404).json({
          error: "Image not found",
          success: false
        });
      }
      
      // Determine content type based on filename
      const contentType = req.params.filename.endsWith('.png') ? 'image/png' : 'image/jpeg';
      
      // Set proper content type header
      res.set('Content-Type', contentType);
      
      // Send the image data
      res.send(image.data);
      
    } catch (error) {
      console.error("Error retrieving image:", error);
      res.status(500).json({
        error: "Failed to retrieve image",
        success: false
      });
    }
  });
};
app.post("/api/admin/clear-requests", ensureAuthenticated, async (req, res) => {
  try {
    // Check if user has admin privileges
    if (!req.user.isAdmin) {
      return res.status(403).json({
        error: "Unauthorized. Admin privileges required.",
        success: false
      });
    }
    
    // Clear the map of ongoing requests
    const requestCount = ongoingRequests.size;
    ongoingRequests.clear();
    
    console.log(`Admin user ${req.user._id} cleared ${requestCount} ongoing requests`);
    
    return res.json({
      success: true,
      message: `Successfully cleared ${requestCount} ongoing requests`,
      clearedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error clearing ongoing requests:", error);
    return res.status(500).json({
      error: "Failed to clear ongoing requests",
      success: false
    });
  }
});