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
const { handleError } = require("../utilities/routeUtilities");

/**
 * @async
 * @route POST /feedback/interest
 * @memberof module:interest
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

module.exports = router;
