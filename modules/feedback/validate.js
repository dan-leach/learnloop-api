/**
 * @module validate
 * @memberof module:feedback
 * @summary Specifies validation rules and checks requests against these for feedback module routes.
 * @description
 * This module defines validation rules for various routes related to feedback session management,
 * specifically for inserting, loading, and updating session data. It utilizes the `express-validator`
 * library to enforce data integrity and ensure that all required fields meet specified criteria
 * before being processed by the application.
 *
 * @requires express-validator - Validation library for performing data validation and sanitization
 * @requires ../../config.json - Used to check question types match expected values
 * @requires ../utilities/routeUtilities Error handling
 *
 * @exports insertSessionRules - Ruleset for the insertSession route
 * @exports loadUpdateSessionRules - Ruleset for the loadUpdateSession route
 * @exports updateSessionRules - Ruleset for the updateSession route
 * @exports resetPinRules - Ruleset for the resetPin route
 * @exports updateNotificationPreferencesRules - Ruleset for the updateNotificationPreferences route
 * @exports loadGiveFeedback - Ruleset for the loadGiveFeedback route
 * @exports validateRequest - Function to perform the validation and sanitisation according to a given ruleset
 */

const { check, body, validationResult } = require("express-validator");
const config = require("../../config.json");
const { escape } = require("querystring");
const { handleError } = require("../utilities/routeUtilities");

/**
 * Validation rules for the insertSession route.
 * @type {Array}
 */
const insertSessionRules = [
  check("title")
    .notEmpty()
    .withMessage("Session title must be provided.")
    .isString()
    .withMessage("Session title field must be data type [string].")
    .escape(),

  check("name")
    .notEmpty()
    .withMessage("Facilitator name must be provided.")
    .isString()
    .withMessage("Session title field must be data type [string].")
    .escape(),

  check("multipleDates")
    .isBoolean()
    .withMessage("Multiple dates status field must be data type [boolean]."),

  check("date")
    .if(body("multipleDates").equals("true"))
    .equals("")
    .withMessage(
      "Session date must be blank if multiple dates status is true."
    ),

  check("date")
    .if(body("multipleDates").equals("false"))
    .isISO8601()
    .toDate()
    .withMessage("Session date is invalid date."),

  check("certificate")
    .isBoolean()
    .withMessage("Certificate status field must be data type [boolean]."),

  check("attendance")
    .isBoolean()
    .withMessage(
      "Attendance register status field must be data type [boolean]."
    )
    .if(body("certificate").equals("false"))
    .equals("false")
    .withMessage(
      "Attendance register cannot be enabled if certificate of attendance is disabled."
    ),

  check("notifications")
    .isBoolean()
    .withMessage("Notifications status field must be data type [boolean]."),

  //subsessions
  check("subsessions")
    .optional()
    .isArray()
    .withMessage("Subsessions field must be data type [array]."),

  check("subsessions.*.title")
    .notEmpty()
    .withMessage("Subsession title must be provided.")
    .isString()
    .withMessage("Subsession title field must be data type [string].")
    .escape(),

  check("subsessions.*.name")
    .notEmpty()
    .withMessage("Subsession facilitator name must be provided.")
    .isString()
    .withMessage(
      "Subsession facilitator name field must be data type [string]."
    )
    .escape(),

  check("subsessions.*.email")
    .optional({ checkFalsy: true })
    .isEmail()
    .withMessage(
      "Subsession facilitator email field (if provided) must be a valid email address format."
    ),

  //questions
  check("questions")
    .optional()
    .isArray()
    .withMessage("Custom questions field must be data type [array]."),

  check("questions.*.title")
    .notEmpty()
    .withMessage("Custom question title must be provided.")
    .isString()
    .withMessage("Custom question title field must be data type [string].")
    .escape(),

  check("questions.*.type")
    .notEmpty()
    .withMessage("Custom question type must be provided.")
    .isString()
    .withMessage("Custom question type field must be data type [string].")
    .bail()
    .custom((value) =>
      config.feedback.create.questions.types.hasOwnProperty(value)
    )
    .withMessage("Invalid question type provided.")
    .escape(),

  check("questions.*.options")
    .optional()
    .isArray()
    .withMessage("Custom question options field must be data type [array]."),

  check("questions.*.options.*.title")
    .notEmpty()
    .withMessage("Custom question option title must be provided.")
    .isString()
    .withMessage(
      "Custom question option title field must be data type [string]."
    )
    .escape(),

  check("questions.*.settings")
    .isObject()
    .withMessage("Custom question settings field must be data type [object]."),

  check("questions.*.settings.required")
    .isBoolean()
    .withMessage(
      "Custom question settings required field must be data type [boolean]."
    ),

  check("questions.*.settings.selectedLimit.min")
    .optional()
    .isInt({ min: 0 })
    .withMessage(
      "Custom question settings selected limit minimum must be a positive integer."
    ),

  check("questions.*.settings.selectedLimit.max")
    .optional()
    .isInt({ min: 0 })
    .withMessage(
      "Custom question settings selected limit maximum must be a positive integer."
    ),

  //organisers
  check("organisers")
    .optional()
    .isArray()
    .withMessage("Organisers field must be data type [array]."),

  check("organisers.*.name")
    .notEmpty()
    .withMessage("Organiser name must be provided.")
    .isString()
    .withMessage("Organiser name field must be data type [string].")
    .escape(),

  check("organisers.*.email")
    .isEmail()
    .withMessage("Organiser email field must be a valid email address format."),

  check("organisers.*.canEdit")
    .isBoolean()
    .withMessage(
      "Organiser can edit status field must be data type [boolean]."
    ),

  check("organisers.*.isLead")
    .isBoolean()
    .withMessage("Organiser is lead status field must be data type [boolean]."),
];

