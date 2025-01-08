/**
 * @module updateStatus
 * @memberof module:interaction
 * @summary Module for updating the session status.
 *
 * @description This module facilitates the updating of session status which is used to keep
 * attendee devices syncronised with the host presentation, lock slides and other functions
 *
 * @requires ../../../config.json - Configuration file containing database table
 * settings.
 *
 * @exports updateStatus Core function for the module
 */

const config = require("../../../config.json");

/**
 * @async
 * @function updateStatus
 * @memberof module:updateStatus
 * @summary Updates a session's status in the database.
 *
 * @param {Object} link - The MySQL connection object used to execute queries.
 * @param {string} id - The session ID.
 * @param {Object} status - The status data to be updated.
 * @returns {Promise<void>} - Resolves when the session status has been successfully updated in the database.
 * @throws {Error} - Throws an error if the query execution fails.
 */
const updateStatus = async (link, id, status) => {
  // Construct the update query for modifying session details
  const query = `UPDATE ${config.interaction.tables.tblSessions} SET 
                  status = ?
                  WHERE id = ?`;

  // Execute the query with the provided session data and subsession IDs
  await link.execute(query, [status, id]);
};

module.exports = {
  updateStatus,
};
