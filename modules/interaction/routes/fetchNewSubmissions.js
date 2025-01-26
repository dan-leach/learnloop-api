/**
 * @module fetchNewSubmissions
 * @summary Loads submissions later than the previously latest loaded submission.
 *
 * @description This module returns submission with an ID greater than the lastSubmissionId provided with the request.
 * If there are no new submissions since the last check, an empty array is returned. If the request fails at any step,
 * an appropriate error message is returned.
 *
 * @requires ../../../config.json - Configuration file containing database table settings.
 *
 * @exports fetchNewSubmissions - Main function for loading new submissions.
 */

const config = require("../../../config.json");

/**
 * @async
 * @function fetchNewSubmissions
 * @memberof module:fetchNewSubmissions
 * @summary Retrieves submissions from the database.
 *
 * @param {object} link - The database connection object used to execute queries.
 * @param {object} data - The request data including the session ID, slideIndex and lastSubmissionId.
 * @returns {Promise<array>} - Resolves with the newSubmissions array (which may be empty).
 * @throws {Error} - Throws an error if the query fails.
 */
const fetchNewSubmissions = async (link, data) => {
  const [rows] = await link.execute(
    `SELECT * FROM ${config.interaction.tables.tblSubmissions} WHERE sessionId = ? AND slideIndex = ? AND id > ? AND active = ?`,
    [data.id, data.slideIndex, data.lastSubmissionId, true]
  );

  return rows;
};

module.exports = { fetchNewSubmissions };
