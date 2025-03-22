import express from 'express';
import Image from '../models/Clothing.js';
import { ensureAuthenticated } from '../middleware/auth.js';

const router = express.Router();

// Endpoint to retrieve images for the current user
router.get("/", ensureAuthenticated, async (req, res) => {
  try {
    const includeBinary = req.query.includeBinary === 'true';
    const query = { userId: req.user._id };
    if (req.query.type) query.type = req.query.type;

    // Fields to select based on includeBinary parameter
    let projection = '_id filename fileUrl type uploadDate isFromShop';
    if (includeBinary) {
      projection += ' data'; // Include binary data when requested
    }

    // Fetch the images
    let images = await Image.find(query)
      .select(projection)
      .lean() // Convert to plain JS objects
      .sort({ uploadDate: -1 });
    
    // Process the binary data to base64 if it exists
    if (includeBinary) {
      images = images.map(img => {
        if (img.data) {
          // Convert Buffer to base64 string on the server side
          img.data = img.data.toString('base64');
        }
        return img;
      });
    }

    console.log(`Returning ${images.length} images, includeBinary: ${includeBinary}`);
    res.json({ success: true, images });
  } catch (error) {
    console.error("Error retrieving images:", error);
    res.status(500).json({ success: false, error: "Failed to retrieve images" });
  }
});

// Endpoint to delete an image
router.delete("/:id", ensureAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    
    const deletedImage = await Image.findByIdAndDelete(id);
    
    if (!deletedImage) {
      return res.status(404).json({
        success: false,
        error: "Image not found"
      });
    }
    
    res.json({
      success: true,
      message: "Image deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting image:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete image"
    });
  }
});

export default router;