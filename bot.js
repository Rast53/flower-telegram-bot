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

// Логирование конфигурации при запуске
console.log('===== CONFIGURATION =====');
console.log(`botToken: ${botToken ? 'Установлен (скрыт)' : 'НЕ УСТАНОВЛЕН!'}`);
console.log(`webAppUrl: ${webAppUrl}`);
console.log(`apiUrl: ${apiUrl}`);
console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
console.log(`PORT: ${process.env.PORT}`);
console.log('========================');

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
  console.log('Проверка сервисов...');
  
  // Проверяем критические настройки
  console.log(`webAppUrl: ${webAppUrl}`);
  console.log(`apiUrl: ${apiUrl}`);
  
  if (checkingServices) return servicesAvailable;
  
  // Если последняя проверка была недавно, используем кешированный результат
  if (Date.now() - lastCheck < CHECK_INTERVAL) {
    return servicesAvailable;
  }
  
  checkingServices = true;
  try {
    // Проверяем доступность API с таймаутом 5 секунд
    console.log(`Попытка подключения к API: ${apiUrl}/health`);
    const response = await axios.get(`${apiUrl}/health`, { timeout: 5000 });
    servicesAvailable = response.status === 200;
    console.log(`Сервисы ${servicesAvailable ? 'доступны' : 'недоступны'}`);
    if (servicesAvailable) {
      console.log('Ответ API:', response.data);
    }
  } catch (error) {
    servicesAvailable = false;
    console.log('Ошибка при проверке доступности сервисов:', error.message);
    console.log('Считаем сервисы недоступными');
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
  console.log("Получена команда /status");
  try {
    const available = await checkServicesAvailability();
    
    // Составляем расширенный ответ с информацией о конфигурации
    const configInfo = `
🔧 Конфигурация бота:
- WEBAPP_URL: ${webAppUrl}
- API_URL: ${apiUrl}
- Режим: ${process.env.NODE_ENV || 'development'}
- Порт: ${PORT}`;
    
    if (available) {
      console.log("Отправляю положительный ответ на команду /status");
      await ctx.reply(`✅ Сервисы цветочного магазина доступны.\n${configInfo}`);
    } else {
      console.log("Отправляю отрицательный ответ на команду /status");
      await ctx.reply(`⚠️ Сервисы временно недоступны. Наши специалисты уже работают над решением проблемы.\n${configInfo}`);
    }
  } catch (error) {
    console.error("Ошибка при обработке команды /status:", error);
    await ctx.reply("Произошла ошибка при проверке статуса сервисов. Пожалуйста, попробуйте позже.");
  }
});

