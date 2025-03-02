#!/bin/sh

# wait-for-it.sh - Скрипт для ожидания доступности сервисов перед запуском бота
# Использование: ./wait-for-it.sh host:port [-t timeout] [-- command args]
# -t TIMEOUT: таймаут в секундах, по умолчанию 15
# Пример: ./wait-for-it.sh flower-backend:3000 -t 30 -- node bot.js

WAITFORIT_cmdname=${0##*/}

echoerr() { if [ $WAITFORIT_QUIET -ne 1 ]; then echo "$@" 1>&2; fi }

usage()
{
    cat << USAGE >&2
Usage:
    $WAITFORIT_cmdname host:port [-t timeout] [-- command args]
    -t TIMEOUT                   таймаут в секундах, по умолчанию 15
    -- COMMAND ARGS              команда со аргументами для выполнения после проверки
USAGE
    exit 1
}

wait_for()
{
    if [ $WAITFORIT_TIMEOUT -gt 0 ]; then
        echoerr "$WAITFORIT_cmdname: ожидание $WAITFORIT_HOST:$WAITFORIT_PORT до $WAITFORIT_TIMEOUT секунд"
    else
        echoerr "$WAITFORIT_cmdname: ожидание $WAITFORIT_HOST:$WAITFORIT_PORT без таймаута"
    fi
    
    WAITFORIT_start_ts=$(date +%s)
    while :
    do
        (echo > /dev/tcp/$WAITFORIT_HOST/$WAITFORIT_PORT) >/dev/null 2>&1
        WAITFORIT_result=$?
        if [ $WAITFORIT_result -eq 0 ]; then
            WAITFORIT_end_ts=$(date +%s)
            echoerr "$WAITFORIT_cmdname: $WAITFORIT_HOST:$WAITFORIT_PORT доступен после $((WAITFORIT_end_ts - WAITFORIT_start_ts)) секунд"
            break
        fi
        sleep 1
        
        WAITFORIT_now=$(date +%s)
        WAITFORIT_elapsed=$((WAITFORIT_now - WAITFORIT_start_ts))
        if [ $WAITFORIT_TIMEOUT -gt 0 -a $WAITFORIT_elapsed -ge $WAITFORIT_TIMEOUT ]; then
            echoerr "$WAITFORIT_cmdname: таймаут после ожидания $WAITFORIT_TIMEOUT секунд"
            exit 1
        fi
    done
    return $WAITFORIT_result
}

wait_for_wrapper()
{
    # Используем деаттач для избежания проблем с таймаутом в bash
    if [ "$WAITFORIT_QUIET" = "1" ]; then
        timeout $WAITFORIT_TIMEOUT sh -c 'until (echo > /dev/tcp/$0/$1) >/dev/null 2>&1; do sleep 1; done' $WAITFORIT_HOST $WAITFORIT_PORT
    else
        timeout $WAITFORIT_TIMEOUT sh -c 'until (echo > /dev/tcp/$0/$1) >/dev/null 2>&1; do echo "waiting for $0:$1..."; sleep 1; done' $WAITFORIT_HOST $WAITFORIT_PORT
    fi
    WAITFORIT_RESULT=$?
    if [ $WAITFORIT_RESULT -eq 0 ]; then
        echoerr "$WAITFORIT_cmdname: $WAITFORIT_HOST:$WAITFORIT_PORT доступен"
    else
        echoerr "$WAITFORIT_cmdname: таймаут при ожидании $WAITFORIT_HOST:$WAITFORIT_PORT"
    fi
    return $WAITFORIT_RESULT
}

# Процесс всех аргументов
while [ $# -gt 0 ]
do
    case "$1" in
        *:* )
        WAITFORIT_hostport=(${1//:/ })
        WAITFORIT_HOST=${WAITFORIT_hostport[0]}
        WAITFORIT_PORT=${WAITFORIT_hostport[1]}
        shift 1
        ;;
        -t)
        WAITFORIT_TIMEOUT="$2"
        if [ -z "$WAITFORIT_TIMEOUT" ]; then break; fi
        shift 2
        ;;
        -q)
        WAITFORIT_QUIET=1
        shift 1
        ;;
        --)
        shift
        WAITFORIT_CLI=("$@")
        break
        ;;
        --help)
        usage
        ;;
        *)
        echoerr "Неизвестный аргумент: $1"
        usage
        ;;
    esac
done

if [ -z "$WAITFORIT_HOST" -o -z "$WAITFORIT_PORT" ]; then
    echoerr "Ошибка: необходимо указать host и port"
    usage
fi

WAITFORIT_TIMEOUT=${WAITFORIT_TIMEOUT:-15}
WAITFORIT_QUIET=${WAITFORIT_QUIET:-0}

# Проверяем наличие команды timeout
if command -v timeout >/dev/null 2>&1; then
    WAITFORIT_TIMEOUT_CMD=$(command -v timeout)
else
    echoerr "Команда timeout не найдена"
    exit 1
fi

if [ "${WAITFORIT_CLI[0]}" != "" ]; then
    if wait_for_wrapper; then
        echoerr "$WAITFORIT_cmdname: Запуск: ${WAITFORIT_CLI[*]}"
        exec "${WAITFORIT_CLI[@]}"
    else
        echoerr "$WAITFORIT_cmdname: Ошибка при ожидании"
        exit 1
    fi
else
    if wait_for; then
        echoerr "$WAITFORIT_cmdname: Готово"
    else
        echoerr "$WAITFORIT_cmdname: Ошибка при ожидании"
        exit 1
    fi
fi 