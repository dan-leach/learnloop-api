/**
 * @module loadUpdateSession
 * @summary Module for loading session details prior to updates.
 *
 * @description This module provides functionality for retrieving session and subsession details
 * from the database, formatting data for consumption, and sanitizing sensitive organiser data.
 * It is used by both the session update and feedback modules.
 *
 * @requires ../../../config.json - Configuration file containing database table settings.
 * @requires ../../utilities/dateUtilities - Utilities for formatting date objects into string representations.
 *
 * @exports loadUpdateSession - Main function for loading session details for updates.
 * @exports selectSessionDetails - Helper function to retrieve session details.
 * @exports selectSubsessionDetails - Helper function to retrieve subsession details.
 */

const config = require("../../../config.json");
const dateUtilities = require("../../utilities/dateUtilities");

/**
 * @async
 * @function loadUpdateSession
 * @memberof module:loadUpdateSession
 * @summary Fetches and processes a session's details for updates.
 *
 * @description This function retrieves a session's details from the database, formats the session date,
 * fetches associated subsession details, and sanitizes organiser data by removing sensitive fields.
 *
 * @param {object} link - The database connection object used to execute queries.
 * @param {string} id - The unique identifier of the session to retrieve.
 * @returns {Promise<object>} - Resolves with the processed session object.
 * @throws {Error} - Throws an error if the session cannot be retrieved or processed.
 */
const loadUpdateSession = async (link, id) => {
  const session = await selectSessionDetails(link, id);
  session.date = dateUtilities.formatDateISO(session.date);

  const subsessionIDs = session.subsessions;
  session.subsessions = await selectSubsessionDetails(link, subsessionIDs);

  session.organisers = session.organisers.map(
    ({ pinHash, salt, lastSent, ...rest }) => rest
  );

  return session;
};

/**
 * @async
 * @function selectSessionDetails
 * @memberof module:loadUpdateSession
 * @summary Retrieves session details from the database.
 *
 * @description Executes a SQL query to fetch session details by ID. Parses JSON fields for subsessions,
 * questions, and organisers to create a structured session object.
 *
 * @param {object} link - The database connection object used to execute queries.
 * @param {string} id - The unique identifier of the session to retrieve.
 * @returns {Promise<object>} - Resolves with the session object.
 * @throws {Error} - Throws an error if the session cannot be found or the query fails.
 */
const selectSessionDetails = async (link, id) => {
  const [rows] = await link.execute(
    `SELECT * FROM ${config.feedback.tables.tblSessions} WHERE id = ?`,
    [id]
  );

  if (rows.length > 0) {
    const session = rows[0];
    ["subsessions", "questions", "organisers"].forEach((field) => {
      if (session[field]) session[field] = JSON.parse(session[field]);
    });
    return session;
  }
  throw Object.assign(new Error("Session not found"), { statusCode: 400 });
};

/**
 * @async
 * @function selectSubsessionDetails
 * @memberof module:loadUpdateSession
 * @summary Retrieves details for multiple subsessions.
 *
 * @description Takes an array of subsession IDs, fetches their details concurrently, and
 * processes each subsession by removing non-essential fields and extracting organiser information.
 *
 * @param {object} link - The database connection object used to execute queries.
 * @param {Array<string>} subsessionIDs - Array of unique identifiers for the subsessions to retrieve.
 * @returns {Promise<Array<object>>} - Resolves with an array of processed subsession objects.
 * @throws {Error} - Throws an error if subsession details cannot be fetched.
 */
const selectSubsessionDetails = async (link, subsessionIDs) => {
  const subsessions = await Promise.all(
    subsessionIDs.map((id) => selectSessionDetails(link, id))
  );

  const cleanedSubsessions = subsessions.map((subsession) => {
    const { email, notifications, lastSent } = subsession.organisers[0];
    const {
      organisers,
      attendance,
      certificate,
      closed,
      date,
      datetime,
      multipleDates,
      questions,
      subsessions,
      ...rest
    } = subsession;

    return { ...rest, email, notifications, lastSent };
  });

  return cleanedSubsessions;
};

module.exports = {
  loadUpdateSession,
  selectSessionDetails,
  selectSubsessionDetails,
};
