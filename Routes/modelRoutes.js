import { generate3DModel } from '../services/3dModelService.js';
import express from 'express';

export const modelRoutes = (app) => {
  app.post("/api/generate3d", express.json(), async (req, res) => {
    try {
      console.log("Received 3D model generation request");

      const { imageUrl } = req.body;

      if (!imageUrl) {
        return res.status(400).json({
          error: "Missing imageUrl parameter",
          success: false
        });
      }

      console.log(`Processing 3D generation request for image`);

      try {
        const modelFiles = await generate3DModel(imageUrl);

        if (!modelFiles || Object.keys(modelFiles).length === 0) {
          throw new Error("Failed to generate 3D model files");
        }

        res.json({
          success: true,
          modelData: modelFiles
        });
      } catch (modelError) {
        console.error("Error in 3D model generation:", modelError);
        res.status(500).json({
          error: modelError.message || "Failed to generate 3D model",
          success: false
        });
      }

    } catch (error) {
      console.error("Error processing 3D model request:", error);
      res.status(500).json({
        error: error.message || "An unexpected error occurred while generating the 3D model.",
        success: false
      });
    }
  });
};