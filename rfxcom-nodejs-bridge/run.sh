#!/usr/bin/with-contenv bashio

# Récupérer les options depuis la configuration
SERIAL_PORT=$(bashio::config 'serial_port' '/dev/ttyUSB0')
LOG_LEVEL=$(bashio::config 'log_level' 'info')
AUTO_DISCOVERY=$(bashio::config 'auto_discovery' 'false')
API_PORT=$(bashio::config 'api_port' '8888')

# Afficher la configuration pour le débogage
bashio::log.info "Configuration de l'addon RFXCOM Node.js Bridge"
bashio::log.info "Port série: ${SERIAL_PORT}"
bashio::log.info "Niveau de log: ${LOG_LEVEL}"
bashio::log.info "Détection automatique: ${AUTO_DISCOVERY}"
bashio::log.info "Port API: ${API_PORT}"

# Créer le répertoire de données si nécessaire
mkdir -p /data

# Exporter comme variables d'environnement pour app.js
export SERIAL_PORT
export LOG_LEVEL
export AUTO_DISCOVERY
export API_PORT

# Lancer l'application
node /app/app.js
