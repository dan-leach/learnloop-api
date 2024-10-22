/**
 * @module feedback
 * @memberof module:LearnLoopAPI
 * @summary Module for handling feedback-related routes in the application.
 *
 * @description This module contains the Express router and middleware for managing feedback sessions, including
 * inserting new sessions, loading existing session details for updates, and updating session
 * information. Each route includes request validation and sanitization to ensure data integrity.
 * The module interacts with a MySQL database to store and retrieve session data. It also includes
 * utility functions for validating organiser PINs and checking user permissions for editing sessions.
 *
 * @requires express
 * @requires express-validator
 * @requires ../utilities/dbUtilities Database link configuration and function for opening connection
 *
 * @exports router Object containing the different routes available in the feedback module
 */

const express = require("express");
const router = express.Router();
const { matchedData } = require("express-validator");
const validate = require("./validate");
const { dbConfig, openDbConnection } = require("../utilities/dbUtilities");

/**
 * @async
 * @route POST /feedback/insertSession
 * @memberof module:feedback
 * @summary Inserts a new session into the database.
 *
 * @description This route validates the incoming request, creates a new session in the database using the provided data,
 * and returns the session ID along with the lead organiser pin. If the request fails, an error message is returned.
 *
 * @requires ./validate - Module for defining validation rules and sanitizing request data.
 * @requires ./routes/insertSession - Contains the logic for inserting the session into the database and sending out emails to the organisers.
 *
 * @param {object} req.body.data - The data for the new session to be created.
 * @returns {object} 200 - An object containing the ID of the newly created session and the lead organiser pin.
 * @returns {object} 500 - An error message if the session creation fails.
 */
router.post(
  "/insertSession",
  validate.insertSessionRules, // Middleware for validating session data
  validate.validateRequest, // Middleware for validating the request based on the rules
  async (req, res) => {
    let link; // Database connection variable
    try {
      // Get the validated and sanitized data from the request
      const data = matchedData(req);

      // Open a connection to the database
      link = await openDbConnection(dbConfig);

      // Import the function to insert the session into the database
      const { insertSession } = require("./routes/insertSession");

      // Insert session into the database and get the session ID and lead pin
      const { id, leadPin } = await insertSession(link, data);

      // Respond with the session ID and lead organiser pin
      res.json({ id, leadPin });
    } catch (error) {
      // Log the error with a timestamp for debugging
      console.error(new Date().toISOString(), "insertSession error:", error);

      // Send a 500 response with the error message
      res.status(500).json({
        errors: [{ msg: "Failed to create session: " + error.message }],
      });
    } finally {
      // Close the database connection if it was opened
      if (link) await link.end();
    }
  }
);

/**
 * @async
 * @route POST /feedback/loadUpdateSession
 * @memberof module:feedback
 * @summary Loads session deails based on the provided session ID and validates the organiser's PIN.
 *
 * @description This route validates the incoming request, checks the provided organiser's PIN for validity,
 * verifies if the user has editing rights, and then retrieves the session details for updating.
 * If the request fails at any step, an appropriate error message is returned.
 *
 * @requires ./validate - Module for defining validation rules and sanitizing request data.
 * @requires ../utilities/pinUtilities - Utility functions for validating PINs.
 * @requires ./routes/loadUpdateSession - Contains the logic for retreiving the session and any subsession details from the database.
 *
 * @param {object} req.body.data - The data containing the session ID and organiser's PIN.
 * @returns {object} 200 - The session details if successfully loaded.
 * @returns {object} 401 - Error message if the PIN is invalid or the user lacks editing rights.
 * @returns {object} 500 - Error message if loading session details fails.
 */
