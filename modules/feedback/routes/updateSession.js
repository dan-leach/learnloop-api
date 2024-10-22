/**
 * @module updateSession
 * @memberof module:feedback
 * @summary Module for updating the session details.
 *
 * @description This module facilitates the updating of session data. It provides
 * a comprehensive set of asynchronous functions to update, retrieve, and manipulate session
 * and subsession details stored in the database. The primary focus of this module is to
 * ensure accurate session data management, handle changes made by users, and send
 * notifications to organisers regarding updates or removals.
 *
 * @requires ../../../config.json - Configuration file containing database table
 * settings for session data retrieval.
 * @requires ./insertSession - For inserting new subsessions as part of an session series update.
 * @requires ../../utilities/pinUtilities - For generating new pins.
 * @requires ../../utilities/mailUtilities - For sending notification emails.
 * @requires ../../utilities/dateUtilities - Utilities for formatting date objects into various string representations.
 *
 * @exports loadUpdateSession Core function for the module
 */

const config = require("../../../config.json");
const insertSessionRoute = require("./insertSession");
const pinUtilities = require("../../utilities/pinUtilities");
const mailUtilities = require("../../utilities/mailUtilities");
const dateUtilities = require("../../utilities/dateUtilities");

// Define application URLs
const appURL = config.client.url;
const shortenedAppURL = appURL.replace("https://", ""); // Create a shortened version of the URL to look better on emails

/**
 * @async
 * @function updateSession
 * @memberof module:updateSession
 * @summary Updates the details of a session, including its subsessions and organisers.
 *
 * @description This function processes the provided session data, compares it with existing
 * session details, and performs updates in the database. It also manages notifications
 * to the relevant organisers based on changes made, including additions, removals,
 * and modifications of organisers and subsessions.
 *
 * @param {object} link - Database connection for executing SQL queries.
 * @param {object} data - The updated session data.
 * @param {object} user - The user making the update, including their email.
 * @returns {Promise<boolean>} - Returns true if the update is successful.
 * @throws {Error} - Throws an error for any issues during the update process.
 */
