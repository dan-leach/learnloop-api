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
 * @requires router
 * @requires express-validator
 * @requires ./validate Rulesets and validation function for each route
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
      const { id, leadPin, sendMailFails } = await insertSession(link, data);

      // Respond with the session ID and lead organiser pin
      res.json({ id, leadPin, sendMailFails });
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

      // Check that the session isn't closed
      if (session.closed) {
        res.status(403).json({
          errors: [{ msg: "Session is closed." }],
        });
        return;
      }

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
      const sendMailFails = await updateSession(link, data, user);

      // Respond with a success message
      res.json({ message: "The session was updated.", sendMailFails });
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

/**
 * @async
 * @route POST /feedback/closeSession
 * @memberof module:feedback
 * @summary Closes a session based on the provided session ID and organiser's PIN.
 *
 * @description This route validates the incoming request, checks the provided organiser's PIN for validity,
 * verifies if the user has editing rights, and then closes the session in the database.
 * If the request fails at any step, an appropriate error message is returned.
 *
 * @requires ./validate - Module for defining validation rules and sanitizing request data.
 * @requires ../utilities/pinUtilities - Utility functions for validating PINs.
 * @requires ./routes/closeSession - Contains the logic for closing the session in the database and sending out emails to the organisers.
 * @requires ./routes/updateSession - Reuses getOldSessionDetails
 *
 * @param {object} req.body.data - The data containing the session ID and organiser's PIN.
 *
 * @returns {object} 200 - A success message indicating that the session was updated.
 * @returns {object} 401 - Error message if session has already been closed.
 * @returns {object} 401 - Error message if the PIN is invalid or the user lacks editing rights.
 * @returns {object} 500 - Error message if updating the session fails.
 */
router.post(
  "/closeSession",
  validate.loadUpdateSessionRules, // Middleware for validating update session request data
  validate.validateRequest, // Middleware for validating the request based on the rules
  async (req, res) => {
    let link; // Database connection variable
    try {
      // Get the validated and sanitized data from the request
      const data = matchedData(req);

      // Open a connection to the database
      link = await openDbConnection(dbConfig);

      // Retrieve session details from the database
      const updateSessionRoute = require("./routes/updateSession");
      const sessionDetails = await updateSessionRoute.getOldSessionDetails(
        data.id,
        link
      );

      // Check if the provided PIN is valid for any organiser
      const { pinIsValid } = require("../utilities/pinUtilities");
      const user = sessionDetails.organisers.find((organiser) =>
        pinIsValid(data.pin, organiser.salt, organiser.pinHash)
      );
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

      // Check if the session is a subsession
      if (sessionDetails.isSubsession) {
        res.status(400).json({
          errors: [{ msg: "Subsessions cannot be closed directly." }],
        });
        return;
      }

      // Check if the session is already closed
      if (sessionDetails.closed) {
        res.status(400).json({
          errors: [{ msg: "Session is already closed." }],
        });
        return;
      }

      // Close the session in the database
      const { closeSession } = require("./routes/closeSession");
      const sendMailFails = await closeSession(link, sessionDetails, user);

      // Respond with a success message
      res.json({ message: "The session was closed.", sendMailFails });
    } catch (error) {
      // Log the error with a timestamp for debugging
      console.error(new Date().toISOString(), "closeSession error:", error);

      // Send a 500 response with the error message
      res.status(500).json({
        errors: [{ msg: "Failed to close session: " + error.message }],
      });
    } finally {
      // Close the database connection if it was opened
      if (link) await link.end();
    }
  }
);

/**
 * @async
 * @route POST /feedback/resetPin
 * @memberof module:feedback
 * @summary Resets a session Pin for a given organiser
 *
 * @description This route validates the incoming request, checks the email matches an organiser for the given session ID,
 * then generates a new pin, updates the hash in the database and sends the new pin to the organiser by email.
 *
 * @requires ./validate - Module for defining validation rules and sanitizing request data.
 * @requires ../utilities/pinUtilities - Utility functions for validating PINs.
 * @requires ./routes/updateSession - Contains the logic for updating the session in the database and sending out emails to the organisers.
 *
 * @param {object} req.body.data - The data containing the session ID and organiser email.
 * @returns {object} 200 - A success message indicating that the pin was reset.
 * @returns {object} 401 - Error message if the session ID is not found or the email does not match an existing organiser.
 * @returns {object} 500 - Error message if updating the session fails.
 */
