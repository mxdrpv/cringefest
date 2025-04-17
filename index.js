// index.js
const express = require('express');
const bodyParser = require('body-parser');
const { Telegraf } = require('telegraf');
const { token } = require('./config');
const { startGame, handleJoin, beginGame, handleAnswer, handleVote } = require('./gameManager');

const app = express();
const bot = new Telegraf(token);

// Webhook (Render автоматически выдаёт HTTPS URL)
const webhookUrl = process.env.WEBHOOK_URL;
bot.telegram.setWebhook(`${webhookUrl}/`);
app.use(bodyParser.json());
app.post('/', (req, res) => bot.handleUpdate(req.body, res) && res.send('ok'));

// Команды и кнопки
bot.start(ctx => ctx.reply('Добро пожаловать! /start_cringe в групповом чате'));
bot.command('start_cringe', ctx => startGame(ctx, bot));
bot.action('join_game', ctx => handleJoin(ctx));
bot.action('begin_game', ctx => beginGame(ctx, bot));
bot.on('text', ctx => ctx.chat.type === 'private' && handleAnswer(ctx));
bot.action(/vote_(\d+)/, ctx => handleVote(ctx));

// Поднимаем сервер
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server on ${port}`));
