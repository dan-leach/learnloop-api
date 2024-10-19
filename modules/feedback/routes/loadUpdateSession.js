const config = require("../../../config.json");

/**
 * Updates a session in the database and sends notification emails to organisers.
 *
 * @param {object} link - Database connection or context to be used for database queries.
 * @param {string} id - The session data, including details about the session and organisers.
 * @returns {Promise<object>} - The session data.
 */
const loadUpdateSession = async (link, id) => {
  try {
    // SQL query to extract data by ID
    const [rows] = await link.execute(
      `SELECT * FROM ${config.feedback.tables.tblSessions} WHERE id = ?`,
      [id]
    );

    if (rows.length > 0) {
      const session = rows[0];
      session.organisers = JSON.parse(session.organisers);
      session.questions = JSON.parse(session.questions);
      session.subsessions = JSON.parse(session.subsessions);
      for (let organiser of session.organisers) {
        delete organiser.pinHash;
        delete organiser.salt;
        delete organiser.lastSent;
      }
      return session;
    } else {
      throw new Error("Session not found");
    }
  } catch (error) {
    console.error("Error loading session data:", error);
    throw error;
  }
};

module.exports = { loadUpdateSession };
