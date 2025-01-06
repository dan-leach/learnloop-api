/**
 * @module viewFeedback
 * @memberof module:feedback
 * @summary Provides functionality to retrieve session details and organize feedback.
 * @description
 * This module is responsible for retrieving session details, feedback data,
 * and organizing feedback for each session or its subsessions.
 * It includes utilities for fetching and processing feedback data from the database.
 *
 * @requires ../../../config.json - Configuration file containing database table settings for feedback data retrieval.
 * @requires ../../utilities/dateUtilities - Utility module for formatting dates.
 * @requires ./loadUpdateSession - Module for retrieving session and subsession details.
 *
 * @exports viewFeedback - Core function for retrieving and processing feedback data.
 * @exports selectFeedbackFromDatabase - Helper function to retrieve feedback from the database.
 */

const config = require("../../../config.json");
const dateUtilities = require("../../utilities/dateUtilities");

/**
 * @function viewFeedback
 * @memberof module:feedback
 * @summary Retrieves session details and feedback for a given session ID.
 * @description
 * Fetches session and subsession details from the database and retrieves feedback for
 * the session and its subsessions. Organizes feedback into a structured format for presentation.
 *
 * @param {string} id - The unique identifier of the session.
 * @param {object} link - The database connection object.
 * @returns {object} - An object containing session details, feedback, and organized responses.
 * @throws {Error} - Throws an error if retrieving feedback or session data fails.
 */
async function viewFeedback(id, link) {
  const loadUpdateSessionRoute = require("./loadUpdateSession");
  const session = await loadUpdateSessionRoute.selectSessionDetails(link, id);

  const subsessionIDs = session.subsessions;
  session.subsessions = await loadUpdateSessionRoute.selectSubsessionDetails(
    link,
    subsessionIDs
  );

  session.organisers = session.organisers.map(
    ({ pinHash, salt, lastSent, email, notifications, ...rest }) => rest
  );

  session.feedback = await selectFeedbackFromDatabase(id, link);
  session.date = dateUtilities.formatDateUK(session.date);

  for (let subsession of session.subsessions) {
    subsession.feedback = await selectFeedbackFromDatabase(subsession.id, link);
  }

  session.questions = organiseQuestionFeedback(
    session.questions,
    session.feedback.questionFeedback
  );
  delete session.feedback.questionFeedback;

  return session;
}

/**
 * @function selectFeedbackFromDatabase
 * @memberof module:feedback
 * @summary Retrieves feedback for a specific session ID from the database.
 * @description
 * Fetches all feedback entries associated with the given session ID from the database,
 * including positive and negative feedback, question responses, and session scores.
 * Returns the data in a structured format.
 *
 * @param {string} id - The unique identifier of the session.
 * @param {object} link - The database connection object.
 * @returns {object} - An object containing feedback data:
 * - `positive`: Array of positive feedback comments.
 * - `negative`: Array of negative feedback comments.
 * - `questionFeedback`: Array of responses to session questions.
 * - `score`: Array of session scores.
 * @throws {Error} - Throws an error if database connection or query execution fails.
 */
async function selectFeedbackFromDatabase(id, link) {
  if (!link) throw new Error("Database connection failed.");

  const [result] = await link.execute(
    `SELECT * FROM ${config.feedback.tables.tblSubmissions} WHERE id = ?`,
    [id]
  );

  const feedback = {
    positive: [],
    negative: [],
    questionFeedback: [],
    score: [],
  };

  if (result.length > 0) {
    result.forEach((row) => {
      feedback.positive.push(row.positive);
      feedback.negative.push(row.negative);
      feedback.questionFeedback.push(JSON.parse(row.questions));
      feedback.score.push(row.score);
    });
  } else {
    feedback.positive.push("No feedback found.");
    feedback.negative.push("No feedback found.");
    feedback.questionFeedback.push("No feedback found.");
    feedback.score.push("No feedback found.");
  }

  return feedback;
}

/**
 * @function organiseQuestionFeedback
 * @memberof module:feedback
 * @summary Organizes feedback responses for session questions.
 * @description
 * Processes and organizes feedback responses for each session question. Supports text-type
 * questions (adding responses) and option-based questions (counting selections).
 *
 * @param {Array} questions - The list of questions associated with the session.
 * @param {Array} questionFeedback - The feedback responses for the questions.
 * @returns {Array} - The updated questions array with organized feedback.
 */
function organiseQuestionFeedback(questions, questionFeedback) {
  questions.forEach((question) => {
    question.responses = [];
    try {
      question.options.forEach((option) => {
        option.count = 0;
      });
    } catch (error) {
      console.error("question.options.forEach error. question:", question);
      throw error;
    }
  });

  questionFeedback.forEach((responseSet) => {
    if (typeof responseSet !== "object") return;
    responseSet.forEach((response) => {
      questions.forEach((question) => {
        if (response.title === question.title) {
          if (question.type === "text") {
            question.responses.push(response.response);
          } else {
            question.options.forEach((option) => {
              if (question.type === "checkbox") {
                const responseOption = response.options.find(
                  (opt) => opt.title === option.title
                );
                if (responseOption?.selected) option.count++;
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

  return questions;
}

module.exports = { viewFeedback, selectFeedbackFromDatabase };
