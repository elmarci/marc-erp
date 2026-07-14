#!/bin/sh
set -e

# Los volúmenes montados en tiempo de ejecución (Railway, Docker named volumes
# en algunos hosts) llegan con otro dueño (normalmente root), pisando el
# chown hecho en build-time. Arreglamos permisos como root antes de bajar
# privilegios al usuario de la app.
mkdir -p /app/uploads /app/backups
chown -R erp:nodejs /app/uploads /app/backups

exec su-exec erp:nodejs "$@"