const updateSession = async (link, data, user) => {
  // Initialize mail notification objects
  const mails = {
    subsessionEdit: [],
    subsessionRemove: [],
    subsessionAdd: [],
    nonLeadSessionEdit: [],
    organiserEdit: [],
    organiserRemove: [],
    organiserAdd: [],
  };
  let sendMailFails = [];

  // Array to hold IDs of current subsessions
  const subsessionIds = [];

  // Retrieve old session details from the database
  const oldSessionDetails = await getOldSessionDetails(data.id, link);

  // Find the lead organiser from the old session details
  const leadOrganiser = oldSessionDetails.organisers.find(
    (oldOrganiser) => oldOrganiser.isLead === true
  );

  // Notify non-lead organisers about the session update if applicable
  if (leadOrganiser.email !== user.email) {
    mails.nonLeadSessionEdit.push({
      email: leadOrganiser.email,
      name: leadOrganiser.name,
    });
  }

  //Convert the date string to a date object
  data.date = new Date(data.date);

  // Process subsessions to identify changes
  for (let subsession of data.subsessions) {
    // Find existing subsession details if it already exists
    const oldSubsessionDetails =
      oldSessionDetails.subsessions.find(
        (oldSubsession) => oldSubsession.id === subsession.id
      ) || null;

    if (oldSubsessionDetails) {
      // Existing subsession found, check for changes
      if (
        subsession.name !== oldSubsessionDetails.name ||
        subsession.title !== oldSubsessionDetails.title ||
        subsession.email !== oldSubsessionDetails.organisers[0].email
      ) {
        // Update subsession details if changes detected
        await updateSubsessionDetails(
          subsession,
          oldSubsessionDetails,
          mails,
          link
        );
      }
      subsessionIds.push(subsession.id); // Add to current subsession IDs
    } else {
      // New subsession to be added
      data.leadName = user.name;
      const insertOutcome = await insertSessionRoute.insertSession(
        link,
        subsession,
        true,
        data
      );
      sendMailFails.push(...insertOutcome.sendMailFails);
      subsessionIds.push(insertOutcome.id); // Add new subsession ID
    }
  }

  // Remove old subsessions that are not included in the updated data
  for (let oldSubsessionDetails of oldSessionDetails.subsessions) {
    if (!subsessionIds.includes(oldSubsessionDetails.id)) {
      removeOldSubsession(oldSubsessionDetails, mails, link);
    }
  }

  // Process organisers and their details
  for (let organiser of data.organisers) {
    const oldOrganiserDetails =
      oldSessionDetails.organisers.find(
        (oldOrganiser) => oldOrganiser.email === organiser.email
      ) || null;

    if (oldOrganiserDetails) {
      // Existing organiser found
      if (organiser.email !== oldOrganiserDetails.email) {
        throw new Error(
          "Cannot change email address for an existing organiser."
        );
      }
      if (organiser.isLead !== oldOrganiserDetails.isLead) {
        throw new Error(
          "Cannot change lead organiser after a session has been created."
        );
      }
      if (
        organiser.name !== oldOrganiserDetails.name ||
        organiser.canEdit !== oldOrganiserDetails.canEdit
      ) {
        // Notify about changes to organiser details
        mails.organiserEdit.push({
          name: organiser.name,
          email: organiser.email,
          canEdit: organiser.canEdit,
        });
      }
      // Preserve existing properties for the organiser
      organiser.pinHash = oldOrganiserDetails.pinHash;
      organiser.salt = oldOrganiserDetails.salt;
      organiser.isLead = oldOrganiserDetails.isLead;
      organiser.lastSent = oldOrganiserDetails.lastSent;
      organiser.notifications = oldOrganiserDetails.notifications;
    } else {
      // New organiser to be added
      const pin = pinUtilities.createPin();
      const salt = pinUtilities.createSalt();
      organiser.pinHash = pinUtilities.hashPin(pin, salt);
      organiser.salt = salt;

      // Notify about the new organiser
      mails.organiserAdd.push({
        name: organiser.name,
        email: organiser.email,
        canEdit: organiser.canEdit,
        pin: pin,
      });
    }
  }

  // Remove old organisers that are not included in the updated data
  const newOrganiserEmails = data.organisers.map(
    (organiser) => organiser.email
  );
  for (let oldOrganiser of oldSessionDetails.organisers) {
    if (!newOrganiserEmails.includes(oldOrganiser.email)) {
      mails.organiserRemove.push({
        name: oldOrganiser.name,
        email: oldOrganiser.email,
      });
    }
  }

  // Insert the updated session data into the database
  await updateSessionInDatabase(link, data, subsessionIds);

  // Notify the lead organiser of non-lead updates
  for (let recipient of mails.nonLeadSessionEdit) {
    const emailOutcome = await emailOrganiserUpdate(
      data,
      user,
      recipient,
      buildMailBodyNonLeadSessionEdit,
      "Feedback request updated"
    );
    if (!emailOutcome.sendSuccess)
      sendMailFails.push({
        name: recipient.name,
        email: recipient.email,
        error: emailOutcome.error,
      });
  }

  // Notify newly added organisers
  if (mails.organiserAdd.length) {
    for (let recipient of mails.organiserAdd) {
      data.leadName = leadOrganiser.name; // Ensure lead name is set
      const emailOutcome = await insertSessionRoute.emailOrganiserInsert(
        data,
        data.id,
        recipient.pin,
        recipient.name,
        recipient.email,
        false,
        recipient.canEdit
      );
      if (!emailOutcome.sendSuccess)
        sendMailFails.push({
          name: recipient.name,
          email: recipient.email,
          error: emailOutcome.error,
        });
    }
  }

  // Notify organisers whose details have changed
  for (let recipient of mails.organiserEdit) {
    const emailOutcome = await emailOrganiserUpdate(
      data,
      user,
      recipient,
      buildMailBodyOrganiserEdit,
      "Organiser status updated"
    );
    if (!emailOutcome.sendSuccess)
      sendMailFails.push({
        name: recipient.name,
        email: recipient.email,
        error: emailOutcome.error,
      });
  }

  // Notify organisers who have been removed
  for (let recipient of mails.organiserRemove) {
    const emailOutcome = await emailOrganiserUpdate(
      data,
      user,
      recipient,
      buildMailBodyOrganiserRemove,
      "Organiser status update"
    );
    if (!emailOutcome.sendSuccess)
      sendMailFails.push({
        name: recipient.name,
        email: recipient.email,
        error: emailOutcome.error,
      });
  }

  // Notify facilitators of changed subsessions
  for (let recipient of mails.subsessionEdit) {
    const emailOutcome = await emailOrganiserUpdate(
      recipient,
      user,
      recipient,
      buildMailBodySubsessionEdit,
      "Feedback request updated",
      data
    );
    if (!emailOutcome.sendSuccess)
      sendMailFails.push({
        name: recipient.name,
        email: recipient.email,
        error: emailOutcome.error,
      });
  }

  // Notify facilitators of removed subsessions
  for (let recipient of mails.subsessionRemove) {
    const emailOutcome = await emailOrganiserUpdate(
      recipient,
      user,
      recipient,
      buildMailBodySubsessionRemove,
      "Feedback request closed",
      data
    );
    if (!emailOutcome.sendSuccess)
      sendMailFails.push({
        name: recipient.name,
        email: recipient.email,
        error: emailOutcome.error,
      });
  }

  return sendMailFails; // Indicate successful completion of the update process
};

