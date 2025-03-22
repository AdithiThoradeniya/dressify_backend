import { tryOnRoutes } from './tryOnRoutes.js';
import { modelRoutes } from './modelRoutes.js';
import { utilityRoutes } from './utilityRoutes.js';
import profileRoutes from './profileRoutes.js';
import authRoutes from './authRoutes.js';
import imageRoutes from './imageRoutes.js'; 
import productRoutes from './productRoutes.js'; 

export const configureRoutes = (app) => {
  // Set up all route modules
  app.use('/api/auth', authRoutes);
  app.use('/api/profile', profileRoutes);
  app.use('/api/images', imageRoutes); 
  app.use('/api/products', productRoutes);
  
  // Set up function-based routes
  tryOnRoutes(app);
  modelRoutes(app);
  utilityRoutes(app);
};