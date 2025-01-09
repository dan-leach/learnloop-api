/**
 * @module fetchStatus
 * @summary Module for loading session status for attendees.
 *
 * @requires ../../../config.json - Configuration file containing database table settings.
 *
 * @exports fetchStatus - Main function for loading session status.
 */

const config = require("../../../config.json");

/**
 * @async
 * @function fetchStatus
 * @memberof module:fetchStatus
 * @summary Fetches the session status from the database.
 *
 * @param {object} link - The database connection object used to execute queries.
 * @param {string} id - The unique identifier of the session.
 * @returns {Promise<object>} - Resolves with the session status object.
 * @throws {Error} - Throws an error if the session status cannot be retrieved.
 */
const fetchStatus = async (link, id) => {
  const [rows] = await link.execute(
    `SELECT status FROM ${config.interaction.tables.tblSessions} WHERE id = ?`,
    [id]
  );

  if (rows.length > 0) {
    return JSON.parse(rows[0].status);
  }
  throw Object.assign(new Error("Session not found"), { statusCode: 400 });
};

module.exports = { fetchStatus };
