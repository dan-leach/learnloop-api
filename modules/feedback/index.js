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
  loadUpdateSessionRules,
  updateSessionRules,
  validateRequest,
} = require("./validateAndSanitize");

const mysql = require("mysql2/promise");
const { json } = require("body-parser");

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
  password: process.env.dbKey,
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

    return link; // Return the connection object
  } catch (error) {
    throw error;
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
      const { id, leadPin } = await insertSession(link, data);

      // Respond with the session ID and pin
      res.json({ id, leadPin });
    } catch (error) {
      console.error(new Date().toISOString(), "insertSession error:", error);
      res.status(500).json({
        errors: [{ msg: "Failed to create session: " + error.message }],
      });
    } finally {
      // Close the database connection
      if (link) await link.end();
    }
  }
);

/**
 * Route for get the details an existing session as part of the update process.
 * Validates the request, checks the pin, returns the session details.
 *
 * @name post/loadUpdateSession
 * @function
 * @memberof module:routes/loadUpdateSession
 * @param {express.Request} req - The request object containing the session id and pin.
 * @param {express.Response} res - The response object with the session details.
 */
router.post(
  "/loadUpdateSession",
  loadUpdateSessionRules,
  validateRequest,
  async (req, res) => {
    let link;
    try {
      // Get the validated and sanitized data
      const data = matchedData(req);

      // Open database connection
      link = await openDbConnection(dbConfig);

      const { getOrganisers, pinIsValid } = require("../utilities/index");
      const organisers = await getOrganisers(data.id, "feedback", link);
      const user = organisers.find((organiser) =>
        pinIsValid(data.pin, organiser.salt, organiser.pinHash)
      );

      // Check the pin is valid for an organiser
      if (!user) {
        res.status(401).json({
          errors: [{ msg: "Invalid PIN." }],
        });
        return;
      }

      //check the organiser has editing rights
      if (!user.canEdit) {
        res.status(401).json({
          errors: [{ msg: "User does not have editing rights." }],
        });
        return;
      }

      // Get the session details
      const { loadUpdateSession } = require("./routes/loadUpdateSession");
      const session = await loadUpdateSession(link, data.id);

      // Respond with the session details
      res.json(session);
    } catch (error) {
      console.error(
        new Date().toISOString(),
        "loadUpdateSession error:",
        error
      );
      res.status(500).json({
        errors: [{ msg: "Failed to load session details: " + error.message }],
      });
    } finally {
      // Close the database connection
      if (link) await link.end();
    }
  }
);

/**
 * Route for updating an existing session.
 * Validates the request, updates the session in the database.
 *
 * @name post/updateSession
 * @function
 * @memberof module:routes/updateSession
 * @param {express.Request} req - The request object containing the updated session data.
 * @param {express.Response} res - The response object for sending back update success or error.
 */
router.post(
  "/updateSession",
  updateSessionRules,
  validateRequest,
  async (req, res) => {
    let link;
    try {
      // Get the validated and sanitized data
      const data = matchedData(req);

      // Open database connection
      link = await openDbConnection(dbConfig);

      const { getOrganisers, pinIsValid } = require("../utilities/index");
      const organisers = await getOrganisers(data.id, "feedback", link);
      const user = organisers.find((organiser) =>
        pinIsValid(data.pin, organiser.salt, organiser.pinHash)
      );

      // Check the pin is valid for an organiser
      if (!user) {
        res.status(401).json({
          errors: [{ msg: "Invalid PIN." }],
        });
        return;
      }

      //check the organiser has editing rights
      if (!user.canEdit) {
        res.status(401).json({
          errors: [{ msg: "User does not have editing rights." }],
        });
        return;
      }

      // Update session in the database
      const { updateSession } = require("./routes/updateSession");
      await updateSession(link, data, user);

      res.json("The session was updated.");
    } catch (error) {
      console.error(new Date().toISOString(), "updateSession error:", error);
      res.status(500).json({
        errors: [{ msg: "Failed to update session: " + error.message }],
      });
    } finally {
      // Close the database connection
      if (link) await link.end();
    }
  }
);

module.exports = router;
