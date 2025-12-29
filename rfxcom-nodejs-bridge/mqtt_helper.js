const mqtt = require('mqtt');

// Gestion MQTT pour Home Assistant
class MQTTHelper {
    constructor(logFn, options = {}) {
        this.log = logFn;
        this.client = null;
        this.connected = false;
        this.baseTopic = 'homeassistant';
        this.connectionAttempts = 0;
        this.maxConnectionAttempts = 3;
        this.shouldReconnect = true;
        
        // Récupérer les paramètres depuis les variables d'environnement ou les options
        // Par défaut, utiliser core-mosquitto (nom du service Docker de l'add-on Mosquitto broker)
        this.host = options.host || process.env.MQTT_HOST || 'core-mosquitto';
        this.port = options.port || parseInt(process.env.MQTT_PORT || '1883');
        this.username = options.username || process.env.MQTT_USER || '';
        this.password = options.password || process.env.MQTT_PASSWORD || '';
    }

    connect() {
        // Construire l'URL du broker MQTT
        let brokerUrl;
        if (this.username && this.password) {
            brokerUrl = `mqtt://${this.username}:${this.password}@${this.host}:${this.port}`;
        } else {
            brokerUrl = `mqtt://${this.host}:${this.port}`;
        }
        
        const clientId = `rfxcom-bridge-${Date.now()}`;
        
        this.log('info', `🔌 Tentative de connexion au broker MQTT: ${this.host}:${this.port}`);
        if (this.username) {
            this.log('info', `   Utilisateur: ${this.username}`);
        } else {
            this.log('info', `   Connexion sans authentification`);
        }
        this.log('info', `💡 Assurez-vous que l'add-on MQTT (Mosquitto) est installé et démarré dans Home Assistant`);
        
        // Vérifier si on a déjà atteint le maximum de tentatives
        if (this.connectionAttempts >= this.maxConnectionAttempts) {
            this.log('error', `❌ Nombre maximum de tentatives de connexion MQTT atteint (${this.maxConnectionAttempts})`);
            this.log('error', `❌ Arrêt des tentatives de reconnexion. Vérifiez vos paramètres MQTT dans la configuration de l'add-on.`);
            this.shouldReconnect = false;
            return;
        }
        
        this.connectionAttempts++;
        this.log('info', `🔄 Tentative de connexion MQTT ${this.connectionAttempts}/${this.maxConnectionAttempts}`);
        
        // Désactiver la reconnexion automatique si on a atteint le maximum
        const reconnectPeriod = (this.shouldReconnect && this.connectionAttempts < this.maxConnectionAttempts) ? 5000 : 0;
        
        const connectOptions = {
            clientId: clientId,
            reconnectPeriod: reconnectPeriod, // 0 = désactiver la reconnexion automatique
            connectTimeout: 10000, // Timeout de 10 secondes
            will: {
                topic: `${this.baseTopic}/status/rfxcom-bridge`,
                payload: 'offline',
                qos: 1,
                retain: true
            }
        };
        
        // Ajouter l'authentification si fournie
        if (this.username) {
            connectOptions.username = this.username;
        }
        if (this.password) {
            connectOptions.password = this.password;
        }
        
        this.client = mqtt.connect(brokerUrl, connectOptions);

        this.client.on('connect', () => {
            this.connected = true;
            this.connectionAttempts = 0; // Réinitialiser le compteur en cas de succès
            this.shouldReconnect = true; // Réactiver la reconnexion
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
            
            // Messages d'erreur spécifiques selon le type d'erreur
            if (error.message.includes('Not authorized') || error.message.includes('Connection refused')) {
                this.log('error', `❌ Erreur d'authentification MQTT: ${error.message}`);
                this.log('error', `❌ Vérifiez vos identifiants MQTT (utilisateur/mot de passe) dans la configuration de l'add-on`);
                this.log('error', `❌ Ou laissez les champs vides pour utiliser la récupération automatique depuis Home Assistant`);
            } else {
                this.log('error', `❌ Erreur de connexion MQTT: ${error.message}`);
                this.log('warn', `⚠️ Vérifiez que l'add-on MQTT (Mosquitto) est installé et démarré`);
            }
            
            // Si on a atteint le maximum de tentatives, arrêter
            if (this.connectionAttempts >= this.maxConnectionAttempts) {
                this.log('error', `❌ Arrêt des tentatives de connexion MQTT après ${this.maxConnectionAttempts} tentatives`);
                this.log('warn', `⚠️ Les entités Home Assistant ne seront pas créées sans connexion MQTT`);
                this.log('warn', `⚠️ L'add-on continuera de fonctionner pour les commandes RFXCOM, mais sans intégration Home Assistant`);
                this.shouldReconnect = false;
                if (this.client) {
                    this.client.end();
                    this.client = null;
                }
            } else {
                this.log('warn', `⚠️ Les entités Home Assistant ne seront pas créées sans connexion MQTT`);
            }
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
            // Incrémenter le compteur lors de la reconnexion
            if (this.connectionAttempts < this.maxConnectionAttempts) {
                this.connectionAttempts++;
            }
            
            if (this.connectionAttempts >= this.maxConnectionAttempts) {
                // Arrêter la reconnexion si on a atteint le max
                this.log('error', `❌ Arrêt de la reconnexion automatique après ${this.maxConnectionAttempts} tentatives`);
                this.shouldReconnect = false;
                if (this.client) {
                    this.client.end(true); // Forcer la fermeture
                    this.client = null;
                }
            } else {
                this.log('info', `🔄 Reconnexion au broker MQTT... (tentative ${this.connectionAttempts}/${this.maxConnectionAttempts})`);
            }
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

