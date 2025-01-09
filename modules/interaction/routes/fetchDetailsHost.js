/**
 * @module fetchDetailsHost
 * @summary Module for loading session details prior to updates or when hosting a session.
 *
 * @description This module provides functionality for retrieving session details
 * from the database.
 *
 * @requires ../../../config.json - Configuration file containing database table settings.
 *
 * @exports fetchDetailsHost - Main function for loading session details.
 */

const config = require("../../../config.json");

/**
 * @async
 * @function fetchDetailsHost
 * @memberof module:fetchDetailsHost
 * @summary Fetches and processes a session's details.
 *
 * @description This function retrieves a session's details from the database and removes sensitive data before returning.
 *
 * @param {object} link - The database connection object used to execute queries.
 * @param {string} id - The unique identifier of the session to retrieve.
 * @returns {Promise<object>} - Resolves with the processed session object.
 * @throws {Error} - Throws an error if the session cannot be retrieved or processed.
 */
const fetchDetailsHost = async (link, id) => {
  const session = await selectSessionDetails(link, id);

  session.name = session.organisers[0].name;
  session.email = session.organisers[0].email;
  delete session.organisers;

  return session;
};

/**
 * @async
 * @function selectSessionDetails
 * @memberof module:fetchDetailsHost
 * @summary Retrieves session details from the database.
 *
 * @description Executes a SQL query to fetch session details by ID. Parses JSON fields for organisers,
 * slides, and status to create a structured session object.
 *
 * @param {object} link - The database connection object used to execute queries.
 * @param {string} id - The unique identifier of the session to retrieve.
 * @returns {Promise<object>} - Resolves with the session object.
 * @throws {Error} - Throws an error if the session cannot be found or the query fails.
 */
const selectSessionDetails = async (link, id) => {
  const [rows] = await link.execute(
    `SELECT * FROM ${config.interaction.tables.tblSessions} WHERE id = ?`,
    [id]
  );

  if (rows.length > 0) {
    const session = rows[0];

    ["organisers", "slides", "status"].forEach((field) => {
      if (session[field]) session[field] = JSON.parse(session[field]);
    });

    return session;
  }
  throw Object.assign(new Error("Session not found"), { statusCode: 400 });
};

module.exports = { fetchDetailsHost };
