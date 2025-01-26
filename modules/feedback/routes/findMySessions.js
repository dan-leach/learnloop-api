/**
 * @module findMySessions
 * @memberof module:feedback
 * @summary Module for sending an email to an organiser or facilitator containing all their sessions.
 *
 * @description
 * This module retrieves session details associated with a given email, sends an email to the organiser
 * or facilitator containing their session history, and provides a structured response.
 *
 * @requires ../../../config.json - Configuration file containing database table settings for session data retrieval.
 * @requires ../../utilities/mailUtilities - Utilities for sending email messages.
 * @requires ../../utilities/dateUtilities - Utilities for formatting date objects.
 *
 * @exports findMySessions - Core function for the module.
 */

const config = require("../../../config.json");
const mailUtilities = require("../../utilities/mailUtilities");
const dateUtilities = require("../../utilities/dateUtilities");

/**
 * @async
 * @function findMySessions
 * @memberof module:findMySessions
 * @summary Retrieves and sends an email with session details for a given organiser or facilitator email.
 *
 * @param {string} email - The email address to search for in the sessions' organiser list.
 * @param {object} link - Database connection object.
 * @returns {Promise<Array>} - A list of failed email send attempts, if any.
 * @throws {Error} - Throws an error if database operations or email dispatch fail.
 */
async function findMySessions(email, link) {
  const foundSessions = await selectSessionsByEmail(email, link);

  let organiser = {};
  if (foundSessions.length) {
    organiser = foundSessions[0].organisers.find(
      (organisers) => organisers.email === email
    );
  } else {
    organiser = {
      name: "unknown user",
      email,
    };
  }

  const sendMailFails = [];
  const emailOutcome = await emailOrganiserSessions(foundSessions, organiser);

  if (!emailOutcome.sendSuccess) {
    sendMailFails.push({
      name: organiser.name,
      email: organiser.email,
      error: emailOutcome.error,
    });
  }

  return sendMailFails;
}

/**
 * @async
 * @function selectSessionsByEmail
 * @memberof module:findMySessions
 * @summary Retrieves sessions associated with an email from the database.
 *
 * @param {string} email - The email to search for in the `organisers` column.
 * @param {object} link - Database connection object.
 * @returns {Promise<Array>} - An array of session objects with parsed organisers.
 * @throws {Error} - Throws an error if the database query fails.
 */
async function selectSessionsByEmail(email, link) {
  if (!link) {
    throw new Error("Database connection failed");
  }
  // Query the database for sessions where the email appears in the `organisers` column
  const [rows] = await link.execute(
    `SELECT * FROM ${config.feedback.tables.tblSessions} WHERE organisers LIKE ?`,
    [`%${email}%`]
  );

  // Parse the organisers field in each row as JSON
  rows.forEach((row) => (row.organisers = JSON.parse(row.organisers)));

  return rows;
}

/**
 * @async
 * @function emailOrganiserSessions
 * @memberof module:findMySessions
 * @summary Sends an email to an organiser with their session details.
 *
 * @param {Array} foundSessions - The list of sessions found for the organiser.
 * @param {Object} organiser - The organiser's details, including name and email.
 * @returns {Promise<Object>} - An object indicating the success or failure of the email operation.
 */
const emailOrganiserSessions = async (foundSessions, organiser) => {
  // Define application URLs for email content
  const appURL = config.client.url; // Base application URL
  const shortenedAppURL = appURL.replace("https://", ""); // Shortened version for cleaner email display

  // Construct the email body
  const body = buildMailBody(foundSessions, organiser, appURL, shortenedAppURL);

  const heading = "Your feedback session history"; // Email heading

  // Generate the HTML for the email
  const html = mailUtilities.buildMailHTML(
    heading,
    heading,
    body,
    true,
    appURL,
    shortenedAppURL
  );

  try {
    // Send the email
    await mailUtilities.sendMail(organiser.email, heading, html);
    return { sendSuccess: true };
  } catch (error) {
    return { sendSuccess: false, error: error.message };
  }
};

/**
 * @function buildMailBody
 * @memberof module:findMySessions
 * @summary Constructs the email body with session details.
 *
 * @param {Array} foundSessions - List of sessions found for the organiser.
 * @param {Object} organiser - The organiser's details.
 * @param {string} appURL - The base application URL.
 * @param {string} shortenedAppURL - The shortened application URL for the email.
 * @returns {string} - The constructed HTML body for the email.
 */
const buildMailBody = (foundSessions, organiser, appURL, shortenedAppURL) => {
  let body = `<p>Hello ${organiser.name},</p>`;

  if (!foundSessions.length) {
    body += `There were no feedback sessions found for this email address.`;
  } else {
    body += `
      <p>Here are the details of your sessions on LearnLoop requested using 'Find My Sessions'.</p>
      <p>Go to <a href="${appURL}">${shortenedAppURL}</a> and use the session ID and PIN to view submitted feedback or the attendance register. A link is provided to reset the PIN if you don't have the original.</p>`;

    for (const session of foundSessions) {
      body += `
        <p><span style="font-size:1.2em">${session.title}</span><br>
        Date: ${dateUtilities.formatDateUK(session.date)} | Session ID: ${
        session.id
      } | Status: ${
        session.closed ? "closed" : "open"
      } | <a href="${appURL}/feedback/resetPIN/${
        session.id
      }">Reset PIN</a></p>`;
    }
  }

  body += `
    <p>Can't find the session you're looking for? Might you have used a different email? You can also contact <a href="mailto:${config.email}">${config.email}</a> if you need more help.</p>`;

  return body;
};

module.exports = { findMySessions };
