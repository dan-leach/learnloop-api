/**
 * @module LearnLoopAPI The LearnLoop API application setup and routing.
 *
 * @description This Express server provides various API endpoints, including loading the feedback and interaction modules.
 * It also includes middleware for error handling and serves as the main entry point for client requests.
 *
 * @requires express
 * @requires cors
 * @requires body-parser
 */

const express = require("express");
var cors = require("cors");
const bodyParser = require("body-parser");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Required to get the client IP address as server is behind a proxy
app.set("trust proxy", 3);

/**
 * @route GET /
 * @summary Redirects users to the main website.
 *
 * @description This route handles any GET requests made to the API root. Instead of providing an API response,
 * it advises users to visit the main website. The response includes HTML content with a clickable link to the website.
 * This is useful for guiding users who may be accessing the API directly in a browser.
 *
 * @requires ./config.json - To get the primary URL
 *
 * @returns {string} 200 - HTML content that redirects the user to an external website.
 */
app.get("/", (req, res) => {
  const config = require("./config.json");
  res.send(
    `Please go to <a href='${config.client.url}'>${config.client.url}</a> instead.`
  );
});

/**
 * @route GET /qrcode
 * @summary Generates a QR code based on the provided session ID and streams it as an image.
 *
 * @description This route generates a QR code based on the session ID passed in the query parameter `id`.
 * The session ID should be 6 characters long. If the ID is invalid, a 400 status code is returned.
 * If the ID is valid, a URL is created using the session ID and the configured base URL, and a QR code is generated.
 * The QR code is then streamed as a PNG image directly to the client. If the QR code generation fails, a 500 status is returned with an error message.
 *
 * @param {string} req.query.id - The session ID (should be 6 characters long).
 *
 * @requires qrcode - Library for generating QRcodes
 * @requires config - For the primary URL
 *
 * @returns {image/png} 200 - A PNG image of the generated QR code.
 * @returns {string} 400 - Error message if the session ID is invalid.
 * @returns {string} 500 - Error message if QR code generation fails.
 */
app.get("/qrcode", async (req, res) => {
  const QRCode = require("qrcode");
  const config = require("./config.json");

  // Validate the session ID is present and exactly 6 characters long
  const sessionId = req.query.id;
  if (!sessionId || sessionId.length !== 6) {
    res.status(400).send("Failed to generate QR code: Invalid session ID.");
    return;
  }

  // Construct the URL using the session ID and the configured base URL
  const qrUrl = `${config.client.url}/${sessionId}`;

  try {
    // Set the content type to inform the client that the response is a PNG image
    res.setHeader("Content-Type", "image/png");

    // Generate the QR code and stream it directly to the response
    await QRCode.toFileStream(res, qrUrl);
  } catch (error) {
    // Log the error for debugging purposes and send a 500 status with an error message
    console.error("Error generating QR code:", error);
    res.status(500).send(`Failed to generate QR code: ${error.message}`);
  }
});

/**
 * @route GET /config
 * @summary Provides the configuration settings to the client.
 *
 * @description This route sends the contents of the server's config file to the client as a JSON response.
 * The config file contains various settings that the client might need, such as API endpoints or feature flags.
 *
 * @requires ./config.json - The config file to be returned
 *
 * @returns {Object} 200 - JSON object containing the server's configuration.
 */
app.get("/config", (req, res) => {
  // Import the configuration file containing settings to be shared with the client
  const config = require("./config.json");

  // Send the configuration file as a JSON response
  res.json(config);
});

/**
 * @route USE /feedback
 * @summary Mounts the feedback module.
 *
 * @description This middleware mounts the feedback module, allowing all routes defined in the feedback module to be accessed under the `/feedback` path.
 * It serves as the entry point for handling feedback-related requests.
 *
 * @requires ./modules/feedback/index.js - Contains the routes and logic for handling feedback operations.
 */
app.use("/feedback", require("./modules/feedback/index.js"));

/**
 * @route USE /interaction
 * @summary Mounts the interaction module.
 *
 * @description This middleware mounts the interaction module, allowing all routes defined in the interaction module to be accessed under the `/interaction` path.
 * It serves as the entry point for handling interaction-related requests.
 *
 * @requires ./modules/interaction/index.js - Contains the routes and logic for handling interaction operations.
 */
app.use("/interaction", require("./modules/interaction/index.js"));

/**
 * @route USE *
 * @summary Handles incorrect or undefined API routes.
 *
 * @description This middleware is used as a catch-all for undefined routes, returning a 500 status code and an error message indicating that the API route is incorrect.
 * This is useful for guiding clients when they access a non-existent route.
 *
 * @returns {Object} 500 - JSON object containing an error message.
 */
app.use("*", (req, res) => {
  res.status(500).json({
    errors: [{ msg: "Incorrect API route" }],
  });
});

/**
 * @function listen
 * @summary Starts the Express server.
 *
 * @description This function starts the Express server on the specified port (3000).
 * Once the server is running, it listens for incoming requests and logs a message to the console indicating the server's status.
 *
 * @param {number} 3000 - The port number the server listens on.
 *
 * @returns {void}
 */
app.listen(3000, () => {
  console.log("Server is running on port 3000");
});
