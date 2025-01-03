/**
 * @module viewAttendance
 * @memberof module:feedback
 * @summary Provides functionality to retrieve session details and attendance data.
 * @description
 * This module retrieves session details and attendance information for a specified session ID.
 * It organizes attendance data by region and organization for structured presentation.
 *
 * @requires ../../../config.json - Configuration file containing database table settings for attendance data retrieval.
 * @requires ../../utilities/dateUtilities - Utility module for formatting dates.
 * @requires ./loadUpdateSession - Module for retrieving session details.
 *
 * @exports viewAttendance - Core function to retrieve and organize attendance data.
 */

const config = require("../../../config.json");
const dateUtilities = require("../../utilities/dateUtilities");

/**
 * @function viewAttendance
 * @memberof module:viewAttendance
 * @summary Retrieves session details and organizes attendance for a given session ID.
 * @description
 * Fetches session details from the database and retrieves attendance data for the session.
 * Organizes attendance data into a structured format grouped by region and organization.
 *
 * @param {string} id - The unique identifier of the session.
 * @param {object} link - The database connection object.
 * @returns {object} - An object containing session details and organized attendance data.
 * @throws {Error} - Throws an error if retrieving session details or attendance data fails.
 */
async function viewAttendance(id, link) {
  const loadUpdateSessionRoute = require("./loadUpdateSession");
  const session = await loadUpdateSessionRoute.selectSessionDetails(link, id);

  if (session.isSubsession) {
    throw Object.assign(
      new Error(
        "Attendance data is only available to session series organisers"
      ),
      { statusCode: 401 }
    );
  }

  if (!session.attendance) {
    throw Object.assign(
      new Error("Attendance register is not enabled for this session"),
      { statusCode: 400 }
    );
  }

  delete session.organisers;
  delete session.questions;
  delete session.subsessions;

  session.attendance = await selectAttendanceFromDatabase(id, link);
  session.attendance = organiseAttendance(session.attendance);

  session.date = dateUtilities.formatDateUK(session.date);

  return session;
}

/**
 * @function selectAttendanceFromDatabase
 * @memberof module:viewAttendance
 * @summary Retrieves attendance data for a specific session ID from the database.
 * @description
 * Fetches attendance records associated with the specified session ID from the database.
 * Ensures a minimum of three attendees to maintain anonymity for feedback.
 *
 * @param {string} id - The unique identifier of the session.
 * @param {object} link - The database connection object.
 * @returns {Array} - An array of attendance records including attendee names, regions, and organizations.
 * @throws {Error} - Throws an error if the database connection fails, query execution fails, or if fewer than three attendees exist.
 */
async function selectAttendanceFromDatabase(id, link) {
  if (!link) throw new Error("Database connection failed.");

  const [result] = await link.execute(
    `SELECT name, region, organisation FROM ${config.feedback.tables.tblAttendance} WHERE id = ? ORDER BY region, organisation, name`,
    [id]
  );

  if (result.length < 3) {
    throw Object.assign(
      new Error(
        "Cannot view attendance where fewer than 3 attendees exist to protect feedback anonymity"
      ),
      { statusCode: 401 }
    );
  }

  return result;
}

/**
 * @function organiseAttendance
 * @memberof module:viewAttendance
 * @summary Organizes attendance data by region and organization.
 * @description
 * Processes raw attendance data, grouping attendees by region and organization.
 * Counts attendees and structures the data for easier interpretation.
 *
 * @param {Array} rawAttendance - An array of raw attendance records.
 * @returns {object} - An object representing organized attendance data:
 * - `count`: Total number of attendees.
 * - `regions`: Array of regions, each containing:
 *   - `name`: Region name.
 *   - `count`: Number of attendees in the region.
 *   - `organisations`: Array of organizations, each containing:
 *     - `name`: Organization name.
 *     - `count`: Number of attendees in the organization.
 *     - `attendees`: Array of attendee names.
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
    currentRegionName = attendee.region;

    currentRegion = attendance.regions.find(
      (region) => region.name === currentRegionName
    );

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

    currentOrganisationName = attendee.organisation;

    currentOrganisation = currentRegion.organisations.find(
      (organisation) => organisation.name === currentOrganisationName
    );

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
