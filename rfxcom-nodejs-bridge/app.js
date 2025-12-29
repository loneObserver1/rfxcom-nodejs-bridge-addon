const rfxcom = require('rfxcom');
const fs = require('fs');
const express = require('express');
const http = require('http');
const MQTTHelper = require('./mqtt_helper');

// Récupérer les variables d'environnement
const SERIAL_PORT = process.env.SERIAL_PORT || '/dev/ttyUSB0';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const AUTO_DISCOVERY = process.env.AUTO_DISCOVERY === 'true';
const API_PORT = parseInt(process.env.API_PORT || '8888');

// Chemin du fichier de stockage des appareils
const DEVICES_FILE = '/data/devices.json';
const DATA_DIR = '/data';

// Niveaux de log valides
const LOG_LEVELS = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3
};

// Fonction de log avec niveau
function log(level, ...args) {
    const currentLevel = LOG_LEVELS[LOG_LEVEL] || LOG_LEVELS.info;
    const messageLevel = LOG_LEVELS[level] || LOG_LEVELS.info;

    if (messageLevel <= currentLevel) {
        const prefix = level.toUpperCase().padEnd(5);
        console.log(`[${prefix}]`, ...args);
    }
}

// Gestion des appareils
let devices = {};

// S'assurer que le répertoire de données existe
function ensureDataDirectory() {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
            log('info', `📁 Répertoire de données créé: ${DATA_DIR}`);
        }
    } catch (error) {
        log('error', `❌ Erreur lors de la création du répertoire de données: ${error.message}`);
    }
}

// Charger les appareils depuis le fichier
function loadDevices() {
    try {
        // S'assurer que le répertoire existe
        ensureDataDirectory();

        if (fs.existsSync(DEVICES_FILE)) {
            const data = fs.readFileSync(DEVICES_FILE, 'utf8');
            if (data.trim() === '') {
                // Fichier vide, initialiser avec un objet vide
                devices = {};
                log('warn', '⚠️ Fichier devices.json vide, initialisation avec un objet vide');
                saveDevices(); // Créer un fichier valide
            } else {
                devices = JSON.parse(data);
                // Vérifier que c'est bien un objet
                if (typeof devices !== 'object' || Array.isArray(devices)) {
                    log('warn', '⚠️ Format de fichier invalide, réinitialisation');
                    devices = {};
                    saveDevices();
                } else {
                    log('info', `📦 ${Object.keys(devices).length} appareil(s) chargé(s)`);
                }
            }
        } else {
            devices = {};
            log('info', '📦 Aucun appareil enregistré, création du fichier devices.json');
            saveDevices(); // Créer le fichier avec un objet vide
        }
    } catch (error) {
        log('error', `❌ Erreur lors du chargement des appareils: ${error.message}`);
        if (LOG_LEVEL === 'debug') {
            log('debug', `   Stack: ${error.stack}`);
        }
        devices = {};
        // Essayer de sauvegarder un fichier vide en cas d'erreur
        try {
            saveDevices();
        } catch (saveError) {
            log('error', `❌ Impossible de créer le fichier devices.json: ${saveError.message}`);
        }
    }
}

// Sauvegarder les appareils dans le fichier
function saveDevices() {
    try {
        // S'assurer que le répertoire existe avant d'écrire
        ensureDataDirectory();

        // Créer un fichier temporaire puis le renommer pour éviter la corruption en cas d'erreur
        const tempFile = `${DEVICES_FILE}.tmp`;
        fs.writeFileSync(tempFile, JSON.stringify(devices, null, 2), 'utf8');
        fs.renameSync(tempFile, DEVICES_FILE);

        log('debug', `💾 ${Object.keys(devices).length} appareil(s) sauvegardé(s) dans ${DEVICES_FILE}`);
    } catch (error) {
        log('error', `❌ Erreur lors de la sauvegarde des appareils: ${error.message}`);
        if (LOG_LEVEL === 'debug') {
            log('debug', `   Stack: ${error.stack}`);
        }
        // Essayer de nettoyer le fichier temporaire s'il existe
        try {
            if (fs.existsSync(`${DEVICES_FILE}.tmp`)) {
                fs.unlinkSync(`${DEVICES_FILE}.tmp`);
            }
        } catch (cleanupError) {
            // Ignorer les erreurs de nettoyage
        }
    }
}

// Trouver un house code et unit code libre pour ARC
function findFreeArcCode() {
    const houseCodes = 'ABCDEFGHIJKLMNOP';
    const unitCodes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];

    for (const houseCode of houseCodes) {
        for (const unitCode of unitCodes) {
            const id = `ARC_${houseCode}_${unitCode}`;
            if (!devices[id]) {
                return { houseCode, unitCode };
            }
        }
    }
    return null;
}


