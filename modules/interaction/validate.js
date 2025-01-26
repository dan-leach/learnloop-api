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

/**
 * Validation rules for the interest route
 * @type {array}
 */
const interestRules = [
  check("email")
    .isEmail()
    .withMessage("Email field must be a valid email address format."),
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
      res,
      false,
      [JSON.stringify(req.body)]
    );
  }
};

module.exports = {
  interestRules,
  validateRequest,
};
