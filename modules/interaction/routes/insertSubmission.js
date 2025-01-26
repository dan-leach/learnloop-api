/**
 * @module insertSubmission
 * @memberof module:interaction
 * @summary Handles the insertion of attendee submissions.
 *
 * @requires ../../../config.json - Configuration settings for the application.
 *
 * @exports insertSubmission - Core function for this module.
 */

const config = require("../../../config.json");

/**
 * @async
 * @function insertSubmission
 * @memberof module:insertSubmission
 * @summary Inserts a attendee submission into the database.
 *
 * @param {object} link - The database connection object for executing queries.
 * @param {object} data - The submission data including session id, slideIndex, response string and preview status.
 * @returns {Promise<boolean>} - Returns true if the insertion is successful.
 * @throws {Error} - Throws an error if the database connection is invalid or if the insertion fails.
 */
const insertSubmission = async (link, data) => {
  if (!link) {
    throw new Error("Database connection failed");
  }

  const query = `INSERT INTO ${config.interaction.tables.tblSubmissions} 
        (sessionId, slideIndex, response, active, preview) 
        VALUES (?, ?, ?, ?, ?)`;

  await link.execute(query, [
    data.id,
    data.slideIndex,
    data.response,
    true,
    data.isPreview,
  ]);

  return true;
};

module.exports = { insertSubmission };
