const express = require("express");
var cors = require("cors");
const bodyParser = require("body-parser");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Required to get the client IP address as server is behind a proxy
app.set("trust proxy", 3);

/**
 * Route handler for the root ("/") path.
 * Any browser GET requests are advised to redirect to the main website.
 *
 * @name GET/
 * @function
 * @memberof module:app
 * @param {express.Request} req - The request object.
 * @param {express.Response} res - The response object.
 */
app.get("/", (req, res) => {
  res.send(
    "Please go to <a href='https://learnloop.co.uk/'>https://learnloop.co.uk</a> instead."
  );
});

/**
 * Generates a QR code based on the provided ID in the query string and streams it as a PNG image.
 *
 * Query Parameters:
 * @param {string} req.query.id - The unique identifier to encode into the QR code.
 *
 * Response:
 * - Content-Type: image/png
 * - Streams the QR code as a PNG image or returns a 500 error if generation fails.
 */
app.get("/qrcode", async (req, res) => {
  const QRCode = require("qrcode");
  const config = require("./config.json");

  const url = config.client.url + "/" + req.query.id;

  try {
    // Set the content type for the PNG image
    res.setHeader("Content-Type", "image/png");

    // Stream the generated QR code as an image to the response
    await QRCode.toFileStream(res, url);
  } catch (err) {
    console.error("Error generating QR code:", err);
    res.status(500).send("Failed to generate QR code");
  }
});

/**
 * Route for providing the config file to the client.
 *
 * @name GET/config
 * @function
 * @memberof module:app
 * @param {express.Request} req - The request object.
 * @param {express.Response} res - The response object containing the config data in JSON format.
 */
app.get("/config", (req, res) => {
  const config = require("./config.json");
  res.json(config);
});

/**
 * Routes for the feedback module.
 *
 * @module feedbackRoutes
 */
const feedbackRoutes = require("./modules/feedback/index.js");
app.use("/feedback", feedbackRoutes);

/**
 * Routes for the interaction module.
 *
 * @module interactionRoutes
 */
const interactionRoutes = require("./modules/interaction/index.js");
app.use("/interaction", interactionRoutes);

/**
 * Default route for handling incorrect API routes.
 *
 * @name All Routes
 * @function
 * @memberof module:app
 * @param {express.Request} req - The request object.
 * @param {express.Response} res - The response object.
 */
app.use("*", (req, res) => {
  res.status(500).json({
    errors: [{ msg: "Incorrect API route" }],
  });
});

/**
 * Starts the Express server on port 3000.
 *
 * @function listen
 * @memberof module:app
 * @param {number} port - The port number the server will run on.
 */
app.listen(3000, () => {
  console.log("Server is running on port 3000");
});
