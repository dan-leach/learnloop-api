const config = require("../../../config.json");
const { insertSession, emailOrganiserInsert } = require("./insertSession");
const {
  createPin,
  createSalt,
  hashPin,
  buildMailHTML,
  sendMail,
  formatDateISO,
} = require("../../utilities/index");

// Define application URLs
const appURL = config.client.url;
const shortenedAppURL = appURL.replace("https://", ""); // Create a shortened version of the URL to look better on emails

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
    nonLeadSessionEdit: [],
    organiserEdit: [],
    organiserRemove: [],
    organiserAdd: [],
  };

  const subsessionIds = [];

  const oldSessionDetails = await getOldSessionDetails(data.id, link);

  const leadOrganiser = oldSessionDetails.organisers.find(
    (oldOrganiser) => oldOrganiser.isLead === true
  );

  if (leadOrganiser.email != user.email)
    mails.nonLeadSessionEdit.push({
      email: leadOrganiser.email,
      name: leadOrganiser.name,
    });

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

  //remove any old organisers that are not included in the update
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

  // Insert the session into the database
  await updateSessionInDatabase(link, data, subsessionIds);

  //let the lead organiser know if someone else has updated the session
  for (let recipient of mails.nonLeadSessionEdit) {
    emailOrganiserUpdate(
      data,
      user,
      recipient,
      buildMailBodyNonLeadSessionEdit,
      "Feedback request updated"
    );
  }

  //let organisers who have been added know
  if (mails.organiserAdd.length) {
    for (let recepient of mails.organiserAdd) {
      data.leadName = leadOrganiser.name;
      emailOrganiserInsert(
        data,
        data.id,
        recepient.pin,
        recepient.name,
        recepient.email,
        false,
        recepient.canEdit
      );
    }
  }

  //let organisers who's name or canEdit status has changed know
  for (let recepient of mails.organiserEdit) {
    emailOrganiserUpdate(
      data,
      user,
      recepient,
      buildMailBodyOrganiserEdit,
      "Organiser status updated"
    );
  }

  //let organisers who've been removed know
  for (let recepient of mails.organiserRemove) {
    emailOrganiserUpdate(
      data,
      user,
      recepient,
      buildMailBodyOrganiserRemove,
      "Organiser status update"
    );
  }

  //entirely new subsessions are get mailed via the insertSession route. This loop deals with existing subsession which have an email added
  for (let recepient of mails.subsessionAdd) {
    emailOrganiserInsert(
      {
        title: recepient.subsession.title,
      },
      recepient.subsession.id, //subsession id
      recepient.pin,
      recepient.name,
      recepient.email,
      false,
      false,
      true,
      {
        ...data,
        leadName: leadOrganiser.name,
      }
    );
  }

  //let facilitators of subsessions which have been changed know
  for (let recepient of mails.subsessionEdit) {
    emailOrganiserUpdate(
      recepient,
      user,
      recepient,
      buildMailBodySubsessionEdit,
      "Feedback request updated",
      data
    );
  }

  //let facilitators of subsessions which have been removed know
  for (let recepient of mails.subsessionRemove) {
    console.error(recepient);
    emailOrganiserUpdate(
      recepient,
      user,
      recepient,
      buildMailBodySubsessionRemove,
      "Feedback request closed",
      data
    );
  }

  return true;
};

/**
 * Retrieves and processes old session details, including its subsessions.
 *
 * @param {number|string} id - The ID of the session to retrieve.
 * @param {Object} link - The database connection object.
 * @returns {Promise<Object>} The processed session object with formatted date and subsession details.
 * @throws Will throw an error if the session or subsessions retrieval fails.
 */
