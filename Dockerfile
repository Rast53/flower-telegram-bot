FROM node:18-alpine

WORKDIR /app

# Установка необходимых утилит для wait-for-it
RUN apk add --no-cache bash curl

# Копируем package.json и package-lock.json
COPY package.json .

# Установка зависимостей
RUN npm install --production

# Копируем исходный код и скрипты
COPY bot.js ./
COPY wait-for-it.sh ./
COPY start.sh ./

# Устанавливаем права на выполнение скриптов
RUN chmod +x wait-for-it.sh start.sh

# Создаем директорию для данных
RUN mkdir -p /app/data

# Создаем директорию для сертификатов 
RUN mkdir -p /app/certs

# Открываем порт
EXPOSE 3000

# Запускаем сервер
CMD ["./start.sh"] 