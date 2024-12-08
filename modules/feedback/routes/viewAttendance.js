/**
 * @module viewAttendance
 * @memberof module:feedback
 * @summary
 *
 * @description
 *
 * @requires ../../../config.json - Configuration file containing database table settings for feedback data retrieval.
 *
 * @exports viewAttendance Core function for the module
 */

const config = require("../../../config.json");
const dateUtilities = require("../../utilities/dateUtilities");

/**
 * @function viewAttendance
 * @summary Retrieves session details and attendance for a given session ID.
 *
 * @param {string} id - The session ID.
 * @param {object} link - The database connection object.
 * @returns {object} - The session details and attendance data as a JSON object.
 * @throws {Error} - Throws an error if the attendance data cannot be retrieved.
 */
async function viewAttendance(id, link) {
  try {
    // Retrieve session details from the database
    const loadUpdateSessionRoute = require("./loadUpdateSession");
    const session = await loadUpdateSessionRoute.selectSessionDetails(link, id);

    // Remove non-required properties from the organiser data
    delete session.organisers;
    delete session.questions;
    delete session.subsessions;

    session.attendance = await selectAttendanceFromDatabase(id, link);

    session.attendance = organiseAttendance(session.attendance);

    //Format the session date to ISO format
    session.date = dateUtilities.formatDateUK(session.date);
    /*
  // Decode HTML entities in name and title
  res.name = decodeHtmlEntities(res.name);
  res.title = decodeHtmlEntities(res.title);

*/

    return session;
  } catch (error) {
    throw error;
  }
}

/**
 * @function selectAttendanceFromDatabase
 * @summary Retrieves the session attendance for a specific session ID.
 *
 * @param {string} id - The session ID.
 * @param {object} link - The database connection object.
 * @returns {object} - The session attendance data.
 * @throws {Error} - Throws an error if database connection, query preparation, or execution fails.
 */
async function selectAttendanceFromDatabase(id, link) {
  // Check if the database link (connection) is valid
  if (!link) throw new Error("Database connection failed.");

  try {
    // Prepare SQL query to fetch feedback for the given session ID
    const [result] = await link.execute(
      `SELECT name, region, organisation FROM ${config.feedback.tables.tblAttendance} WHERE id = ? ORDER BY region, organisation, name`,
      [id] // Session ID is passed as a parameter
    );

    if (result.length < 3)
      throw new Error(
        "Cannot view attendance where fewer than 3 attendees exist to protect feedback anonymity."
      );

    return result;
  } catch (error) {
    throw error;
  }
}

/**
 * @function organiseAttendance
 * @summary Organizes the feedback responses for each question.
 *
 * @param {object} attendance - The attendance organize.
 *
 * @returns {object} - The attendance data organised by region and organisation.
 */
function organiseAttendance(rawAttendance) {
  const attendance = {
    count: 0,
    regions: [],
  };
  let currentRegionName = "";
  let currentRegion = {};
  let currentOrganisationName = "";
  let currentOrganisation = {};

  for (let attendee of rawAttendance) {
    //get the region of this attendee
    currentRegionName = attendee.region;

    //check if the current attendee's region is already created in attendance object and map it to currentRegion object
    currentRegion = attendance.regions.find(
      (region) => region.name === currentRegionName
    );

    //if not already created, create the region in the attendance object, then map to currentRegion object
    if (!currentRegion) {
      attendance.regions.push({
        name: currentRegionName,
        count: 0,
        organisations: [],
      });
      currentRegion = attendance.regions.find(
        (region) => region.name === currentRegionName
      );
    }

    //get the organisation of this attendee
    currentOrganisationName = attendee.organisation;

    //check if the current attendee's organisation is already created in currentRegion object and map it to currentOrganisation object
    currentOrganisation = currentRegion.organisations.find(
      (organisation) => organisation.name === currentOrganisationName
    );

    //if not already created, create the region in the attendance object, then map to currentRegion object
    if (!currentOrganisation) {
      currentRegion.organisations.push({
        name: currentOrganisationName,
        count: 0,
        attendees: [],
      });
      currentOrganisation = currentRegion.organisations.find(
        (organisation) => organisation.name === currentOrganisationName
      );
    }

    //add the attendees name to the array of attendees for this organisation in this region
    if (!currentOrganisation.attendees.includes(attendee.name)) {
      currentOrganisation.attendees.push(attendee.name);
      currentOrganisation.count++;
      currentRegion.count++;
      attendance.count++;
    }
  }

  return attendance;
}

module.exports = { viewAttendance };
