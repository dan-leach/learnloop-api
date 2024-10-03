/**
 * Inserts a session into the database and returns the session ID and pin.
 *
 * @async
 * @function insertSession
 * @param {Object} link - The database connection object.
 * @param {Object} data - The sanitized and validated data for the session.
 * @param {boolean} [isSubsession=false] - Flag indicating if the session is a subsession (optional, default is false).
 * @returns {Promise<Object>} Returns an object containing the generated session `id` and `pin`.
 *
 * @example
 * const { id, pin } = await insertSession(link, data);
 */
const insertSession = async (link, data, isSubsession = false) => {
  const {
    createUniqueId,
    createPin,
    createSalt,
    hashPin,
  } = require("../../utilities/index");

  const id = await createUniqueId(link, "feedback");
  const pin = createPin();
  const salt = createSalt();
  const pinHash = hashPin(pin, salt);

  // Insert the session and subsessions into the database

  return { id, pin };
};

module.exports = { insertSession };
