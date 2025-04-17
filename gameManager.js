const prompts = require('./prompts')
const store = require('./sessionStore')
const { shuffle } = require('./utils')

async function startGame(ctx, bot) {
  const chatId = ctx.chat.id
  store.createSession(chatId)
  const session = store.getSession(chatId)
  session.players.push({ id: ctx.from.id, name: ctx.from.first_name })

  await ctx.reply(`🧻 КРИНЖ-ФЕСТ НАЧИНАЕТСЯ! Пиши в ЛС боту, чтобы участвовать.`)

  const prompt = prompts[Math.floor(Math.random() * prompts.length)]
  session.prompt = prompt
  session.phase = 'answering'
  session.players = [                             // И ЭТО
  { id: ctx.from.id, name: ctx.from.first_name },  // ВРЕМЕННО ДЛЯ МЕНЯ, ПОТОМ УБЕРУ
]

  for (const player of session.players) {
    bot.telegram.sendMessage(player.id, `📝 Задание:
${prompt}

Отправь мне свой кринж-ответ в течение 60 секунд.`)
  }

  setTimeout(() => publishAnswers(chatId, bot), 60000)
}

async function handleAnswer(ctx) {
  const session = Object.values(store).find((s) => s?.players?.some((p) => p.id === ctx.from.id))
  if (!session || session.phase !== 'answering') return

  const player = session.players.find(p => p.id === ctx.from.id)
  if (session.answers.some(a => a.id === player.id)) return

  session.answers.push({ id: player.id, text: ctx.message.text })
  ctx.reply('✅ Ответ принят')
}

async function publishAnswers(chatId, bot) {
  const session = store.getSession(chatId)
  session.phase = 'voting'
  session.answers = shuffle(session.answers)

  let message = `🗳 Голосование началось! Выбери самый кринжовый ответ:`
  session.answers.forEach((a, i) => {
    message += `\n${i + 1}. ${a.text}`
  })
  const buttons = session.answers.map((_, i) => [Markup.button.callback(`${i + 1}`, `vote_${i}`)])

  bot.telegram.sendMessage(chatId, message, Markup.inlineKeyboard(buttons))
}

async function handleVote(ctx) {
  const chatId = ctx.chat.id
  const session = store.getSession(chatId)
  if (!session || session.phase !== 'voting') return

  const userId = ctx.from.id
  const voteIndex = parseInt(ctx.match[1])
  const voted = session.answers[voteIndex]

  if (!voted || voted.id === userId) {
    return ctx.answerCbQuery('Нельзя голосовать за себя или невалидно!')
  }

  if (session.votes[userId]) return ctx.answerCbQuery('Ты уже проголосовал!')

  session.votes[userId] = voted.id
  ctx.answerCbQuery('Голос принят ✅')

  if (Object.keys(session.votes).length === session.players.length) {
    countVotes(chatId, bot)
  }
}
async function startGame(ctx, bot) {
  const chatId = ctx.chat.id
  store.createSession(chatId)
  const session = store.getSession(chatId)
  session.players.push({ id: ctx.from.id, name: ctx.from.first_name })

  await ctx.reply(`🧻 КРИНЖ-ФЕСТ НАЧИНАЕТСЯ! Пиши в ЛС боту, чтобы участвовать.`)

  const prompt = prompts[Math.floor(Math.random() * prompts.length)]
  session.prompt = prompt
  session.phase = 'answering'

  for (const player of session.players) {
    bot.telegram.sendMessage(player.id, `📝 Задание:\n${prompt}\n\nОтправь мне свой кринж-ответ в течение 60 секунд.`)
  }

  // Запускаем таймер на 60 секунд
  setTimeout(() => publishAnswers(chatId, bot), 60000)
}

async function publishAnswers(chatId, bot) {
  const session = store.getSession(chatId)
  session.phase = 'voting'
  session.answers = shuffle(session.answers)

  let message = `🗳 Голосование началось! Выбери самый кринжовый ответ:`
  session.answers.forEach((a, i) => {
    message += `\n${i + 1}. ${a.text}`
  })
  const buttons = session.answers.map((_, i) => [Markup.button.callback(`${i + 1}`, `vote_${i}`)])

  bot.telegram.sendMessage(chatId, message, Markup.inlineKeyboard(buttons))
}
function countVotes(chatId, bot) {
  const session = store.getSession(chatId)
  session.phase = 'finished'

  for (const id of Object.values(session.votes)) {
    session.scores[id] = (session.scores[id] || 0) + 1
  }

  let max = -Infinity
  let king = null
  for (const [id, score] of Object.entries(session.scores)) {
    if (score > max) {
      max = score
      king = id
    }
  }

  const winner = session.players.find(p => p.id == king)

  bot.telegram.sendMessage(chatId, `👑 Кринж-король раунда: ${winner.name} с ${max} голосами!`)
}

module.exports = { startGame, handleAnswer, handleVote }