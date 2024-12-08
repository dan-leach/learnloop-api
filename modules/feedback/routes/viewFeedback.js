/**
 * @module viewFeedback
 * @memberof module:feedback
 * @summary
 *
 * @description
 *
 * @requires ../../../config.json - Configuration file containing database table settings for feedback data retrieval.
 *
 * @exports viewFeedback Core function for the module
 */

const config = require("../../../config.json");
const dateUtilities = require("../../utilities/dateUtilities");

/**
 * @function viewFeedback
 * @summary Retrieves session details and feedback for a given session ID.
 *
 * @param {string} id - The session ID.
 * @param {object} link - The database connection object.
 * @returns {object} - The session details and feedback as a JSON object.
 * @throws {Error} - Throws an error if the feedback cannot be retrieved.
 */
async function viewFeedback(id, link) {
  try {
    // Retrieve session details from the database
    const loadUpdateSessionRoute = require("./loadUpdateSession");
    const session = await loadUpdateSessionRoute.selectSessionDetails(link, id);

    // Extract subsession IDs from the session
    const subsessionIDs = session.subsessions;

    // Retrieve details for each subsession
    session.subsessions = await loadUpdateSessionRoute.selectSubsessionDetails(
      link,
      subsessionIDs
    );

    // Remove non-required properties from the organiser data
    session.organisers = session.organisers.map(
      ({ pinHash, salt, lastSent, email, notifications, ...rest }) => rest // Destructure and retain only the needed properties
    );

    session.feedback = await selectFeedbackFromDatabase(id, link);

    //Format the session date to ISO format
    session.date = dateUtilities.formatDateUK(session.date);
    /*
  // Decode HTML entities in name and title
  res.name = decodeHtmlEntities(res.name);
  res.title = decodeHtmlEntities(res.title);

*/

    for (let subsession of session.subsessions) {
      subsession.feedback = await selectFeedbackFromDatabase(
        subsession.id,
        link
      );
    }

    // Organize question feedback and update the result
    session.questions = organiseQuestionFeedback(
      session.questions,
      session.feedback.questionFeedback
    );
    delete session.feedback.questionFeedback;

    return session;
  } catch (error) {
    throw error;
  }
}

/**
 * @function selectFeedbackFromDatabase
 * @summary Retrieves the session feedback for a specific session ID.
 *
 * @param {string} id - The session ID.
 * @param {object} link - The database connection object.
 * @returns {object} - The session feedback data including positive/negative feedback, score, and questions.
 * @throws {Error} - Throws an error if database connection, query preparation, or execution fails.
 */
async function selectFeedbackFromDatabase(id, link) {
  // Check if the database link (connection) is valid
  if (!link) throw new Error("Database connection failed.");

  try {
    // Prepare SQL query to fetch feedback for the given session ID
    const [result] = await link.execute(
      `SELECT * FROM ${config.feedback.tables.tblSubmissions} WHERE id = ?`,
      [id] // Session ID is passed as a parameter
    );

    // Initialize the response object with empty arrays
    const feedback = {
      positive: [],
      negative: [],
      questionFeedback: [],
      score: [],
    };

    // If feedback exists for the session ID, process it
    if (result.length > 0) {
      result.forEach((row) => {
        feedback.positive.push(row.positive);
        feedback.negative.push(row.negative);
        feedback.questionFeedback.push(JSON.parse(row.questions));
        feedback.score.push(row.score);
      });
    } else {
      // If no feedback exists, push default "No feedback found" values
      feedback.positive.push("No feedback found.");
      feedback.negative.push("No feedback found.");
      feedback.questionFeedback.push("No feedback found.");
      feedback.score.push("No feedback found.");
    }

    return feedback;
  } catch (error) {
    throw error;
  }
}

/**
 * @function organiseQuestionFeedback
 * @summary Organizes the feedback responses for each question.
 *
 * @param {Array} questions - The list of questions to organize feedback for.
 * @param {Array} questionFeedback - The list of feedback responses to process.
 * @returns {Array} - The updated questions array with organized responses.
 */
function organiseQuestionFeedback(questions, questionFeedback) {
  // Initialize the responses and counts for each question and option
  questions.forEach((question) => {
    question.responses = []; // Empty array for storing responses for each question
    question.options.forEach((option) => {
      option.count = 0; // Reset the count for each option
    });
  });

  // Iterate over each set of feedback responses
  questionFeedback.forEach((responseSet) => {
    if (typeof responseSet != "object") return; //don't try to organise when no feedback found
    responseSet.forEach((response) => {
      // Find the matching question for each response
      questions.forEach((question) => {
        if (response.title === question.title) {
          // Handle text-type questions by directly adding responses
          if (question.type === "text") {
            question.responses.push(response.response);
          } else {
            // Handle checkbox and select-type questions by counting responses for each option
            question.options.forEach((option) => {
              if (question.type === "checkbox") {
                const responseOption = response.options.find(
                  (opt) => opt.title === option.title
                );
                if (responseOption.selected) option.count++;
              }
              if (
                question.type === "select" &&
                response.response === option.title
              ) {
                option.count++;
              }
            });
          }
        }
      });
    });
  });

  return questions; // Return the updated questions with feedback organized
}

module.exports = { viewFeedback };