/**
 * @async
 * @function getOldSessionDetails
 * @memberof module:updateSession
 * @summary Retrieves the details of a session by its ID, including subsession information.
 *
 * @description This function fetches the session details from the database, formats the date,
 * and retrieves associated subsession details. It returns the complete session object
 * with all relevant information.
 *
 * @param {number|string} id - The ID of the session to retrieve.
 * @param {object} link - Database connection for executing SQL queries.
 * @returns {Promise<object>} - A promise that resolves to the session details, including subsessions.
 * @throws {Error} - Throws an error if the session retrieval fails.
 */
const getOldSessionDetails = async (id, link) => {
  // Get session details by ID
  const session = await selectSessionDetails(link, id);

  // Format session date to ISO format for consistency
  session.date = dateUtilities.formatDateISO(session.date);

  // Fetch and assign subsession details to the session
  session.subsessions = await selectSubsessionDetails(
    link,
    session.subsessions
  );

  return session; // Return the populated session object
};

/**
 * @async
 * @function selectSessionDetails
 * @memberof module:updateSession
 * @summary Retrieves session details from the database by session ID.
 *
 * @description This function executes a SQL query to select a session from the database
 * based on the provided session ID. If the session is found, it parses
 * any JSON fields and returns the session details. If the session is not
 * found, an error is thrown.
 *
 * @param {object} link - Database connection for executing SQL queries.
 * @param {number|string} id - The ID of the session to retrieve.
 * @returns {Promise<object>} - A promise that resolves to the session details.
 * @throws {Error} - Throws an error if the session cannot be found or if the query fails.
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

      // Parse JSON fields in the session object
      ["subsessions", "questions", "organisers"].forEach((field) => {
        if (session[field]) {
          session[field] = JSON.parse(session[field]);
        }
      });

      return session; // Return the session details
    }

    // Throw an error if no session is found
    throw new Error("Session not found.");
  } catch (error) {
    // Re-throw the error to handle it in higher-level code
    throw error;
  }
};

/**
 * @async
 * @function selectSubsessionDetails
 * @memberof module:updateSession
 * @summary Retrieves details of multiple subsessions from the database.
 *
 * @description This function fetches the details of subsessions concurrently using
 * the provided subsession IDs.
 *
 * @param {object} link - Database connection for executing SQL queries.
 * @param {Array<number|string>} subsessionIds - An array of IDs for the subsessions to retrieve.
 * @returns {Promise<Array<object>>} - A promise that resolves to an array of subsession details.
 * @throws {Error} - Throws an error if the retrieval of subsession details fails.
 */
const selectSubsessionDetails = async (link, subsessionIds) => {
  try {
    // Use Promise.all to fetch subsession details concurrently for better performance
    const subsessions = await Promise.all(
      subsessionIds.map((id) => selectSessionDetails(link, id))
    );

    return subsessions; // Return the array of subsession details
  } catch (error) {
    // Re-throw the error to handle it in higher-level code
    throw error;
  }
};

