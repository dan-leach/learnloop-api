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
 * @param {string} id - The session ID.
 * @returns {Promise<integer>} - Resolves with the count.
 * @throws {Error} - Throws an error if the query fails.
 */
const fetchSubmissionCount = async (link, id) => {
  const [rows] = await link.execute(
    `SELECT COUNT(*) AS submission_count FROM ${config.interaction.tables.tblSubmissions} WHERE sessionId = ?`,
    [id]
  );

  return rows[0].submission_count;
};

module.exports = { fetchSubmissionCount };