console.log(`🚀 RFXCOM Node.js Bridge add-on démarré`);
log('info', `📡 Port série configuré: ${SERIAL_PORT}`);
log('info', `📝 Niveau de log: ${LOG_LEVEL}`);
log('info', `🔍 Détection automatique: ${AUTO_DISCOVERY ? 'Activée' : 'Désactivée'}`);
log('info', `🌐 Port API: ${API_PORT}`);

// Charger les appareils
loadDevices();

// Vérifier si le port série existe (mais ne pas bloquer le démarrage du serveur)
if (!fs.existsSync(SERIAL_PORT)) {
    log('error', `❌ Le port série ${SERIAL_PORT} n'existe pas !`);
    log('warn', `⚠️ Le serveur démarrera quand même, mais RFXCOM ne fonctionnera pas.`);
    log('info', `💡 Vérifiez que votre émetteur RFXCOM est bien branché.`);
} else {
    // Vérifier les permissions sur le port série
    try {
        fs.accessSync(SERIAL_PORT, fs.constants.R_OK | fs.constants.W_OK);
        log('info', `✅ Permissions OK sur ${SERIAL_PORT}`);
    } catch (error) {
        log('error', `❌ Pas de permissions en lecture/écriture sur ${SERIAL_PORT}`);
        log('warn', `⚠️ Le serveur démarrera quand même, mais RFXCOM ne fonctionnera pas.`);
    }
}

// Initialiser le module RFXCOM
let rfxtrx = null;
let lighting1Handler = null;
let mqttHelper = null;

// Récupérer les paramètres MQTT depuis les variables d'environnement (pour utilisation après initialisation RFXCOM)
const MQTT_HOST = process.env.MQTT_HOST || '';
const MQTT_PORT = parseInt(process.env.MQTT_PORT || '1883');
const MQTT_USER = process.env.MQTT_USER || '';
const MQTT_PASSWORD = process.env.MQTT_PASSWORD || '';

// Fonction pour initialiser MQTT (appelée après l'initialisation RFXCOM)
function initializeMQTT() {
    log('info', '🔧 Initialisation de la connexion MQTT...');
    log('info', '📋 Prérequis: L\'add-on MQTT (Mosquitto) doit être installé et démarré dans Home Assistant');

    if (MQTT_HOST) {
        log('info', `📡 Configuration MQTT: ${MQTT_HOST}:${MQTT_PORT}`);
        if (MQTT_USER) {
            log('info', `   Authentification: ${MQTT_USER}`);
        }
    } else {
        log('info', `📡 Configuration MQTT: localhost:${MQTT_PORT} (par défaut)`);
    }

    try {
        mqttHelper = new MQTTHelper(log, {
            host: MQTT_HOST || 'core-mosquitto',
            port: MQTT_PORT,
            username: MQTT_USER,
            password: MQTT_PASSWORD
        });

        // Gérer les messages MQTT (commandes depuis Home Assistant)
        mqttHelper.setMessageHandler((topic, message) => {
            log('debug', `📨 Message MQTT reçu: ${topic} -> ${message}`);

            // Format: rfxcom/cover/{deviceId}/set ou rfxcom/cover/{deviceId}/set_position
            const parts = topic.split('/');
            if (parts.length >= 4 && parts[0] === 'rfxcom' && parts[1] === 'cover') {
                const deviceId = parts[2];
                const commandType = parts[3];

                if (devices[deviceId] && devices[deviceId].type === 'ARC' && lighting1Handler) {
                    const device = devices[deviceId];

                    if (commandType === 'set') {
                        // Commandes: OPEN, CLOSE, STOP
                        if (message === 'OPEN' || message === 'open') {
                            lighting1Handler.switchOn(device.houseCode, device.unitCode, (error) => {
                                if (error) {
                                    log('error', `❌ Erreur commande OPEN: ${error.message}`);
                                } else {
                                    log('info', `✅ Commande OPEN envoyée à ${device.name}`);
                                    if (mqttHelper) {
                                        mqttHelper.publishCoverState(deviceId, 'open');
                                    }
                                }
                            });
                        } else if (message === 'CLOSE' || message === 'close') {
                            lighting1Handler.switchOff(device.houseCode, device.unitCode, (error) => {
                                if (error) {
                                    log('error', `❌ Erreur commande CLOSE: ${error.message}`);
                                } else {
                                    log('info', `✅ Commande CLOSE envoyée à ${device.name}`);
                                    if (mqttHelper) {
                                        mqttHelper.publishCoverState(deviceId, 'closed');
                                    }
                                }
                            });
                        } else if (message === 'STOP' || message === 'stop') {
                            // Pour stop, on peut envoyer OFF
                            lighting1Handler.switchOff(device.houseCode, device.unitCode, (error) => {
                                if (error) {
                                    log('error', `❌ Erreur commande STOP: ${error.message}`);
                                } else {
                                    log('info', `✅ Commande STOP envoyée à ${device.name}`);
                                }
                            });
                        }
                    }
                }
            }
        });

        mqttHelper.connect();
    } catch (error) {
        log('warn', `⚠️ Impossible d'initialiser MQTT: ${error.message}`);
        log('warn', `⚠️ Les entités Home Assistant ne seront pas créées automatiquement`);
    }
}