/**
 * @async
 * @function updateSubsessionDetails
 * @memberof module:updateSession
 * @summary Updates the details of a subsession, including handling changes to the organiser's email.
 *
 * @description This function checks if the email address of the organiser for a subsession
 * can be updated. If a new email is being added to a subsession that previously
 * didn't have one, it generates a PIN and salt, and updates the subsession's
 * organisers accordingly. If an email change is invalid, it throws an error.
 *
 * @param {object} subsession - The subsession object containing updated details.
 * @param {object} oldSubsessionDetails - The existing details of the subsession.
 * @param {object} mails - An object to collect email notifications for changes.
 * @param {object} link - Database connection for executing SQL queries.
 * @returns {Promise<void>} - A promise that resolves when the subsession details have been updated in the database.
 * @throws {Error} - Throws an error if the email change is invalid or if the update fails.
 */
const updateSubsessionDetails = async (
  subsession,
  oldSubsessionDetails,
  mails,
  link
) => {
  const oldEmail = oldSubsessionDetails.organisers?.[0]?.email || "";
  const newEmail = subsession.email;

  // Check if email change is invalid
  if (oldEmail.length && oldEmail !== newEmail) {
    throw new Error(
      "Cannot change email address for an existing subsession which already has an email address set."
    );
  }

  // Handle adding a new email to a subsession without a previous email
  if (!oldEmail.length && newEmail.length) {
    const pin = pinUtilities.createPin();
    const salt = pinUtilities.createSalt();

    // Set the organiser details for the subsession
    subsession.organisers = [
      {
        name: subsession.name,
        email: newEmail,
        isLead: false,
        canEdit: false,
        pinHash: pinUtilities.hashPin(pin, salt),
        salt: salt,
        notifications: true,
        lastSent: null,
      },
    ];

    // Add mail data for new subsession organiser
    mails.subsessionAdd.push({
      name: subsession.name,
      email: newEmail,
      pin: pin,
      subsession: subsession,
    });
  } else {
    // Handle other changes besides email
    subsession.organisers = oldSubsessionDetails.organisers; // Retain previous organisers
    mails.subsessionEdit.push(subsession); // Log the edit for notifications
  }

  // Update subsession details in the database
  return updateSubsessionDetailsInDatabase(link, subsession);
};

/**
 * @async
 * @function updateSubsessionDetailsInDatabase
 * @memberof module:updateSession
 * @summary Updates the details of a subsession in the database.
 *
 * @description This function constructs and executes an SQL UPDATE query to modify the
 * specified subsession's details, including the name, title, and organisers.
 *
 * @param {Object} link - The MySQL connection object used to execute queries.
 * @param {Object} subsession - The subsession details to update, containing:
 *   @param {string} subsession.name - The name of the subsession.
 *   @param {string} subsession.title - The title of the subsession.
 *   @param {string} subsession.organisers - The JSON stringified list of organisers.
 *   @param {number} subsession.id - The unique identifier of the subsession to update.
 * @returns {Promise<void>} - Resolves when the update is complete.
 * @throws {Error} - Throws an error if the query execution fails.
 */
const updateSubsessionDetailsInDatabase = async (link, subsession) => {
  const { name, title, organisers, id } = subsession; // Destructure subsession properties
  const tableName = config.feedback.tables.tblSessions; // Reference to the sessions table

  // Construct the SQL UPDATE query
  const query = `UPDATE ${tableName} SET name = ?, title = ?, organisers = ? WHERE id = ?`;

  // Execute the update query with the provided subsession details
  await link.execute(query, [name, title, organisers, id]);
};

