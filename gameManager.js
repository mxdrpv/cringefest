// gameManager.js
const prompts = require('./prompts');
const { createSession, getSession, sessions } = require('./sessionStore');
const { shuffle } = require('./utils');
const { Markup } = require('telegraf');

async function startGame(ctx, bot) {
  const chatId = ctx.chat.id;
  createSession(chatId);
  const session = getSession(chatId);

  session.phase = 'joining';
  await ctx.reply(
    `🔥 КРИНЖ-ФЕСТ НАЧИНАЕТСЯ!\nНажимай кнопку ниже, чтобы вступить в игру. Ждём игроков...`,
    Markup.inlineKeyboard([
      [Markup.button.callback('🙋 Вступить', 'join_game')],
      [Markup.button.callback('🚀 Начать', 'begin_game')]
    ])
  );
}

async function handleJoin(ctx) {
  const chatId = ctx.chat.id;
  const userId = ctx.from.id;
  const session = getSession(chatId);
  if (!session || session.phase !== 'joining') return;

  if (session.players.some(p => p.id === userId)) {
    return ctx.answerCbQuery('Ты уже в игре!');
  }
  session.players.push({ id: userId, name: ctx.from.first_name });
  await ctx.answerCbQuery('Добавил тебя!');
  await ctx.reply(`${ctx.from.first_name} вступил(а) в игру!`);
}

async function beginGame(ctx, bot) {
  const chatId = ctx.chat.id;
  const session = getSession(chatId);
  if (!session || session.phase !== 'joining') return;
  if (session.players.length < 3) {
    return ctx.answerCbQuery('Нужно минимум 3 игрока!');
  }

  session.phase = 'answering';
  session.prompt = prompts[Math.floor(Math.random() * prompts.length)];
  session.answers = [];
  session.votes = {};
  session.scores = {};

  await bot.telegram.sendMessage(chatId, '📝 Отправляю задание в ЛС всем участникам...');
  for (const p of session.players) {
    try {
      await bot.telegram.sendMessage(
        p.id,
        `📝 Твое задание:\n${session.prompt}\n\nУ тебя 60 секунд.`
      );
    } catch {
      await bot.telegram.sendMessage(chatId, `❌ Не могу написать ${p.name} в ЛС.`);
    }
  }

  // через 60с публикуем ответы
  setTimeout(() => publishAnswers(chatId, bot), 60000);
}

async function handleAnswer(ctx) {
  // ищем сессию, где сейчас фаза 'answering' и ты в players
  const session = Object.values(sessions).find(
    s => s.phase === 'answering' && s.players.some(p => p.id === ctx.from.id)
  );
  if (!session) return;

  if (session.answers.some(a => a.id === ctx.from.id)) {
    return ctx.reply('Ты уже отправил ответ!');
  }
  session.answers.push({ id: ctx.from.id, text: ctx.message.text });
  await ctx.reply('✅ Ответ принят!');
}

async function publishAnswers(chatId, bot) {
  const session = getSession(chatId);
  session.phase = 'voting';
  session.answers = shuffle(session.answers);

  let text = '🗳 Голосуем за самый кринжовый ответ:\n';
  session.answers.forEach((a, i) => (text += `${i + 1}. ${a.text}\n`));

  const buttons = session.answers.map((_, i) => [Markup.button.callback(`${i+1}`, `vote_${i}`)]);
  await bot.telegram.sendMessage(chatId, text, Markup.inlineKeyboard(buttons));

  // Закрываем голосование через 30 секунд, если кто-то забыл
  setTimeout(() => {
    if (session.phase === 'voting') countVotes(chatId, bot);
  }, 30000);
}

async function handleVote(ctx) {
  const chatId = ctx.chat.id;
  const session = getSession(chatId);
  if (!session || session.phase !== 'voting') return;

  const idx = Number(ctx.match[1]);
  const voted = session.answers[idx];
  if (!voted || voted.id === ctx.from.id) {
    return ctx.answerCbQuery('Нельзя за себя или невалидно!');
  }
  if (session.votes[ctx.from.id]) {
    return ctx.answerCbQuery('Ты уже голосовал!');
  }

  session.votes[ctx.from.id] = voted.id;
  await ctx.answerCbQuery('Голос засчитан! ✅');

  // если проголосовали все — сразу подсчет
  if (Object.keys(session.votes).length === session.players.length) {
    countVotes(chatId, bot);
  }
}

function countVotes(chatId, bot) {
  const session = getSession(chatId);
  session.phase = 'finished';

  // считаем
  Object.values(session.votes).forEach(id => {
    session.scores[id] = (session.scores[id] || 0) + 1;
  });

  // ищем победителя
  const [winnerId] = Object.entries(session.scores).reduce(
    (best, [id, sc]) => (sc > best[1] ? [id, sc] : best),
    [null, -1]
  );

  const winner = session.players.find(p => p.id == winnerId);
  bot.telegram.sendMessage(chatId, `👑 Кринж-король: ${winner.name}!`);
}

module.exports = { startGame, handleJoin, beginGame, handleAnswer, handleVote };