// Initialiser RFXCOM de manière asynchrone sans bloquer le serveur
function initializeRFXCOMAsync() {
    if (!fs.existsSync(SERIAL_PORT)) {
        log('warn', `⚠️ Port série ${SERIAL_PORT} non disponible, RFXCOM ne sera pas initialisé`);
        return;
    }

    try {
        log('info', `🔌 Initialisation du module RFXCOM sur ${SERIAL_PORT}...`);

        const debugMode = LOG_LEVEL === 'debug';
        rfxtrx = new rfxcom.RfxCom(SERIAL_PORT, {
            debug: debugMode
        });

        // Ajouter un timeout pour éviter que l'initialisation bloque indéfiniment
        const initTimeout = setTimeout(() => {
            log('warn', `⚠️ Timeout lors de l'initialisation RFXCOM (30s), le serveur continue sans RFXCOM`);
        }, 30000);

        rfxtrx.initialise((error) => {
            clearTimeout(initTimeout);

            if (error) {
                log('error', `❌ Erreur lors de l'initialisation RFXCOM:`, error);
                log('warn', `⚠️ Le serveur continue sans RFXCOM, vous pouvez réessayer plus tard`);
            } else {
                log('info', `✅ RFXCOM initialisé avec succès sur ${SERIAL_PORT}`);

                // Créer le handler pour Lighting1 (ARC, etc.)
                lighting1Handler = new rfxcom.Lighting1(rfxtrx, rfxcom.lighting1.ARC);

                // Écouter les messages si la détection automatique est activée
                if (AUTO_DISCOVERY) {
                    log('info', `👂 Écoute des messages RFXCOM pour détection automatique...`);
                    rfxtrx.on('receive', (evt, msg) => {
                        if (msg && typeof msg === 'object') {
                            log('debug', `📨 Message reçu:`, JSON.stringify(msg));
                            handleReceivedMessage(msg);
                        } else {
                            // Ignorer les messages vides ou les échos de commandes envoyées
                            // Ces messages sont normaux et ne nécessitent pas de warning
                            log('debug', `📨 Message RFXCOM reçu (écho/confirmation ignoré)`);
                        }
                    });
                } else {
                    // Même si AUTO_DISCOVERY est désactivé, on peut écouter les messages pour le debug
                    // mais on ne les traite pas pour la détection automatique
                    rfxtrx.on('receive', (evt, msg) => {
                        if (msg && typeof msg === 'object') {
                            log('debug', `📨 Message RFXCOM reçu (AUTO_DISCOVERY désactivé):`, JSON.stringify(msg));
                        } else {
                            // Ignorer silencieusement les messages vides/échos
                            log('debug', `📨 Message RFXCOM reçu (écho/confirmation ignoré)`);
                        }
                    });
                }

                log('info', `🎉 L'addon est prêt à recevoir des commandes !`);

                // Initialiser MQTT après l'initialisation complète de RFXCOM
                // Utiliser un petit délai pour s'assurer que tout est prêt
                setTimeout(() => {
                    initializeMQTT();

                    // Configurer la publication des entités après connexion MQTT
                    if (mqttHelper) {
                        mqttHelper.onConnect = () => {
                            // Test simple de connexion : publier le statut
                            log('info', '✅ Test de connexion MQTT réussi');

                            // Publier les entités existantes s'il y en a
                            const deviceCount = Object.keys(devices).length;
                            if (deviceCount > 0) {
                                setTimeout(() => {
                                    log('info', `📡 Publication des ${deviceCount} entité(s) Home Assistant existante(s)...`);
                                    Object.keys(devices).forEach(deviceId => {
                                        const device = devices[deviceId];
                                        if (device.type === 'ARC') {
                                            mqttHelper.publishCoverDiscovery({ ...device, id: deviceId });
                                        } else if (device.type === 'TEMP_HUM') {
                                            mqttHelper.publishTempHumDiscovery({ ...device, id: deviceId });
                                        }
                                    });
                                }, 1000);
                            } else {
                                log('info', '📡 Aucun appareil enregistré, prêt à en ajouter');
                            }
                        };
                    }
                }, 500);
            }
        });
    } catch (error) {
        log('error', `❌ Erreur lors de la création de la connexion RFXCOM:`, error);
        log('warn', `⚠️ Le serveur continue sans RFXCOM`);
    }
}

