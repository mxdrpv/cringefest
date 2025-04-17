const sessions = {}
module.exports = {
  createSession(chatId) {
    sessions[chatId] = {
      players: [],
      prompt: '',
      answers: [],
      votes: {},
      scores: {},
      phase: 'waiting'
    }
  },
  getSession(chatId) {
    return sessions[chatId]
  },
  updateSession(chatId, data) {
    Object.assign(sessions[chatId], data)
  }
}