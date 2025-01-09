/**
 * @module uploadImage
 * @summary Handles file uploads for images using multer.
 *
 * @description This module provides functionality for securely uploading image files to the server using multer. Uploaded files are stored in a structured folder system based on the current date. File names are made unique to prevent collisions.
 *
 * @requires multer - Middleware for handling multipart/form-data, used for file uploads.
 * @requires path - Node.js module for working with file and directory paths.
 * @requires fs - Node.js module for interacting with the file system.
 *
 * @exports uploadImage - Multer instance configured for image uploads.
 */

const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Define storage settings for multer
/**
 * @constant {object} storage
 * @description Configuration for storing uploaded files using multer. Determines the destination directory and file naming convention.
 */
const storage = multer.diskStorage({
  /**
   * @function destination
   * @memberof storage
   * @description Determines the destination directory for uploaded files. Creates the directory if it doesn't exist.
   *
   * @param {object} req - The Express.js request object.
   * @param {object} file - The file being uploaded.
   * @param {function} cb - Callback to set the destination directory.
   */
  destination: (req, file, cb) => {
    const uploadPath = path.join(
      path.dirname(__dirname), // Using parent directory of current directory
      `uploads/images/${new Date().toISOString().slice(0, 7)}`
    );
    // Ensure the directory exists
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },

  /**
   * @function filename
   * @memberof storage
   * @description Sets a unique file name for each uploaded file to prevent collisions.
   *
   * @param {object} req - The Express.js request object.
   * @param {object} file - The file being uploaded.
   * @param {function} cb - Callback to set the file name.
   */
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const extension = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${extension}`);
  },
});

// Set up multer
/**
 * @constant {object} uploadImage
 * @description A configured instance of multer for handling image uploads. Limits file size and validates file type.
 *
 * @throws {Error} - If the uploaded file is not an allowed image type.
 */
const uploadImage = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // Limit file size to 20MB
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

module.exports = { uploadImage };