router.post(
  "/resetPin",
  validate.resetPinRules, // Middleware for validating update session request data
  validate.validateRequest, // Middleware for validating the request based on the rules
  async (req, res) => {
    let link; // Database connection variable
    try {
      // Get the validated and sanitized data from the request
      const data = matchedData(req);

      // Open a connection to the database
      link = await openDbConnection(dbConfig);

      // Retrieve session details from the database
      const updateSessionRoute = require("./routes/updateSession");
      const sessionDetails = await updateSessionRoute.getOldSessionDetails(
        data.id,
        link
      );

      // Import the function to update the session in the database
      const { resetPin } = require("./routes/resetPin");

      // Update the session with the provided data
      const sendMailFails = await resetPin(link, data, sessionDetails);

      // Respond with a success message
      res.json({
        message: "You pin was reset. Please check your inbox for your new pin.",
        sendMailFails,
      });
    } catch (error) {
      // Log the error with a timestamp for debugging
      console.error(new Date().toISOString(), "resetPin error:", error);

      // Send a 500 response with the error message
      res.status(500).json({
        errors: [{ msg: "Failed to reset pin: " + error.message }],
      });
    } finally {
      // Close the database connection if it was opened
      if (link) await link.end();
    }
  }
);

/**
 * @async
 * @route POST /feedback/updateNotificationPreferences
 * @memberof module:feedback
 * @summary Changes if an organiser has feedback submission notifications enabled.
 *
 * @description This route validates the incoming request, checks the provided organiser's PIN for validity,
 * then updates the notification settings for that organiser in the database.
 * If the request fails at any step, an appropriate error message is returned.
 *
 * @requires ./validate - Module for defining validation rules and sanitizing request data.
 * @requires ../utilities/pinUtilities - Utility functions for validating PINs.
 * @requires ./routes/updateNotificationPreferences - Contains the logic for updating the notification preferences in the database and sending an email to the organiser.
 * @requires ./routes/updateSession - Reuses getOldSessionDetails
 *
 * @param {object} req.body.data - The data containing the session ID and organiser's PIN.
 *
 * @returns {object} 200 - A success message indicating that the session was updated.
 * @returns {object} 401 - Error message if session has already been closed.
 * @returns {object} 401 - Error message if the PIN is invalid or the user lacks editing rights.
 * @returns {object} 500 - Error message if updating the session fails.
 */
router.post(
  "/updateNotificationPreferences",
  validate.updateNotificationPreferencesRules, // Middleware for validating notification preference update request data
  validate.validateRequest, // Middleware for validating the request based on the rules
  async (req, res) => {
    let link; // Database connection variable
    try {
      // Get the validated and sanitized data from the request
      const data = matchedData(req);

      // Open a connection to the database
      link = await openDbConnection(dbConfig);

      // Retrieve session details from the database
      const updateSessionRoute = require("./routes/updateSession");
      const sessionDetails = await updateSessionRoute.getOldSessionDetails(
        data.id,
        link
      );

      // Check if the provided PIN is valid for any organiser
      const { pinIsValid } = require("../utilities/pinUtilities");
      const organiserIndex = sessionDetails.organisers.findIndex((organiser) =>
        pinIsValid(data.pin, organiser.salt, organiser.pinHash)
      );
      const organiser = sessionDetails.organisers[organiserIndex];
      if (!organiser) {
        res.status(401).json({
          errors: [{ msg: "Invalid PIN." }],
        });
        return;
      }

      // Close the session in the database
      const {
        updateNotificationPreferences,
      } = require("./routes/updateNotificationPreferences");
      const sendMailFails = await updateNotificationPreferences(
        link,
        data,
        sessionDetails,
        organiserIndex
      );

      // Respond with a success message
      res.json({
        message: "Your notification preferences were updated.",
        sendMailFails,
      });
    } catch (error) {
      // Log the error with a timestamp for debugging
      console.error(
        new Date().toISOString(),
        "updateNotificationPreferences error:",
        error
      );

      // Send a 500 response with the error message
      res.status(500).json({
        errors: [
          {
            msg: "Failed to update notification preferences: " + error.message,
          },
        ],
      });
    } finally {
      // Close the database connection if it was opened
      if (link) await link.end();
    }
  }
);

/**
 * @async
 * @route POST /feedback/findMySessions
 * @memberof module:feedback
 * @summary Sends an email with a list of sessions for which that email is an organiser or facilitator.
 *
 * @description
 * This route allows a user to request an email with details of feedback sessions they are associated with
 * as an organiser or facilitator. It validates the provided email, checks the database
 * for sessions matching the criteria, and sends an email containing the session details.
 * If no matching sessions are found, the email indicates this with an appropriate message.
 *
 * @requires ./validate - Module for defining validation rules and sanitizing request data.
 * @requires ./routes/findMySessions
 *
 * @param {object} req.body.data - The data containing the email.
 *
 * @returns {object} 200 - A success message indicating that the email of sessions was sent.
 * @returns {object} 500 - Error message if the process fails.
 */
