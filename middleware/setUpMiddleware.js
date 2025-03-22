import cors from 'cors';
import { CONFIG } from '../config/config.js';
import express from 'express';
import multer from 'multer';

// Configure multer to use memory storage
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: CONFIG.MAX_FILE_SIZE }
});

export const setUpMiddleware = (app) => {
    // Configure CORS for frontend with explicit Authorization header
    const corsOptions = {
      origin: CONFIG.FRONTEND_URL,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token'],
      exposedHeaders: ['Content-Type', 'Content-Disposition', 'Authorization'],
      credentials: true,
      max: 86400
    };
  
    app.use(cors(corsOptions));
    app.use(express.json({ limit: '50mb' }));
    app.use(express.urlencoded({ limit: '50mb', extended: true }));
    
    console.log("Middleware setup complete with memory storage for file uploads");
};