// sessionStore.js
const sessions = {};

function createSession(chatId) {
  sessions[chatId] = {
    players: [],
    phase: null,
    prompt: null,
    answers: [],
    votes: {},
    scores: {}
  };
}

function getSession(chatId) {
  return sessions[chatId];
}

function getAllSessions() {
  return sessions;
}

module.exports = {
  sessions,
  createSession,
  getSession,
  getAllSessions
};