// L'initialisation RFXCOM sera démarrée après le démarrage du serveur
// (voir plus bas dans le code, après app.listen)

// Gérer l'arrêt propre
process.on('SIGTERM', () => {
    log('info', '🛑 Arrêt du module RFXCOM...');
    saveDevices();
    if (mqttHelper) {
        mqttHelper.disconnect();
    }
    if (rfxtrx) {
        try {
            rfxtrx.close();
        } catch (err) {
            log('warn', `⚠️ Erreur lors de la fermeture: ${err.message}`);
        }
    }
    process.exit(0);
});

process.on('SIGINT', () => {
    log('info', '🛑 Arrêt du module RFXCOM...');
    saveDevices();
    if (mqttHelper) {
        mqttHelper.disconnect();
    }
    if (rfxtrx) {
        try {
            rfxtrx.close();
        } catch (err) {
            log('warn', `⚠️ Erreur lors de la fermeture: ${err.message}`);
        }
    }
    process.exit(0);
});

// L'initialisation RFXCOM est maintenant asynchrone et ne bloque plus le démarrage

// Gérer les messages reçus
function handleReceivedMessage(msg) {
    if (!AUTO_DISCOVERY) return;
    if (!msg || typeof msg !== 'object') {
        log('warn', `⚠️ Message invalide reçu:`, msg);
        return;
    }

    // Détecter les nouveaux appareils ARC
    if (msg.type === 'lighting1' && msg.subtype === 'ARC') {
        const id = `ARC_${msg.houseCode}_${msg.unitCode}`;
        if (!devices[id]) {
            log('info', `🆕 Nouvel appareil ARC détecté: ${msg.houseCode}${msg.unitCode}`);
            devices[id] = {
                type: 'ARC',
                name: `ARC ${msg.houseCode}${msg.unitCode}`,
                houseCode: msg.houseCode,
                unitCode: msg.unitCode,
                discovered: true,
                discoveredAt: new Date().toISOString()
            };
            saveDevices();

            // Publier la découverte Home Assistant
            if (mqttHelper && mqttHelper.connected) {
                mqttHelper.publishCoverDiscovery({ ...devices[id], id: id });
            }
        }
    }

    // Détecter les sondes de température/humidité
    // Le package rfxcom peut utiliser différents noms de type selon la version
    if (msg.type === 'tempHumidity' || msg.type === 'TEMP_HUM' || msg.packetType === 'TEMP_HUM') {
        // Extraire l'ID de la sonde depuis différents champs possibles
        const sensorId = msg.id || msg.sensorId || msg.ID || `temp_${msg.channel || msg.channelNumber || 0}`;
        const id = `TEMP_HUM_${sensorId}`;

        if (!devices[id]) {
            log('info', `🆕 Nouvelle sonde température/humidité détectée: ID ${sensorId}, Canal ${msg.channel || msg.channelNumber || 'N/A'}`);
            devices[id] = {
                type: 'TEMP_HUM',
                name: `Sonde Temp/Hum ${sensorId}`,
                sensorId: sensorId,
                channel: msg.channel || msg.channelNumber,
                subtype: msg.subtype,
                discovered: true,
                discoveredAt: new Date().toISOString()
            };
            saveDevices();

            // Publier la découverte Home Assistant
            if (mqttHelper && mqttHelper.connected) {
                mqttHelper.publishTempHumDiscovery({ ...devices[id], id: id });
            }
        }

        // Publier les valeurs actuelles
        if (mqttHelper && mqttHelper.connected && devices[id]) {
            // Le package peut utiliser différents noms pour la température
            const temperature = msg.temperature || msg.Temperature;
            const humidity = msg.humidity || msg.Humidity;

            if (temperature !== undefined && temperature !== null) {
                mqttHelper.publishSensorState(`${id}_temperature`, temperature.toString(), '°C');
            }
            if (humidity !== undefined && humidity !== null) {
                mqttHelper.publishSensorState(`${id}_humidity`, humidity.toString(), '%');
            }
        }
    }
}

// API Express
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

