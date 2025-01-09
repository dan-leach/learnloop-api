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
 * @route POST /interaction/fetchDetailsHost
 * @memberof module:interaction
 * @summary Loads full session details for the host.
 *
 * @description This route validates the incoming request, checks the provided organiser's PIN for validity,
 * and then returns the session details from the database. If the request fails at any step, an appropriate error message is returned.
 *
 * @requires ./validate - Module for defining validation rules and sanitizing request data.
 * @requires ../utilities/pinUtilities - Utility functions for validating PINs.
 * @requires ./routes/fetchDetailsHost - Contains the logic for loading the session details.
 *
 * @param {object} req.body.data - The data containing the session ID and organiser's PIN.
 * @returns {object} 200 - The session details object.
 * @returns {object} 401 - Error message if the PIN is invalid.
 * @returns {object} 500 - Error message if retrieving the session details fails.
 */
router.post(
  "/fetchDetailsHost",
  validate.fetchDetailsHostRules, // Middleware for validating session request data
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
      const { fetchDetailsHost } = require("./routes/fetchDetailsHost");
      let sessionDetails = await fetchDetailsHost(link, data.id);

      // Return the session details
      sessionDetails = decodeObjectStrings(sessionDetails);
      res.json(sessionDetails);
    } catch (error) {
      handleError(
        error,
        error.statusCode,
        "interaction/fetchDetailsHost",
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

/**
 * @async
 * @route POST /interaction/fetchSubmissionCount
 * @memberof module:interaction
 * @summary Returns a count of the submissions associated with a particular interaction session id.
 *
 * @description This route validates the incoming request, checks the provided organiser's PIN for validity,
 * and then returns the submission count matching the given session id. If the request fails at any step,
 * an appropriate error message is returned.
 *
 * @requires ./validate - Module for defining validation rules and sanitizing request data.
 * @requires ../utilities/pinUtilities - Utility functions for validating PINs.
 * @requires ./routes/fetchSubmissionCount - Contains the logic for fetching the count.
 *
 * @param {object} req.body.data - The data containing the session ID and PIN.
 * @returns {integer} 200 - The submission count.
 * @returns {object} 401 - Error message if the PIN is invalid.
 * @returns {object} 500 - Error message if retrieving the count fails.
 */
router.post(
  "/fetchSubmissionCount",
  validate.fetchDetailsHostRules, // Middleware for validating fetch request data
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

      // Retrieve the submission count
      const { fetchSubmissionCount } = require("./routes/fetchSubmissionCount");
      let submissionCount = await fetchSubmissionCount(link, data.id);

      // Return the submission count
      res.json(submissionCount);
    } catch (error) {
      handleError(
        error,
        error.statusCode,
        "interaction/fetchSubmissionCount",
        "Failed to load submission count",
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
 * @route POST /interaction/fetchNewSubmissions
 * @memberof module:interaction
 * @summary Loads submissions later than the previously latest loaded submission.
 *
 * @description This route validates the incoming request, checks the provided organiser's PIN for validity,
 * and then returns the submissions with an ID greater than that provided with the request. If there are no new
 * submissions since the last check, an empty array is returned. If the request fails at any step, an appropriate
 * error message is returned.
 *
 * @requires ./validate - Module for defining validation rules and sanitizing request data.
 * @requires ../utilities/pinUtilities - Utility functions for validating PINs.
 * @requires ./routes/fetchNewSubmissions - Contains the logic for loading the submissions.
 *
 * @param {object} req.body.data - The data containing the session ID, PIN, slideIndex and lastSubmissionId.
 * @returns {array} 200 - An array of submissions.
 * @returns {object} 401 - Error message if the PIN is invalid.
 * @returns {object} 500 - Error message if retrieving the submissions fails.
 */
router.post(
  "/fetchNewSubmissions",
  validate.fetchNewSubmissionsRules, // Middleware for validating fetch request data
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

      // Retrieve the new submissions
      const { fetchNewSubmissions } = require("./routes/fetchNewSubmissions");
      let newSubmissions = await fetchNewSubmissions(link, data);

      // Return the new submissions
      newSubmissions = decodeObjectStrings(newSubmissions);
      res.json(newSubmissions);
    } catch (error) {
      handleError(
        error,
        error.statusCode,
        "interaction/fetchNewSubmissions",
        "Failed to load new submissions",
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
 * @route POST /interaction/fetchDetailsJoin
 * @memberof module:interaction
 * @summary Loads session details for attendees.
 *
 * @description This route validates the incoming request and then returns the session details from the database,
 * excluding the sensitive organiser details. If the request fails at any step, an appropriate error message is returned.
 *
 * @requires ./validate - Module for defining validation rules and sanitizing request data.
 * @requires ./routes/fetchDetailsHost - Contains the logic for loading the session details.
 *
 * @param {object} req.body.data - The data containing the session ID.
 * @returns {object} 200 - The session details object.
 * @returns {object} 500 - Error message if retrieving the session details fails.
 */
router.post(
  "/fetchDetailsJoin",
  validate.fetchDetailsJoinRules, // Middleware for validating session request data
  validate.validateRequest, // Middleware for validating the request based on the rules
  async (req, res) => {
    let link; // Database connection variable
    try {
      // Get the validated and sanitized data from the request
      const data = matchedData(req);

      // Open a connection to the database
      link = await openDbConnection(dbConfig);

      // Update the session with the provided data
      const { fetchDetailsHost } = require("./routes/fetchDetailsHost");
      let sessionDetails = await fetchDetailsHost(link, data.id);

      // Return the session details
      sessionDetails = decodeObjectStrings(sessionDetails);
      res.json(sessionDetails);
    } catch (error) {
      handleError(
        error,
        error.statusCode,
        "interaction/fetchDetailsJoin",
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
 * @route POST /interaction/fetchStatus
 * @memberof module:interaction
 * @summary Loads session status for attendees.
 *
 * @description This route validates the incoming request and then returns the session status from the database.
 * If the request fails at any step, an appropriate error message is returned.
 *
 * @requires ./validate - Module for defining validation rules and sanitizing request data.
 * @requires ./routes/fetchStatus - Contains the logic for loading the session status.
 *
 * @param {object} req.body.data - The data containing the session ID.
 * @returns {object} 200 - The session status object.
 * @returns {object} 500 - Error message if retrieving the session status fails.
 */
router.post(
  "/fetchStatus",
  validate.fetchDetailsJoinRules, // Middleware for validating session request data
  validate.validateRequest, // Middleware for validating the request based on the rules
  async (req, res) => {
    let link; // Database connection variable
    try {
      // Get the validated and sanitized data from the request
      const data = matchedData(req);

      // Open a connection to the database
      link = await openDbConnection(dbConfig);

      // Update the session with the provided data
      const { fetchStatus } = require("./routes/fetchStatus");
      let status = await fetchStatus(link, data.id);

      // Return the session details
      status = decodeObjectStrings(status);
      res.json(status);
    } catch (error) {
      handleError(
        error,
        error.statusCode,
        "interaction/fetchStatus",
        "Failed to load session status",
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
 * @route POST /interaction/insertSubmission
 * @memberof module:interaction
 * @summary Inserts a new submission.
 *
 * @description This route validates the incoming request and then inserts a new submission in the database.
 * If the request fails at any step, an appropriate error message is returned.
 *
 * @requires ./validate - Module for defining validation rules and sanitizing request data.
 * @requires ./routes/insertSubmission - Contains the logic for inserting the submission in the database.
 *
 * @param {object} req.body.data - The data containing the session ID, slideIndex and submission.
 * @returns {object} 200 - A success message indicating that the submission was inserted.
 * @returns {object} 500 - Error message if updating the session fails.
 */
router.post(
  "/insertSubmission",
  validate.insertSubmissionRules, // Middleware for validating update session request data
  validate.validateRequest, // Middleware for validating the request based on the rules
  async (req, res) => {
    let link; // Database connection variable
    try {
      // Get the validated and sanitized data from the request
      const data = matchedData(req);

      // Open a connection to the database
      link = await openDbConnection(dbConfig);

      // Update the session with the provided data
      const { insertSubmission } = require("./routes/insertSubmission");
      await insertSubmission(link, data);

      // Respond with a success message
      res.json({ message: "Response submitted" });
    } catch (error) {
      handleError(
        error,
        error.statusCode,
        "interaction/insertSubmission",
        "Failed to submit response",
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
 * @route POST /interaction/deactivateSubmissions
 * @memberof module:interaction
 * @summary Deactivates submissions for a given session id.
 *
 * @description This route validates the incoming request, checks the provided organiser's PIN for validity,
 * and then sets the active property of all associated submissions to false. This is used to clear the submission
 * history prior to reusing a session or when updating the session. If the request fails at any step, an
 * appropriate error message is returned.
 *
 * @requires ./validate - Module for defining validation rules and sanitizing request data.
 * @requires ../utilities/pinUtilities - Utility functions for validating PINs.
 * @requires ./routes/deactivateSubmissions - Contains the logic for deactivating the submissions in the database.
 *
 * @param {object} req.body.data - The data containing the session id and pin.
 * @returns {object} 200 - A success message indicating that the submissions were deactivated.
 * @returns {object} 401 - Error message if the PIN is invalid.
 * @returns {object} 500 - Error message if deactivation fails.
 */
router.post(
  "/deactivateSubmissions",
  validate.fetchDetailsHostRules, // Middleware for validating update request data
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
      const {
        deactivateSubmissions,
      } = require("./routes/deactivateSubmissions");
      await deactivateSubmissions(link, data);

      // Respond with a success message
      res.json({ message: "Submissions cleared" });
    } catch (error) {
      handleError(
        error,
        error.statusCode,
        "interaction/deactivateSubmissions",
        "Failed to clear submissions",
        res
      );
    } finally {
      // Close the database connection if it was opened
      if (link) await link.end();
    }
  }
);

/////////////////////////////////////////

const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Define storage settings for multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, "uploads/images");
    // Ensure the directory exists
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const extension = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${extension}`);
  },
});

// Set up multer
const upload = multer({
  storage,
  limits: { fileSize: 4 * 1024 * 1024 }, // Limit file size to 4MB
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

// Define the route
router.post("/uploadImage", upload.single("image"), (req, res) => {
  console.error("new uploadImage");
  if (!req.file) {
    return res.status(400).json({
      error: true,
      msg: "No file uploaded or file type not supported.",
    });
  }

  const filePath = `/uploads/images/${req.file.filename}`;
  res.status(200).json({
    error: false,
    msg: "Image uploaded successfully!",
    src: filePath,
  });
});

module.exports = router;
