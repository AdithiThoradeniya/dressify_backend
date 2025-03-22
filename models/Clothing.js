import mongoose from 'mongoose';

const ImageSchema = new mongoose.Schema({
  filename: String,
  fileUrl: String,
  type: { 
    type: String, 
    enum: ['front', 'garment', 'generated', 'avatar', '3dmodel'],
    required: true 
  },
  uploadDate: { type: Date, default: Date.now },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, 
});

const Image = mongoose.model('Image', ImageSchema);

export default Image;