// Logging middleware pour toutes les requêtes (sauf GET /api/devices qui est trop verbeux)
app.use((req, res, next) => {
    // Ne pas logger les requêtes GET vers /api/devices (trop verbeux)
    if (req.method === 'GET' && req.path === '/api/devices') {
        next();
        return;
    }
    log('info', `📥 ${req.method} ${req.path}`);
    next();
});

// Vérifier que le répertoire public existe
const PUBLIC_DIR = '/app/public';
if (fs.existsSync(PUBLIC_DIR)) {
    log('info', `📁 Répertoire public trouvé: ${PUBLIC_DIR}`);
    // Servir les fichiers statiques (interface web)
    app.use(express.static(PUBLIC_DIR));

    // Route explicite pour la page d'accueil
    app.get('/', (req, res) => {
        const indexPath = `${PUBLIC_DIR}/index.html`;
        if (fs.existsSync(indexPath)) {
            res.sendFile(indexPath);
        } else {
            log('error', `❌ Fichier index.html non trouvé dans ${PUBLIC_DIR}`);
            res.status(404).json({
                status: 'error',
                error: 'Interface web non disponible'
            });
        }
    });
} else {
    log('warn', `⚠️ Répertoire public non trouvé: ${PUBLIC_DIR}`);
    // Route de fallback si le répertoire public n'existe pas
    app.get('/', (req, res) => {
        res.json({
            status: 'ok',
            message: 'API RFXCOM Node.js Bridge',
            endpoints: {
                health: '/health',
                devices: '/api/devices',
                addDevice: 'POST /api/devices/arc'
            }
        });
    });
}

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        initialized: rfxtrx !== null,
        port: SERIAL_PORT,
        auto_discovery: AUTO_DISCOVERY
    });
});

// Liste des appareils
app.get('/api/devices', (req, res) => {
    res.json({
        status: 'success',
        devices: devices
    });
});

// Obtenir un appareil
app.get('/api/devices/:id', (req, res) => {
    const deviceId = req.params.id;
    if (devices[deviceId]) {
        res.json({
            status: 'success',
            device: devices[deviceId]
        });
    } else {
        res.status(404).json({
            status: 'error',
            error: 'Appareil non trouvé'
        });
    }
});

// Ajouter un appareil ARC
app.post('/api/devices/arc', (req, res) => {
    try {
        log('info', `📥 Requête reçue pour ajouter un appareil ARC`);
        const { name, houseCode, unitCode } = req.body;
        log('info', `📝 Données reçues: name="${name}", houseCode="${houseCode || 'auto'}", unitCode="${unitCode || 'auto'}"`);

        if (!name) {
            return res.status(400).json({
                status: 'error',
                error: 'Le nom est requis'
            });
        }

        // Trouver un code libre si non fourni
        let finalHouseCode = houseCode;
        let finalUnitCode = unitCode;

        if (!finalHouseCode || !finalUnitCode) {
            const freeCode = findFreeArcCode();
            if (!freeCode) {
                return res.status(400).json({
                    status: 'error',
                    error: 'Aucun code libre disponible'
                });
            }
            finalHouseCode = freeCode.houseCode;
            finalUnitCode = freeCode.unitCode;
        }

        const id = `ARC_${finalHouseCode}_${finalUnitCode}`;

        if (devices[id]) {
            return res.status(400).json({
                status: 'error',
                error: 'Cet appareil existe déjà'
            });
        }

        devices[id] = {
            type: 'ARC',
            name: name,
            houseCode: finalHouseCode,
            unitCode: finalUnitCode,
            discovered: false,
            paired: false,
            createdAt: new Date().toISOString()
        };

        saveDevices();
        log('info', `✅ Appareil ARC créé: ${name} (${id}) - House code: ${finalHouseCode}, Unit code: ${finalUnitCode}`);

        // Publier la découverte Home Assistant
        if (mqttHelper && mqttHelper.connected) {
            mqttHelper.publishCoverDiscovery({ ...devices[id], id: id });
            log('info', `📡 Entité Home Assistant créée pour ${name}`);
        } else {
            log('warn', `⚠️ MQTT non connecté, l'entité Home Assistant sera créée lors de la prochaine connexion`);
        }

        res.json({
            status: 'success',
            device: devices[id],
            message: `Appareil ARC créé avec house code ${finalHouseCode} et unit code ${finalUnitCode}. Mettez l'appareil en mode appairage puis utilisez /api/devices/arc/pair`
        });
    } catch (error) {
        log('error', `❌ Erreur lors de l'ajout d'un appareil ARC:`, error);
        res.status(500).json({
            status: 'error',
            error: error.message
        });
    }
});