/**
 * @async
 * @function removeOldSubsession
 * @memberof module:updateSession
 * @summary Marks an old subsession as closed in the database and prepares email notifications for its removal.
 *
 * @description This function adds the subsession's details to the removal list for emailing to
 * the associated organiser and updates the database to reflect the subsession's closed status.
 *
 * @param {Object} oldSubsessionDetails - The details of the old subsession to be removed, containing:
 *   @param {string} oldSubsessionDetails.title - The title of the subsession.
 *   @param {string} oldSubsessionDetails.name - The name of the subsession.
 *   @param {Array} oldSubsessionDetails.organisers - The list of organisers for the subsession.
 *   @param {number} oldSubsessionDetails.id - The unique identifier of the subsession to close.
 * @param {Object} mails - The object containing arrays for different email notifications.
 * @param {Object} link - The MySQL connection object used to execute queries.
 * @returns {Promise<void>} - Resolves when the subsession has been marked as closed in the database.
 * @throws {Error} - Throws an error if the query execution fails.
 */
const removeOldSubsession = async (oldSubsessionDetails, mails, link) => {
  // Check if the first organiser has an email and add the subsession to the removal list for mailing
  if (oldSubsessionDetails.organisers[0].email) {
    mails.subsessionRemove.push({
      title: oldSubsessionDetails.title, // Title of the subsession
      name: oldSubsessionDetails.name, // Name of the subsession
      email: oldSubsessionDetails.organisers[0].email, // Email of the organiser
    });
  }

  // Mark the subsession as closed in the database
  await closeSessionInDatabase(link, oldSubsessionDetails.id);
};

/**
 * @async
 * @function closeSessionInDatabase
 * @memberof module:updateSession
 * @summary Closes a session in the database by updating its status to closed.
 *
 * @description This function updates the 'closed' field of the specified session to true,
 * indicating that the session is no longer active or available for feedback.
 *
 * @param {Object} link - The MySQL connection object used to execute queries.
 * @param {number} id - The unique identifier of the session to be closed.
 * @returns {Promise<void>} - Resolves when the session has been successfully marked as closed.
 * @throws {Error} - Throws an error if the query execution fails.
 */
const closeSessionInDatabase = async (link, id) => {
  const tableName = config.feedback.tables.tblSessions;

  // Construct the update query to set the 'closed' status of the session
  const query = `UPDATE ${tableName} SET closed = true WHERE id = ?`;

  // Execute the query with the provided session ID
  await link.execute(query, [id]);
};

/**
 * @async
 * @function updateSessionInDatabase
 * @memberof module:updateSession
 * @summary Updates a session's details in the database.
 *
 * @description This function modifies the specified session's details, including its name, title,
 * date, organisers, questions, and other relevant fields based on the provided session data.
 *
 * @param {Object} link - The MySQL connection object used to execute queries.
 * @param {Object} data - The session data containing details to be updated.
 * @param {Array} subsessionIds - An array of IDs representing the subsessions associated with the session.
 * @returns {Promise<void>} - Resolves when the session has been successfully updated in the database.
 * @throws {Error} - Throws an error if the query execution fails.
 */
const updateSessionInDatabase = async (link, data, subsessionIds) => {
  const tableName = config.feedback.tables.tblSessions;

  // Destructure the session data object for ease of access
  const {
    name,
    title,
    date,
    multipleDates,
    organisers,
    questions,
    certificate,
    attendance,
    id,
  } = data;

  // Construct the update query for modifying session details
  const query = `UPDATE ${tableName} SET 
                  name = ?, 
                  title = ?, 
                  date = ?, 
                  multipleDates = ?, 
                  organisers = ?, 
                  questions = ?, 
                  certificate = ?, 
                  subsessions = ?, 
                  attendance = ? 
                  WHERE id = ?`;

  // Execute the query with the provided session data and subsession IDs
  await link.execute(query, [
    name,
    title,
    date,
    multipleDates,
    organisers,
    questions,
    certificate,
    subsessionIds,
    attendance,
    id,
  ]);
};

/**
 * @async
 * @function emailOrganiserUpdate
 * @memberof module:updateSession
 * @summary Sends an email update to an organiser regarding session changes.
 *
 * @description This function constructs an email using a provided mail body builder,
 * sets the subject based on the session title, and sends the email to the specified recipient.
 *
 * @param {Object} data - The session data to include in the email.
 * @param {Object} user - The user sending the email, typically the lead organiser.
 * @param {Object} recipient - The recipient of the email, containing their email address and name.
 * @param {Function} mailBodyBuilder - A function that constructs the body of the email.
 * @param {string} heading - The heading for the email subject.
 * @param {Object} [seriesData] - Optional additional data related to the session series.
 * @returns {void} - This function does not return a value; it sends an email.
 */
