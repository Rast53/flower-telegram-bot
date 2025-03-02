const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const https = require('https');
const axios = require('axios');

// Переменные окружения
const botToken = process.env.BOT_TOKEN;
const webAppUrl = process.env.WEBAPP_URL || 'https://ra.nov.ru';
const apiUrl = process.env.API_URL || 'http://flower-backend:3000';

// Состояние сервисов
let servicesAvailable = false;
let checkingServices = false;
let lastCheck = 0;
const CHECK_INTERVAL = 30000; // Проверка каждые 30 секунд

// Инициализация бота
const bot = new Telegraf(botToken);

// Создание Express приложения для webhook
const app = express();
app.use(express.json());
app.use(cors());

// Функция для проверки доступности API
async function checkServicesAvailability() {
  if (checkingServices) return servicesAvailable;
  
  // Если последняя проверка была недавно, используем кешированный результат
  if (Date.now() - lastCheck < CHECK_INTERVAL) {
    return servicesAvailable;
  }
  
  checkingServices = true;
  try {
    // Проверяем доступность API с таймаутом 5 секунд
    const response = await axios.get(`${apiUrl}/api/health`, { timeout: 5000 });
    servicesAvailable = response.status === 200;
    console.log(`Сервисы ${servicesAvailable ? 'доступны' : 'недоступны'}`);
  } catch (error) {
    servicesAvailable = false;
    console.log('Ошибка при проверке доступности сервисов:', error.message);
  } finally {
    checkingServices = false;
    lastCheck = Date.now();
  }
  
  return servicesAvailable;
}

// Middleware для проверки доступности сервисов перед обработкой команд
bot.use(async (ctx, next) => {
  // Пропускаем проверку для системных обновлений
  if (!ctx.message && !ctx.callbackQuery) {
    return next();
  }
  
  // Всегда пропускаем команду /start и /status
  if (ctx.message && ctx.message.text && 
      (ctx.message.text === '/start' || ctx.message.text === '/status')) {
    return next();
  }
  
  const available = await checkServicesAvailability();
  if (!available) {
    return ctx.reply('⚠️ Сервис временно недоступен. Пожалуйста, попробуйте позже или используйте /status для проверки состояния.');
  }
  
  return next();
});

// Команда для проверки статуса сервисов
bot.command('status', async (ctx) => {
  const available = await checkServicesAvailability();
  if (available) {
    ctx.reply('✅ Сервисы цветочного магазина доступны.');
  } else {
    ctx.reply('⚠️ Сервисы временно недоступны. Наши специалисты уже работают над решением проблемы.');
  }
});

// Основная команда для запуска бота
bot.start((ctx) => {
  ctx.reply(
    'Добро пожаловать в цветочный магазин! Выберите действие:',
    Markup.keyboard([
      [Markup.button.webApp('🌹 Открыть каталог', `${webAppUrl}`)],
      ['💬 Связаться с менеджером', '📦 Мои заказы'],
      ['📊 Статус системы']
    ]).resize()
  );
});

// Обработка текстовых сообщений
bot.on('text', async (ctx) => {
  const text = ctx.message.text;

  if (text === '💬 Связаться с менеджером') {
    ctx.reply('Наш менеджер скоро свяжется с вами. Также вы можете позвонить нам по телефону: +7 (XXX) XXX-XX-XX');
  }
  else if (text === '📦 Мои заказы') {
    // Здесь можно добавить логику получения заказов пользователя
    ctx.reply('Вы можете просмотреть свои заказы в личном кабинете:',
      Markup.inlineKeyboard([
        Markup.button.webApp('Мои заказы', `${webAppUrl}/profile`)
      ])
    );
  }
  else if (text === '📊 Статус системы') {
    const available = await checkServicesAvailability();
    if (available) {
      ctx.reply('✅ Сервисы цветочного магазина доступны.');
    } else {
      ctx.reply('⚠️ Сервисы временно недоступны. Наши специалисты уже работают над решением проблемы.');
    }
  }
  else {
    ctx.reply('Выберите действие в меню или посетите наш магазин',
      Markup.keyboard([
        [Markup.button.webApp('🌹 Открыть каталог', `${webAppUrl}`)],
        ['💬 Связаться с менеджером', '📦 Мои заказы'],
        ['📊 Статус системы']
      ]).resize()
    );
  }
});

// Обработка данных из веб-приложения
bot.on('web_app_data', async (ctx) => {
  const available = await checkServicesAvailability();
  if (!available) {
    return ctx.reply('⚠️ Извините, сервис временно недоступен. Пожалуйста, попробуйте оформить заказ позже.');
  }
  
  const data = ctx.webAppData.data;
  try {
    const orderData = JSON.parse(data);
    // Обработка данных заказа
    ctx.reply(`Спасибо за заказ! Номер заказа: ${orderData.orderId}`);
    // Здесь можно добавить логику сохранения заказа
  } catch (e) {
    ctx.reply('Произошла ошибка при обработке заказа.');
  }
});

// Настройка webhook для Telegram бота
app.post('/webhook', (req, res) => {
  bot.handleUpdate(req.body, res);
});

// Эндпоинт для проверки работоспособности бота
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Запуск сервера
const PORT = process.env.PORT || 3000;

// Инициализация и периодическая проверка сервисов
async function initializeBot() {
  console.log('Инициализация бота...');
  
  // Первая проверка доступности сервисов
  await checkServicesAvailability();
  
  // Периодическая проверка доступности сервисов
  setInterval(checkServicesAvailability, CHECK_INTERVAL);
  
  if (process.env.NODE_ENV === 'production') {
    // Используем HTTPS в production
    const httpsOptions = {
      key: fs.readFileSync(path.resolve(__dirname, 'privkey.pem')),
      cert: fs.readFileSync(path.resolve(__dirname, 'fullchain.pem'))
    };

    https.createServer(httpsOptions, app).listen(PORT, () => {
      console.log(`Telegram bot server is running on port ${PORT} with HTTPS`);

      // Установка webhook
      const webhookUrl = `${webAppUrl}/telegram-webhook`;
      bot.telegram.setWebhook(webhookUrl).then(() => {
        console.log(`Webhook set to ${webhookUrl}`);
      });
    });
  } else {
    // Используем HTTP для разработки
    app.listen(PORT, () => {
      console.log(`Telegram bot server is running on port ${PORT}`);
    });

    // Использование long polling для локальной разработки
    bot.launch().then(() => {
      console.log('Bot started in polling mode');
    });
  }
}

// Запуск бота
initializeBot();

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));