// Appairage ARC - Étape 1: Envoyer la commande d'appairage
app.post('/api/devices/arc/pair', (req, res) => {
    try {
        const { deviceId } = req.body;

        if (!deviceId || !devices[deviceId]) {
            return res.status(400).json({
                status: 'error',
                error: 'Appareil non trouvé'
            });
        }

        const device = devices[deviceId];
        if (device.type !== 'ARC') {
            return res.status(400).json({
                status: 'error',
                error: 'Cet appareil n\'est pas de type ARC'
            });
        }

        if (!lighting1Handler) {
            return res.status(500).json({
                status: 'error',
                error: 'RFXCOM non initialisé'
            });
        }

        // Envoyer ON pour l'appairage
        lighting1Handler.switchOn(device.houseCode, device.unitCode, (error) => {
            if (error) {
                log('error', `❌ Erreur lors de l'appairage:`, error);
                return res.status(500).json({
                    status: 'error',
                    error: error.message
                });
            }

            log('info', `✅ Commande d'appairage envoyée pour ${device.name}`);

            // Marquer comme appairé (l'utilisateur confirmera via /api/devices/arc/confirm-pair)
            devices[deviceId].pairingSent = true;
            saveDevices();

            res.json({
                status: 'success',
                message: 'Commande d\'appairage envoyée. Vérifiez si l\'appareil a répondu, puis utilisez /api/devices/arc/confirm-pair pour confirmer.'
            });
        });
    } catch (error) {
        log('error', `❌ Erreur lors de l'appairage:`, error);
        res.status(500).json({
            status: 'error',
            error: error.message
        });
    }
});

// Confirmer l'appairage ARC
app.post('/api/devices/arc/confirm-pair', (req, res) => {
    try {
        const { deviceId, confirmed } = req.body;

        if (!deviceId || !devices[deviceId]) {
            return res.status(400).json({
                status: 'error',
                error: 'Appareil non trouvé'
            });
        }

        const device = devices[deviceId];
        if (confirmed === true) {
            device.paired = true;
            device.pairedAt = new Date().toISOString();
            saveDevices();

            log('info', `✅ Appairage confirmé pour ${device.name}`);
            res.json({
                status: 'success',
                message: 'Appairage confirmé. Utilisez les endpoints /api/devices/arc/:id/on, /off, /stop pour contrôler l\'appareil.'
            });
        } else {
            res.json({
                status: 'info',
                message: 'Appairage non confirmé. Réessayez le processus d\'appairage.'
            });
        }
    } catch (error) {
        log('error', `❌ Erreur lors de la confirmation:`, error);
        res.status(500).json({
            status: 'error',
            error: error.message
        });
    }
});

// Fonction helper pour envoyer une commande ARC
function sendArcCommand(deviceId, command, res) {
    if (!deviceId || !devices[deviceId]) {
        return res.status(404).json({
            status: 'error',
            error: 'Appareil non trouvé'
        });
    }

    const device = devices[deviceId];
    if (device.type !== 'ARC') {
        return res.status(400).json({
            status: 'error',
            error: 'Cet appareil n\'est pas de type ARC'
        });
    }

    if (!lighting1Handler) {
        return res.status(500).json({
            status: 'error',
            error: 'RFXCOM non initialisé'
        });
    }

    // Envoyer la commande
    log('info', `📤 Envoi de la commande ${command} à ${device.name} (House: ${device.houseCode}, Unit: ${device.unitCode})`);

    let responseSent = false;

    // Timeout de sécurité pour éviter que la requête reste en pending
    const timeout = setTimeout(() => {
        if (!responseSent) {
            responseSent = true;
            log('warn', `⚠️ Timeout lors de l'envoi de la commande ${command}, réponse envoyée quand même`);
            res.json({
                status: 'success',
                message: `Commande ${command} envoyée (timeout, mais la commande a probablement été transmise)`,
                device: deviceId,
                command: command
            });
        }
    }, 2000); // 2 secondes de timeout

    const callback = (error) => {
        clearTimeout(timeout);

        if (responseSent) {
            log('debug', `Callback reçu après timeout pour la commande ${command}`);
            return;
        }

        responseSent = true;

        if (error) {
            log('error', `❌ Erreur lors de l'envoi de la commande ${command}:`, error);
            return res.status(500).json({
                status: 'error',
                error: error.message
            });
        }

        log('info', `✅ Commande ${command} envoyée avec succès à ${device.name} via RFXCOM`);
        res.json({
            status: 'success',
            message: `Commande ${command} envoyée avec succès`,
            device: deviceId,
            command: command
        });
    };

    try {
        if (command === 'on' || command === 'up') {
            lighting1Handler.switchOn(device.houseCode, device.unitCode, callback);
        } else if (command === 'off' || command === 'down' || command === 'stop') {
            lighting1Handler.switchOff(device.houseCode, device.unitCode, callback);
        } else {
            clearTimeout(timeout);
            return res.status(400).json({
                status: 'error',
                error: 'Commande invalide'
            });
        }

        // Si le callback est appelé de manière synchrone, on le détecte
        // Sinon, le timeout s'occupera de répondre
        log('debug', `Commande ${command} transmise à lighting1Handler`);
    } catch (error) {
        clearTimeout(timeout);
        if (!responseSent) {
            responseSent = true;
            log('error', `❌ Exception lors de l'envoi de la commande ${command}:`, error);
            return res.status(500).json({
                status: 'error',
                error: error.message
            });
        }
    }
}