const emailOrganiserUpdate = async (
  data,
  user,
  recipient,
  mailBodyBuilder,
  heading,
  seriesData
) => {
  // Build the body of the email using the provided mail body builder function
  const body = mailBodyBuilder(data, user, recipient, seriesData);

  // Construct the email subject line
  const subject = `${heading}: ${data.title}`;

  // Create the HTML structure for the email using the mail utilities
  const html = mailUtilities.buildMailHTML(
    subject,
    heading,
    body,
    false,
    appURL,
    shortenedAppURL
  );

  // Dispatch the email to the organiser
  try {
    await mailUtilities.sendMail(recipient.email, subject, html); // Send the email using the specified parameters
    return {
      sendSuccess: true,
    };
  } catch (error) {
    return {
      sendSuccess: false,
      error: error.message,
    };
  }
};

/**
 * @function buildMailBodyNonLeadSessionEdit
 * @memberof module:updateSession
 * @summary Constructs the email body for the lead organiser when a session has been edited by a non-lead organiser.
 *
 * @description This function generates a personalized email body informing the recipient about updates
 * to their session, including details about subsessions, questions, and options.
 *
 * @param {Object} data - The session data containing details about the session and subsessions.
 * @param {Object} user - The user who made the updates to the session.
 * @param {Object} recipient - The recipient of the email, containing their name.
 * @returns {string} - The constructed HTML body for the email.
 */
const buildMailBodyNonLeadSessionEdit = (data, user, recipient) => {
  // Initialize the email body with a greeting and session update details
  let body = `
        <p>Hello ${recipient.name},<br><br>
        Your feedback request on <a href='${appURL}'>LearnLoop</a> for your session '${data.title}' has been updated by ${user.name}. You are the lead organiser for this event. This means your access to the session cannot be removed and you have editing rights.<br><br>
        <span style='font-size:2em'>Your session ID is <strong>${data.id}</strong></span><br>
        Refer to your session creation email for your PIN, or <a href='${appURL}/feedback/resetPIN/${data.id}'>reset your PIN</a>.<br><br>
    `;

  // Check if there are any subsessions and add related information to the body
  if (data.subsessions && data.subsessions.length) {
    if (data.subsessions.length === 1) {
      body += `Feedback will be collected on the session ${data.subsessions[0].title}.<br>`;
    } else {
      body += `Feedback will be collected on the sessions: <ul>${data.subsessions
        .map(
          (subsession) =>
            `<li>'${subsession.title}' facilitated by ${subsession.name}</li>`
        )
        .join("")}</ul>`;
    }
  }

  // Add information about additional questions to be asked
  if (data.questions && data.questions.length) {
    body += `The following additional questions will be asked:<ul>
            ${data.questions
              .map((question) => `<li>${question.title}</li>`)
              .join("")}
            </ul>`;
  }

  // Add information about certificate and attendance options
  body += `
    <p>
      The certificate of attendance option is ${
        data.certificate ? "enabled" : "disabled"
      }.<br>
      The attendance register option is ${
        data.attendance ? "enabled" : "disabled"
      }.
    </p>
  `;

  return body; // Return the constructed email body
};

/**
 * @function buildMailBodyOrganiserEdit
 * @memberof module:updateSession
 * @summary Constructs the email body for notifying an organiser about changes to their status.
 *
 * @description This function generates a personalized email body that informs the recipient of updates
 * to their organiser status for a specific feedback session, including editing rights and session details.
 *
 * @param {Object} data - The session data containing details about the session.
 * @param {Object} user - The user who made the updates to the organiser's status.
 * @param {Object} recipient - The recipient of the email, containing their name and rights.
 * @returns {string} - The constructed HTML body for the email.
 */
