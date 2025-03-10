const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const https = require('https');
const axios = require('axios');

// Переменные окружения
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const webAppUrl = process.env.WEBAPP_URL || 'https://ra.nov.ru';
const apiUrl = process.env.API_URL || 'http://flower-backend:3000';
// Добавляем ID группы администраторов
const adminGroupId = '-1002487206807'; // Группа админов - исправленный ID
const adminChatIds = ['-1002487206807']; // ID чатов администраторов - можно добавить несколько

// Ведение логов Telegram
const logTelegramRequests = true; // Включаем подробное логирование запросов к Telegram API

// Состояние для управления диалогами заказа
const orderStates = {};

// Хранилище данных пользователей для обеспечения возможности ответа
// Даже если пользователь скрыл свой профиль
const userCache = {};

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
- Режим: ${process.env.NODE_ENV || 'production'}
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
    
    // Расширенное приветственное сообщение с инструкциями
    const welcomeMessage = `
🌸 *Добро пожаловать в бот цветочного магазина!* 🌸

*Через этого бота вы можете:*
• 🛒 Заказать цветы и букеты
• 📦 Отслеживать свои заказы
• 💬 Общаться с менеджером
• 🔄 Получать уведомления о статусе заказа

*Как сделать заказ:*
1. Нажмите кнопку "🛒 Сделать заказ" через меню или используйте команду /neworder
2. Следуйте инструкциям бота для оформления заказа
3. Дождитесь подтверждения от менеджера

*Для начала работы используйте кнопки ниже ⬇️*
`;

    // Отправляем приветственное сообщение
    ctx.replyWithMarkdown(welcomeMessage, 
      Markup.keyboard([
        [Markup.button.webApp('🛒 Сделать заказ', `${webAppUrl}`), '🌹 Новый заказ'],
        ['💬 Связаться с менеджером', '📦 Мои заказы'],
        ['📊 Статус системы', '❓ Помощь']
      ]).resize()
    );
    
    // Предлагаем зарегистрироваться, если это первое взаимодействие
    setTimeout(() => {
      ctx.reply('Для полного доступа к функциям бота рекомендуем зарегистрироваться, отправив команду /register');
    }, 2000);
    
  } catch (error) {
    console.error("Ошибка при обработке команды /start:", error);
    ctx.reply("Произошла ошибка при запуске бота. Пожалуйста, попробуйте позже или напишите /start.");
  }
});

