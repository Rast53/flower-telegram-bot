#!/bin/sh

# Проверка наличия всех необходимых переменных окружения
if [ -z "$BOT_TOKEN" ]; then
  echo "ОШИБКА: Переменная BOT_TOKEN не установлена"
  exit 1
fi

# Получаем хост и порт из переменных окружения или используем значения по умолчанию
API_HOST=$(echo $API_URL | sed -E 's|^https?://||' | sed -E 's|/.*$||' | sed -E 's|:.*$||')
API_PORT=$(echo $API_URL | sed -E 's|^.*:([0-9]+).*$|\1|')

# Если порт не был получен, используем порт по умолчанию
if [ -z "$API_PORT" ]; then
  if echo $API_URL | grep -q "^https"; then
    API_PORT=443
  else
    API_PORT=80
  fi
fi

echo "Проверка доступности API по адресу $API_HOST:$API_PORT"

# Сначала пытаемся дождаться доступности API
chmod +x ./wait-for-it.sh
./wait-for-it.sh "$API_HOST:$API_PORT" -t 60 -- echo "API доступен!"

# Если проверка API успешна, запускаем бота
echo "Запуск Telegram бота..."
node bot.js 