router.post(
  "/loadUpdateSession",
  validate.loadUpdateSessionRules, // Middleware for validating session load request data
  validate.validateRequest, // Middleware for validating the request based on the rules
  async (req, res) => {
    let link; // Database connection variable
    try {
      // Get the validated and sanitized data from the request
      const data = matchedData(req);

      // Open a connection to the database
      link = await openDbConnection(dbConfig);

      // Import utility functions for getting organisers and validating PINs
      const {
        getOrganisers,
        pinIsValid,
      } = require("../utilities/pinUtilities");

      // Retrieve organisers associated with the session ID
      const organisers = await getOrganisers(data.id, "feedback", link);

      // Check if the provided PIN is valid for any organiser
      const user = organisers.find((organiser) =>
        pinIsValid(data.pin, organiser.salt, organiser.pinHash)
      );

      // Check if the PIN is valid for an organiser
      if (!user) {
        res.status(401).json({
          errors: [{ msg: "Invalid PIN." }],
        });
        return;
      }

      // Check if the organiser has editing rights
      if (!user.canEdit) {
        res.status(401).json({
          errors: [{ msg: "User does not have editing rights." }],
        });
        return;
      }

      // Import the function to load the session details
      const { loadUpdateSession } = require("./routes/loadUpdateSession");

      // Get the session details based on the provided session ID
      const session = await loadUpdateSession(link, data.id);

      // Respond with the session details
      res.json(session);
    } catch (error) {
      // Log the error with a timestamp for debugging
      console.error(
        new Date().toISOString(),
        "loadUpdateSession error:",
        error
      );

      // Send a 500 response with the error message
      res.status(500).json({
        errors: [{ msg: "Failed to load session details: " + error.message }],
      });
    } finally {
      // Close the database connection if it was opened
      if (link) await link.end();
    }
  }
);

/**
 * @async
 * @route POST /feedback/updateSession
 * @memberof module:feedback
 * @summary Updates session details based on the provided session ID and organiser's PIN.
 *
 * @description This route validates the incoming request, checks the provided organiser's PIN for validity,
 * verifies if the user has editing rights, and then updates the session in the database.
 * If the request fails at any step, an appropriate error message is returned.
 *
 * @requires ./validate - Module for defining validation rules and sanitizing request data.
 * @requires ../utilities/pinUtilities - Utility functions for validating PINs.
 * @requires ./routes/updateSession - Contains the logic for updating the session in the database and sending out emails to the organisers.
 *
 * @param {object} req.body.data - The data containing the session ID, updated details, and organiser's PIN.
 * @returns {object} 200 - A success message indicating that the session was updated.
 * @returns {object} 401 - Error message if the PIN is invalid or the user lacks editing rights.
 * @returns {object} 500 - Error message if updating the session fails.
 */
router.post(
  "/updateSession",
  validate.updateSessionRules, // Middleware for validating update session request data
  validate.validateRequest, // Middleware for validating the request based on the rules
  async (req, res) => {
    let link; // Database connection variable
    try {
      // Get the validated and sanitized data from the request
      const data = matchedData(req);

      // Open a connection to the database
      link = await openDbConnection(dbConfig);

      // Import utility functions for getting organisers and validating PINs
      const {
        getOrganisers,
        pinIsValid,
      } = require("../utilities/pinUtilities");

      // Retrieve organisers associated with the session ID
      const organisers = await getOrganisers(data.id, "feedback", link);

      // Check if the provided PIN is valid for any organiser
      const user = organisers.find((organiser) =>
        pinIsValid(data.pin, organiser.salt, organiser.pinHash)
      );

      // Check if the PIN is valid for an organiser
      if (!user) {
        res.status(401).json({
          errors: [{ msg: "Invalid PIN." }],
        });
        return;
      }

      // Check if the organiser has editing rights
      if (!user.canEdit) {
        res.status(401).json({
          errors: [{ msg: "User does not have editing rights." }],
        });
        return;
      }

      // Import the function to update the session in the database
      const { updateSession } = require("./routes/updateSession");

      // Update the session with the provided data
      await updateSession(link, data, user);

      // Respond with a success message
      res.json("The session was updated.");
    } catch (error) {
      // Log the error with a timestamp for debugging
      console.error(new Date().toISOString(), "updateSession error:", error);

      // Send a 500 response with the error message
      res.status(500).json({
        errors: [{ msg: "Failed to update session: " + error.message }],
      });
    } finally {
      // Close the database connection if it was opened
      if (link) await link.end();
    }
  }
);

module.exports = router;