// Commandes ARC - ON (ouvrir/monter)
app.post('/api/devices/arc/:id/on', (req, res) => {
    try {
        sendArcCommand(req.params.id, 'on', res);
    } catch (error) {
        log('error', `❌ Erreur lors de l'envoi de la commande ON:`, error);
        res.status(500).json({
            status: 'error',
            error: error.message
        });
    }
});

// Commandes ARC - UP (alias pour ON)
app.post('/api/devices/arc/:id/up', (req, res) => {
    try {
        sendArcCommand(req.params.id, 'up', res);
    } catch (error) {
        log('error', `❌ Erreur lors de l'envoi de la commande UP:`, error);
        res.status(500).json({
            status: 'error',
            error: error.message
        });
    }
});

// Commandes ARC - OFF (fermer/descendre)
app.post('/api/devices/arc/:id/off', (req, res) => {
    try {
        sendArcCommand(req.params.id, 'off', res);
    } catch (error) {
        log('error', `❌ Erreur lors de l'envoi de la commande OFF:`, error);
        res.status(500).json({
            status: 'error',
            error: error.message
        });
    }
});

// Commandes ARC - DOWN (alias pour OFF)
app.post('/api/devices/arc/:id/down', (req, res) => {
    try {
        sendArcCommand(req.params.id, 'down', res);
    } catch (error) {
        log('error', `❌ Erreur lors de l'envoi de la commande DOWN:`, error);
        res.status(500).json({
            status: 'error',
            error: error.message
        });
    }
});

// Commandes ARC - STOP (arrêter)
app.post('/api/devices/arc/:id/stop', (req, res) => {
    try {
        sendArcCommand(req.params.id, 'stop', res);
    } catch (error) {
        log('error', `❌ Erreur lors de l'envoi de la commande STOP:`, error);
        res.status(500).json({
            status: 'error',
            error: error.message
        });
    }
});

// Supprimer un appareil
app.delete('/api/devices/:id', (req, res) => {
    const deviceId = req.params.id;
    if (devices[deviceId]) {
        // Supprimer la découverte Home Assistant
        if (mqttHelper) {
            mqttHelper.removeDiscovery(deviceId);
        }

        delete devices[deviceId];
        saveDevices();

        res.json({
            status: 'success',
            message: 'Appareil supprimé'
        });
    } else {
        res.status(404).json({
            status: 'error',
            error: 'Appareil non trouvé'
        });
    }
});

// Gestion d'erreurs globale
app.use((err, req, res, next) => {
    log('error', `❌ Erreur non gérée dans Express:`, err);
    res.status(500).json({
        status: 'error',
        error: err.message || 'Erreur interne du serveur'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        status: 'error',
        error: 'Endpoint non trouvé'
    });
});

// Gestion des erreurs non capturées
process.on('uncaughtException', (error) => {
    log('error', `❌ Exception non capturée:`, error);
    log('error', `   Stack:`, error.stack);
    // Ne pas arrêter le processus, juste logger
});

process.on('unhandledRejection', (reason, promise) => {
    log('error', `❌ Rejection non gérée:`, reason);
    log('error', `   Promise:`, promise);
    // Ne pas arrêter le processus, juste logger
});

