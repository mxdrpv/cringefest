const prompts = require('./prompts')
const store = require('./sessionStore')
const { shuffle } = require('./utils')
const { Markup } = require('telegraf')

// Запуск фазы присоединения игроков
async function startGame(ctx) {
  const chatId = ctx.chat.id
  store.createSession(chatId)
  const session = store.getSession(chatId)
  session.players = []
  session.phase = 'joining'
  session.roundNumber = 0
  session.prompt = null
  session.answers = []
  session.votes = {}
  session.scores = {}

  const msg = await ctx.reply(
    `🔥 КРИНЖ-ФЕСТ НАЧИНАЕТСЯ!\nНажимай кнопку ниже, чтобы вступить в игру. Ждём игроков...`,
    Markup.inlineKeyboard([
      [Markup.button.callback('🙋 Вступить в игру', 'join_game')],
      [Markup.button.callback('🚀 Начать', 'begin_game')]
    ])
  )
  session.joinMessage = { chatId, messageId: msg.message_id }
}

// Присоединение игроков
async function handleJoin(ctx) {
  const chatId = ctx.chat.id
  const session = store.getSession(chatId)
  if (!session || session.phase !== 'joining') return
  const userId = ctx.from.id
  if (session.players.some(p => p.id === userId)) {
    return ctx.answerCbQuery('Ты уже в игре!')
  }
  session.players.push({ id: userId, name: ctx.from.first_name })
  await ctx.answerCbQuery('Ты в игре!')
  // Обновляем сообщение с игроками
  const playersList = session.players.map((p, i) => `${i + 1}. ${p.name}`).join('\n')
  const text = `🔥 КРИНЖ-ФЕСТ (раунд ${session.roundNumber + 1}/3)\nИгроки:\n${playersList}`
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

// Начало или следующий раунд игры
async function beginRound(chatId, bot) {
  const session = store.getSession(chatId)
  session.phase = 'answering'
  session.roundNumber++
  session.prompt = prompts[Math.floor(Math.random() * prompts.length)]
  session.answers = []
  session.votes = {}

  // Удаляем предыдущее сообщения (join или task)
  if (session.currentMessage) {
    await bot.telegram.deleteMessage(session.currentMessage.chatId, session.currentMessage.messageId).catch(() => {})
  }

  // Сообщаем в чат о старте раунда
  const roundMsg = await bot.telegram.sendMessage(
    chatId,
    `📝 Раунд ${session.roundNumber}/3: задание разослано в ЛС игрокам.`
  )
  session.currentMessage = { chatId, messageId: roundMsg.message_id }

  // Разослать личные сообщения
  for (const p of session.players) {
    try {
      await bot.telegram.sendMessage(
        p.id,
        `📝 Раунд ${session.roundNumber}/3 — твоё задание:\n${session.prompt}\n60 секунд на ответ.`
      )
    } catch {
      await bot.telegram.sendMessage(chatId, `❌ Не могу написать ${p.name}`)
    }
  }

  setTimeout(() => publishAnswers(chatId, bot), 60000)
}

// Команда запуска из чата
async function beginGame(ctx, bot) {
  const chatId = ctx.chat.id
  const session = store.getSession(chatId)
  if (!session || session.phase !== 'joining') return
  if (session.players.length < 3) {
    return ctx.answerCbQuery('Нужно минимум 3 игрока!')
  }
  // Удалить сообщение join
  await ctx.telegram.deleteMessage(session.joinMessage.chatId, session.joinMessage.messageId)
  await ctx.answerCbQuery('Игра стартует!')
  // Запускаем первый раунд
  await beginRound(chatId, bot)
}

// Сбор ответов
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

// Публикация ответов и голосование
async function publishAnswers(chatId, bot) {
  const session = store.getSession(chatId)
  session.phase = 'voting'
  session.answers = shuffle(session.answers)
  // Удаляем уведомление о задании
  await bot.telegram.deleteMessage(session.currentMessage.chatId, session.currentMessage.messageId).catch(() => {})
  // Показываем задания и варианты
  let text = `🗳 Раунд ${session.roundNumber}/3 — голосуем:\n${session.prompt}`
  session.answers.forEach((a,i) => text += `\n${i+1}. ${a.text}`)
  const buttons = session.answers.map((_,i)=>[Markup.button.callback(`${i+1}`,`vote_${i}`)])
  const voteMsg = await bot.telegram.sendMessage(chatId, text, Markup.inlineKeyboard(buttons))
  session.currentMessage = { chatId, messageId: voteMsg.message_id }

  setTimeout(() => {
    if (session.phase==='voting') {
      bot.telegram.deleteMessage(session.currentMessage.chatId, session.currentMessage.messageId).catch(()=>{})
      countVotes(chatId, bot.telegram)
    }
  },30000)
}

// Обработка голосов
async function handleVote(ctx) {
  const chatId = ctx.chat.id
  const session = store.getSession(chatId)
  if (!session || session.phase !== 'voting') return
  const idx = Number(ctx.match[1])
  const voted = session.answers[idx]
  if (!voted||voted.id===ctx.from.id) return ctx.answerCbQuery('Нельзя за себя!')
  if (session.votes[ctx.from.id]) return ctx.answerCbQuery('Уже проголосовал!')
  session.votes[ctx.from.id]=voted.id
  await ctx.answerCbQuery('Голос принят')
  // Редактируем счёт
  const counts=session.answers.map(a=>Object.values(session.votes).filter(v=>v===a.id).length)
  let updated=`🗳 Раунд ${session.roundNumber}/3 — голосуем:\n${session.prompt}`
  session.answers.forEach((a,i)=>{updated+=`\n${i+1}. ${a.text} ${'🔻'.repeat(counts[i])}`})
  await ctx.telegram.editMessageText(
    session.currentMessage.chatId,
    session.currentMessage.messageId,
    null,
    updated,
    Markup.inlineKeyboard(session.answers.map((_,i)=>[Markup.button.callback(`${i+1}`,`vote_${i}`)]))
  )
  if(Object.keys(session.votes).length===session.players.length){
    await ctx.telegram.deleteMessage(session.currentMessage.chatId, session.currentMessage.messageId).catch(()=>{})
    countVotes(chatId, ctx.telegram)
  }
}

// Подсчёт и переход между раундами
async function countVotes(chatId, telegram) {
  const session = store.getSession(chatId)
  session.phase = 'finished'
  // считаем
  Object.values(session.votes).forEach(id=>session.scores[id]=(session.scores[id]||0)+1)
  // объявляем победителя раунда
  const [winId]=Object.entries(session.scores).reduce((b,[id,sc])=>sc>b[1]?[id,sc]:b,[null,-1])
  const winner=session.players.find(p=>p.id==winId)
  await telegram.sendMessage(chatId,`🏆 Раунд ${session.roundNumber} — кринж-король: ${winner.name}!`)
  // следующий раунд или конец
  if(session.roundNumber<3){
    await beginRound(chatId,{telegram})
  } else {
    // финал
    const final= session.players.map(p=>`${p.name}: ${session.scores[p.id]||0}`).join('\n')
    await telegram.sendMessage(chatId,`🎉 Игра окончена! Итоги:\n${final}`)
  }
}

module.exports = { startGame, handleJoin, beginGame, handleAnswer, handleVote }
