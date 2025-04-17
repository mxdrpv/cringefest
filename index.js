const express = require('express');
const bodyParser = require('body-parser');
const { Telegraf } = require('telegraf');
const { token } = require('./config');

const app = express();
const bot = new Telegraf(token);

// Настроим webhook
const webhookUrl = process.env.WEBHOOK_URL || 'https://cringefest.onrender.com';
bot.telegram.setWebhook(webhookUrl);

// Обработчик обновлений
app.use(bodyParser.json());

app.post('/', (req, res) => {
  bot.handleUpdate(req.body, res);
  res.send('ok');
});

// Пример простой команды
bot.start((ctx) => ctx.reply('Добро пожаловать в Кринж-Фест! Напишите /start_cringe для начала игры.'));

bot.command('start_cringe', async (ctx) => {
  const chatId = ctx.chat.id;
  // Твоя логика для старта игры
  await ctx.reply('🚀 Игра начинается! Напиши свой кринжовый ответ в ЛС боту!');
  // Здесь будет дальше идти твой код для игры
});

// Запуск сервера
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
