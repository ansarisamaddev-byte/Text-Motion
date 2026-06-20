import { Router } from 'express';
import { v2 as cloudinary } from 'cloudinary';

const router = Router();

// Initialize Cloudinary SDK context configuration inside route environment layer
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

router.get('/signature', (_req, res) => {
  const timestamp = Math.round(Date.now() / 1000);
  const folder = 'caption-editor-uploads';

  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!apiSecret) {
    return res.status(500).json({ error: 'Cloudinary credentials configuration parameters are missing on server hosts.' });
  }

  // Generate an authenticated signature valid for direct client side form posts
  const signature = cloudinary.utils.api_sign_request(
    { timestamp, folder },
    apiSecret
  );

  return res.json({
    signature,
    timestamp,
    apiKey: process.env.CLOUDINARY_API_KEY,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    folder,
  });
});

export default router;