// Démarrer le serveur Express IMMÉDIATEMENT
// Le serveur doit démarrer avant l'initialisation RFXCOM pour être accessible
const server = app.listen(API_PORT, '0.0.0.0', (err) => {
    if (err) {
        log('error', `❌ Erreur lors du démarrage du serveur: ${err.message}`);
        process.exit(1);
    }

    log('info', `🌐 Serveur API démarré sur le port ${API_PORT}`);
    log('info', `🌐 Interface web disponible sur http://localhost:${API_PORT}/`);
    log('info', `📡 Endpoints disponibles:`);
    log('info', `   GET  / - Interface web de gestion des appareils`);
    log('info', `   GET  /health - Health check`);
    log('info', `   GET  /api/devices - Liste des appareils`);
    log('info', `   GET  /api/devices/:id - Obtenir un appareil`);
    log('info', `   POST /api/devices/arc - Ajouter un appareil ARC`);
    log('info', `   POST /api/devices/arc/pair - Envoyer commande d'appairage ARC`);
    log('info', `   POST /api/devices/arc/confirm-pair - Confirmer l'appairage ARC`);
    log('info', `   POST /api/devices/arc/:id/on - Ouvrir/Monter un appareil ARC`);
    log('info', `   POST /api/devices/arc/:id/off - Fermer/Descendre un appareil ARC`);
    log('info', `   POST /api/devices/arc/:id/stop - Arrêter un appareil ARC`);
    log('info', `   POST /api/devices/arc/:id/up - Alias pour ON`);
    log('info', `   POST /api/devices/arc/:id/down - Alias pour OFF`);
    log('info', `   DELETE /api/devices/:id - Supprimer un appareil`);

    // Vérifier que le serveur écoute bien
    server.on('error', (err) => {
        log('error', `❌ Erreur serveur: ${err.message}`);
    });

    server.on('connection', (socket) => {
        log('debug', `🔌 Nouvelle connexion depuis ${socket.remoteAddress}:${socket.remotePort}`);
    });

    // Tester que le serveur répond correctement
    setTimeout(() => {
        testServerHealth();
    }, 1000);

    // Démarrer l'initialisation RFXCOM APRÈS le démarrage du serveur
    // Cela garantit que le serveur HTTP est accessible même si RFXCOM ne s'initialise pas
    setTimeout(() => {
        initializeRFXCOMAsync();
    }, 500);
});

// Fonction pour tester que le serveur répond
function testServerHealth() {
    log('info', '🧪 Test de santé du serveur...');

    const testUrl = `http://localhost:${API_PORT}`;
    const testEndpoints = [
        { path: '/', name: 'Interface web (/)', expectedStatus: 200 },
        { path: '/health', name: 'Health check (/health)', expectedStatus: 200 },
        { path: '/api/devices', name: 'API Devices (/api/devices)', expectedStatus: [200, 404] }
    ];

    let testsCompleted = 0;
    let testsPassed = 0;
    const totalTests = testEndpoints.length;

    testEndpoints.forEach((endpoint) => {
        const url = `${testUrl}${endpoint.path}`;

        const req = http.get(url, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                testsCompleted++;
                const expectedStatuses = Array.isArray(endpoint.expectedStatus)
                    ? endpoint.expectedStatus
                    : [endpoint.expectedStatus];

                if (expectedStatuses.includes(res.statusCode)) {
                    testsPassed++;
                    const dataLength = data.length > 0 ? ` (${data.length} bytes)` : '';
                    log('info', `✅ ${endpoint.name}: OK (${res.statusCode})${dataLength}`);
                } else {
                    log('warn', `⚠️ ${endpoint.name}: Status ${res.statusCode} (attendu: ${expectedStatuses.join(' ou ')})`);
                }

                if (testsCompleted === totalTests) {
                    if (testsPassed === totalTests) {
                        log('info', `✅ Tous les tests de santé ont réussi (${testsPassed}/${totalTests})`);
                    } else {
                        log('warn', `⚠️ Tests de santé: ${testsPassed}/${totalTests} réussis`);
                    }
                }
            });
        });

        req.on('error', (err) => {
            testsCompleted++;
            log('error', `❌ ${endpoint.name}: Erreur de connexion - ${err.message}`);

            if (testsCompleted === totalTests) {
                log('error', `❌ Tests de santé: ${testsPassed}/${totalTests} réussis`);
                log('error', '❌ Le serveur pourrait ne pas être accessible depuis localhost');
            }
        });

        req.setTimeout(5000, () => {
            testsCompleted++;
            req.destroy();
            log('warn', `⚠️ ${endpoint.name}: Timeout après 5 secondes`);

            if (testsCompleted === totalTests) {
                log('warn', `⚠️ Tests de santé: ${testsPassed}/${totalTests} réussis`);
                log('warn', '⚠️ Certains tests ont timeout, vérifiez que le serveur écoute bien sur le port');
            }
        });
    });
}

// Gestion de l'arrêt propre
process.on('SIGTERM', () => {
    log('info', '🛑 Signal SIGTERM reçu, arrêt du serveur...');
    server.close(() => {
        log('info', '✅ Serveur fermé proprement');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    log('info', '🛑 Signal SIGINT reçu, arrêt du serveur...');
    server.close(() => {
        log('info', '✅ Serveur fermé proprement');
        process.exit(0);
    });
});
