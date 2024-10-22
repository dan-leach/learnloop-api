/**
 * @module dbUtilities
 * @memberof module:LearnLoopAPI
 * @summary Utilities for connecting to a MySQL database.
 *
 * @description
 * The `dbUtilities` module provides essential functions and configurations for
 * establishing a connection to a MySQL database. It includes a comprehensive database
 * configuration object and an asynchronous function for opening a connection using the
 * mysql2/promise library, which enhances the handling of asynchronous operations.
 * This module simplifies database connectivity, making it easier for the LearnLoop API
 * to interact with the underlying data layer.
 *
 * @requires mysql2/promise - A promise-based MySQL client for Node.js, enabling
 * efficient database interactions.
 *
 * @exports dbConfig - The database configuration object used for establishing connections.
 * @exports openDbConnection - A function that opens a connection to the MySQL database
 * based on the provided configuration.
 */

const mysql = require("mysql2/promise");

/**
 * Database configuration for MySQL connection.
 * @const {Object} dbConfig
 * @property {string} host - The hostname of the database.
 * @property {string} user - The username for the database.
 * @property {string} password - The password for the database.
 * @property {string} database - The name of the database.
 */
const dbConfig = {
  host: "localhost",
  user: "learnloop_app",
  password: process.env.dbKey, // Password fetched from environment variable
  database: "learnloop_data",
};

/**
 * Opens a connection to the database.
 * This function establishes a connection using the provided configuration object.
 *
 * @async
 * @function openDbConnection
 * @summary Opens a connection to the MySQL database.
 *
 * @returns {Promise<Object>} - A promise that resolves to the database connection object.
 * @throws {Error} - Throws an error if the database connection fails.
 */
const openDbConnection = async () => {
  try {
    // Create and return a promise-based connection to the database
    return await mysql.createConnection(dbConfig);
  } catch (error) {
    throw new Error(`Database connection failed: ${error.message}`); // Provide a more descriptive error message
  }
};

module.exports = { dbConfig, openDbConnection };
