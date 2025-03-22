import cors from 'cors';
import path from 'path';
import { CONFIG } from '../config/config.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import express from 'express';
import fsSync from 'fs';
import multer from 'multer';
import { getContentType } from '../utils/fileUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configure multer
const storage = multer.diskStorage({
    destination: "uploads/",
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
  });
  
  export const upload = multer({
    storage: storage,
    limits: { fileSize: CONFIG.MAX_FILE_SIZE }
  });

export const setUpMiddleware = (app) => {
    // Configure CORS for frontend with explicit Authorization header
    const corsOptions = {
      origin: CONFIG.FRONTEND_URL,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token'],
      exposedHeaders: ['Content-Type', 'Content-Disposition', 'Authorization'],
      credentials: true
    };
  
    app.use(cors(corsOptions));
    app.use(express.json({ limit: '50mb' }));
    app.use(express.urlencoded({ limit: '50mb', extended: true }));

    // Get absolute path to uploads directory
    const uploadsPath = path.join(dirname(dirname(__dirname)), 'uploads');
    
    // Create uploads directory if it doesn't exist
    if (!fsSync.existsSync(uploadsPath)) {
        fsSync.mkdirSync(uploadsPath, { recursive: true });
        console.log(`Created uploads directory at: ${uploadsPath}`);
    }

    // Set up static file serving with proper MIME types
    app.use('/uploads', express.static(uploadsPath, {
      setHeaders: (res, filePath) => {
        res.setHeader('Content-Type', getContentType(filePath));
        res.setHeader('Access-Control-Allow-Origin', CONFIG.FRONTEND_URL);
        res.setHeader('Access-Control-Allow-Methods', 'GET');
      }
    }));
  
    console.log(`Static file serving configured for uploads directory: ${uploadsPath}`);
};