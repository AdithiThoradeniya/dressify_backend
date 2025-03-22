import express from 'express';
import Image from '../models/Clothing.js';
import { ensureAuthenticated } from '../middleware/auth.js';

const router = express.Router();

// Endpoint to retrieve images for the current user
router.get("/", ensureAuthenticated, async (req, res) => {
  try {
    const query = { userId: req.user._id };
    if (req.query.type) query.type = req.query.type;

    const images = await Image.find(query).sort({ uploadDate: -1 });

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