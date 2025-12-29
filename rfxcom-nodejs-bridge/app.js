const rfxcom = require('rfxcom');
const fs = require('fs');
const http = require('http');
const url = require('url');
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

// Vérifier si le port série existe
if (!fs.existsSync(SERIAL_PORT)) {
    log('error', `❌ Le port série ${SERIAL_PORT} n'existe pas !`);
    log('info', `💡 Vérifiez que votre émetteur RFXCOM est bien branché.`);
    process.exit(1);
}

// Vérifier les permissions sur le port série
try {
    fs.accessSync(SERIAL_PORT, fs.constants.R_OK | fs.constants.W_OK);
    log('info', `✅ Permissions OK sur ${SERIAL_PORT}`);
} catch (error) {
    log('error', `❌ Pas de permissions en lecture/écriture sur ${SERIAL_PORT}`);
    process.exit(1);
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

try {
    log('info', `🔌 Initialisation du module RFXCOM sur ${SERIAL_PORT}...`);

    const debugMode = LOG_LEVEL === 'debug';
    rfxtrx = new rfxcom.RfxCom(SERIAL_PORT, {
        debug: debugMode
    });

    rfxtrx.initialise((error) => {
        if (error) {
            log('error', `❌ Erreur lors de l'initialisation RFXCOM:`, error);
            process.exit(1);
        } else {
            log('info', `✅ RFXCOM initialisé avec succès sur ${SERIAL_PORT}`);
            
            // Créer le handler pour Lighting1 (ARC, etc.)
            lighting1Handler = new rfxcom.Lighting1(rfxtrx, rfxcom.lighting1.ARC);
            
            // Écouter les messages si la détection automatique est activée
            if (AUTO_DISCOVERY) {
                log('info', `👂 Écoute des messages RFXCOM pour détection automatique...`);
                rfxtrx.on('receive', (evt, msg) => {
                    log('debug', `📨 Message reçu:`, JSON.stringify(msg));
                    handleReceivedMessage(msg);
                });
            }
            
            log('info', `🎉 L'addon est prêt à recevoir des commandes !`);
            
            // Configurer la publication des entités après connexion MQTT
            // (l'initialisation MQTT se fera après le démarrage du serveur HTTP)
            if (mqttHelper) {
                mqttHelper.onConnect = () => {
                    setTimeout(() => {
                        log('info', '📡 Publication des entités Home Assistant existantes...');
                        Object.keys(devices).forEach(deviceId => {
                            const device = devices[deviceId];
                            if (device.type === 'ARC') {
                                mqttHelper.publishCoverDiscovery({ ...device, id: deviceId });
                            }
                        });
                    }, 1000);
                };
            }
        }
    });

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

} catch (error) {
    log('error', `❌ Erreur lors de la création de la connexion RFXCOM:`, error);
    process.exit(1);
}

// Gérer les messages reçus
function handleReceivedMessage(msg) {
    if (!AUTO_DISCOVERY) return;
    
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
        }
    }
}

