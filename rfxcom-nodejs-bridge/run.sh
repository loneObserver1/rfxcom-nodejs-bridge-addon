#!/usr/bin/with-contenv bashio

# Récupérer le port série depuis les options (avec valeur par défaut)
SERIAL_PORT=$(bashio::config 'serial_port' '/dev/ttyUSB0')

# Récupérer le niveau de log depuis les options (avec valeur par défaut)
LOG_LEVEL=$(bashio::config 'log_level' 'info')

# Afficher la configuration pour le débogage
bashio::log.info "Configuration de l'addon RFXCOM Node.js Bridge"
bashio::log.info "Port série: ${SERIAL_PORT}"
bashio::log.info "Niveau de log: ${LOG_LEVEL}"

# Exporter comme variables d'environnement pour app.js
export SERIAL_PORT
export LOG_LEVEL

# Lancer l'application
node /app/app.js
