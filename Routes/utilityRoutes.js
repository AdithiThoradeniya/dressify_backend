import axios from 'axios';
import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { CONFIG } from '../config/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get absolute path to uploads directory
const uploadsDir = path.join(dirname(dirname(__dirname)), 'uploads');

export const utilityRoutes = (app) => {
  app.get("/api/test-hf-token", async (req, res) => {
    try {
      console.log("Testing Hugging Face token");
      
      const response = await axios.get('https://huggingface.co/api/whoami', {
        headers: {
          'Authorization': `Bearer ${CONFIG.HF_TOKEN}`
        }
      });
      
      if (response.status === 200) {
        res.json({
          success: true,
          message: "Hugging Face token is valid",
          userData: response.data
        });
      } else {
        res.status(response.status).json({
          success: false,
          message: "Failed to validate Hugging Face token",
          status: response.status
        });
      }
    } catch (error) {
      console.error("Error testing Hugging Face token:", error);
      res.status(500).json({
        success: false,
        message: "Error testing Hugging Face token",
        error: error.message
      });
    }
  });

  // Add a diagnostic endpoint to check uploads directory and files
  app.get("/api/diagnose", async (req, res) => {
    try {
      const diagnostics = {
        uploadsPath: uploadsDir,
        uploadsExists: fsSync.existsSync(uploadsDir),
        files: [],
        serverInfo: {
          cwd: process.cwd(),
          platform: process.platform,
          nodeVersion: process.version
        }
      };
      
      // List files in uploads directory
      if (diagnostics.uploadsExists) {
        const files = await fs.readdir(uploadsDir);
        
        for (const file of files) {
          const filePath = path.join(uploadsDir, file);
          const stats = await fs.stat(filePath);
          
          diagnostics.files.push({
            name: file,
            path: filePath,
            size: stats.size,
            isDirectory: stats.isDirectory(),
            created: stats.birthtime,
            modified: stats.mtime
          });
        }
      }
      
      res.json(diagnostics);
    } catch (error) {
      console.error("Error in diagnostics:", error);
      res.status(500).json({
        success: false,
        message: "Error running diagnostics",
        error: error.message
      });
    }
  });

  app.get("/health", (req, res) => {
    res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      corsStatus: "enabled",
      config: {
        frontend: CONFIG.FRONTEND_URL,
        backend: CONFIG.BACKEND_URL,
        gradioUrl: CONFIG.GRADIO_URL,
        gradio3dUrl: CONFIG.GRADIO_3D_URL
      }
    });
  });
};