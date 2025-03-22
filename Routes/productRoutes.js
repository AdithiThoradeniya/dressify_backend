import express from 'express';
import Product from '../models/Product.js';

const router = express.Router();

// Get all products
router.get('/', async (req, res) => {
  try {
    console.log('GET /api/products request received');
    const products = await Product.find();
    console.log(`Found ${products.length} products`);
    res.json(products);
  } catch (err) {
    console.error('Error in GET /api/products:', err);
    res.status(500).json({ message: err.message });
  }
});

// Get a single product
router.get('/:id', async (req, res) => {
  try {
    console.log(`GET /api/products/${req.params.id} request received`);
    const product = await Product.findById(req.params.id);
    if (!product) {
      console.log(`Product with ID ${req.params.id} not found`);
      return res.status(404).json({ message: 'Product not found' });
    }
    res.json(product);
  } catch (err) {
    console.error(`Error in GET /api/products/${req.params.id}:`, err);
    res.status(500).json({ message: err.message });
  }
});

export default router;