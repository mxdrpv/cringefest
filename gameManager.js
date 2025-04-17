const prompts = require('./prompts')
const store = require('./sessionStore')
const { shuffle } = require('./utils')
const { Markup } = require('telegraf')

// Запуск фазы присоединения игроков: сохраняем сообщение для редактирования
async function startGame(ctx) {
  const chatId = ctx.chat.id
  store.createSession(chatId)
  const session = store.getSession(chatId)
  session.players = []
  session.phase = 'joining'
  session.prompt = null
  session.answers = []
  session.votes = {}
  session.scores = {}

  // Сохраняем исходное сообщение, чтобы потом редактировать или удалять
  const msg = await ctx.reply(
    `🔥 КРИНЖ-ФЕСТ НАЧИНАЕТСЯ!\nНажимай кнопку ниже, чтобы вступить в игру. Ждём игроков...`,
    Markup.inlineKeyboard([
      [Markup.button.callback('🙋 Вступить в игру', 'join_game')],
      [Markup.button.callback('🚀 Начать', 'begin_game')]
    ])
  )
  session.joinMessage = { chatId, messageId: msg.message_id }
}

// Обработка присоединения: редактируем исходное сообщение, добавляя список игроков
async function handleJoin(ctx) {
  const chatId = ctx.chat.id
  const userId = ctx.from.id
  const username = ctx.from.first_name

  const session = store.getSession(chatId)
  if (!session || session.phase !== 'joining') return

  if (session.players.some(p => p.id === userId)) {
    return ctx.answerCbQuery('Ты уже в игре!')
  }
  session.players.push({ id: userId, name: username })
  await ctx.answerCbQuery('Ты в игре!')

  // Формируем текст с текущим списком
  const playersList = session.players.map((p, i) => `${i + 1}. ${p.name}`).join('\n')
  const text = `🔥 КРИНЖ-ФЕСТ НАЧИНАЕТСЯ!\nНажимай кнопку ниже, чтобы вступить в игру. Ждём игроков...\n\nИгроки:\n${playersList}`

  // Редактируем сообщение
  await ctx.telegram.editMessageText(
    session.joinMessage.chatId,
    session.joinMessage.messageId,
    null,
    text,
    Markup.inlineKeyboard([
      [Markup.button.callback('🙋 Вступить в игру', 'join_game')],
      [Markup.button.callback('🚀 Начать', 'begin_game')]
    ])
  )
}

// Начало игры: отправка ЛС заданий и планирование голосования
async function beginGame(ctx, bot) {
  const chatId = ctx.chat.id
  const session = store.getSession(chatId)
  if (!session || session.phase !== 'joining') return

  if (session.players.length < 3) {
    return ctx.answerCbQuery('Нужно минимум 3 игрока!')
  }

  // Удаляем сообщение набора игроков
  await ctx.telegram.deleteMessage(session.joinMessage.chatId, session.joinMessage.messageId)

  session.phase = 'answering'
  session.prompt = prompts[Math.floor(Math.random() * prompts.length)]
  session.answers = []
  session.votes = {}
  session.scores = {}

  await ctx.answerCbQuery('Игра стартовала! Смотри ЛС.')
  // Сообщение о рассылке заданий, сохраняем для удаления
  const taskMsg = await ctx.telegram.sendMessage(
    chatId,
    '📝 Задание разослано игрокам в ЛС!\n\nУчастники:\n' +
      session.players.map((p, i) => `${i + 1}. ${p.name}`).join('\n')
  )
  session.taskMessage = { chatId, messageId: taskMsg.message_id }

  // Отправляем в ЛС
  for (const p of session.players) {
    try {
      await ctx.telegram.sendMessage(
        p.id,
        `📝 Задание:\n${session.prompt}\n\nОтправь мне свой кринж-ответ в течение 60 секунд.`
      )
    } catch {
      await ctx.telegram.sendMessage(chatId, `❌ Не могу написать ${p.name} в ЛС.`)
    }
  }

  // Через 60 секунд публикуем ответы и запускаем голосование
  setTimeout(() => publishAnswers(chatId, bot), 60000)
}

