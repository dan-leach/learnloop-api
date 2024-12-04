/**
 * @module loadUpdateSession
 * @memberof module:feedback
 * @summary Module for loading the session details prior to an update being performed.
 *
 * @description This module contains the logic for returning the details for feedback session prior to
 * a user performing an update.
 *
 * @requires ../../../config.json - Configuration file containing database table
 * settings for session data retrieval.
 * @requires ../../utilities/dateUtilities - Utilities for formatting date objects into various string representations.
 *
 * @exports loadUpdateSession Core function for the module
 * @exports selectSessionDetails Reused by loadGiveFeedback and viewFeedback route
 * @exports selectSubsessionDetails Reused by loadGiveFeedback and viewFeedback route
 */

const config = require("../../../config.json");
const dateUtilities = require("../../utilities/dateUtilities");

/**
 * @async
 * @function loadUpdateSession
 * @memberof module:loadUpdateSession
 * @summary Loads the details of a specific session, including its subsessions.
 *
 * @description This function retrieves the session details from the database, formats the date
 * to ISO format, and fetches any related subsession details. It also sanitizes the
 * organiser data by removing authentication data before returning the session object.
 *
 * @param {object} link - Database connection for executing queries.
 * @param {string} id - The unique identifier of the session to be loaded.
 * @returns {Promise<object>} - The session object containing details and subsessions.
 * @throws {Error} - Throws an error if the session cannot be retrieved.
 */
const loadUpdateSession = async (link, id) => {
  try {
    // Retrieve session details from the database
    const session = await selectSessionDetails(link, id);

    // Format the session date to ISO format
    session.date = dateUtilities.formatDateISO(session.date);

    // Extract subsession IDs from the session
    const subsessionIDs = session.subsessions;

    // Retrieve details for each subsession
    session.subsessions = await selectSubsessionDetails(link, subsessionIDs);

    // Remove non-required properties from the organiser data
    session.organisers = session.organisers.map(
      ({ pinHash, salt, lastSent, ...rest }) => rest // Destructure and retain only the needed properties
    );

    return session; // Return the cleaned-up session object
  } catch (error) {
    throw error; // Rethrow the error for handling by the caller
  }
};

/**
 * @async
 * @function selectSessionDetails
 * @memberof module:loadUpdateSession
 * @summary Retrieves the details of a session from the database by its unique identifier.
 *
 * @description This function executes a SQL query to fetch the session details from the database.
 * It also parses the JSON fields for subsessions, questions, and organisers,
 * returning a structured session object.
 *
 * @param {object} link - Database connection for executing SQL queries.
 * @param {string} id - The unique identifier of the session to be retrieved.
 * @returns {Promise<object>} - The session object containing all relevant details.
 * @throws {Error} - Throws an error if the session cannot be found or if there is an error in the query.
 */
const selectSessionDetails = async (link, id) => {
  try {
    // Execute SQL query to select the session by its ID
    const [rows] = await link.execute(
      `SELECT * FROM ${config.feedback.tables.tblSessions} WHERE id = ?`,
      [id]
    );

    // Check if any rows were returned
    if (rows.length > 0) {
      const session = rows[0]; // Retrieve the first (and only) session
      // Parse JSON fields for subsessions, questions, and organisers if they exist
      ["subsessions", "questions", "organisers"].forEach((field) => {
        if (session[field]) session[field] = JSON.parse(session[field]);
      });
      return session; // Return the structured session object
    }

    // Throw an error if no session is found
    throw new Error("Session not found.");
  } catch (error) {
    throw error; // Re-throw the error for handling by higher-level code
  }
};

/**
 * @async
 * @function selectSubsessionDetails
 * @memberof module:loadUpdateSession
 * @summary Retrieves the details of multiple subsessions from the database concurrently.
 *
 * @description This function takes an array of subsession IDs and fetches the details for the
 * associated subsession. It then cleans each subsession object by removing non-essential properties.
 *
 * @param {object} link - Database connection for executing SQL queries.
 * @param {Array<string>} subsessionIDs - An array of unique identifiers for the subsessions to be retrieved.
 * @returns {Promise<Array<object>>} - An array of cleaned subsession objects.
 * @throws {Error} - Throws an error if there is an issue fetching subsession details.
 */
const selectSubsessionDetails = async (link, subsessionIDs) => {
  try {
    // Use Promise.all to fetch subsession details concurrently for better performance
    const subsessions = await Promise.all(
      subsessionIDs.map((id) => selectSessionDetails(link, id))
    );

    // Clean up each subsession object to remove non-required properties
    const cleanedSubsessions = subsessions.map((subsession) => {
      // Extract the email from the first organiser (subsession typically has only one organiser)
      const email = subsession.organisers[0].email;
      const notifications = subsession.organisers[0].notifications;
      const lastSent = subsession.organisers[0].lastSent;

      // Destructure and exclude non-essential fields from the subsession
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

      // Return a new object containing only essential fields and the organiser's email
      return { ...rest, email, notifications, lastSent };
    });

    return cleanedSubsessions; // Return the array of cleaned subsession objects
  } catch (error) {
    throw error; // Re-throw the error for handling by higher-level code
  }
};

module.exports = {
  loadUpdateSession,
  selectSessionDetails,
  selectSubsessionDetails,
};
