# Инструкция по настройке Telegram бота для цветочного магазина

## 1. Создание бота в BotFather

1. Откройте Telegram и найдите @BotFather
2. Отправьте команду `/newbot`
3. Следуйте инструкциям и задайте имя и username для бота
4. Сохраните полученный токен (BOT_TOKEN)

## 2. Настройка меню и команд

1. Отправьте команду `/mybots` боту @BotFather
2. Выберите вашего бота из списка
3. Нажмите "Edit Bot" -> "Edit Commands"
4. Отправьте список команд:
```
start - Запустить бота
catalog - Открыть каталог цветов
help - Помощь
```

## 3. Настройка Telegram Mini App

1. В BotFather отправьте команду `/mybots`
2. Выберите вашего бота
3. Нажмите "Bot Settings" -> "Menu Button"
4. Выберите "Configure menu button"
5. Введите текст кнопки: "Цветочный магазин"
6. Введите URL вашего приложения: https://ra.nov.ru

## 4. Сборка Docker образа для бота

```bash
# Переименуйте файлы
mv bot-package.json package.json
mv bot-Dockerfile Dockerfile

# Соберите образ
docker build -t rast53/flower-telegram-bot:latest .

# Опционально, отправьте образ в Docker Hub
docker push rast53/flower-telegram-bot:latest
```

## 5. Запуск в Docker Compose

1. Создайте файл `.env` со следующим содержимым:
```
TELEGRAM_BOT_TOKEN=<ваш токен от BotFather>
```

2. Запустите контейнер:
```bash
docker-compose up -d
```

## 6. Проверка работы

1. Откройте вашего бота в Telegram
2. Отправьте команду `/start`
3. Убедитесь, что бот отвечает и открывается меню с кнопкой для запуска Mini App 