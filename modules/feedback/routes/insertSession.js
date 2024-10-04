const config = require("../../../config.json");

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
const insertSession = async (link, data, isSubsession = false, seriesData) => {
  const {
    createUniqueId,
    createPin,
    createSalt,
    hashPin,
  } = require("../../utilities/index");

  //generate the session id
  const id = await createUniqueId(link, "feedback");
  let leadPin;

  let subsessionIds = [];
  if (!isSubsession) {
    //insert any subsessions and store array of their ids
    for (let subsession of data.subsessions) {
      const { id } = await insertSession(link, subsession, true, data);
      subsessionIds.push(id);
      console.error("subsession id: ", id);
    }

    //generate pin, salt, pinHash for each organiser
    for (let organiser of data.organisers) {
      const pin = createPin();
      if (organiser.isLead) {
        leadPin = pin;
      }
      const salt = createSalt();

      organiser.pinHash = hashPin(pin, salt);
      organiser.salt = salt;
      organiser.lastSent = null;
      organiser.notifications = organiser.isLead ? data.notifications : true;

      //****email the organiser */
    }
  }

  if (isSubsession) {
    //subsessions take some data from the parent series
    data.date = seriesData.date;
    data.multipleDates = seriesData.multipleDates;
    data.questions = [];
    data.certificate = false;
    data.attendance = false;
    //create the organisers array
    const pin = createPin();
    const salt = createSalt();
    data.organisers = [
      {
        name: data.name,
        email: data.email,
        isLead: false,
        canEdit: false,
        pinHash: hashPin(pin, salt),
        salt: salt,
        notifications: true,
        lastSent: null,
      },
    ];

    //****email the organiser */
  }

  // Insert the session and subsessions into the database
  if (!link) {
    throw new Error("Database connection failed.");
  }
  try {
    const query = `INSERT INTO ${config.feedback.tables.tblSessions} (id, name, title, date, multipleDates, organisers, questions, certificate, subsessions, isSubsession, attendance) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    await link.execute(query, [
      id,
      data.name,
      data.title,
      data.multipleDates ? "0000-00-00" : data.date, //default value in case of multipleDates
      data.multipleDates,
      data.organisers,
      data.questions,
      data.certificate,
      subsessionIds,
      isSubsession,
      data.attendance,
    ]);
  } catch (error) {
    throw new Error("Failed to insert session into database: " + error.message);
  }

  return { id, leadPin };
};

module.exports = { insertSession };
