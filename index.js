const { Telegraf, Markup } = require('telegraf')
const { startGame, handleAnswer, handleVote } = require('./gameManager')
const { token } = require('./config')

const bot = new Telegraf(token)

bot.command('start_cringe', (ctx) => startGame(ctx, bot))

bot.on('text', (ctx) => handleAnswer(ctx))

bot.action(/vote_(\d+)/, (ctx) => handleVote(ctx))

bot.launch()
console.log('Cringe-Fest bot запущен 🚀')