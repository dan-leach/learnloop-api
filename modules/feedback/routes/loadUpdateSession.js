const config = require("../../../config.json");
const { formatDateISO } = require("../../utilities/index");

/**
 * Updates a session in the database and sends notification emails to organisers.
 *
 * @param {object} link - Database connection or context to be used for database queries.
 * @param {string} id - The session data, including details about the session and organisers.
 * @returns {Promise<object>} - The session data.
 */
const loadUpdateSession = async (link, id) => {
  try {
    const session = await selectSessionDetails(link, id);

    session.date = formatDateISO(session.date);

    const subsessionIDs = session.subsessions;

    session.subsessions = await selectSubsessionDetails(link, subsessionIDs);

    //remove non-required properties
    session.organisers = session.organisers.map(
      ({ pinHash, salt, lastSent, ...rest }) => rest
    );

    return session;
  } catch (error) {
    throw error;
  }
};

/**
 * Retrieves session details by ID from the database.
 *
 * @param {Object} link - The database connection object.
 * @param {number|string} id - The ID of the session to retrieve.
 * @returns {Promise<Object>} The session details if found, or an error if not found.
 * @throws Will throw an error if the session is not found or if a database error occurs.
 */
const selectSessionDetails = async (link, id) => {
  try {
    // Execute SQL query to select session by ID
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
    throw new Error("Session not found."); // Throw error if no session is found
  } catch (error) {
    throw error; // Re-throw the error to handle it in higher-level code
  }
};

/**
 * Loads details for multiple subsessions by their IDs.
 *
 * @param {Object} link - The database connection object.
 * @param {Array<number|string>} subsessionIDs - An array of subsession IDs to retrieve.
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of subsession details.
 * @throws Will throw an error if any subsession retrieval fails.
 */
const selectSubsessionDetails = async (link, subsessionIDs) => {
  try {
    // Use Promise.all to fetch subsession details concurrently for better performance
    const subsessions = await Promise.all(
      subsessionIDs.map((id) => selectSessionDetails(link, id))
    );

    // Remove non-required properties from each subsession object
    const cleanedSubsessions = subsessions.map((subsession) => {
      // Extract the email from the first organiser (subsession will have only one organiser)
      const email = subsession.organisers[0].email;
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
      } = subsession; // Destructure and exclude listed fields
      return { ...rest, email };
    });

    return cleanedSubsessions;
  } catch (error) {
    throw error; // Re-throw the error to handle it in higher-level code
  }
};

module.exports = { loadUpdateSession };
