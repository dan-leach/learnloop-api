/**
 * @module fetchAttendancePDF
 * @memberof module:feedback
 * @summary Generates a PDF attendance report for a session.
 *
 * @description
 * This module generates a detailed PDF attendance report for a specific session,
 * including regional and organizational breakdowns. The PDF is streamed directly to the client.
 *
 * @requires PDFKit - A library for creating PDFs in Node.js.
 * @requires path - For resolving file paths.
 * @requires entities For decoding html entities
 * @requires ../../../config.json - Configuration settings for the application, including URLs.
 * @requires ../../utilities/dateUtilities - Utility functions for formatting dates.
 * @requires ./updateSession - Module for retrieving session details.
 * @requires ./viewAttendance - Module for retrieving attendance data.
 *
 * @exports fetchAttendancePDF - Function to generate and serve the PDF report.
 */

const PDFDocument = require("pdfkit");
const path = require("path");
const config = require("../../../config.json");
const dateUtilities = require("../../utilities/dateUtilities");
const { decode } = require("entities");

/**
 * @async
 * @function fetchAttendancePDF
 * @memberof module:fetchAttendancePDF
 * @summary Generates and streams a PDF attendance report.
 *
 * @description
 * Fetches session and attendance details from the database and generates a PDF report.
 * Streams the PDF directly to the HTTP response object.
 *
 * @param {number} id - The ID of the session.
 * @param {object} res - The HTTP response object to stream the PDF to the client.
 * @param {object} link - Database connection for executing queries.
 * @returns {Promise<boolean>} - Resolves to `true` if the PDF is generated and sent successfully.
 * @throws {Error} - Throws an error if PDF generation or data retrieval fails.
 */
const fetchAttendancePDF = async (id, res, link) => {
  const updateSessionRoute = require("./updateSession");
  const { viewAttendance } = require("./viewAttendance");

  // Retrieve session details and attendance data
  const sessionDetails = await updateSessionRoute.getOldSessionDetails(
    id,
    link
  );
  const { attendance } = await viewAttendance(sessionDetails.id, link);

  // Create a new PDF document
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 100, bottom: 50, left: 50, right: 50 },
  });

  // Set response headers for PDF download
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=${decode(sessionDetails.title)}-attendance.pdf`
  );

  // Pipe the PDF document to the HTTP response
  doc.pipe(res);

  // Add header with background color and logo
  const headerHeight = 60;
  const pageWidth = doc.page.width;

  doc.rect(0, 0, pageWidth, headerHeight).fill("#17a2b8");

  const logoPath = path.resolve(__dirname, "../../utilities/logo.png");
  doc.image(logoPath, 5, 10, { height: 40 });

  // Add report title and details
  doc
    .fill("black")
    .font("Helvetica-Bold")
    .moveDown(1)
    .fontSize(26)
    .text("Attendance Report", { align: "left" })
    .moveDown(0.5);

  doc
    .font("Helvetica")
    .fontSize(14)
    .text(
      `For '${decode(sessionDetails.title)}' by ${decode(sessionDetails.name)}`
    )
    .text(`Date: ${dateUtilities.formatDateUK(new Date(sessionDetails.date))}`)
    .moveDown(0.3)
    .text(`Total attendees: ${attendance.count}`)
    .moveDown(1);

  const generatedDate = new Date();
  doc
    .text(
      `Report generated: ${generatedDate.toLocaleString("en-UK", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })}`
    )
    .moveDown(1);

  // Add attendance details by region and organization
  for (const region of attendance.regions) {
    if (attendance.regions.length > 1) {
      doc.fontSize(20).text(`${region.name} (${region.count})`).moveDown(0.5);
    }

    for (const organisation of region.organisations) {
      doc
        .fontSize(14)
        .text(`${decode(organisation.name)} (${organisation.count})`)
        .moveDown(0.3);

      doc
        .fontSize(12)
        .text(decode(organisation.attendees.join(", ").replace(/,\s*$/, ".")))
        .moveDown(1);
    }
  }

  // Finalize the PDF document
  doc.end();
  return true;
};

module.exports = { fetchAttendancePDF };
