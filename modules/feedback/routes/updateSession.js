const config = require("../../../config.json");

/**
 * Updates a session in the database and sends notification emails to organisers.
 *
 * @param {object} link - Database connection or context to be used for database queries.
 * @param {object} data - The session data, including details about the session and organisers.
 * @param {object} user - The user performing the update.
 * @returns {Promise<boolean>} - Returns true if the update was successful, otherwise throws an error.
 */
const updateSession = async (link, data, user) => {
  const mails = {
    subsessionEdit: [],
    subsessionRemove: [],
    subsessionAdd: [],
    sessionEdit: [],
    organiserEdit: [],
    organiserRemove: [],
    organiserAdd: [],
  };

  const subsessionIds = [];

  const oldSessionDetails = await getOldSessionDetails(data.id, link);

  data.date = new Date(data.date);

  for (let subsession of data.subsessions) {
    //find the stored subsession details if the subsession is pre-existing
    const oldSubsessionDetails =
      oldSessionDetails.subsessions.find(
        (oldSubsession) => oldSubsession.id === subsession.id
      ) || null;

    if (oldSubsessionDetails) {
      //existing subsession
      if (
        subsession.name != oldSubsessionDetails.name ||
        subsession.title != oldSubsessionDetails.title ||
        subsession.email != oldSubsessionDetails.organisers[0].email
      ) {
        //something has changed
        await updateSubsessionDetails(
          subsession,
          oldSubsessionDetails,
          mails,
          link
        );
      }
      subsessionIds.push(subsession.id);
    } else {
      //insertNew
      const { insertSession } = require("./insertSession");
      data.leadName = user.name;
      const { id } = await insertSession(link, subsession, true, data);
      subsessionIds.push(id);
    }
  }

  //remove any old subsessions that are not included in the update
  for (let oldSubsessionDetails of oldSessionDetails.subsessions) {
    if (!subsessionIds.includes(oldSubsessionDetails.id)) {
      removeOldSubsession(oldSubsessionDetails, mails, link);
    }
  }

  for (let organiser of data.organisers) {
    const oldOrganiserDetails =
      oldSessionDetails.organisers.find(
        (oldOrganiser) => oldOrganiser.email === organiser.email
      ) || null;

    if (oldOrganiserDetails) {
      //existing organiser
      if (organiser.email != oldOrganiserDetails.email) {
        throw new Error(
          "Cannot change email address for an existing organiser."
        );
      }
      if (organiser.isLead != oldOrganiserDetails.isLead) {
        throw new Error(
          "Cannot change lead organiser after a session has been created."
        );
      }
      if (
        organiser.name != oldOrganiserDetails.name ||
        organiser.canEdit != oldOrganiserDetails.canEdit
      ) {
        //changed
        mails.organiserEdit.push({
          name: organiser.name,
          email: organiser.email,
          canEdit: organiser.canEdit,
        });
      }
      organiser.pinHash = oldOrganiserDetails.pinHash;
      organiser.salt = oldOrganiserDetails.salt;
      organiser.isLead = oldOrganiserDetails.isLead;
      organiser.lastSent = oldOrganiserDetails.lastSent;
      organiser.notifications = oldOrganiserDetails.notifications;
    } else {
      //new organiser
      const {
        createPin,
        createSalt,
        hashPin,
      } = require("../../utilities/index");

      const pin = createPin();
      const salt = createSalt();
      organiser.pinHash = hashPin(pin, salt);
      organiser.salt = salt;

      mails.organiserAdd.push({
        name: organiser.name,
        email: organiser.email,
        canEdit: organiser.canEdit,
        pin: pin,
      });
    }
  }

  // Insert the session into the database
  await updateSessionInDatabase(link, data, subsessionIds);

  return true;
  // Send emails to all organisers
  for (let mail of mails) {
    emailOrganiser(
      data,
      id,
      mail.pin,
      mail.name,
      mail.email,
      mail.isLead,
      mail.canEdit,
      isSubsession,
      seriesData
    );
  }

  return true;
};