router.post(
  "/findMySessions",
  validate.findMySessionsRules, // Middleware for validating find my sessions request data
  validate.validateRequest, // Middleware for validating the request based on the rules
  async (req, res) => {
    let link; // Database connection variable
    try {
      // Get the validated and sanitized data from the request
      const data = matchedData(req);

      // Open a connection to the database
      link = await openDbConnection(dbConfig);

      // Find and send the sessions
      const { findMySessions } = require("./routes/findMySessions");
      const sendMailFails = await findMySessions(data.email, link);

      // Respond with a success message
      res.json({
        message: sendMailFails.length
          ? ""
          : "Please check your email for session details.",
        sendMailFails,
      });
    } catch (error) {
      // Log the error with a timestamp for debugging
      console.error(new Date().toISOString(), "findMySessions error:", error);

      // Send a 500 response with the error message
      res.status(500).json({
        errors: [
          {
            msg: "Failed to find sessions: " + error.message,
          },
        ],
      });
    } finally {
      // Close the database connection if it was opened
      if (link) await link.end();
    }
  }
);

/**
 * @async
 * @route POST /feedback/loadGiveFeedback
 * @memberof module:feedback
 * @summary Loads session deails based on the provided session ID.
 *
 * @description This route validates the incoming request and then retrieves the session details to populate the feedback form.
 * If the request fails at any step, an appropriate error message is returned.
 *
 * @requires ./validate - Module for defining validation rules and sanitizing request data.
 * @requires ./routes/loadGiveFeedback - Contains the logic for retreiving the session and any subsession details from the database.
 *
 * @param {object} req.body.data - The data containing the session ID.
 * @returns {object} 200 - The session details if successfully loaded.
 * @returns {object} 500 - Error message if loading session details fails.
 */
router.post(
  "/loadGiveFeedback",
  validate.loadGiveFeedbackRules, // Middleware for validating session load request data
  validate.validateRequest, // Middleware for validating the request based on the rules
  async (req, res) => {
    let link; // Database connection variable
    try {
      // Get the validated and sanitized data from the request
      const data = matchedData(req);

      // Open a connection to the database
      link = await openDbConnection(dbConfig);

      // Import the function to load the session details
      const { loadGiveFeedback } = require("./routes/loadGiveFeedback");

      // Get the session details based on the provided session ID
      const session = await loadGiveFeedback(link, data.id);

      // Check that the session isn't closed
      if (session.closed) {
        res.status(403).json({
          errors: [{ msg: "Session is closed." }],
        });
        return;
      }

      // Respond with the session details
      res.json(session);
    } catch (error) {
      // Log the error with a timestamp for debugging
      console.error(new Date().toISOString(), "loadGiveFeedback error:", error);

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
 * @route POST /feedback/giveFeedback
 * @memberof module:feedback
 * @summary Inserts a feedback submission for a given session.
 *
 * @description This route validates the incoming request, and inserts the feedback into the feedback database.
 * If the request fails at any step, an appropriate error message is returned.
 *
 * @requires ./validate - Module for defining validation rules and sanitizing request data.
 * @requires ./routes/loadGiveFeedback - Reused to check session is not closed.
 * @requires ./routes/giveFeedback - Contains the logic for inserting the feedback response in the database and sending out notifications.
 *
 * @param {object} req.body.data - The data containing the session ID and feedback submission details.
 * @returns {object} 200 - A success message indicating that the feedback was submitted.
 * @returns {object} 401 - Error message if the session is closed.
 * @returns {object} 500 - Error message if submitting the feedback fails.
 */
router.post(
  "/giveFeedback",
  validate.giveFeedbackRules, // Middleware for validating feedback submission data
  validate.validateRequest, // Middleware for validating the request based on the rules
  async (req, res) => {
    let link; // Database connection variable
    try {
      // Get the validated and sanitized data from the request
      const data = matchedData(req);

      // Open a connection to the database
      link = await openDbConnection(dbConfig);

      // Check that the session isn't closed
      const { loadGiveFeedback } = require("./routes/loadGiveFeedback");
      const session = await loadGiveFeedback(link, data.id);
      if (session.closed) {
        res.status(403).json({
          errors: [{ msg: "Session is closed." }],
        });
        return;
      }

      // Import the function to insert the feedback into the database and send notifications
      const { giveFeedback } = require("./routes/giveFeedback");

      // Insert the feedback and send notifications
      await giveFeedback(link, data, session);

      // Respond with a success message
      res.json({ message: "Your feedback was submitted." });
    } catch (error) {
      // Log the error with a timestamp for debugging
      console.error(new Date().toISOString(), "giveFeedback error:", error);

      // Send a 500 response with the error message
      res.status(500).json({
        errors: [{ msg: "Failed to submit feedback: " + error.message }],
      });
    } finally {
      // Close the database connection if it was opened
      if (link) await link.end();
    }
  }
);

module.exports = router;
