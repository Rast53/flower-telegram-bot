FROM node:18-alpine

WORKDIR /app

# Установка необходимых утилит для wait-for-it
RUN apk add --no-cache bash curl dos2unix

# Копируем package.json и package-lock.json
COPY package.json .

# Установка зависимостей
RUN npm install --production

# Копируем исходный код и скрипты
COPY bot.js ./
COPY wait-for-it.sh ./
COPY start.sh ./

# Убедимся, что файлы имеют правильную кодировку и концы строк (CRLF -> LF)
RUN sed -i 's/\r$//' ./start.sh ./wait-for-it.sh
# Удалим BOM-символы из файлов
RUN if [ -f start.sh ]; then dos2unix start.sh; fi
RUN if [ -f wait-for-it.sh ]; then dos2unix wait-for-it.sh; fi

# Устанавливаем права на выполнение скриптов
RUN chmod +x wait-for-it.sh start.sh

# Создаем директорию для данных
RUN mkdir -p /app/data

# Создаем директорию для сертификатов 
RUN mkdir -p /app/certs

# Проверка наличия файлов перед запуском
RUN ls -la /app/

# Открываем порт
EXPOSE 3000

# Запускаем сервер
CMD ["sh", "-c", "ls -la && ./start.sh"] 