/**
 * Validation rules for the loadUpdateSession route.
 * @type {Array}
 */
const loadUpdateSessionRules = [
  check("id")
    .notEmpty()
    .withMessage("Session ID must be provided.")
    .isString()
    .withMessage("Session ID field must be data type [string].")
    .escape(),

  check("pin")
    .notEmpty()
    .withMessage("Pin must be provided.")
    .isNumeric()
    .withMessage("Pin field must be data type [number]."),
];

/**
 * Validation rules for the updateSession route.
 * @type {Array}
 */
const updateSessionRules = [...insertSessionRules, ...loadUpdateSessionRules];

/**
 * Validation rules for the resetPin route
 * @type {array}
 */
const resetPinRules = [
  check("id")
    .notEmpty()
    .withMessage("Session ID must be provided.")
    .isString()
    .withMessage("Session ID field must be data type [string].")
    .escape(),

  check("email")
    .isEmail()
    .withMessage("Organiser email field must be a valid email address format."),
];

/**
 * Validation rules for the findMySessions route
 * @type {array}
 */
const findMySessionsRules = [
  check("email")
    .isEmail()
    .withMessage("Email field must be a valid email address format."),
];

/**
 * Validation rules for the updateNotificationPreferences route.
 * @type {Array}
 */
const updateNotificationPreferencesRules = [
  ...loadUpdateSessionRules,

  check("notifications")
    .notEmpty()
    .withMessage("Notifications preference must be provided.")
    .isBoolean()
    .withMessage("Notifications preference field must by data type [boolean]"),
];

/**
 * Validation rules for the loadGiveFeedbackRules route.
 * @type {Array}
 */
const loadGiveFeedbackRules = [
  check("id")
    .notEmpty()
    .withMessage("Session ID must be provided.")
    .isString()
    .withMessage("Session ID field must be data type [string].")
    .escape(),
];

/**
 * Validation rules for the giveFeedback route.
 * @type {Array}
 */
const giveFeedbackRules = [
  check("id")
    .notEmpty()
    .withMessage("Session ID must be provided.")
    .isString()
    .withMessage("Session ID field must be data type [string].")
    .escape(),

  check("feedback")
    .optional()
    .isObject()
    .withMessage("Feedback field must be data type [object]."),

  check("feedback.positive")
    .notEmpty()
    .withMessage("Positive feedback must be provided.")
    .isString()
    .withMessage("Positive feedback field must be data type [string].")
    .escape(),

  check("feedback.negative")
    .notEmpty()
    .withMessage("Constructive feedback must be provided.")
    .isString()
    .withMessage("Constructive feedback field must be data type [string].")
    .escape(),

  check("feedback.score")
    .notEmpty()
    .withMessage("Score must be provided.")
    .isInt()
    .withMessage("Score field must be data type [integer]."),

  check("questions")
    .optional()
    .isArray()
    .withMessage("Questions field must be data type [array]."),

  check("questions.*.response")
    .optional()
    .isString()
    .withMessage("Question response must be data type [string].")
    .escape(),

  check("subsessions")
    .optional()
    .isArray()
    .withMessage("Subsessions field must be data type [array]."),

  check("subsessions.*.positive")
    .optional()
    .isString()
    .withMessage("Subsession positive feedback must be data type [string].")
    .escape(),

  check("subsessions.*.negative")
    .optional()
    .isString()
    .withMessage("Subsession constructive feedback must be data type [string].")
    .escape(),

  check("subsessions.*.score")
    .optional()
    .isInt()
    .withMessage("Subsession score must be data type [integer].")
    .escape(),
];

/**
 * Validation rules for the fetchCertificate route.
 * @type {Array}
 */
const fetchCertificateRules = [
  ...loadGiveFeedbackRules,

  check("attendee")
    .optional()
    .isObject()
    .withMessage("Attendee field must be data type [object]."),

  check("attendee.name")
    .notEmpty()
    .withMessage("Attendee name must be provided.")
    .isString()
    .withMessage("Attendee name field must be data type [string].")
    .escape(),

  check("attendee.region")
    .notEmpty()
    .withMessage("Attendee region must be provided.")
    .isString()
    .withMessage("Attendee region field must be data type [string].")
    .escape(),

  check("attendee.organisation")
    .notEmpty()
    .withMessage("Attendee organisation must be provided.")
    .isString()
    .withMessage("Attendee organisation field must be data type [string].")
    .escape(),
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
  insertSessionRules,
  loadUpdateSessionRules,
  updateSessionRules,
  resetPinRules,
  findMySessionsRules,
  updateNotificationPreferencesRules,
  loadGiveFeedbackRules,
  giveFeedbackRules,
  fetchCertificateRules,
  validateRequest,
};
