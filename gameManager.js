const prompts = require('./prompts')
const store = require('./sessionStore')
const { shuffle } = require('./utils')
const { Markup } = require('telegraf')

async function startGame(ctx, bot) {
  const chatId = ctx.chat.id
  store.createSession(chatId)
  const session = store.getSession(chatId)
  session.players = []
  session.phase = 'joining'
  session.prompt = null
  session.answers = []
  session.votes = {}
  session.scores = {}

  await ctx.reply(
    `🔥 КРИНЖ-ФЕСТ НАЧИНАЕТСЯ!
Нажимай кнопку ниже, чтобы вступить в игру. Ждём игроков...`,
    Markup.inlineKeyboard([
      [Markup.button.callback('🙋 Вступить в игру', 'join_game')],
      [Markup.button.callback('🚀 Начать', 'begin_game')]
    ])
  )
}

async function handleJoin(ctx) {
  const chatId = ctx.chat.id
  const userId = ctx.from.id
  const username = ctx.from.first_name

  const session = store.getSession(chatId)
  if (!session || session.phase !== 'joining') return

  const alreadyJoined = session.players.some(p => p.id === userId)
  if (!alreadyJoined) {
    session.players.push({ id: userId, name: username })
    await ctx.answerCbQuery('Ты в игре!')
    await ctx.reply(`${username} вступил(а) в игру!`)
  } else {
    await ctx.answerCbQuery('Ты уже в игре!')
  }
}

async function beginGame(ctx, bot) {
  const chatId = ctx.chat.id
  const session = store.getSession(chatId)
  if (!session || session.phase !== 'joining') return

  if (session.players.length < 3) {
    return ctx.answerCbQuery('Нужно хотя бы 3 игрока!')
  }

  session.phase = 'answering'
  const prompt = prompts[Math.floor(Math.random() * prompts.length)]
  session.prompt = prompt
  session.answers = []
  session.votes = {}
  session.scores = {}

  await bot.telegram.sendMessage(chatId, '📝 Задание разослано игрокам в ЛС!')

  for (const player of session.players) {
    try {
      await bot.telegram.sendMessage(player.id, `📝 Задание:
${prompt}

Отправь мне свой кринж-ответ в течение 60 секунд.`)
    } catch (e) {
      await bot.telegram.sendMessage(chatId, `❌ ${player.name}, я не смог отправить тебе задание. Разреши мне писать в ЛС.`)
    }
  }

  setTimeout(() => publishAnswers(chatId, bot), 60000)
}

async function handleAnswer(ctx) {
  const session = Object.values(store.sessions).find((s) => s?.players?.some((p) => p.id === ctx.from.id) && s.phase === 'answering')
  if (!session) return

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

module.exports = { startGame, handleJoin, beginGame, handleAnswer, handleVote }
