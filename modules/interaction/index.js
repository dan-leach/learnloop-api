/**
 * @module interaction
 * @memberof module:LearnLoopAPI
 * @summary Module for handling interaction-related routes in the application.
 *
 * @requires express
 * @requires router
 * @requires express-validator
 * @requires ./validate Rulesets and validation function for each route
 *
 * @exports router Object containing the different routes available in the feedback module
 */

const express = require("express");
const router = express.Router();
const { matchedData } = require("express-validator");
const validate = require("./validate");
const { dbConfig, openDbConnection } = require("../utilities/dbUtilities");
const {
  handleError,
  decodeObjectStrings,
} = require("../utilities/routeUtilities");

/**
 * @async
 * @route POST /interaction/interest
 * @memberof module:interaction
 * @summary Inserts an interested party's email into the db table.
 *
 * @requires ./validate - Module for defining validation rules and sanitizing request data.
 */
router.post(
  "/interest",
  validate.interestRules, // Middleware for validating data
  validate.validateRequest, // Middleware for validating the request based on the rules
  async (req, res) => {
    let link; // Database connection variable
    try {
      // Get the validated and sanitized data from the request
      const { email } = matchedData(req);

      // Open a connection to the database
      link = await openDbConnection(dbConfig);

      await link.execute(
        `INSERT INTO tbl_interaction_interest (email) VALUES (?)`,
        [email]
      );

      // Respond with the session ID and lead organiser pin
      res.json({
        message:
          "Thanks for your interest. I'll let you know when LearnLoop Interaction is available or needs beta-testers.",
      });
    } catch (error) {
      handleError(
        error,
        error.statusCode,
        "interaction/interest",
        "Failed to register email on interest list",
        res
      );
    } finally {
      // Close the database connection if it was opened
      if (link) await link.end();
    }
  }
);

/**
 * @async
 * @route POST /interaction/insertSession
 * @memberof module:interaction
 * @summary Inserts a new session into the database.
 *
 * @description This route validates the incoming request, creates a new session in the database using the provided data,
 * and returns the session ID and pin. If the request fails, an error message is returned.
 *
 * @requires ./validate - Module for defining validation rules and sanitizing request data.
 * @requires ./routes/insertSession - Contains the logic for inserting the session into the database and sending out email to the organiser.
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

      // Insert session into the database and get the session ID and lead pin
      const { insertSession } = require("./routes/insertSession");
      const { id, pin, emailOutcome } = await insertSession(link, data);

      // Respond with the session ID and lead organiser pin
      res.json({ id, pin, emailOutcome });
    } catch (error) {
      handleError(
        error,
        error.statusCode,
        "interaction/insertSession",
        "Failed to create session",
        res
      );
    } finally {
      // Close the database connection if it was opened
      if (link) await link.end();
    }
  }
);

/**
 * @async
 * @route POST /interaction/updateSession
 * @memberof module:interaction
 * @summary Updates session details based on the provided session ID and PIN.
 *
 * @description This route validates the incoming request, checks the provided organiser's PIN for validity,
 * and then updates the session in the database. If the request fails at any step, an appropriate error message is returned.
 *
 * @requires ./validate - Module for defining validation rules and sanitizing request data.
 * @requires ../utilities/pinUtilities - Utility functions for validating PINs.
 * @requires ./routes/updateSession - Contains the logic for updating the session in the database and sending out emails to the organisers.
 *
 * @param {object} req.body.data - The data containing the session ID, updated details, and organiser's PIN.
 * @returns {object} 200 - A success message indicating that the session was updated.
 * @returns {object} 401 - Error message if the PIN is invalid.
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

      // Retrieve organiser associated with the session ID
      let organiser = (await getOrganisers(data.id, "interaction", link))[0];

      // Check if the provided PIN is valid for any organiser
      if (!pinIsValid(data.pin, organiser.salt, organiser.pinHash)) {
        throw Object.assign(new Error("Invalid PIN"), { statusCode: 401 });
      }

      // Update the session with the provided data
      const { updateSession } = require("./routes/updateSession");
      await updateSession(link, data);

      // Respond with a success message
      res.json({ message: "The session was updated" });
    } catch (error) {
      handleError(
        error,
        error.statusCode,
        "interaction/updateSession",
        "Failed to update session",
        res
      );
    } finally {
      // Close the database connection if it was opened
      if (link) await link.end();
    }
  }
);

/**
 * @async
 * @route POST /interaction/loadDetailsHost
 * @memberof module:interaction
 * @summary Loads full session details for the host.
 *
 * @description This route validates the incoming request, checks the provided organiser's PIN for validity,
 * and then returns the session details from the database. If the request fails at any step, an appropriate error message is returned.
 *
 * @requires ./validate - Module for defining validation rules and sanitizing request data.
 * @requires ../utilities/pinUtilities - Utility functions for validating PINs.
 * @requires ./routes/loadDetailsHost - Contains the logic for loading the session details.
 *
 * @param {object} req.body.data - The data containing the session ID and organiser's PIN.
 * @returns {object} 200 - A success message indicating that the session was updated.
 * @returns {object} 401 - Error message if the PIN is invalid.
 * @returns {object} 500 - Error message if updating the session fails.
 */
