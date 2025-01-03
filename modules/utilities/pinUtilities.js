/**
 * @module pinUtilities
 * @memberof module:LearnLoopAPI
 * @summary This module provides utilities for creating and authenticating pins.
 *
 * @description
 * The `pinUtilities` module contains functions for generating and managing
 * secure PINs used for user authentication. It includes the ability to create
 * random PINs, generate salts for hashing, hash PINs securely using SHA-256,
 * retrieve session organizers from a database, and validate user-inputted PINs
 * against stored hashes. This module is essential for ensuring the security
 * of PIN-based authentication mechanisms in the LearnLoop API.
 *
 * @requires crypto - Node.js core module for cryptographic functionality.
 * @requires ../../config.json - Configuration file containing database table
 * settings for session data retrieval.
 *
 * @exports createPin - Generates a random 6-digit PIN.
 * @exports createSalt - Creates a random salt for hashing.
 * @exports hashPin - Hashes a given PIN using SHA-256 with a salt.
 * @exports getOrganisers - Retrieves organizers for a specific session ID
 * from the database.
 * @exports pinIsValid - Checks if a provided PIN matches the stored hash.
 */

const crypto = require("crypto");
const config = require("../../config.json");

/**
 * @function createPin
 * @memberof module:pinUtilities
 * @summary Generates a random 6-digit PIN.
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
 * @function createSalt
 * @memberof module:pinUtilities
 * @summary Generates a random salt.
 *
 * @param {number} [length=16] - The length of the salt to generate (default is 16 bytes).
 * @returns {string} A randomly generated salt in hexadecimal format.
 */
const createSalt = (length = 16) => {
  return crypto.randomBytes(length).toString("hex"); // Generates a salt of specified length
};

/**
 * @function hashPin
 * @memberof module:pinUtilities
 * @summary Hashes a PIN using SHA-256 with the provided salt.
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
 * @function getOrganisers
 * @memberof module:pinUtilities
 * @summary Retrieves the organisers for a given session ID to enable a pin check to then be performed
 *
 * @param {string} id - The session id.
 * @param {string} module - The module of the session.
 * @param {Object} link - The database connection object used to execute queries.
 * @returns {Promise<{ pinHash: string, salt: string }>} - An object containing pinHash and salt.
 */
async function getOrganisers(id, module, link) {
  const tbl = config[module].tables.tblSessions;
  const [rows] = await link.execute(
    `SELECT organisers FROM ${tbl} WHERE id = ?`,
    [id]
  );

  if (rows.length > 0) {
    return JSON.parse(rows[0].organisers);
  } else {
    throw Object.assign(new Error("Session not found"), { statusCode: 400 });
  }
}

/**
 * @function pinIsValid
 * @memberof module:pinUtilities
 * @summary Checks if a PIN matches the given PIN hash.
 *
 * @param {string} pin - The PIN to check.
 * @param {string} salt - The stored salt.
 * @param {string} pinHash - The stored hash of the PIN.
 * @returns {boolean} True if the PIN matches the hash; otherwise, false.
 */
const pinIsValid = (pin, salt, pinHash) => {
  let hash = hashPin(pin);
  if (process.env.adminPinHash === hash) return true;
  hash = hashPin(pin, salt);
  return pinHash === hash;
};

module.exports = {
  createPin,
  createSalt,
  hashPin,
  getOrganisers,
  pinIsValid,
};
