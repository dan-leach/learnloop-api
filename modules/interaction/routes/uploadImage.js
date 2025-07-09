/**
 * @module uploadImage
 * @summary Handles file uploads for images using multer and processes them to WebP.
 *
 * @description This module provides functionality for securely uploading image files to the server using multer,
 * and processes them with Sharp to WebP format (quality 75, max width 1920px) before storing.
 *
 * @requires multer - Middleware for handling multipart/form-data, used for file uploads.
 * @requires path - Node.js module for working with file and directory paths.
 * @requires fs - Node.js module for interacting with the file system.
 * @requires sharp - High-performance image processing library.
 *
 * @exports uploadImageMiddleware - Middleware that processes and stores uploaded image as WebP.
 */

const multer = require("multer");
const path = require("path");
const fs = require("fs");
const sharp = require("sharp");

// Use memory storage to allow Sharp processing before saving to disk
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const mimetype = allowedTypes.test(file.mimetype);
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error("Only images are allowed (jpeg, jpg, png, gif)."));
  },
});

/**
 * @function uploadImageMiddleware
 * @memberof module:uploadImage
 * @description Express middleware that converts uploaded image to WebP, resizes, and saves to disk.
 *
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @param {function} next - Express next middleware function.
 *
 * @throws {Error} If id is missing or image processing fails.
 */
const uploadImageMiddleware = [
  upload.single("image"),
  async (req, res, next) => {
    try {
      const id = req.query.id; //session id
      if (!id) {
        throw new Error("Missing id in query parameters.");
      }

      const uploadPath = path.join(
        path.dirname(__dirname),
        `uploads/images/${id}`
      );

      if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true });
      }

      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      const filename = `image-${uniqueSuffix}.webp`;
      const outputPath = path.join(uploadPath, filename);

      await sharp(req.file.buffer)
        .resize({ width: 1920, withoutEnlargement: true })
        .webp({ quality: 75 })
        .toFile(outputPath);

      req.processedImagePath = outputPath; // Optional: attach to request for downstream use
      next();
    } catch (error) {
      next(error);
    }
  },
];

module.exports = { uploadImageMiddleware };
