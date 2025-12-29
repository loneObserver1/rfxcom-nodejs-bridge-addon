const mqtt = require('mqtt');

// Gestion MQTT pour Home Assistant
class MQTTHelper {
    constructor(logFn) {
        this.log = logFn;
        this.client = null;
        this.connected = false;
        this.baseTopic = 'homeassistant';
    }

    connect() {
        // Dans Home Assistant, MQTT est accessible via le broker intégré (Mosquitto)
        // L'add-on peut accéder au broker via le réseau Docker interne
        // Par défaut, Home Assistant utilise 'core-mosquitto' comme nom de service
        const brokerUrl = process.env.MQTT_BROKER || 'mqtt://core-mosquitto:1883';
        const clientId = `rfxcom-bridge-${Date.now()}`;
        
        this.log('info', `🔌 Tentative de connexion au broker MQTT: ${brokerUrl}`);
        this.log('info', `💡 Assurez-vous que l'add-on MQTT (Mosquitto) est installé et démarré dans Home Assistant`);
        
        this.client = mqtt.connect(brokerUrl, {
            clientId: clientId,
            reconnectPeriod: 5000, // Réessayer toutes les 5 secondes en cas de déconnexion
            connectTimeout: 10000, // Timeout de 10 secondes
            will: {
                topic: `${this.baseTopic}/status/rfxcom-bridge`,
                payload: 'offline',
                qos: 1,
                retain: true
            }
        });

        this.client.on('connect', () => {
            this.connected = true;
            this.log('info', '✅ Connecté au broker MQTT Home Assistant');
            this.log('info', '📡 Les entités Home Assistant seront créées automatiquement pour les appareils ARC');
            
            // Publier le statut en ligne
            this.client.publish(
                `${this.baseTopic}/status/rfxcom-bridge`,
                'online',
                { qos: 1, retain: true }
            );
            
            // Émettre l'événement de connexion si défini
            if (this.onConnect) {
                this.onConnect();
            }
        });

        this.client.on('error', (error) => {
            this.connected = false;
            this.log('error', `❌ Erreur de connexion MQTT: ${error.message}`);
            this.log('warn', `⚠️ Vérifiez que l'add-on MQTT (Mosquitto) est installé et démarré`);
            this.log('warn', `⚠️ Les entités Home Assistant ne seront pas créées sans connexion MQTT`);
        });

        this.client.on('close', () => {
            this.log('warn', '⚠️ Connexion MQTT fermée');
            this.connected = false;
        });

        this.client.on('offline', () => {
            this.log('warn', '⚠️ Broker MQTT hors ligne');
            this.connected = false;
        });

        this.client.on('reconnect', () => {
            this.log('info', '🔄 Reconnexion au broker MQTT...');
        });
    }

    // Publier la configuration de découverte Home Assistant pour un volet ARC
    publishCoverDiscovery(device) {
        if (!this.connected || !this.client) {
            this.log('warn', '⚠️ MQTT non connecté, impossible de publier la découverte');
            return;
        }

        const deviceId = device.id || `arc_${device.houseCode}_${device.unitCode}`;
        const uniqueId = `rfxcom_arc_${device.houseCode}_${device.unitCode}`;
        const topic = `${this.baseTopic}/cover/rfxcom/${deviceId}/config`;
        
        const config = {
            name: device.name,
            unique_id: uniqueId,
            state_topic: `rfxcom/cover/${deviceId}/state`,
            command_topic: `rfxcom/cover/${deviceId}/set`,
            position_topic: `rfxcom/cover/${deviceId}/position`,
            set_position_topic: `rfxcom/cover/${deviceId}/set_position`,
            payload_open: 'OPEN',
            payload_close: 'CLOSE',
            payload_stop: 'STOP',
            state_open: 'open',
            state_closed: 'closed',
            state_opening: 'opening',
            state_closing: 'closing',
            device: {
                identifiers: [`rfxcom_${deviceId}`],
                name: device.name,
                model: 'RFXCOM ARC',
                manufacturer: 'RFXCOM'
            }
        };

        this.client.publish(topic, JSON.stringify(config), { qos: 1, retain: true }, (error) => {
            if (error) {
                this.log('error', `❌ Erreur lors de la publication de la découverte: ${error.message}`);
            } else {
                this.log('info', `✅ Entité Home Assistant créée pour ${device.name}`);
            }
        });

        // S'abonner aux commandes
        this.client.subscribe(`rfxcom/cover/${deviceId}/set`, (error) => {
            if (error) {
                this.log('error', `❌ Erreur lors de l'abonnement aux commandes: ${error.message}`);
            }
        });
        
        // S'abonner aux commandes de position
        this.client.subscribe(`rfxcom/cover/${deviceId}/set_position`, (error) => {
            if (error) {
                this.log('error', `❌ Erreur lors de l'abonnement aux commandes de position: ${error.message}`);
            }
        });
    }
    
    // Définir le callback pour les messages MQTT
    setMessageHandler(handler) {
        if (this.client) {
            this.client.on('message', (topic, message) => {
                handler(topic, message.toString());
            });
        }
    }

    // Publier l'état d'un volet
    publishCoverState(deviceId, state) {
        if (!this.connected || !this.client) return;
        
        const topic = `rfxcom/cover/${deviceId}/state`;
        this.client.publish(topic, state, { qos: 1, retain: true });
    }

    // Supprimer la configuration de découverte
    removeDiscovery(deviceId) {
        if (!this.connected || !this.client) return;
        
        const topic = `${this.baseTopic}/cover/rfxcom/${deviceId}/config`;
        this.client.publish(topic, '', { qos: 1, retain: true }, (error) => {
            if (!error) {
                this.log('info', `🗑️ Entité Home Assistant supprimée pour ${deviceId}`);
            }
        });
    }

    disconnect() {
        if (this.client) {
            this.client.publish(
                `${this.baseTopic}/status/rfxcom-bridge`,
                'offline',
                { qos: 1, retain: true }
            );
            this.client.end();
        }
    }
}

module.exports = MQTTHelper;