router.post(
  "/loadDetailsHost",
  validate.loadDetailsHostRules, // Middleware for validating update session request data
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

      // Retrieve organiser associated with the session ID
      let organiser = (await getOrganisers(data.id, "interaction", link))[0];

      // Check if the provided PIN is valid for any organiser
      if (!pinIsValid(data.pin, organiser.salt, organiser.pinHash)) {
        throw Object.assign(new Error("Invalid PIN"), { statusCode: 401 });
      }

      // Update the session with the provided data
      const { loadDetailsHost } = require("./routes/loadDetailsHost");
      let sessionDetails = await loadDetailsHost(link, data.id);

      // Return the session details
      sessionDetails = decodeObjectStrings(sessionDetails);
      res.json(sessionDetails);
    } catch (error) {
      handleError(
        error,
        error.statusCode,
        "interaction/loadDetailsHost",
        "Failed to load session details",
        res
      );
    } finally {
      // Close the database connection if it was opened
      if (link) await link.end();
    }
  }
);

/**
 * @async
 * @route POST /interaction/updateStatus
 * @memberof module:interaction
 * @summary Updates session status.
 *
 * @description This route validates the incoming request, checks the provided organiser's PIN for validity,
 * and then updates the session status in the database. If the request fails at any step, an appropriate error message is returned.
 *
 * @requires ./validate - Module for defining validation rules and sanitizing request data.
 * @requires ../utilities/pinUtilities - Utility functions for validating PINs.
 * @requires ./routes/updateStatus - Contains the logic for updating the session in the database and sending out emails to the organisers.
 *
 * @param {object} req.body.data - The data containing the session ID, status, and organiser's PIN.
 * @returns {object} 200 - A success message indicating that the session was updated.
 * @returns {object} 401 - Error message if the PIN is invalid.
 * @returns {object} 500 - Error message if updating the session fails.
 */
router.post(
  "/updateStatus",
  validate.updateStatusRules, // Middleware for validating update session request data
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

      // Retrieve organiser associated with the session ID
      let organiser = (await getOrganisers(data.id, "interaction", link))[0];

      // Check if the provided PIN is valid for any organiser
      if (!pinIsValid(data.pin, organiser.salt, organiser.pinHash)) {
        throw Object.assign(new Error("Invalid PIN"), { statusCode: 401 });
      }

      // Update the session with the provided data
      const { updateStatus } = require("./routes/updateStatus");
      await updateStatus(link, data.id, data.status);

      // Respond with a success message
      res.json({ message: "Session status updated" });
    } catch (error) {
      handleError(
        error,
        error.statusCode,
        "interaction/updateStatus",
        "Failed to update session status",
        res
      );
    } finally {
      // Close the database connection if it was opened
      if (link) await link.end();
    }
  }
);

module.exports = router;
