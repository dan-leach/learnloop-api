const crypto = require("crypto");

/**
 * Builds a unique ID based on the module type.
 *
 * @param {string} prefix - The prefix character to denonte the module.
 * @returns {string} The generated unique ID starting with the prefix character followed by 5 random characters.
 */
const buildID = (prefix) => {
  const permittedChars = "23456789abcdeghjkmnpqrstuvwxyzABCDEGHJKMNPQRSTUVWXYZ";
  let id = prefix;

  for (let i = 0; i < 5; i++) {
    id += permittedChars[Math.floor(Math.random() * permittedChars.length)];
  }
  return id;
};

/**
 * Check if a session ID exists in the sessions table.
 * async
 * @param {mysql.Connection} link - The database connection.
 * @param {string} tblName - The name of the table to check the Id uniqueness against
 * @param {string} id - The session ID to check.
 * @returns {Promise<boolean>} - Returns false if the session ID exists, true if not.
 */
const dbIdIsUnique = async (link, tblName, id) => {
  if (!link) {
    throw new Error("Database connection failed.");
  }

  try {
    const query = `SELECT COUNT(*) as count FROM ${tblName} WHERE id = ?`;
    const result = await link.execute(query, [id]);
    const count = result[0][0].count;
    return count === 0;
  } catch (error) {
    throw new Error("dbIDIsUnique database query failed: " + error.message);
  }
};

/**
 * Creates a unique short Id and checks it is unique.
 * async
 * @param {Object} link - Database link or connection object.
 * @param {string} module - The name of the module in use (e.g. feedback)
 * @returns {Promise<string>} A unique short Id.
 */
const createUniqueId = async (link, module) => {
  let id;
  let isUnique;
  let count = 0;

  //get the name of the sessions table according to module
  const config = require("../../config.json");
  const tblName = config[module].tables.tblSessions;

  do {
    id = buildID(module.charAt(0)); //prefix is first letter of module name (e.g. f for feedback)
    isUnique = await dbIdIsUnique(link, tblName, id);
    count++;
    if (count > 100)
      throw new Error(
        "Unable to create unique feedback session ID after 100 attempts."
      );
  } while (!isUnique);

  return id;
};

/**
 * Generates a random 6-digit PIN.
 *
 * @returns {string} A randomly generated 6-digit PIN.
 */
const createPin = () => {
  const permittedChars = "0123456789";
  let pin = "";
  for (let i = 0; i < 6; i++) {
    pin += permittedChars[Math.floor(Math.random() * permittedChars.length)];
  }
  return pin;
};

/**
 * Generates a random salt.
 *
 * @param {number} [length=16] - The length of the salt to generate (default is 16 bytes).
 * @returns {string} A randomly generated salt in hexadecimal format.
 */
const createSalt = (length = 16) => {
  return crypto.randomBytes(length).toString("hex"); // Generates a salt of specified length
};

/**
 * Hashes a PIN using SHA-256 with the provided salt.
 *
 * @param {string} pin - The PIN to hash.
 * @param {string} salt - The salt to use in the hashing process.
 * @returns {string} The resulting SHA-256 hash of the PIN and salt.
 */
const hashPin = (pin, salt) => {
  return crypto
    .createHash("sha256")
    .update(pin + salt)
    .digest("hex");
};

/**
 * Checks if a PIN matches the given PIN hash.
 *
 * @param {string} pin - The PIN to check.
 * * @param {string} salt - The stored salt.
 * @param {string} pinHash - The stored hash of the PIN.
 * @param {string} adminPinHash - The hash of the admin PIN to allow bypassing.
 * @returns {boolean} True if the PIN matches the hash; otherwise, false.
 */
const pinIsValid = (pin, salt, pinHash, adminPinHash) => {
  const hash = hashPin(pin, salt);
  if (adminPinHash === hash) return true;
  return pinHash === hash;
};

module.exports = {
  createUniqueId,
  createPin,
  createSalt,
  hashPin,
  pinIsValid,
};
