/**
 * @module validate
 * @memberof module:interaction
 * @summary Specifies validation rules and checks requests against these for interaction module routes.
 * @description
 * This module defines validation rules for various routes related to interaction session management.
 * It utilizes the `express-validator` library to enforce data integrity and ensure that all required
 * fields meet specified criteria before being processed by the application.
 *
 * @requires express-validator - Validation library for performing data validation and sanitization
 * @requires ../utilities/routeUtilities Error handling
 *
 * @exports interestRules - Ruleset for the interest route
 */

const { check, validationResult } = require("express-validator");
const { handleError } = require("../utilities/routeUtilities");
const { escape } = require("mysql");

/**
 * Validation rules for the interest route
 * @type {array}
 */
const interestRules = [
  check("email")
    .isEmail()
    .withMessage("Email field must be a valid email address format."),
];

/**
 * Validation rules for the insertSession route
 * @type {array}
 */
const insertSessionRules = [
  check("title")
    .notEmpty()
    .withMessage("Session title must be provided.")
    .isString()
    .withMessage("Session title field must be data type [string].")
    .escape(),

  check("feedbackId")
    .optional()
    .isString()
    .withMessage("Feedback ID field (if provided) must be data type [string].")
    .escape(),

  check("name")
    .notEmpty()
    .withMessage("Facilitator name must be provided.")
    .isString()
    .withMessage("Session title field must be data type [string].")
    .escape(),

  check("email")
    .isEmail()
    .withMessage("Email field must be a valid email address format."),
];

/**
 * Validation rules for the updateSession route
 * @type {array}
 */
const updateSessionRules = [
  check("id")
    .isString()
    .withMessage("ID field must be data type [string].")
    .escape(),

  check("pin").isInt().withMessage("PIN field must be data type [integer]."),

  check("title")
    .notEmpty()
    .withMessage("Session title must be provided.")
    .isString()
    .withMessage("Session title field must be data type [string].")
    .escape(),

  check("feedbackId")
    .optional()
    .isString()
    .withMessage("Feedback ID field (if provided) must be data type [string].")
    .escape(),

  check("name")
    .notEmpty()
    .withMessage("Facilitator name must be provided.")
    .isString()
    .withMessage("Session title field must be data type [string].")
    .escape(),

  check("email")
    .isEmail()
    .withMessage("Email field must be a valid email address format."),

  check("slides")
    .isArray()
    .withMessage("Slides field must be data type [array]."),

  check("slides.*.type")
    .notEmpty()
    .withMessage("Slide type must be provided.")
    .isString()
    .withMessage("Slide type field must be data type [string].")
    .escape(),

  check("slides.*.prompt")
    .notEmpty()
    .withMessage("Slide prompt must be provided.")
    .isString()
    .withMessage("Slide prompt field must be data type [string].")
    .escape(),

  check("slides.*.content")
    .isObject()
    .withMessage("Slide content field must be data type [object]."),

  check("slides.*.interaction")
    .isObject()
    .withMessage("Slide interaction field must be data type [object]."),
];

/**
 * Validation rules for the fetchDetailsHost route
 * @type {array}
 */
const fetchDetailsHostRules = [
  check("id")
    .isString()
    .withMessage("ID field must be data type [string].")
    .escape(),

  check("pin").isInt().withMessage("PIN field must be data type [integer]."),
];

/**
 * Validation rules for the updateStatus route
 * @type {array}
 */
const updateStatusRules = [
  check("id")
    .isString()
    .withMessage("ID field must be data type [string].")
    .escape(),

  check("pin").isInt().withMessage("PIN field must be data type [integer]."),

  check("status")
    .isObject()
    .withMessage("Status field must be data type [object]."),
];

/**
 * Validation rules for the fetchNewSubmissions route
 * @type {array}
 */
const fetchNewSubmissionsRules = [
  check("id")
    .isString()
    .withMessage("ID field must be data type [string].")
    .escape(),

  check("pin").isInt().withMessage("PIN field must be data type [integer]."),

  check("slideIndex")
    .isInt()
    .withMessage("Slide index field must be data type [integer]."),

  check("lastSubmissionId")
    .isInt()
    .withMessage("Last submission ID field must be data type [integer]."),
];

/**
 * Validation rules for the fetchDetailsJoin route
 * @type {array}
 */
const fetchDetailsJoinRules = [
  check("id")
    .isString()
    .withMessage("ID field must be data type [string].")
    .escape(),
];

/**
 * Validation rules for the insertSubmission route
 * @type {array}
 */
const insertSubmissionRules = [
  check("id")
    .isString()
    .withMessage("ID field must be data type [string].")
    .escape(),

  check("slideIndex")
    .isInt()
    .withMessage("Slide index field must be data type [integer]."),

  check("response").exists().withMessage("Response cannot be empty.").escape(),
];

// Middleware function to validate the request
const validateRequest = (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  } catch (error) {
    handleError(
      error,
      500,
      "validateRequest",
      "Failed to validate request",
      res
    );
  }
};

module.exports = {
  interestRules,
  insertSessionRules,
  updateSessionRules,
  fetchDetailsHostRules,
  updateStatusRules,
  fetchNewSubmissionsRules,
  fetchDetailsJoinRules,
  insertSubmissionRules,
  validateRequest,
};
