#!/bin/sh
# Railway injects $PORT dynamically — replace it in nginx config before starting
PORT=${PORT:-80}
sed -i "s/listen 80/listen $PORT/g" /etc/nginx/conf.d/default.conf
echo "Starting nginx on port $PORT"
nginx -g 'daemon off;'