const buildMailBodyOrganiserEdit = (data, user, recipient) => {
  // Initialize the email body with a greeting and update details
  let body = `
        <p>Hello ${recipient.name},</p>
        <p>Your organiser status for the feedback request on <a href='${appURL}'>LearnLoop</a> for the session '${data.title}' has been updated by ${user.name}.</p>
        <p><span style='font-size:2em'>Your session ID is <strong>${data.id}</strong></span><br>
        Refer to your session creation email for your PIN, or <a href='${appURL}/feedback/resetPIN/${data.id}'>reset your PIN</a>.</p>
    `;

  // Check if the recipient has editing rights and update the body accordingly
  body += recipient.canEdit
    ? `<p>You have editing rights for this session. <a href='${appURL}/feedback/edit/${data.id}'>Edit your session</a>. This option is only available <strong>before</strong> feedback has been submitted.</p>`
    : "<p>You have viewing rights for this session.</p>";

  return body; // Return the constructed email body
};

/**
 * @function buildMailBodyOrganiserRemove
 * @memberof module:updateSession
 * @summary Constructs the email body for notifying an organiser about the removal of their status.
 *
 * @description This function generates a personalized email body that informs the recipient of the removal
 * of their organiser status for a specific feedback session, including contact instructions.
 *
 * @param {Object} data - The session data containing details about the session.
 * @param {Object} user - The user who made the change to the organiser's status.
 * @param {Object} recipient - The recipient of the email, containing their name.
 * @returns {string} - The constructed HTML body for the email.
 */
const buildMailBodyOrganiserRemove = (data, user, recipient) => {
  // Initialize the email body with a greeting and removal details
  let body = `
        <p>Hello ${recipient.name},</p>
        <p>Your organiser status for the feedback request on <a href='${appURL}'>LearnLoop</a> for the session '${data.title}' has been removed by ${user.name}. Please contact them if you believe this was done in error.</p>
    `;

  return body; // Return the constructed email body
};

/**
 * @function buildMailBodySubsessionEdit
 * @memberof module:updateSession
 * @summary Constructs the email body for notifying an organiser about updates to a subsession.
 *
 * @description This function generates a personalized email body that informs the recipient of the updates
 * made to their feedback request for a specific subsession, including session and series details.
 *
 * @param {Object} data - The subsession data containing details about the session.
 * @param {Object} user - The user who made the updates to the subsession.
 * @param {Object} recipient - The recipient of the email, containing their name.
 * @param {Object} seriesData - The session series data, providing context about the series title.
 * @returns {string} - The constructed HTML body for the email.
 */
const buildMailBodySubsessionEdit = (data, user, recipient, seriesData) => {
  // Initialize the email body with a greeting and update details
  let body = `
        <p>Hello ${recipient.name},</p>
        <p>Your feedback request on <a href='${appURL}'>LearnLoop</a> for the session '${data.title}' (part of the session series '${seriesData.title}') has been updated by ${user.name}.</p>
        <p><span style='font-size:2em'>Your session ID is <strong>${data.id}</strong></span></br>
        Refer to your session creation email for your PIN, or <a href='${appURL}/feedback/resetPIN/${data.id}'>reset your PIN</a>.</p>
    `;

  return body; // Return the constructed email body
};

/**
 * @function buildMailBodySubsessionRemove
 * @memberof module:updateSession
 * @summary Constructs the email body for notifying an organiser about the removal of a subsession.
 *
 * @description This function generates a personalized email body that informs the recipient of the removal
 * of their feedback request for a specific subsession, including relevant session and series details.
 *
 * @param {Object} data - The subsession data containing details about the session.
 * @param {Object} user - The user who removed the subsession.
 * @param {Object} recipient - The recipient of the email, containing their name.
 * @param {Object} seriesData - The session series data, providing context about the series title.
 * @returns {string} - The constructed HTML body for the email.
 */
const buildMailBodySubsessionRemove = (data, user, recipient, seriesData) => {
  // Initialize the email body with a greeting and removal details
  let body = `
        <p>Hello ${recipient.name},</p>
        <p>Your feedback request on <a href='${appURL}'>LearnLoop</a> for the session '${data.title}' has been removed from the session series '${seriesData.title}' by ${user.name}. Please contact them if you believe this was done in error.</p>
    `;

  return body; // Return the constructed email body
};

module.exports = { updateSession };
