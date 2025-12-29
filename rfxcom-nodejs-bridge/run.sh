#!/usr/bin/with-contenv bashio

# Récupérer le port série depuis les options
SERIAL_PORT=$(bashio::config 'serial_port')

# Récupérer le niveau de log depuis les options
LOG_LEVEL=$(bashio::config 'log_level')

# Exporter comme variables d'environnement pour app.js
export SERIAL_PORT
export LOG_LEVEL

# Lancer l'application
node /app/app.js
