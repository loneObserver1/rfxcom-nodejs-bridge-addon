#!/usr/bin/with-contenv bashio

# Récupérer les options depuis la configuration
SERIAL_PORT=$(bashio::config 'serial_port' '/dev/ttyUSB0')
LOG_LEVEL=$(bashio::config 'log_level' 'info')
AUTO_DISCOVERY=$(bashio::config 'auto_discovery' 'false')
API_PORT=$(bashio::config 'api_port' '8888')

# Récupérer les paramètres MQTT depuis la configuration ou depuis Home Assistant
MQTT_HOST=$(bashio::config 'mqtt_host' '')
MQTT_PORT=$(bashio::config 'mqtt_port' '1883')
MQTT_USER=$(bashio::config 'mqtt_user' '')
MQTT_PASSWORD=$(bashio::config 'mqtt_password' '')

# Si les paramètres MQTT ne sont pas fournis, essayer de les récupérer depuis Home Assistant
if [ -z "$MQTT_HOST" ] || [ -z "$MQTT_USER" ]; then
    bashio::log.info "Récupération automatique des paramètres MQTT depuis Home Assistant..."

    # Essayer de récupérer depuis le service MQTT de Home Assistant
    # (qui expose les informations du broker MQTT, y compris Mosquitto broker)
    if bashio::services.available mqtt; then
        # Fallback: essayer de récupérer depuis le service MQTT de Home Assistant
        bashio::log.info "Récupération depuis le service MQTT de Home Assistant..."
        MQTT_HOST=$(bashio::services mqtt host)
        MQTT_PORT=$(bashio::services mqtt port)
        MQTT_USER=$(bashio::services mqtt username)
        MQTT_PASSWORD=$(bashio::services mqtt password)

        bashio::log.info "✅ Paramètres MQTT récupérés automatiquement depuis le service MQTT"
        bashio::log.info "   Host: ${MQTT_HOST}"
        bashio::log.info "   Port: ${MQTT_PORT}"
        bashio::log.info "   User: ${MQTT_USER:-'(vide)'}"
        bashio::log.info "   Password: ${MQTT_PASSWORD:+'(présent)'}"
    else
        # Valeurs par défaut si rien n'est disponible
        if [ -z "$MQTT_HOST" ]; then
            MQTT_HOST="core-mosquitto"
        fi
        if [ -z "$MQTT_PORT" ]; then
            MQTT_PORT="1883"
        fi
        bashio::log.warning "⚠️ Add-on Mosquitto broker et service MQTT non disponibles, utilisation des valeurs par défaut"
        bashio::log.warning "⚠️ Si vous avez besoin d'authentification, configurez manuellement les paramètres MQTT"
    fi
fi

# Afficher la configuration pour le débogage
bashio::log.info "Configuration de l'addon RFXCOM Node.js Bridge"
bashio::log.info "Port série: ${SERIAL_PORT}"
bashio::log.info "Niveau de log: ${LOG_LEVEL}"
bashio::log.info "Détection automatique: ${AUTO_DISCOVERY}"
bashio::log.info "Port API: ${API_PORT}"
bashio::log.info "MQTT Host: ${MQTT_HOST}"
bashio::log.info "MQTT Port: ${MQTT_PORT}"
bashio::log.info "MQTT User: ${MQTT_USER:-'(vide)'}"

# Créer le répertoire de données si nécessaire
mkdir -p /data

# Exporter comme variables d'environnement pour app.js
export SERIAL_PORT
export LOG_LEVEL
export AUTO_DISCOVERY
export API_PORT
export MQTT_HOST
export MQTT_PORT
export MQTT_USER
export MQTT_PASSWORD

# Lancer l'application
node /app/app.js
