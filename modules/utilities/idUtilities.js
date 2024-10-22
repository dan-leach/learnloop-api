/**
 * @module idUtilities
 * @memberof module:LearnLoopAPI
 * @summary Utilities for generating unique session IDs.
 *
 * @description
 * The `idUtilities` module provides essential functionalities for creating unique
 * session IDs suitable for various operations within the LearnLoop API. It ensures
 * that generated IDs are unique and do not collide with existing IDs in the database,
 * making it reliable for session-related processes. The module is designed to handle
 * ID generation efficiently, retrying up to 100 times if necessary to avoid duplication.
 *
 * @requires ../../config.json - Configuration file containing database table
 * settings for session data retrieval.
 *
 * @exports createUniqueId - Generates a unique short ID after ensuring its uniqueness
 * in the database.
 */

const config = require("../../config.json");

/**
 * @async
 * @function createUniqueId
 * @memberof module:idUtilities
 * @summary Creates a short ID and checks its uniqueness in the database.
 *
 * @param {Object} link - Database link or connection object.
 * @param {string} module - The name of the module in use (e.g. feedback).
 * @returns {Promise<string>} A unique short ID.
 * @throws {Error} If unable to create a unique ID after 100 attempts.
 */
const createUniqueId = async (link, module) => {
  // Get the name of the sessions table according to the module
  const tblName = config[module].tables.tblSessions;

  let id;
  let count = 0;

  do {
    id = buildId(module.charAt(0)); // Prefix is the first letter of the module name (e.g., 'f' for feedback)
    count++;
    if (count > 100) {
      throw new Error(
        "Unable to create unique feedback session ID after 100 attempts."
      );
    }
  } while (!(await idIsUnique(link, tblName, id))); // Check if the generated ID is unique

  return id;
};

/**
 * @function buildId
 * @memberof module:idUtilities
 * @summary Builds a unique ID based on the module type.
 *
 * @param {string} prefix - The prefix character to denote the module.
 * @returns {string} The generated unique ID starting with the prefix followed by 5 random characters.
 */
const buildId = (prefix) => {
  const permittedChars = "23456789abcdeghjkmnpqrstuvwxyzABCDEGHJKMNPQRSTUVWXYZ";
  // Generate a random ID with the specified prefix
  return (
    prefix +
    Array.from(
      { length: 5 },
      () => permittedChars[Math.floor(Math.random() * permittedChars.length)]
    ).join("")
  );
};

/**
 * @async
 * @function idIsUnique
 * @memberof module:idUtilities
 * @summary Checks if a session ID exists in the sessions table.
 *
 * @param {mysql.Connection} link - The database connection.
 * @param {string} tblName - The name of the table to check the ID uniqueness against.
 * @param {string} id - The session ID to check.
 * @returns {Promise<boolean>} - Returns true if the ID is unique, false if it exists.
 * @throws {Error} If the database connection fails or the query fails.
 */
const idIsUnique = async (link, tblName, id) => {
  if (!link) {
    throw new Error("Database connection failed.");
  }

  try {
    const [result] = await link.execute(
      `SELECT COUNT(*) as count FROM ${tblName} WHERE id = ?`,
      [id]
    );
    return result[0].count === 0; // Return true if count is zero (ID is unique)
  } catch (error) {
    throw new Error("dbIDIsUnique database query failed: " + error.message);
  }
};

module.exports = { createUniqueId };