const getOldSessionDetails = async (id, link) => {
  const session = await selectSessionDetails(link, id);

  const { formatDateISO } = require("../../utilities/index");
  session.date = formatDateISO(session.date);

  const subsessionIds = session.subsessions;

  session.subsessions = await selectSubsessionDetails(link, subsessionIds);

  return session;
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
 * @param {Array<number|string>} subsessionIds - An array of subsession IDs to retrieve.
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of subsession details.
 * @throws Will throw an error if any subsession retrieval fails.
 */
const selectSubsessionDetails = async (link, subsessionIds) => {
  try {
    // Use Promise.all to fetch subsession details concurrently for better performance
    const subsessions = await Promise.all(
      subsessionIds.map((id) => selectSessionDetails(link, id))
    );
    return subsessions;
  } catch (error) {
    throw error; // Re-throw the error to handle it in higher-level code
  }
};

const updateSubsessionDetails = async (
  subsession,
  oldSubsessionDetails,
  mails,
  link
) => {
  //subsession has been changed
  if (
    oldSubsessionDetails.organisers[0].email?.length &&
    oldSubsessionDetails.organisers[0].email != subsession.email
  ) {
    throw new Error(
      "Cannot change email address for an existing subsession which already has an email address set."
    );
  }
  if (
    !oldSubsessionDetails.organisers[0].email?.length &&
    subsession.email.length
  ) {
    //added an email to a subsession which previously didn't have one (and maybe some other changes)
    // Generate organiser data for the subsession
    const { createPin, createSalt, hashPin } = require("../../utilities/index");
    const pin = createPin();
    const salt = createSalt();
    subsession.organisers = [
      {
        name: subsession.name,
        email: subsession.email,
        isLead: false,
        canEdit: false,
        pinHash: hashPin(pin, salt),
        salt: salt,
        notifications: true,
        lastSent: null,
      },
    ];

    mails.subsessionAdd.push({
      name: subsession.name,
      email: subsession.email,
      pin: pin,
      notifications: true,
    });
  } else {
    //made some changes besides email
    subsession.organisers = oldSubsessionDetails.organisers;

    mails.subsessionEdit.push({
      name: subsession.name,
      email: subsession.email,
      notifications: oldSubsessionDetails.organisers[0].notifications,
    });
  }
  updateSubsessionDetailsInDatabase(link, subsession);
};

const updateSubsessionDetailsInDatabase = async (link, subsession) => {
  try {
    // Execute the update query
    const query = `UPDATE ${config.feedback.tables.tblSessions} SET name = ?, title = ?, organisers = ? WHERE id = ?`;
    const { name, title, organisers, id } = subsession;
    await link.execute(query, [name, title, organisers, id]);
  } catch (error) {
    throw error;
  }
};

const removeOldSubsession = async (oldSubsessionDetails, mails, link) => {
  try {
    mails.subsessionRemove.push({
      name: oldSubsessionDetails.name,
      email: oldSubsessionDetails.email,
    });
    closeSessionInDatabase(link, subsession.id);
  } catch (error) {
    throw error;
  }
};

const closeSessionInDatabase = async (link, id) => {
  try {
    // Execute the update query
    const query = `UPDATE ${config.feedback.tables.tblSessions} SET closed = true WHERE id = ?`;
    await link.execute(query, [id]);
  } catch (error) {
    throw error;
  }
};

/**
 * Sends an email to an organiser with details about the session and their PIN.
 *
 * @param {object} data - The session data, including title, organisers, and other relevant information.
 * @param {string} id - The unique ID of the session.
 * @param {string} pin - The PIN for the organiser to access the session.
 * @param {string} name - The name of the organiser.
 * @param {string} email - The email address of the organiser.
 * @param {boolean} isLead - Whether the organiser is the lead organiser of the session.
 * @param {boolean} canEdit - Whether the organiser has editing privileges.
 * @param {boolean} [isSubsession=false] - Flag indicating whether the email is for a subsession of a series.
 * @param {object} [seriesData={}] - Data from the parent series, if this is a subsession.
 * @returns {Promise<boolean>} - Returns `true` if the email was sent successfully, `false` otherwise.
 */
const emailOrganiser = (
  data,
  id,
  pin,
  name,
  email,
  isLead,
  canEdit,
  isSubsession = false,
  seriesData = {}
) => {
  // Determine the lead organiser's name (in subsession use the parent sessions lead)
  const leadName = isSubsession ? seriesData.leadName : data.leadName;

  // Define application URLs
  const appURL = config.client.url;
  const shortenedAppURL = appURL.replace("https://", ""); // Create a shortened version of the URL to look better on emails

  // Build the body of the email
  const body = buildMailBody(
    id,
    pin,
    name,
    isLead,
    canEdit,
    leadName,
    appURL,
    shortenedAppURL,
    data,
    isSubsession,
    seriesData
  );

  // Email heading and subject
  let heading = `Feedback request created`;
  let subject = `${heading}: ${data.title}`;

  // Import utility function to build HTML structure for the email
  const { buildMailHTML } = require("../../utilities/index");
  const html = buildMailHTML(
    subject,
    heading,
    body,
    isLead,
    appURL,
    shortenedAppURL
  );

  //import the sendMail utility then dispatch the email
  const { sendMail } = require("../../utilities/index");
  sendMail(email, subject, html);
};

const updateSessionInDatabase = async (link, data, subsessionIds) => {
  try {
    // Execute the update query
    const query = `UPDATE ${config.feedback.tables.tblSessions} SET name = ?, title = ?, date = ?, multipleDates = ?, organisers = ?, questions = ?, certificate = ?, subsessions = ?, attendance = ? WHERE id = ?`;
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
  } catch (error) {
    throw error;
  }
};

/**
 * Constructs the body of the feedback request email.
 *
 * @param {string} id - The unique identifier for the session.
 * @param {string} pin - The PIN associated with the session.
 * @param {string} name - The name of the email recipient.
 * @param {boolean} isLead - Indicates if the recipient is the lead organiser for the session.
 * @param {boolean} canEdit - Indicates if the recipient has editing rights for the session.
 * @param {string} leadName - The name of the lead organiser (if the recipient is not the lead).
 * @param {string} appURL - The base URL of the application for generating links.
 * @param {string} shortenedAppURL - The shortened version of the application URL.
 * @param {Object} data - The session data, including title, date, organisers, and questions.
 * @param {boolean} isSubsession - Indicates if the session is a subsession.
 * @param {Object} seriesData - Data related to the parent series, if applicable.
 * @returns {string} - The constructed HTML body of the email.
 */
const buildMailBody = (
  id,
  pin,
  name,
  isLead,
  canEdit,
  leadName,
  appURL,
  shortenedAppURL,
  data,
  isSubsession,
  seriesData
) => {
  const { formatDateUK } = require("../../utilities/index");
  if (!data.multipleDates) date = formatDateUK(data.date);
  let body = `
        <p>Hello ${name},<br><br>
        A feedback request has been successfully created${
          isLead ? "" : " by " + leadName
        } on <a href='${appURL}'>LearnLoop</a> for your session '${
    data.title
  }' delivered on ${data.multipleDates ? "multiple dates" : date}. `;

  if (isSubsession) {
    body += `This session is part of the series '${seriesData.title}'. `;
  } else {
    if (isLead) {
      body += `You are the lead organsier for this event. This means your access to the session cannot be removed and you have editing rights. `;
    } else {
      if (canEdit) {
        body += `You have been given editing rights for this session. `;
      } else {
        body += `You have been given viewing rights for this session. `;
      }
    }
  }

  body += `</p><p>Please keep this email for future reference.</p>
        <span style='font-size:2em'>Your session ID is <strong>${id}</strong><br>
        Your session PIN is <strong>${pin}</strong></span><br>
        Do not share your PIN or this email with attendees. 
        <a href='${appURL}/feedback/resetPIN/${id}'>Reset your PIN</a>.<br>
    `;

  // Use join to cleanly concatenate array elements
  if (data.subsessions && data.subsessions.length) {
    if (data.subsessions.length === 1) {
      body += `Feedback will be collected on the session ${data.subsessions[0].title}.<br>`;
    } else {
      body += `Feedback will be collected on the sessions: <ul>${data.subsessions
        .map(
          (subsession) =>
            `<li>'${subsession.title}' faciliated by ${subsession.name}</li>`
        )
        .join("")}</ul>`;
    }
  }

  // Simplify additional questions section
  if (data.questions && data.questions.length) {
    body += `The following additional questions will be asked:<ul>
            ${data.questions
              .map((question) => `<li>${question.title}</li>`)
              .join("")}
            </ul>`;
  }

  if (canEdit) {
    body += `<a href='${appURL}/feedback/edit/${id}'>Edit your session</a>. This option is only available <strong>before</strong> feedback has been submitted.`;
  }

  body += `
        <p style='font-size:1.5em'>How to direct attendees to the feedback form</p>
        ${
          isSubsession
            ? `
            <p>The organiser of this session series will share the feedback link for the whole series with attendees.</p>
        `
            : `
            You can share the direct link: <a href='${appURL}/${id}'>${shortenedAppURL}/${id}</a><br>
            Or, ask them to go to <a href='${appURL}'>${shortenedAppURL}</a> and enter the session ID.<br>
            Or, <a href='${appURL}/feedback/instructions/${id}'>show a page with instructions on how to reach the feedback form</a> including a QR code for your attendees to scan.<br>
            ${
              data.certificate
                ? "<br>Don't forget to let your attendees know that they'll be able to download a certificate of attendance after completing feedback."
                : ""
            }
        `
        }
    `;

  body += `
        <p style='font-size:1.5em'>View your feedback</p>
        <p>Go to <a href='${appURL}/feedback/view/${id}'>${shortenedAppURL}/feedback/view/${id}</a> and enter your PIN to retrieve submitted feedback.<br>
        ${
          data.notifications
            ? "Email notification of feedback submissions is <strong>enabled</strong>. "
            : "Email notification of feedback submissions is <strong>disabled</strong>. "
        }
        <a href='${appURL}/feedback/notifications/${id}'>Update your notification preferences</a>.<br>
        ${
          !isSubsession && data.attendance
            ? `The attendance register is <strong>enabled</strong>. <a href='${appURL}/feedback/attendance/${id}'>View attendance register</a>.<br>`
            : ""
        }
    `;

  return body;
};

module.exports = { updateSession };
