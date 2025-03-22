import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export const CONFIG = {
  MAX_RETRIES: parseInt(process.env.MAX_RETRIES || '3'),
  RETRY_DELAY: parseInt(process.env.RETRY_DELAY || '5000'),
  REQUEST_TIMEOUT: parseInt(process.env.REQUEST_TIMEOUT || '60000'),
  MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE || '5242880'), // 5MB default
  ALLOWED_MIME_TYPES: (process.env.ALLOWED_MIME_TYPES || 'image/jpeg,image/jpg,image/png').split(','),
  DENOISING_STEPS: parseInt(process.env.DENOISING_STEPS || '40'),
  SEED: parseInt(process.env.SEED || '-1'),
  HF_TOKEN: process.env.HF_TOKEN,
  GRADIO_URL: process.env.GRADIO_URL,
  GRADIO_3D_URL: process.env.GRADIO_3D_URL,
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',
  BACKEND_URL: process.env.BACKEND_URL || 'http://localhost:5000',
  MODEL_3D_PARAMS: {
    REMOVE_BACKGROUND: process.env.MODEL_3D_REMOVE_BACKGROUND === 'true',
    SEED: parseInt(process.env.MODEL_3D_SEED || '-1'),
    GENERATE_VIDEO: process.env.MODEL_3D_GENERATE_VIDEO === 'true',
    REFINE_MULTIVIEW: process.env.MODEL_3D_REFINE_MULTIVIEW === 'true',
    EXPANSION_WEIGHT: parseInt(process.env.MODEL_3D_EXPANSION_WEIGHT || '-1'),
    MESH_INITIALIZATION: process.env.MODEL_3D_MESH_INITIALIZATION || "std"
  }
};
  
  export default CONFIG;