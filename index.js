const express = require('express')
const bodyParser = require('body-parser')
const { Telegraf } = require('telegraf')
const { token } = require('./config')
const { startGame, handleAnswer, handleVote } = require('./gameManager')

const app = express()
const bot = new Telegraf(token)

// Webhook
const webhookUrl = process.env.WEBHOOK_URL || 'https://cringefest.onrender.com'
bot.telegram.setWebhook(webhookUrl)
app.use(bodyParser.json())
app.post('/', (req, res) => {
  bot.handleUpdate(req.body, res)
  res.send('ok')
})

// Старт игры из чата
bot.command('start_cringe', async (ctx) => {
  await startGame(ctx, bot)
})

// Обработка ответов игроков в ЛС
bot.on('text', async (ctx) => {
  if (ctx.chat.type === 'private') {
    await handleAnswer(ctx)
  }
})

// Обработка голосов (inline кнопки)
bot.action(/vote_(\d+)/, async (ctx) => {
  await handleVote(ctx)
})

// Простой старт
bot.start((ctx) => ctx.reply('Добро пожаловать в Кринж-Фест! Напиши /start_cringe в групповом чате, чтобы начать игру.'))

// Запуск
const port = process.env.PORT || 3000
app.listen(port, () => {
  console.log(`Server is running on port ${port}`)
})
