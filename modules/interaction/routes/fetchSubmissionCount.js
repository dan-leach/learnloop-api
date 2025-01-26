/**
 * @module fetchSubmissionCount
 * @summary Loads the count of submissions associated with a given session id.
 *
 * @requires ../../../config.json - Configuration file containing database table settings.
 *
 * @exports fetchSubmissionCount - Main function for loading submission count.
 */

const config = require("../../../config.json");

/**
 * @async
 * @function fetchSubmissionCount
 * @memberof module:fetchSubmissionCount
 * @summary Retrieves the count from the database.
 *
 * @param {object} link - The database connection object used to execute queries.
 * @param {object} data - Containing the session ID and the preview status
 * @returns {Promise<integer>} - Resolves with the count.
 * @throws {Error} - Throws an error if the query fails.
 */
const fetchSubmissionCount = async (link, data) => {
  const [rows] = await link.execute(
    `SELECT COUNT(*) AS submission_count FROM ${config.interaction.tables.tblSubmissions} WHERE sessionId = ? AND active = ? AND preview = ?`,
    [data.id, true, data.isPreview]
  );

  return rows[0].submission_count;
};

module.exports = { fetchSubmissionCount };
