/**
 * @module fetchImage
 * @summary Handles retrieving and serving images from the server's file system.
 *
 * @description This module provides a function to retrieve images stored in the server's file system based on the provided folder and filename. It checks for the file's existence and returns it to the client. If the file is not found or cannot be sent, appropriate error responses are returned.
 *
 * @requires path - Node.js module for working with file and directory paths.
 * @requires fs - Node.js module for interacting with the file system.
 *
 * @exports fetchImage - Core function for retrieving and serving images.
 */

const path = require("path");
const fs = require("fs");

/**
 * @function fetchImage
 * @memberof module:fetchImage
 * @summary Retrieves and sends an image file to the client.
 *
 * @param {object} data - An object containing details about the image to be fetched.
 * @param {string} data.folder - The folder where the image is stored.
 * @param {string} data.filename - The name of the image file.
 * @param {object} res - The Express.js response object used to send the file or an error response.
 *
 * @returns {file} - the requested image.
 *
 * @throws {Error} - If an error occurs while sending the image.
 */
const fetchImage = (data, res) => {
  const filePath = path.join(
    path.dirname(__dirname),
    `uploads/images/${data.folder}/`,
    data.filename
  );

  // Check if the file exists
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      error: true,
      msg: "Image not found.",
    });
  }

  // Send the file
  res.sendFile(filePath, (err) => {
    if (err) {
      console.error("Error sending file:", err);
      res.status(500).json({
        error: true,
        msg: "Error sending the image.",
      });
    }
  });
};

module.exports = { fetchImage };