// Приём ответов в личке
async function handleAnswer(ctx) {
  const session = Object.values(store.sessions).find(
    s => s.phase === 'answering' && s.players.some(p => p.id === ctx.from.id)
  )
  if (!session) return

  if (session.answers.some(a => a.id === ctx.from.id)) {
    return ctx.reply('Ты уже ответил!')
  }
  session.answers.push({ id: ctx.from.id, text: ctx.message.text })
  await ctx.reply('✅ Ответ принят!')
}

// Публикация ответов и начало голосования, показываем и задание
async function publishAnswers(chatId, bot) {
  const session = store.getSession(chatId)

  // Удаляем сообщение о рассылке заданий
  if (session.taskMessage && session.taskMessage.messageId) {
    await bot.telegram.deleteMessage(session.taskMessage.chatId, session.taskMessage.messageId).catch(() => {})
  }

  session.phase = 'voting'
  session.answers = shuffle(session.answers)

  // Формируем текст и сохраняем сообщение для редактирования
  let text = `🗳 Голосование! Задание:\n${session.prompt}\n\nВыбери самый кринжовый ответ:`
  session.answers.forEach((a, i) => {
    text += `\n${i + 1}. ${a.text}`
  })

  const buttons = session.answers.map((_, i) => [Markup.button.callback(`${i + 1}`, `vote_${i}`)])
  const msg = await bot.telegram.sendMessage(chatId, text, Markup.inlineKeyboard(buttons))
  session.voteMessage = { chatId, messageId: msg.message_id }

  // Завершение голосования автоматически через 30 секунд
  setTimeout(() => {
    if (session.phase === 'voting' && session.voteMessage.messageId) {
      bot.telegram.deleteMessage(session.voteMessage.chatId, session.voteMessage.messageId).catch(() => {})
      countVotes(session.voteMessage, bot)
    }
  }, 30000)
}

// Обработка голосования
async function handleVote(ctx) {
  const chatId = ctx.chat.id
  const session = store.getSession(chatId)
  if (!session || session.phase !== 'voting') return

  const idx = Number(ctx.match[1])
  const voted = session.answers[idx]
  if (!voted || voted.id === ctx.from.id) {
    return ctx.answerCbQuery('Нельзя за себя!')
  }
  if (session.votes[ctx.from.id]) {
    return ctx.answerCbQuery('Ты уже голосовал!')
  }
  session.votes[ctx.from.id] = voted.id
  await ctx.answerCbQuery('Голос принят!')

  // Редактируем сообщение голосования с текущими счётами
  const counts = session.answers.map(a => Object.values(session.votes).filter(v => v === a.id).length)
  let updated = `🗳 Голосование! Задание:\n${session.prompt}\n\nВыбери самый кринжовый ответ:`
  session.answers.forEach((a, i) => {
    const marks = '🔻'.repeat(counts[i])
    updated += `\n${i + 1}. ${a.text} ${marks}`
  })
  await ctx.telegram.editMessageText(
    session.voteMessage.chatId,
    session.voteMessage.messageId,
    null,
    updated,
    Markup.inlineKeyboard(session.answers.map((_, i) => [Markup.button.callback(`${i + 1}`, `vote_${i}`)]))
  )

  // Если все проголосовали, сразу считаем и удаляем сообщение голосования
  if (Object.keys(session.votes).length === session.players.length) {
    await ctx.telegram.deleteMessage(session.voteMessage.chatId, session.voteMessage.messageId).catch(() => {})
    countVotes(session.voteMessage, ctx.telegram)
  }
}

// Подсчёт и объявление кринж-короля
async function countVotes(voteMessage, bot) {
  const { chatId } = voteMessage
  const session = store.getSession(chatId)
  session.phase = 'finished'

  Object.values(session.votes).forEach(id => {
    session.scores[id] = (session.scores[id] || 0) + 1
  })
  const [winnerId] = Object.entries(session.scores).reduce(
    (best, [id, sc]) => sc > best[1] ? [id, sc] : best,
    [null, -1]
  )
  const winner = session.players.find(p => p.id == winnerId)
  await bot.telegram.sendMessage(chatId, `👑 Кринж-король: ${winner.name}!`)
}

module.exports = { startGame, handleJoin, beginGame, handleAnswer, handleVote }