// Основная команда для запуска бота
bot.start((ctx) => {
  console.log("Получена команда /start от пользователя:", ctx.from.id);
  try {
    console.log(`Создаю WebApp кнопку с URL: ${webAppUrl}`);
    ctx.reply(
      'Добро пожаловать в цветочный магазин! Выберите действие:',
      Markup.keyboard([
        [Markup.button.webApp('🌹 Открыть каталог', `${webAppUrl}`)],
        ['💬 Связаться с менеджером', '📦 Мои заказы'],
        ['📊 Статус системы', 'Тест WebApp']
      ]).resize()
    );
  } catch (error) {
    console.error("Ошибка при обработке команды /start:", error);
    ctx.reply("Произошла ошибка при запуске бота. Пожалуйста, попробуйте позже или напишите /start.");
  }
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
  else if (text === 'Проверить WebApp') {
    // Диагностическая информация
    ctx.reply(`WebApp URL настроен на: ${webAppUrl}\nПопробуйте открыть эту ссылку напрямую в браузере.`);
    
    // Добавим специальную команду для проверки WebApp с обоими URL
    ctx.reply(
      'Тестирование вашего WebApp:',
      Markup.inlineKeyboard([
        Markup.button.webApp('Ваш WebApp', `${webAppUrl}`)
      ])
    );
  }
  else if (text === 'Тест WebApp') {
    // Тестовый WebApp от Telegram для проверки работоспособности
    ctx.reply(
      'Тестирование с демо WebApp от Telegram:',
      Markup.inlineKeyboard([
        Markup.button.webApp('Telegram Demo', 'https://telegram-web-app.github.io/demo')
      ])
    );
  }
  else {
    ctx.reply('Выберите действие в меню или посетите наш магазин',
      Markup.keyboard([
        [Markup.button.webApp('🌹 Открыть каталог', `${webAppUrl}`)],
        ['💬 Связаться с менеджером', '📦 Мои заказы'],
        ['📊 Статус системы', 'Проверить WebApp', 'Тест WebApp']
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
app.post('/telegram-webhook', (req, res) => {
  console.log("Получен запрос на /telegram-webhook");
  bot.handleUpdate(req.body, res);
});

// Добавляем эндпоинт для дебага
app.get('/debug', (req, res) => {
  res.status(200).json({
    status: 'ok',
    config: {
      webAppUrl,
      apiUrl,
      environment: process.env.NODE_ENV || 'development',
      port: PORT
    },
    timestamp: new Date().toISOString()
  });
});

// Эндпоинт для проверки работоспособности бота
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Дополнительный тестовый эндпоинт
app.get('/telegram-test', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Тест Telegram бота</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          .button { 
            display: inline-block; 
            background: #30a3e6; 
            padding: 10px 20px; 
            color: white; 
            border-radius: 5px; 
            text-decoration: none; 
            margin-top: 20px;
          }
        </style>
      </head>
      <body>
        <h1>Тестовая страница Telegram бота</h1>
        <p>Эта страница показывает, что веб-сервер бота работает корректно.</p>
        <p>Текущее время: ${new Date().toLocaleString()}</p>
        <p>Конфигурация:</p>
        <ul>
          <li>WebApp URL: ${webAppUrl}</li>
          <li>API URL: ${apiUrl}</li>
          <li>Режим: ${process.env.NODE_ENV || 'development'}</li>
          <li>Порт: ${PORT}</li>
        </ul>
        <a href="/debug" class="button">Проверить JSON-конфигурацию</a>
      </body>
    </html>
  `);
});

// Запуск сервера
const PORT = process.env.PORT || 3000;

// Инициализация и периодическая проверка сервисов
async function initializeBot() {
  console.log('Инициализация бота...');
  
  // Добавляем глобальный обработчик ошибок
  bot.catch((err, ctx) => {
    console.error(`Ошибка при обработке обновления ${ctx.updateType}:`, err);
    if (ctx.message) {
      ctx.reply('Произошла ошибка при обработке вашего сообщения. Пожалуйста, попробуйте позже.');
    }
  });
  
  // Первая проверка доступности сервисов
  try {
    await checkServicesAvailability();
  } catch (error) {
    console.error('Ошибка при первичной проверке сервисов:', error);
  }
  
  // Периодическая проверка доступности сервисов
  setInterval(async () => {
    try {
      await checkServicesAvailability();
    } catch (error) {
      console.error('Ошибка при периодической проверке сервисов:', error);
    }
  }, CHECK_INTERVAL);
  
  if (process.env.NODE_ENV === 'production') {
    try {
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
          // Проверяем текущий вебхук
          bot.telegram.getWebhookInfo().then(info => {
            console.log('Webhook info:', JSON.stringify(info));
          }).catch(err => {
            console.error('Error getting webhook info:', err.message);
          });
        }).catch(err => {
          console.error('Error setting webhook:', err.message);
        });
      });
    } catch (error) {
      console.error('Критическая ошибка при инициализации HTTPS сервера:', error);
      process.exit(1);
    }
  } else {
    try {
      // Используем HTTP для разработки
      app.listen(PORT, () => {
        console.log(`Telegram bot server is running on port ${PORT}`);
      });

      // Использование long polling для локальной разработки
      bot.launch().then(() => {
        console.log('Bot started in polling mode');
      }).catch(err => {
        console.error('Error starting bot in polling mode:', err);
      });
    } catch (error) {
      console.error('Критическая ошибка при инициализации HTTP сервера:', error);
      process.exit(1);
    }
  }
}

// Запуск бота
initializeBot();

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));