/**
 * @module insertSession
 * @memberof module:interaction
 * @summary Handles the creation of new interaction sessions and notifications.
 *
 * @description
 * The `insertSession` module provides functionality for creating new interaction sessions,
 * including inserting session details into the database and notifying the organiser via email.
 * It generates a unique session ID and secure pin.
 *
 * @requires ../../../config.json - Configuration settings for the application.
 * @requires ../../utilities/idUtilities - Utility functions for ID generation.
 * @requires ../../utilities/pinUtilities - Utility functions for PIN generation and hashing.
 * @requires ../../utilities/mailUtilities - Utilities for sending email notifications.
 * @requires entities For decoding html entities
 *
 * @exports insertSession - Function for inserting a new session into the database and notifying organisers.
 * @exports emailOrganiserInsert - Function to send email notifications to organisers regarding created feedback sessions.
 */

const config = require("../../../config.json");
const idUtilities = require("../../utilities/idUtilities");
const pinUtilities = require("../../utilities/pinUtilities");
const mailUtilities = require("../../utilities/mailUtilities");
const { decode } = require("entities");

/**
 * @async
 * @function insertSession
 * @memberof module:insertSession
 * @summary Inserts a session into the database and sends notification emails to organisers.
 *
 * @description When a new session is created, it generates a unique session ID and a secure PIN along with
 * a hashed version of it. After preparing the session data and the associated email notification, the
 * function inserts the session into the database and sends a notification email to the organiser. The
 * function ensures that the pin is returned to the caller.
 *
 * @param {object} link - Database connection for database queries.
 * @param {object} data - The session data, including details about the session and organiser.
 * @returns {Promise<object>} - The ID of the session and the PIN.
 * @throws {Error} - Throws an error if the database connection fails or if the session insertion fails.
 */
const insertSession = async (link, data) => {
  // Generate a unique session ID and pin
  const id = await idUtilities.createUniqueId(link, "interaction");
  const pin = pinUtilities.createPin();
  const salt = pinUtilities.createSalt();
  const organiser = {
    name: data.name,
    email: data.email.toLowerCase(),
    salt,
    pinHash: pinUtilities.hashPin(pin, salt),
  };
  const status = {
    createStep: "draft",
    facilitatorIndex: 0,
    lockedSlides: [],
    preview: false,
  };

  const betaTesters = require("../../private/betaTesters.json");
  if (!betaTesters.includes(organiser.email)) {
    throw Object.assign(
      new Error("Email is not on list of approved beta-testers"),
      { statusCode: 403 }
    );
  }

  // Insert the session into the database
  await insertSessionIntoDatabase(link, id, organiser, data, status);

  // Send emails to all organisers
  const emailOutcome = await emailOrganiserInsert(id, pin, data);

  // Return the session ID, PIN and if the email was sent successfully
  return { id, pin, emailOutcome };
};

/**
 * @async
 * @function insertSessionIntoDatabase
 * @memberof module:insertSession
 * @summary Inserts an interaction session into the database.
 *
 * @description Performs an SQL insert operation into the specified interaction sessions table.
 * It verifies that a valid database connection is provided before attempting the insertion.
 * The function constructs an SQL query with the session details and executes it using the provided database connection.
 *
 * @param {object} link - The database connection object for executing queries.
 * @param {string} id - The unique identifier for the session being inserted.
 * @param {string} organiser - The organiser object for the session, including pinHash, salt, name, email.
 * @param {object} data - The session data.
 * @param {object} status - The status object for the session.
 * @returns {Promise<boolean>} - Returns true if the insertion is successful.
 * @throws {Error} - Throws an error if the database connection is invalid or if the insertion fails.
 */
const insertSessionIntoDatabase = async (link, id, organiser, data, status) => {
  if (!link) {
    throw new Error("Database connection failed");
  }

  const query = `INSERT INTO ${config.interaction.tables.tblSessions} 
        (id, title, organisers, slides, feedbackId, status) 
        VALUES (?, ?, ?, ?, ?, ?)`;

  await link.execute(query, [
    id,
    data.title,
    [organiser],
    [],
    data.feedbackId ? data.feedbackId : null,
    status,
  ]);

  return true;
};

/**
 * @async
 * @function emailOrganiserInsert
 * @memberof module:insertSession
 * @summary Sends an email notification to the organiser regarding a created interaction session.
 *
 * @param {string} id - The unique identifier of the feedback session being created.
 * @param {string} pin - The secure PIN associated with the organiser for the session.
 * @param {object} data - The session data, including details such as title and lead organiser.
 * @returns {Promise<object>} - Returns object with the success status of the email dispatch.
 * @throws {Error} - Throws an error if the email dispatch fails or if there are issues with email content generation.
 */
const emailOrganiserInsert = async (id, pin, data) => {
  const appURL = config.client.url;
  const shortenedAppURL = appURL.replace("https://", "");

  const body = buildMailBody(id, pin, data, appURL, shortenedAppURL);

  const heading = "Interaction session created";
  const subject = `${heading}: ${decode(data.title)}`;
  const html = mailUtilities.buildMailHTML(
    subject,
    heading,
    body,
    appURL,
    shortenedAppURL
  );

  try {
    await mailUtilities.sendMail(data.email, subject, html);
    return { sendSuccess: true };
  } catch (error) {
    return { sendSuccess: false, error: error.message };
  }
};

/**
 * @function buildMailBody
 * @memberof module:insertSession
 * @summary Builds the HTML body for the email notification regarding a feedback session.
 *
 * @description This function generates a detailed HTML email body that provides recipients
 * with information about the created feedback session. It includes session details,
 * access rights, and instructions for directing attendees to the feedback form.
 *
 * @param {string} id - The unique identifier for the session.
 * @param {string} pin - The session PIN for the lead organiser.
 * @param {object} data - The session data.
 * @param {string} appURL - The URL for the client.
 * @param {string} shortenedAppURL - The URL for the client without 'https://'
 * @returns {string} - The constructed HTML body for the email.
 */
const buildMailBody = (id, pin, data, appURL, shortenedAppURL) => {
  let body = `
        <p>Hello ${data.name},<br><br>
        Your interaction session '${data.title}' has been successfully created on <a href='${appURL}'>LearnLoop</a>.
        </p>
        <p>Please keep this email for future reference.</p>
        <span style='font-size:2em'>Your session ID is <strong>${id}</strong><br>
        Your session PIN is <strong>${pin}</strong></span><br>
        Do not share your PIN or this email with attendees. 
        <a href='${appURL}/interaction/resetPIN/${id}'>Reset your PIN</a>.<br>
        
        <a href='${appURL}/interaction/edit/${id}'>Edit your session</a>.
        
        <p style='font-size:1.5em'>How to direct attendees to the feedback form</p>
        You can share the direct link: <a href='${appURL}/${id}'>${shortenedAppURL}/${id}</a><br>
        Or, ask them to go to <a href='${appURL}'>${shortenedAppURL}</a> and enter the session ID.<br>
        Or, <a href='${appURL}/interaction/instructions/${id}'>show a page with instructions on how to join the Interaction session</a> including a QR code for your attendees to scan.<br>
        `;

  return body;
};

module.exports = { insertSession, emailOrganiserInsert };