const getOldSessionDetails = async (id, link) => {
  // Get session details by ID
  const session = await selectSessionDetails(link, id);

  // Format session date to ISO format
  session.date = formatDateISO(session.date);

  // Fetch and assign subsession details
  session.subsessions = await selectSubsessionDetails(
    link,
    session.subsessions
  );

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

/**
 * Updates subsession details, handles email change restrictions, and updates organiser data.
 *
 * @param {Object} subsession - The new subsession details.
 * @param {Object} oldSubsessionDetails - The existing subsession details.
 * @param {Object} mails - An object to push mail recepients and mail variables.
 * @param {Object} link - The database connection object.
 * @returns {Promise<void>} Resolves when subsession details have been updated in the database.
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
    const pin = createPin();
    const salt = createSalt();

    subsession.organisers = [
      {
        name: subsession.name,
        email: newEmail,
        isLead: false,
        canEdit: false,
        pinHash: hashPin(pin, salt),
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
    subsession.organisers = oldSubsessionDetails.organisers;
    mails.subsessionEdit.push(subsession);
  }

  // Update subsession details in the database
  return updateSubsessionDetailsInDatabase(link, subsession);
};

/**
 * Updates subsession details in the database.
 *
 * @param {Object} link - The MySQL connection object.
 * @param {Object} subsession - The subsession details to update.
 * @returns {Promise<void>} Resolves when the update is complete.
 */
const updateSubsessionDetailsInDatabase = async (link, subsession) => {
  const { name, title, organisers, id } = subsession;
  const tableName = config.feedback.tables.tblSessions;

  // Construct the update query
  const query = `UPDATE ${tableName} SET name = ?, title = ?, organisers = ? WHERE id = ?`;

  // Execute the update query with the provided subsession details
  await link.execute(query, [name, title, organisers, id]);
};

/**
 * Removes an old subsession by marking it as closed and adding to the mail removal list.
 *
 * @param {Object} oldSubsessionDetails - The old subsession details to process.
 * @param {Object} mails - An object to push mail recepients and mail variables.
 * @param {Object} link - The database connection object.
 * @returns {Promise<void>} Resolves when the subsession has been removed and marked as closed.
 */
const removeOldSubsession = async (oldSubsessionDetails, mails, link) => {
  // Add subsession to the removal list for mailing
  if (oldSubsessionDetails.organisers[0].email)
    mails.subsessionRemove.push({
      title: oldSubsessionDetails.title,
      name: oldSubsessionDetails.name,
      email: oldSubsessionDetails.organisers[0].email,
    });

  // Mark the subsession as closed in the database
  await closeSessionInDatabase(link, oldSubsessionDetails.id);
};

/**
 * Marks a session as closed in the database by setting the 'closed' field to true.
 *
 * @param {Object} link - The MySQL connection object.
 * @param {number|string} id - The ID of the session to mark as closed.
 * @returns {Promise<void>} Resolves when the session is successfully closed.
 */
const closeSessionInDatabase = async (link, id) => {
  const tableName = config.feedback.tables.tblSessions;

  // Construct the update query
  const query = `UPDATE ${tableName} SET closed = true WHERE id = ?`;

  // Execute the query with the provided session ID
  await link.execute(query, [id]);
};

/**
 * Updates session details in the database.
 *
 * @param {Object} link - The MySQL connection object.
 * @param {Object} data - The session data to be updated.
 * @param {Array<number|string>} subsessionIds - An array of subsession IDs associated with the session.
 * @returns {Promise<void>} Resolves when the session is successfully updated.
 */
const updateSessionInDatabase = async (link, data, subsessionIds) => {
  const tableName = config.feedback.tables.tblSessions;

  // Destructure the session data object
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

  // Construct the update query
  const query = `UPDATE ${tableName} SET name = ?, title = ?, date = ?, multipleDates = ?, organisers = ?, questions = ?, certificate = ?, subsessions = ?, attendance = ? WHERE id = ?`;

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
 * Sends an email to an organiser with details about the session and their PIN.
 *
 * @param {object} data - The session data, including title, organisers, and other relevant information.
 * @param {object} user - The user who performed the update.
 * @param {string} recepient - The organiser to be emailed.
 * @param {Function} mailBodyBuilder - The function to build the email body (e.g., buildMailBodyNonLeadSessionEdit).
 * @param {string} heading - The heading for the email
 * @returns {Promise<boolean>} - Returns `true` if the email was sent successfully, `false` otherwise.
 */
const emailOrganiserUpdate = (
  data,
  user,
  recepient,
  mailBodyBuilder,
  heading,
  seriesData
) => {
  // Build the body of the email
  const body = mailBodyBuilder(data, user, recepient, seriesData);

  // Email heading and subject
  let subject = `${heading}: ${data.title}`;

  // Import utility function to build HTML structure for the email

  const html = buildMailHTML(
    subject,
    heading,
    body,
    false,
    appURL,
    shortenedAppURL
  );

  //import the sendMail utility then dispatch the email
  sendMail(recepient.email, subject, html);
};

/**
 * Constructs the body of the email sent to the lead organiser when a non-lead organiser updates the session.
 *
 * @param {Object} data - The session data, including title, date, organisers, and questions.
 * @param {object} user - The user who performed the update.
 * @param {string} recepient - The email recipient.
 * @returns {string} - The constructed HTML body of the email.
 */
const buildMailBodyNonLeadSessionEdit = (data, user, recepient) => {
  let body = `
        <p>Hello ${recepient.name},<br><br>
        Your feedback request on <a href='${appURL}'>LearnLoop</a> for your session '${data.title}' has been updated by ${user.name}. You are the lead organsier for this event. This means your access to the session cannot be removed and you have editing rights.<br><br>
        <span style='font-size:2em'>Your session ID is <strong>${data.id}</strong></span><br>
        Refer to your session creation email for your PIN, or <a href='${appURL}/feedback/resetPIN/${data.id}'>reset your PIN</a>.<br><br>
    `;

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

  if (data.questions && data.questions.length) {
    body += `The following additional questions will be asked:<ul>
            ${data.questions
              .map((question) => `<li>${question.title}</li>`)
              .join("")}
            </ul>`;
  }

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

  return body;
};

/**
 * Constructs the body of the email send to an organiser when their organiser status is updated.
 *
 * @param {Object} data - The session data, including title, date, organisers, and questions.
 * @param {object} user - The user who performed the update.
 * @param {string} recepient - The email recipient.
 * @returns {string} - The constructed HTML body of the email.
 */
const buildMailBodyOrganiserEdit = (data, user, recepient) => {
  let body = `
        <p>Hello ${recepient.name},</p>
        <p>Your organiser status for the feedback request on <a href='${appURL}'>LearnLoop</a> for the session '${data.title}' has been updated by ${user.name}.</p>
        <p><span style='font-size:2em'>Your session ID is <strong>${data.id}</strong></span></br>
        Refer to your session creation email for your PIN, or <a href='${appURL}/feedback/resetPIN/${data.id}'>reset your PIN</a>.</p>
    `;

  body += recepient.canEdit
    ? `<p>You have editing rights for this session. <a href='${appURL}/feedback/edit/${data.id}'>Edit your session</a>. This option is only available <strong>before</strong> feedback has been submitted.</p>`
    : "<p>You have viewing rights for this session.</p>";

  return body;
};

/**
 * Constructs the body of the email send to an organiser when their organiser status is removed.
 *
 * @param {Object} data - The session data, including title, date, organisers, and questions.
 * @param {object} user - The user who performed the update.
 * @param {string} recepient - The email recipient.
 * @returns {string} - The constructed HTML body of the email.
 */
const buildMailBodyOrganiserRemove = (data, user, recepient) => {
  let body = `
        <p>Hello ${recepient.name},</p>
        <p>Your organiser status for the feedback request on <a href='${appURL}'>LearnLoop</a> for the session '${data.title}' has been removed by ${user.name}. Please contact them if you believe this was done in error.</p>
    `;

  return body;
};

/**
 * Constructs the body of the email send to a facilitator when their subsession is updated.
 *
 * @param {Object} data - The subsession data.
 * @param {object} user - The user who performed the update.
 * @param {string} recepient - The email recipient.
 * @param {Object} seriesData - The parent session data.
 * @returns {string} - The constructed HTML body of the email.
 */
const buildMailBodySubsessionEdit = (data, user, recepient, seriesData) => {
  let body = `
        <p>Hello ${recepient.name},</p>
        <p>Your feedback request on <a href='${appURL}'>LearnLoop</a> for the session '${data.title}' (part of the session series '${seriesData.title}') has been updated by ${user.name}.</p>
        <p><span style='font-size:2em'>Your session ID is <strong>${data.id}</strong></span></br>
        Refer to your session creation email for your PIN, or <a href='${appURL}/feedback/resetPIN/${data.id}'>reset your PIN</a>.</p>
    `;

  return body;
};

/**
 * Constructs the body of the email send to a faciliator when their subsession is closed and removed from a series.
 *
 * @param {Object} data - The subsession data, including title, date, organisers, and questions.
 * @param {object} user - The user who performed the update.
 * @param {string} recepient - The email recipient.
 * @param {Object} seriesData - The parent session data.
 * @returns {string} - The constructed HTML body of the email.
 */
const buildMailBodySubsessionRemove = (data, user, recepient, seriesData) => {
  let body = `
        <p>Hello ${recepient.name},</p>
        <p>Your feedback request on <a href='${appURL}'>LearnLoop</a> for the session '${data.title}' has been removed from the session series '${seriesData.title}' by ${user.name}. Please contact them if you believe this was done in error.</p>
    `;

  return body;
};

module.exports = { updateSession };
