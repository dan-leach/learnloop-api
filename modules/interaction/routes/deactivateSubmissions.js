/**
 * @module deactivateSubmissions
 * @memberof module:interaction
 * @summary Marks submissions associated with a session id as deactivated.
 *
 * @requires ../../../config.json - Configuration file containing database table
 * settings for submission deactivation.
 *
 * @exports deactivateSubmissions Core function for the module
 */

const config = require("../../../config.json");

/**
 * @async
 * @function deactivateSubmissions
 * @memberof module:deactivateSubmissions
 * @summary Sets the active parameter for old submissions to false.
 *
 * @param {Object} link - The MySQL connection object used to execute queries.
 * @param {string} id - The session ID for which submissions are to be deactivated.
 * @returns {Promise<void>} - Resolves when the submissions have been deactivated in the database.
 * @throws {Error} - Throws an error if the query execution fails.
 */
const deactivateSubmissions = async (link, id) => {
  // Execute the query with the provided id
  await link.execute(
    `UPDATE ${config.interaction.tables.tblSubmissions} SET active = ? WHERE sessionId = ? AND active = ?`,
    [false, id, true]
  );
};

module.exports = {
  deactivateSubmissions,
};