// Обработка текстовых сообщений
bot.on('text', async (ctx) => {
  const text = ctx.message.text;
  const userId = ctx.from.id;

  // Проверяем, находится ли пользователь в процессе оформления заказа
  if (orderStates[userId] && orderStates[userId].active) {
    // Обрабатываем шаги заказа
    return handleOrderStep(ctx);
  }

  // Пропускаем обработку, если это сообщение из группы администраторов
  if (ctx.chat.type !== 'private') {
    // Логируем тип чата и его ID для диагностики
    console.log(`Сообщение из группового чата: тип=${ctx.chat.type}, id=${ctx.chat.id}, title=${ctx.chat.title || 'Неизвестно'}`);
    console.log('Полные данные чата:', JSON.stringify(ctx.chat, null, 2));
    
    // Проверяем, является ли сообщение из группы администраторов
    const isAdminChat = adminChatIds.includes(ctx.chat.id.toString());
    console.log(`Является ли чат административным: ${isAdminChat}`);
    
    if (isAdminChat) {
      console.log('Сообщение из группы администраторов');
      console.log('Сообщение:', ctx.message);
      
      // Проверяем, является ли сообщение ответом на другое сообщение
      if (ctx.message.reply_to_message) {
        console.log('Это ответ на сообщение:', ctx.message.reply_to_message);
        
        let userId = null;
        
        // Пытаемся извлечь ID пользователя разными способами
        if (ctx.message.reply_to_message.forward_from) {
          // Стандартный способ - из пересланного сообщения
          userId = ctx.message.reply_to_message.forward_from.id;
          console.log(`Получен ID пользователя из forward_from: ${userId}`);
        } 
        else if (ctx.message.reply_to_message.text && ctx.message.reply_to_message.text.includes('Telegram ID:')) {
          // Из текста сообщения с заказом
          const match = ctx.message.reply_to_message.text.match(/Telegram ID:\s*(\d+)/);
          if (match && match[1]) {
            userId = match[1];
            console.log(`Получен ID пользователя из текста сообщения: ${userId}`);
          }
        }
        else if (ctx.message.reply_to_message.caption && ctx.message.reply_to_message.caption.includes('ID пользователя:')) {
          // Из подписи к изображению/файлу
          const match = ctx.message.reply_to_message.caption.match(/ID пользователя:\s*(\d+)/);
          if (match && match[1]) {
            userId = match[1];
            console.log(`Получен ID пользователя из подписи: ${userId}`);
          }
        }
        
        // Последняя попытка - искать в кэше по идентификатору сообщения
        if (!userId && ctx.message.reply_to_message.message_id) {
          const messageId = ctx.message.reply_to_message.message_id;
          console.log(`Ищем в кэше по ID сообщения: ${messageId}`);
          
          // Здесь можно добавить логику поиска по кэшу сообщений
          // ...
        }
        
        if (userId) {
          const replyText = ctx.message.text;
          
          console.log(`Отправляем ответ клиенту с ID: ${userId}`);
          
          // Отправляем ответ обратно клиенту
          try {
            await bot.telegram.sendMessage(userId, `📝 Ответ от менеджера: ${replyText}`);
            ctx.reply('✅ Сообщение отправлено клиенту');
          } catch (error) {
            console.error('Ошибка при отправке ответа клиенту:', error);
            ctx.reply(`❌ Не удалось отправить сообщение клиенту: ${error.message}`);
          }
        } else {
          console.log('Не удалось определить ID пользователя из ответа');
          ctx.reply('⚠️ Не удалось определить, кому отправить сообщение. Возможно, пользователь скрыл свой профиль.');
        }
      }
    }
    return; // Пропускаем остальные сообщения в группах
  }

  if (text === '💬 Связаться с менеджером') {
    ctx.reply('Напишите ваш вопрос прямо в этом чате, и наш менеджер свяжется с вами в ближайшее время.');
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
  else if (text === '❓ Помощь') {
    // Отправляем информацию о возможностях бота
    sendHelpMessage(ctx);
  }
  else if (text === '🌹 Новый заказ') {
    // Запускаем процесс оформления заказа
    startOrderProcess(ctx);
  }
  else {
    // Если ни одно из условий не сработало, это обычное сообщение от клиента - пересылаем его админам
    if (ctx.chat.type === 'private') {
      try {
        // Пересылаем сообщение в группу администраторов
        await bot.telegram.forwardMessage(adminGroupId, ctx.chat.id, ctx.message.message_id);
        ctx.reply('✅ Ваше сообщение отправлено менеджеру. Мы ответим вам в ближайшее время.');
      } catch (error) {
        console.error('Ошибка при пересылке сообщения администраторам:', error);
        ctx.reply('Выберите действие в меню или посетите наш магазин',
          Markup.keyboard([
            [Markup.button.webApp('🛒 Сделать заказ', `${webAppUrl}`), '🌹 Новый заказ'],
            ['💬 Связаться с менеджером', '📦 Мои заказы'],
            ['📊 Статус системы', '❓ Помощь']
          ]).resize()
        );
      }
    }
  }
});

// Команда для нового заказа через бота
bot.command('neworder', (ctx) => {
  startOrderProcess(ctx);
});

// Восстанавливаем обработчик для команды register
bot.command('register', async (ctx) => {
  try {
    // Получаем данные пользователя
    const userId = ctx.from.id;
    const firstName = ctx.from.first_name;
    const lastName = ctx.from.last_name || '';
    const username = ctx.from.username || '';
    
    console.log(`Получена команда /register от пользователя: ${userId}`);
    
    // Формируем запрос к API для регистрации пользователя
    try {
      const response = await axios.post(`${apiUrl}/api/users/telegram-register`, {
        telegram_id: userId.toString(),
        first_name: firstName,
        last_name: lastName,
        username: username
      });
      
      if (response.data && response.data.success) {
        ctx.reply(`✅ Вы успешно зарегистрированы! Теперь вы можете совершать покупки и отслеживать статус заказов.`);
        
        // Уведомляем администраторов о новой регистрации
        const adminMessage = `
🆕 Новый пользователь зарегистрировался!
👤 Пользователь: ${firstName} ${lastName} ${username ? `(@${username})` : ''}
🆔 Telegram ID: ${userId}
⏰ Время: ${new Date().toLocaleString()}
`;
        try {
          console.log(`Отправляем уведомление о регистрации в группу ${adminGroupId}`);
          await bot.telegram.sendMessage(adminGroupId, adminMessage);
          console.log('Уведомление о регистрации успешно отправлено');
        } catch (err) {
          console.error('Ошибка при отправке уведомления администраторам о регистрации:', err);
        }
      } else {
        ctx.reply('⚠️ Не удалось зарегистрироваться. Пожалуйста, попробуйте позже или свяжитесь с менеджером.');
      }
    } catch (error) {
      console.error('Ошибка при регистрации пользователя через API:', error);
      
      if (error.response && error.response.status === 409) {
        ctx.reply('ℹ️ Вы уже зарегистрированы в системе!');
      } else {
        ctx.reply('⚠️ Произошла ошибка при регистрации. Пожалуйста, попробуйте позже.');
      }
    }
  } catch (e) {
    console.error('Ошибка при обработке команды register:', e);
    ctx.reply('⚠️ Произошла ошибка. Пожалуйста, попробуйте позже.');
  }
});

// Восстанавливаем команду для просмотра заказов
bot.command('orders', async (ctx) => {
  try {
    // Получаем ID пользователя из Telegram
    const telegramId = ctx.from.id;
    
    console.log(`Получена команда /orders от пользователя: ${telegramId}`);
    
    // Запрашиваем информацию о заказах пользователя
    try {
      const response = await axios.get(`${apiUrl}/api/orders/telegram/${telegramId}`);
      
      if (response.data && response.data.orders && response.data.orders.length > 0) {
        // Формируем сообщение с информацией о заказах
        const orders = response.data.orders;
        let orderMessage = '📋 *Ваши последние заказы:*\n\n';
        
        for (const order of orders.slice(0, 5)) { // Показываем максимум 5 последних заказов
          const status = getOrderStatusText(order.status_id);
          const date = new Date(order.created_at).toLocaleDateString('ru-RU');
          const time = new Date(order.created_at).toLocaleTimeString('ru-RU', {hour: '2-digit', minute:'2-digit'});
          
          orderMessage += `🔹 *Заказ #${order.id}* (от ${date} ${time})\n`;
          orderMessage += `💰 Сумма: ${order.total_amount} ₽\n`;
          orderMessage += `📊 Статус: ${status}\n\n`;
        }
        
        orderMessage += 'Для просмотра всех заказов используйте личный кабинет на сайте.';
        
        // Отправляем сообщение с информацией о заказах
        await ctx.replyWithMarkdown(orderMessage, 
          Markup.inlineKeyboard([
            Markup.button.webApp('Детали заказов', `${webAppUrl}/profile/orders`)
          ])
        );
      } else {
        ctx.reply('У вас пока нет заказов. Вы можете оформить заказ через наш каталог:', 
          Markup.inlineKeyboard([
            Markup.button.webApp('Открыть каталог', `${webAppUrl}`)
          ])
        );
      }
    } catch (error) {
      console.error('Ошибка при получении заказов пользователя:', error);
      
      if (error.response && error.response.status === 404) {
        ctx.reply('Вы не зарегистрированы в системе. Используйте команду /register для регистрации.');
      } else {
        ctx.reply('Не удалось получить информацию о заказах. Пожалуйста, попробуйте позже или свяжитесь с менеджером.');
      }
    }
  } catch (e) {
    console.error('Ошибка при обработке команды orders:', e);
    ctx.reply('Произошла ошибка. Пожалуйста, попробуйте позже.');
  }
});

// Функция для получения текстового описания статуса заказа
function getOrderStatusText(statusId) {
  switch (statusId) {
    case 1:
      return '🕒 Ожидает обработки';
    case 2:
      return '🔄 В обработке';
    case 3:
      return '🚚 Доставляется';
    case 4:
      return '✅ Выполнен';
    case 5:
      return '❌ Отменен';
    default:
      return '❓ Неизвестный статус';
  }
}

// Функция для начала процесса оформления заказа
function startOrderProcess(ctx) {
  const userId = ctx.from.id;
  
  // Сохраняем данные пользователя в кэш
  userCache[userId] = {
    id: userId,
    username: ctx.from.username,
    firstName: ctx.from.first_name,
    lastName: ctx.from.last_name,
    lastInteraction: new Date()
  };
  
  // Инициализируем состояние заказа
  orderStates[userId] = {
    active: true,
    step: 1,
    data: {
      userId: userId,
      username: ctx.from.username,
      firstName: ctx.from.first_name,
      lastName: ctx.from.last_name,
      orderTime: new Date().toISOString()
    }
  };
  
  // Начинаем диалог
  ctx.reply(
    '🌹 Оформление нового заказа 🌹\n\nПожалуйста, опишите, что вы хотели бы заказать (тип букета/композиции, цветы, примерный бюджет и т.д.)',
    Markup.keyboard([['❌ Отменить заказ']]).resize()
  );
}

// Обработка шагов заказа
async function handleOrderStep(ctx) {
  const userId = ctx.from.id;
  const text = ctx.message.text;
  const state = orderStates[userId];
  
  // Проверяем, не хочет ли пользователь отменить заказ
  if (text === '❌ Отменить заказ') {
    delete orderStates[userId];
    return ctx.reply(
      'Оформление заказа отменено. Вы можете начать заново в любое время.',
      Markup.keyboard([
        [Markup.button.webApp('🛒 Сделать заказ', `${webAppUrl}`), '🌹 Новый заказ'],
        ['💬 Связаться с менеджером', '📦 Мои заказы'],
        ['📊 Статус системы', '❓ Помощь']
      ]).resize()
    );
  }
  
  // Обрабатываем шаги заказа
  switch (state.step) {
    case 1: // Описание заказа
      state.data.orderDescription = text;
      state.step = 2;
      
      ctx.reply('Спасибо! Теперь укажите ваш контактный телефон для связи:');
      break;
      
    case 2: // Телефон
      state.data.phone = text;
      state.step = 3;
      
      ctx.reply('Отлично! Укажите адрес доставки или выберите самовывоз:', 
        Markup.keyboard([
          ['Самовывоз из магазина'],
          ['❌ Отменить заказ']
        ]).resize()
      );
      break;
      
    case 3: // Адрес
      state.data.address = text;
      state.step = 4;
      
      ctx.reply('Почти готово! Если у вас есть дополнительные пожелания или комментарии к заказу, напишите их сейчас, или нажмите "Завершить оформление":', 
        Markup.keyboard([
          ['Завершить оформление'],
          ['❌ Отменить заказ']
        ]).resize()
      );
      break;
      
    case 4: // Комментарии и завершение
      if (text !== 'Завершить оформление') {
        state.data.comments = text;
      }
      
      // Генерируем номер заказа
      const orderId = generateOrderId();
      state.data.orderId = orderId;
      
      // Формируем сообщение о заказе для клиента
      const clientMessage = `
🎉 *Ваш заказ #${orderId} успешно оформлен!*

*Детали заказа:*
📝 Описание: ${state.data.orderDescription}
📱 Телефон: ${state.data.phone}
🏠 Адрес: ${state.data.address}
${state.data.comments ? `💬 Комментарий: ${state.data.comments}` : ''}

*Что дальше?*
1️⃣ Наш менеджер свяжется с вами в ближайшее время для уточнения деталей и подтверждения заказа
2️⃣ После подтверждения мы приступим к сборке вашего заказа
3️⃣ Вы получите уведомление, когда заказ будет готов

Спасибо за ваш заказ! 🌹
`;

      // Отправляем подтверждение клиенту
      await ctx.replyWithMarkdown(clientMessage, 
        Markup.keyboard([
          [Markup.button.webApp('🛒 Сделать заказ', `${webAppUrl}`), '🌹 Новый заказ'],
          ['💬 Связаться с менеджером', '📦 Мои заказы'],
          ['📊 Статус системы', '❓ Помощь']
        ]).resize()
      );
      
      // Формируем сообщение для администраторов
      const adminMessage = `
🔔 *НОВЫЙ ЗАКАЗ ЧЕРЕЗ БОТА!*

📦 *Номер заказа:* #${orderId}
👤 *Клиент:* ${state.data.firstName} ${state.data.lastName || ''} ${state.data.username ? `(@${state.data.username})` : ''}
🆔 *Telegram ID:* ${state.data.userId}
⏱ *Время заказа:* ${new Date(state.data.orderTime).toLocaleString()}

📝 *Описание заказа:* 
${state.data.orderDescription}

📱 *Телефон:* ${state.data.phone}
🏠 *Адрес:* ${state.data.address}
${state.data.comments ? `💬 *Комментарий:* ${state.data.comments}` : ''}

Для ответа клиенту используйте reply на это сообщение.
`;

      // Сохраняем связь между ID сообщения и пользователем
      try {
        // Добавляем информацию о чате и пользователе для возможности ответа
        const infoText = `
[Системная информация: для ответа используйте Reply на это сообщение]
Отправитель: ${state.data.firstName} ${state.data.lastName || ''}
Имя пользователя: ${state.data.username ? '@' + state.data.username : 'не указано'}
ID пользователя: ${state.data.userId}
Чат ID: ${ctx.chat.id}
Сообщение ID: ${ctx.message.message_id}
`;
        
        // Отправляем отдельное служебное сообщение с информацией
        console.log(`Отправляем техническую информацию в группу ${adminGroupId}`);
        const sentInfo = await bot.telegram.sendMessage(adminGroupId, infoText);
        console.log('Техническая информация отправлена, ID сообщения:', sentInfo.message_id);
        
        // Отправляем информацию администраторам
        console.log(`Отправляем информацию о заказе в группу администраторов ${adminGroupId}`);
        await bot.telegram.sendMessage(adminGroupId, adminMessage, {
          parse_mode: 'Markdown'
        });
        console.log('Информация о заказе успешно отправлена администраторам');
      } catch (error) {
        console.error('Ошибка при отправке информации администраторам:', error);
        console.error('Детали ошибки:', error.response ? error.response.data : 'Нет данных ответа');
        
        // Пробуем отправить сообщение в простом текстовом формате
        try {
          console.log('Пробуем отправить сообщение в простом формате...');
          const plainTextMessage = adminMessage.replace(/\*/g, '');
          await bot.telegram.sendMessage(adminGroupId, plainTextMessage);
          console.log('Сообщение в простом формате отправлено успешно');
        } catch (fallbackError) {
          console.error('Не удалось отправить даже простое сообщение:', fallbackError);
        }
      }
      
      // Сохраняем заказ в БД или отправляем через API (если нужно)
      try {
        // Здесь можно добавить код для сохранения заказа через API
        // например:
        // await axios.post(`${apiUrl}/api/orders/telegram`, state.data);
      } catch (error) {
        console.error('Ошибка при сохранении заказа:', error);
      }
      
      // Очищаем состояние заказа
      delete orderStates[userId];
      break;
  }
}

// Функция для генерации номера заказа
function generateOrderId() {
  // Генерируем простой номер заказа: текущая дата + случайное число
  const date = new Date();
  const datePart = `${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}`;
  const randomPart = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `T${datePart}-${randomPart}`;
}

// Функция для отправки сообщения с помощью
function sendHelpMessage(ctx) {
  const helpText = `
*📚 Справка по боту цветочного магазина*

*Основные команды:*
/start - Начать работу с ботом
/register - Зарегистрироваться в системе
/neworder - Оформить новый заказ через бота
/order - Быстрый переход к оформлению заказа через сайт
/orders - Показать ваши последние заказы
/status - Проверить статус системы
/help - Показать это сообщение помощи

*Как сделать заказ через бота:*
1. Нажмите кнопку "🌹 Новый заказ" в меню или используйте команду /neworder
2. Опишите, что хотите заказать (тип букета, цветы, бюджет)
3. Укажите ваш контактный телефон
4. Укажите адрес доставки или выберите самовывоз
5. Добавьте комментарии к заказу (если нужно)
6. Завершите оформление

*Как сделать заказ через сайт:*
1. Нажмите кнопку "🛒 Сделать заказ" в меню
2. В открывшемся приложении выберите товары
3. Добавьте товары в корзину
4. Перейдите в корзину и оформите заказ
5. Заполните контактную информацию
6. Подтвердите заказ

После оформления заказа вы получите уведомление с его номером, а наш менеджер свяжется с вами для подтверждения.

*Другие возможности:*
• "💬 Связаться с менеджером" - задать вопрос менеджеру напрямую
• "📦 Мои заказы" - просмотр истории ваших заказов
• "📊 Статус системы" - проверка доступности магазина

Вы можете написать любое сообщение в этом чате, и наши менеджеры ответят вам в ближайшее время.
`;
  ctx.replyWithMarkdown(helpText);
}

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
      environment: process.env.NODE_ENV || 'production',
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
          <li>Режим: ${process.env.NODE_ENV || 'production'}</li>
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
      // Закомментируйте или удалите блок кода, который устанавливает webhook
      if (process.env.NODE_ENV === 'production') {
        console.log('Запуск бота в режиме long polling...');
        await bot.launch();
        console.log('Бот успешно запущен в режиме long polling');
      }
    } catch (error) {
      console.error('Критическая ошибка при инициализации:', error);
      process.exit(1);
    }
  } else {
    try {
      // Используем HTTP для разработки
      app.listen(PORT, () => {
        console.log(`Telegram bot server is running on port ${PORT}`);
      });

      // Используйте long polling вместо вебхука
      bot.launch().then(() => {
        console.log('Бот запущен в режиме long polling');
      }).catch(err => {
        console.error('Ошибка запуска бота:', err);
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