// API HTTP
const server = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    const parsedUrl = url.parse(req.url, true);
    const path = parsedUrl.pathname;
    const method = req.method;

    // Health check
    if (path === '/health' && method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'ok',
            initialized: rfxtrx !== null,
            port: SERIAL_PORT,
            auto_discovery: AUTO_DISCOVERY
        }));
        return;
    }

    // Liste des appareils
    if (path === '/api/devices' && method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'success',
            devices: devices
        }));
        return;
    }

    // Obtenir un appareil
    if (path.startsWith('/api/devices/') && method === 'GET') {
        const deviceId = path.split('/')[3];
        if (devices[deviceId]) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: 'success',
                device: devices[deviceId]
            }));
        } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: 'error',
                error: 'Appareil non trouvé'
            }));
        }
        return;
    }

    // Ajouter un appareil ARC
    if (path === '/api/devices/arc' && method === 'POST') {
        let body = '';
        req.on('data', (chunk) => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const { name, houseCode, unitCode } = data;
                
                if (!name) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        status: 'error',
                        error: 'Le nom est requis'
                    }));
                    return;
                }

                // Trouver un code libre si non fourni
                let finalHouseCode = houseCode;
                let finalUnitCode = unitCode;
                
                if (!finalHouseCode || !finalUnitCode) {
                    const freeCode = findFreeArcCode();
                    if (!freeCode) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            status: 'error',
                            error: 'Aucun code libre disponible'
                        }));
                        return;
                    }
                    finalHouseCode = freeCode.houseCode;
                    finalUnitCode = freeCode.unitCode;
                }

                const id = `ARC_${finalHouseCode}_${finalUnitCode}`;
                
                if (devices[id]) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        status: 'error',
                        error: 'Cet appareil existe déjà'
                    }));
                    return;
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
                
                // Publier la découverte Home Assistant
                if (mqttHelper) {
                    mqttHelper.publishCoverDiscovery({ ...devices[id], id: id });
                }
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    status: 'success',
                    device: devices[id],
                    message: `Appareil ARC créé avec house code ${finalHouseCode} et unit code ${finalUnitCode}. Mettez l'appareil en mode appairage puis utilisez /api/devices/arc/pair`
                }));
            } catch (error) {
                log('error', `❌ Erreur lors de l'ajout d'un appareil ARC:`, error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    status: 'error',
                    error: error.message
                }));
            }
        });
        return;
    }

    // Appairage ARC - Étape 1: Envoyer la commande d'appairage
    if (path === '/api/devices/arc/pair' && method === 'POST') {
        let body = '';
        req.on('data', (chunk) => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const { deviceId } = data;
                
                if (!deviceId || !devices[deviceId]) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        status: 'error',
                        error: 'Appareil non trouvé'
                    }));
                    return;
                }

                const device = devices[deviceId];
                if (device.type !== 'ARC') {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        status: 'error',
                        error: 'Cet appareil n\'est pas de type ARC'
                    }));
                    return;
                }

                if (!lighting1Handler) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        status: 'error',
                        error: 'RFXCOM non initialisé'
                    }));
                    return;
                }

                // Envoyer ON pour l'appairage
                lighting1Handler.switchOn(device.houseCode, device.unitCode, (error) => {
                    if (error) {
                        log('error', `❌ Erreur lors de l'appairage:`, error);
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            status: 'error',
                            error: error.message
                        }));
                    } else {
                        log('info', `✅ Commande d'appairage envoyée pour ${device.name}`);
                        
                        // Marquer comme appairé (l'utilisateur confirmera via /api/devices/arc/confirm-pair)
                        devices[deviceId].pairingSent = true;
                        saveDevices();
                        
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            status: 'success',
                            message: 'Commande d\'appairage envoyée. Vérifiez si l\'appareil a répondu, puis utilisez /api/devices/arc/confirm-pair pour confirmer.'
                        }));
                    }
                });
            } catch (error) {
                log('error', `❌ Erreur lors de l'appairage:`, error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    status: 'error',
                    error: error.message
                }));
            }
        });
        return;
    }

    // Confirmer l'appairage ARC
    if (path === '/api/devices/arc/confirm-pair' && method === 'POST') {
        let body = '';
        req.on('data', (chunk) => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const { deviceId, confirmed } = data;
                
                if (!deviceId || !devices[deviceId]) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        status: 'error',
                        error: 'Appareil non trouvé'
                    }));
                    return;
                }

                const device = devices[deviceId];
                if (confirmed === true) {
                    device.paired = true;
                    device.pairedAt = new Date().toISOString();
                    saveDevices();
                    
                    log('info', `✅ Appairage confirmé pour ${device.name}`);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        status: 'success',
                        message: 'Appairage confirmé. Utilisez /api/devices/arc/test pour tester ON/OFF.'
                    }));
                } else {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        status: 'info',
                        message: 'Appairage non confirmé. Réessayez le processus d\'appairage.'
                    }));
                }
            } catch (error) {
                log('error', `❌ Erreur lors de la confirmation:`, error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    status: 'error',
                    error: error.message
                }));
            }
        });
        return;
    }

    // Tester un appareil ARC (ON/OFF)
    if (path === '/api/devices/arc/test' && method === 'POST') {
        let body = '';
        req.on('data', (chunk) => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const { deviceId, command } = data;
                
                if (!deviceId || !devices[deviceId]) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        status: 'error',
                        error: 'Appareil non trouvé'
                    }));
                    return;
                }

                const device = devices[deviceId];
                if (device.type !== 'ARC') {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        status: 'error',
                        error: 'Cet appareil n\'est pas de type ARC'
                    }));
                    return;
                }

                if (!['on', 'off', 'up', 'down', 'stop'].includes(command)) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        status: 'error',
                        error: 'Commande invalide. Utilisez: on, off, up, down, stop'
                    }));
                    return;
                }

                if (!lighting1Handler) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        status: 'error',
                        error: 'RFXCOM non initialisé'
                    }));
                    return;
                }

                // Envoyer la commande
                const callback = (error) => {
                    if (error) {
                        log('error', `❌ Erreur lors de l'envoi de la commande:`, error);
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            status: 'error',
                            error: error.message
                        }));
                    } else {
                        log('info', `✅ Commande ${command} envoyée à ${device.name}`);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            status: 'success',
                            message: `Commande ${command} envoyée`
                        }));
                    }
                };

                if (command === 'on' || command === 'up') {
                    lighting1Handler.switchOn(device.houseCode, device.unitCode, callback);
                } else if (command === 'off' || command === 'down') {
                    lighting1Handler.switchOff(device.houseCode, device.unitCode, callback);
                } else {
                    // Pour stop, on peut envoyer OFF
                    lighting1Handler.switchOff(device.houseCode, device.unitCode, callback);
                }
            } catch (error) {
                log('error', `❌ Erreur lors du test:`, error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    status: 'error',
                    error: error.message
                }));
            }
        });
        return;
    }

    // Supprimer un appareil
    if (path.startsWith('/api/devices/') && method === 'DELETE') {
        const deviceId = path.split('/')[3];
        if (devices[deviceId]) {
            // Supprimer la découverte Home Assistant
            if (mqttHelper) {
                mqttHelper.removeDiscovery(deviceId);
            }
            
            delete devices[deviceId];
            saveDevices();
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: 'success',
                message: 'Appareil supprimé'
            }));
        } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: 'error',
                error: 'Appareil non trouvé'
            }));
        }
        return;
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        status: 'error',
        error: 'Endpoint non trouvé'
    }));
});

// Démarrer le serveur HTTP
server.listen(API_PORT, '0.0.0.0', () => {
    log('info', `🌐 Serveur API démarré sur le port ${API_PORT}`);
    log('info', `📡 Endpoints disponibles:`);
    log('info', `   GET  /health - Health check`);
    log('info', `   GET  /api/devices - Liste des appareils`);
    log('info', `   GET  /api/devices/:id - Obtenir un appareil`);
    log('info', `   POST /api/devices/arc - Ajouter un appareil ARC`);
    log('info', `   POST /api/devices/arc/pair - Envoyer commande d'appairage ARC`);
    log('info', `   POST /api/devices/arc/confirm-pair - Confirmer l'appairage ARC`);
    log('info', `   POST /api/devices/arc/test - Tester un appareil ARC (on/off/up/down/stop)`);
    log('info', `   DELETE /api/devices/:id - Supprimer un appareil`);
    
    // Initialiser MQTT après le démarrage du serveur HTTP
    // (seulement si RFXCOM est déjà initialisé)
    if (rfxtrx && lighting1Handler) {
        initializeMQTT();
    }
});
