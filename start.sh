#!/bin/sh

# Показать значения всех важных переменных для отладки
echo "Текущие значения переменных:"
echo "API_URL=$API_URL"
echo "BOT_TOKEN=$BOT_TOKEN"
echo "WEBAPP_URL=$WEBAPP_URL"
echo "NODE_ENV=$NODE_ENV"

# Проверка наличия всех необходимых переменных окружения
if [ -z "$BOT_TOKEN" ]; then
  echo "ОШИБКА: Переменная BOT_TOKEN не установлена"
  exit 1
fi

# Если API_URL не определен, используем значение по умолчанию
if [ -z "$API_URL" ]; then
  API_URL="http://flower-backend:3000"
  echo "API_URL не задан, используем значение по умолчанию: $API_URL"
fi

# Получаем хост и порт из переменных окружения
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

# Проверим DNS и сетевые настройки
echo "--- Сетевая диагностика ---"
echo "Проверка DNS для flower-backend:"
getent hosts flower-backend || echo "DNS запись не найдена"

echo "Проверка пути до API сервера:"
traceroute -m 5 $API_HOST 2>/dev/null || echo "traceroute недоступен или не смог достичь хоста"

echo "Проверка сетевого подключения:"
ping -c 3 $API_HOST || echo "Ping не сработал"

# Пытаемся дождаться доступности API, но не более 30 секунд
echo "Ожидаем API не более 30 секунд..."
chmod +x ./wait-for-it.sh
./wait-for-it.sh "$API_HOST:$API_PORT" -t 30 -- echo "API доступен!" || echo "API недоступен, но всё равно запускаем бота"

# Запускаем бота в любом случае
echo "Запуск Telegram бота..."
node bot.js 