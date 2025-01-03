/**
 * @module routeUtilities
 * @memberof module:LearnLoopAPI
 * @summary Module for handling route errors and other route level tasks.
 *
 * @requires ../utilities/dbUtilities Database link configuration and function for opening connection
 *
 * @exports router Object containing the different routes available in the feedback module
 */

/**
 * @function decodeObjectStrings
 * @summary Recursively decodes strings in an object, array, or string.
 * @description
 * This function traverses an object, array, or string and decodes any string values it encounters.
 * It skips decoding for the `date` property to avoid issues with non-string date parsing.
 *
 * @requires entities For decoding html entities
 *
 * @param {object|array|string} obj - The object, array, or string to decode.
 * @returns {object|array|string} - A new object, array, or string with decoded string values.
 */
function decodeObjectStrings(obj) {
  const { decode } = require("entities");
  if (typeof obj === "string") {
    return decode(obj);
  } else if (Array.isArray(obj)) {
    return obj.map(decodeObjectStrings);
  } else if (typeof obj === "object" && obj !== null) {
    const decodedObj = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        if (key === "date") {
          // Don't decode the date as it returns NaN
          decodedObj[key] = obj[key];
        } else {
          decodedObj[key] = decodeObjectStrings(obj[key]);
        }
      }
    }
    return decodedObj;
  }
  return obj; // Return non-string, non-object values as is
}

/**
 * @function handleError
 * @summary Handles and logs errors, optionally sending a response and alert email.
 * @description
 * Logs the error with a timestamp, sends an appropriate response to the client (either HTML or JSON),
 * and optionally emails a status 500 error report to the configured admin email.
 *
 * Errors should be thrown within route modules as --> throw Object.assign(new Error("My custom message"), { statusCode: 400 });
 * Or for status 500 can be just throw new Error("My custom message")
 *
 * @requires ../../config Config file including email for error message
 * @requires ../../utilities/mailUtilities - Utility for sending email error reports.
 *
 * @param {Error} error - The error object to handle.
 * @param {number} [statusCode=500] - The HTTP status code to send with the response.
 * @param {string} [route="undefinedRoute"] - The route where the error occurred.
 * @param {string} [routeMsg="API failed at unknown route"] - A custom message describing the error context.
 * @param {object} res - The Express.js response object for sending the error response.
 * @param {boolean} [returnHtml=false] - If true, sends the error message as HTML. Otherwise, sends JSON.
 * @throws {Error} - If email sending fails, this function may throw an error.
 */
function handleError(
  error,
  statusCode = 500,
  route = "undefinedRoute",
  routeMsg = "API failed at unknown route",
  res,
  returnHtml = false
) {
  // Log the error with a timestamp for debugging
  delete error.statusCode;
  const errorTime = new Date().toISOString();
  console.error(errorTime, `${route} ${statusCode}`, error);

  const config = require("../../config.json");

  let html = `
      <h1>Sorry, something went wrong</h1>
      <p>${routeMsg}: ${error.message}</p>
      <p>If this keeps happening please let me know by emailing <a href="mailto:${config.email}">${config.email}</a> including the message above and the exact time when the error occurred.</p>
    `;

  // Send response with the error message
  if (res) {
    if (returnHtml) {
      res.status(statusCode).send(html);
    } else {
      res.status(statusCode).json({
        errors: [{ msg: `${routeMsg}: ` + error.message }],
      });
    }
  }

  // Send email alert if unexpected error
  if (statusCode === 500) {
    html = `
        <p>route: ${route}<br>
        errorMessage: ${error.message}<br>
        errorTime: ${errorTime}</p>
      `;
    const mailUtilities = require("../utilities/mailUtilities");
    mailUtilities.sendMail(
      config.email,
      "LearnLoop status 500 error report",
      html
    );
  }
}

module.exports = { decodeObjectStrings, handleError };
