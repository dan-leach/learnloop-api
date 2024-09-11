const express = require("express");
var cors = require("cors");
const bodyParser = require("body-parser");
const keys = require("./private/keys.json");

const app = express();
app.use(cors());
app.use(bodyParser.json());

//required to get the client IP address as server behind proxy
app.set("trust proxy", 3);

/**
 * Any browser GET requests redirects to the main website.
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 */
app.get("/", (req, res) => {
  res.send(
    "Please go to <a href='https://learnloop.co.uk/'>https://learnloop.co.uk</a> instead."
  );
});

app.get("/config", (req, res) => {
  const config = require("./config.json");
  res.json(config);
});

/**
 * Default route for handling incorrect API routes.
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 */
app.use("*", (req, res) => {
  res.status(400).json("Incorrect API route");
});

/**
 * Starts the server on port 3000.
 * @function
 */
app.listen(3000, () => {
  console.log("Server is running on port 3000");
});
