/**
 * Express router for handling feedback module routes.
 *
 * @module routes/insertSession
 */

const express = require("express");
const router = express.Router();
const { matchedData } = require("express-validator");
const {
  insertSessionRules,
  validateRequest,
} = require("./validateAndSanitize");

const mysql = require("mysql2/promise");
const keys = require("../../private/keys.json");

/**
 * Database configuration for MySQL connection.
 * @const {Object} dbConfig
 * @property {string} host - The hostname of the database.
 * @property {string} user - The username for the database.
 * @property {string} password - The password for the database.
 * @property {string} database - The name of the database.
 */
const dbConfig = {
  host: "localhost",
  user: "learnloop_app",
  password: keys.dbKey,
  database: "learnloop_data",
};

/**
 * Opens a connection to the database using the provided configuration.
 *
 * @async
 * @function openDbConnection
 * @param {Object} dbConfig - The configuration object for the database connection.
 * @returns {Promise<Object>} - The database connection object.
 * @throws {Error} - Throws an error if the database connection fails.
 */
const openDbConnection = async (dbConfig) => {
  try {
    // Create a promise-based connection to the database
    const link = await mysql.createConnection(dbConfig);
    console.log("Database connection established");

    return link; // Return the connection object
  } catch (err) {
    console.error("Error connecting to the database:", err.stack);
    throw new Error("Database connection failed");
  }
};

/**
 * Route for inserting a new session.
 * Validates the request, inserts the session into the database, and returns the session ID and pin.
 *
 * @name post/insertSession
 * @function
 * @memberof module:routes/insertSession
 * @param {express.Request} req - The request object containing the session data.
 * @param {express.Response} res - The response object for sending back the session ID and pin.
 */
router.post(
  "/insertSession",
  insertSessionRules,
  validateRequest,
  async (req, res) => {
    let link;
    try {
      // Get the validated and sanitized data
      const data = matchedData(req);

      // Open database connection
      link = await openDbConnection(dbConfig);

      // Insert session into the database
      const { insertSession } = require("./routes/insertSession");
      const { id, pin } = await insertSession(link, data);

      // Respond with the session ID and pin
      res.json({ id, pin });
    } catch (error) {
      console.error("Error creating session ID:", error.message);
      res.status(500).json({ error: "Failed to create session ID" });
    } finally {
      // Close the database connection
      if (link) await link.end();
    }
  }
);

module.exports = router;
