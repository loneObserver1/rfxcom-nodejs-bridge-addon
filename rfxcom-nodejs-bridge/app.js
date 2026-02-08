const rfxcom = require('rfxcom');
const fs = require('fs');
const express = require('express');
const http = require('http');
const MQTTHelper = require('./mqtt_helper');
const commandQueue = require('./rfxcom_command_queue');

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

// Variables globales pour le nettoyage
let server = null;

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
                        // Migration: ajouter haDeviceType pour les appareils existants qui n'en ont pas
                        let migrated = false;
                        Object.keys(devices).forEach(deviceId => {
                            const device = devices[deviceId];
                            if (!device.haDeviceType) {
                                // Définir la valeur par défaut selon le type RFXCOM
                                if (device.type === 'ARC') {
                                    device.haDeviceType = 'cover';
                                } else if (device.type === 'AC') {
                                    device.haDeviceType = 'switch';
                                } else if (device.type === 'TEMP_HUM') {
                                    device.haDeviceType = 'sensor';
                                } else {
                                    device.haDeviceType = 'switch'; // Par défaut
                                }
                                migrated = true;
                            }
                        });
                        if (migrated) {
                            saveDevices();
                            log('info', '🔄 Migration: haDeviceType ajouté aux appareils existants');
                        }
                        log('info', `📦 ${Object.keys(devices).length} appareil(s) chargé(s)`);
                    }
                }
        } else {
            devices = {};
            log('info', '📦 Aucun appareil enregistré, le fichier devices.json sera créé');
            log('info', '💡 Si MQTT est disponible, tentative de récupération des appareils depuis Home Assistant...');
            // Ne pas créer le fichier tout de suite, attendre la récupération depuis MQTT
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

// Trouver un Device ID et Unit Code libre pour AC
function findFreeAcCode() {
    // Générer un Device ID aléatoire (6 caractères hexadécimaux)
    const generateRandomDeviceId = () => {
        const chars = '0123456789ABCDEF';
        let result = '';
        for (let i = 0; i < 6; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    };

    const unitCodes = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];

    // Essayer jusqu'à 100 fois pour trouver une combinaison libre
    for (let attempt = 0; attempt < 100; attempt++) {
        const deviceId = generateRandomDeviceId();
        for (const unitCode of unitCodes) {
            const id = `AC_${deviceId}_${unitCode}`;
            if (!devices[id]) {
                return { deviceId, unitCode };
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
let lighting2Handler = null;
let mqttHelper = null;
let rfxtrxReady = false; // Indicateur que RFXCOM est prêt à recevoir des commandes
let consecutiveTimeoutCount = 0; // Timeouts consécutifs pour déclencher une reconnexion
let reconnectingRFXCOM = false;   // Évite de lancer plusieurs reconnexions en parallèle
let lastCommandSentAt = 0;        // Dernière fin de commande (pour keepalive)
let keepaliveIntervalId = null;   // Timer keepalive série

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
            log('info', `📨 Message MQTT reçu: ${topic} -> ${message.toString()}`);

            // Format: rfxcom/cover/{deviceId}/set ou rfxcom/switch/{deviceId}/set
            const parts = topic.split('/');
            log('debug', `📋 Parties du topic: ${JSON.stringify(parts)}`);

            if (parts.length >= 4 && parts[0] === 'rfxcom') {
                const deviceType = parts[1]; // 'cover' ou 'switch'
                const deviceId = parts[2];
                const commandType = parts[3];

                log('debug', `🔍 Type: ${deviceType}, DeviceId: ${deviceId}, CommandType: ${commandType}`);

                // Récupérer le haDeviceType de l'appareil
                const device = devices[deviceId];
                const haDeviceType = device?.haDeviceType ||
                    (device?.type === 'ARC' ? 'cover' :
                     device?.type === 'AC' ? 'switch' :
                     device?.type === 'TEMP_HUM' ? 'sensor' : 'switch');

                log('debug', `🔍 Device existe: ${!!device}, Type device: ${device?.type}, haDeviceType: ${haDeviceType}, Handler: ${deviceType === 'cover' ? !!lighting1Handler : !!lighting2Handler}`);

                // Gestion des volets (cover) - ARC ou AC avec haDeviceType='cover'
                if (deviceType === 'cover' && device && haDeviceType === 'cover') {
                    // Pour ARC, utiliser lighting1Handler
                    if (device.type === 'ARC' && lighting1Handler) {
                        // Pour Lighting1 (ARC), on passe houseCode et unitCode séparément
                        if (commandType === 'set') {
                            // Commandes: OPEN, CLOSE, STOP
                            const messageStr = message.toString().trim();
                            log('info', `🎯 Commande ARC reçue: ${messageStr}`);

                            if (messageStr === 'OPEN' || messageStr === 'open') {
                                commandQueue.push({
                                    type: 'arc',
                                    deviceId,
                                    command: 'open',
                                    onSuccess: () => {
                                        log('info', `✅ Commande OPEN envoyée à ${device.name}`);
                                        if (mqttHelper) mqttHelper.publishCoverState(deviceId, 'open');
                                    },
                                    onDone: (err) => { if (err) log('error', `❌ Erreur commande OPEN: ${err.message}`); }
                                });
                            } else if (messageStr === 'CLOSE' || messageStr === 'close') {
                                commandQueue.push({
                                    type: 'arc',
                                    deviceId,
                                    command: 'close',
                                    onSuccess: () => {
                                        log('info', `✅ Commande CLOSE envoyée à ${device.name}`);
                                        if (mqttHelper) mqttHelper.publishCoverState(deviceId, 'closed');
                                    },
                                    onDone: (err) => { if (err) log('error', `❌ Erreur commande CLOSE: ${err.message}`); }
                                });
                            } else if (messageStr === 'STOP' || messageStr === 'stop') {
                                commandQueue.push({
                                    type: 'arc',
                                    deviceId,
                                    command: 'stop',
                                    onSuccess: () => log('info', `✅ Commande STOP envoyée à ${device.name}`),
                                    onDone: (err) => { if (err) log('error', `❌ Erreur commande STOP: ${err.message}`); }
                                });
                            } else {
                                log('warn', `⚠️ Commande ARC inconnue: ${messageStr}`);
                            }
                        }
                    }
                    // Pour AC avec haDeviceType='cover', utiliser lighting2Handler
                    else if (device.type === 'AC' && lighting2Handler) {
                        if (commandType === 'set') {
                            const messageStr = message.toString().trim();
                            log('info', `🎯 Commande AC (cover) reçue: ${messageStr}`);

                            if (messageStr === 'OPEN' || messageStr === 'open') {
                                commandQueue.push({
                                    type: 'ac',
                                    deviceId,
                                    command: 'open',
                                    onSuccess: () => {
                                        log('info', `✅ Commande OPEN envoyée à ${device.name}`);
                                        if (mqttHelper) mqttHelper.publishCoverState(deviceId, 'open');
                                    },
                                    onDone: (err) => { if (err) log('error', `❌ Erreur commande OPEN: ${err.message}`); }
                                });
                            } else if (messageStr === 'CLOSE' || messageStr === 'close') {
                                commandQueue.push({
                                    type: 'ac',
                                    deviceId,
                                    command: 'close',
                                    onSuccess: () => {
                                        log('info', `✅ Commande CLOSE envoyée à ${device.name}`);
                                        if (mqttHelper) mqttHelper.publishCoverState(deviceId, 'closed');
                                    },
                                    onDone: (err) => { if (err) log('error', `❌ Erreur commande CLOSE: ${err.message}`); }
                                });
                            } else if (messageStr === 'STOP' || messageStr === 'stop') {
                                commandQueue.push({
                                    type: 'ac',
                                    deviceId,
                                    command: 'stop',
                                    onSuccess: () => {
                                        log('info', `✅ Commande STOP envoyée à ${device.name}`);
                                        if (mqttHelper) mqttHelper.publishCoverState(deviceId, 'open');
                                    },
                                    onDone: (err) => { if (err) log('error', `❌ Erreur commande STOP: ${err.message}`); }
                                });
                            } else {
                                log('warn', `⚠️ Commande AC (cover) inconnue: ${messageStr}`);
                            }
                        }
                    }
                }
                // Gestion des switches (prises) - AC ou ARC avec haDeviceType='switch'
                else if (deviceType === 'switch' && device && haDeviceType === 'switch') {
                    // Pour AC, utiliser lighting2Handler
                    if (device.type === 'AC' && lighting2Handler) {
                        // Pour Lighting2 (AC), on utilise le format "0x{deviceId}/{unitCode}"
                        const deviceIdFormatted = `0x${device.deviceId}/${device.unitCode}`;

                        if (commandType === 'set') {
                            // Commandes: ON, OFF
                            const messageStr = message.toString().trim();
                            log('info', `🎯 Commande AC reçue: ${messageStr} pour ${device.name} (${deviceIdFormatted})`);

                            // Vérifier que rfxtrx est bien initialisé
                            if (!rfxtrx) {
                                log('error', `❌ RFXCOM non initialisé (rfxtrx est null)`);
                                return;
                            }

                            // Vérifier que RFXCOM est prêt à recevoir des commandes
                            if (!rfxtrxReady) {
                                log('warn', `⚠️ RFXCOM n'est pas encore prêt à recevoir des commandes (receiverstarted non émis)`);
                                log('warn', `⚠️ La commande sera ignorée. Attendez que le module soit complètement initialisé.`);
                                return;
                            }

                            if (messageStr === 'ON' || messageStr === 'on') {
                                log('info', `📤 Envoi de la commande ON au module RFXCOM pour ${device.name}...`);
                                commandQueue.push({
                                    type: 'ac',
                                    deviceId,
                                    command: 'on',
                                    onSuccess: () => {
                                        log('info', `✅ Commande ON envoyée à ${device.name}`);
                                        if (mqttHelper) mqttHelper.publishSwitchState(deviceId, 'ON');
                                    },
                                    onDone: (err) => { if (err) log('error', `❌ Erreur commande ON: ${err.message}`); }
                                });
                            } else if (messageStr === 'OFF' || messageStr === 'off') {
                                log('info', `📤 Envoi de la commande OFF au module RFXCOM pour ${device.name}...`);
                                commandQueue.push({
                                    type: 'ac',
                                    deviceId,
                                    command: 'off',
                                    onSuccess: () => {
                                        log('info', `✅ Commande OFF envoyée à ${device.name}`);
                                        if (mqttHelper) mqttHelper.publishSwitchState(deviceId, 'OFF');
                                    },
                                    onDone: (err) => { if (err) log('error', `❌ Erreur commande OFF: ${err.message}`); }
                                });
                            } else {
                                log('warn', `⚠️ Commande AC inconnue: ${messageStr}`);
                            }
                        }
                    }
                    // Pour ARC avec haDeviceType='switch', utiliser lighting1Handler
                    else if (device.type === 'ARC' && lighting1Handler) {
                        if (commandType === 'set') {
                            const messageStr = message.toString().trim();
                            log('info', `🎯 Commande ARC (switch) reçue: ${messageStr}`);

                            // Vérifier que rfxtrx est bien initialisé
                            if (!rfxtrx) {
                                log('error', `❌ RFXCOM non initialisé (rfxtrx est null)`);
                                return;
                            }

                            // Vérifier que RFXCOM est prêt à recevoir des commandes
                            if (!rfxtrxReady) {
                                log('warn', `⚠️ RFXCOM n'est pas encore prêt à recevoir des commandes (receiverstarted non émis)`);
                                log('warn', `⚠️ La commande sera ignorée. Attendez que le module soit complètement initialisé.`);
                                return;
                            }

                            if (messageStr === 'ON' || messageStr === 'on') {
                                log('info', `📤 Envoi de la commande ON au module RFXCOM pour ${device.name}...`);
                                commandQueue.push({
                                    type: 'arc',
                                    deviceId,
                                    command: 'on',
                                    onSuccess: () => {
                                        log('info', `✅ Commande ON envoyée à ${device.name}`);
                                        if (mqttHelper) mqttHelper.publishSwitchState(deviceId, 'ON');
                                    },
                                    onDone: (err) => { if (err) log('error', `❌ Erreur commande ON: ${err.message}`); }
                                });
                            } else if (messageStr === 'OFF' || messageStr === 'off') {
                                log('info', `📤 Envoi de la commande OFF au module RFXCOM pour ${device.name}...`);
                                commandQueue.push({
                                    type: 'arc',
                                    deviceId,
                                    command: 'off',
                                    onSuccess: () => {
                                        log('info', `✅ Commande OFF envoyée à ${device.name}`);
                                        if (mqttHelper) mqttHelper.publishSwitchState(deviceId, 'OFF');
                                    },
                                    onDone: (err) => { if (err) log('error', `❌ Erreur commande OFF: ${err.message}`); }
                                });
                            } else {
                                log('warn', `⚠️ Commande ARC (switch) inconnue: ${messageStr}`);
                            }
                        }
                    }
                } else {
                    if (deviceType === 'switch' && !device) {
                        log('warn', `⚠️ Appareil non trouvé pour deviceId: ${deviceId}`);
                        log('debug', `📋 Appareils disponibles: ${Object.keys(devices).join(', ')}`);
                    } else if (deviceType === 'switch' && device && haDeviceType !== 'switch') {
                        log('warn', `⚠️ Type HA incorrect: ${haDeviceType} (attendu: switch) pour deviceId: ${deviceId}`);
                    } else if (deviceType === 'cover' && device && haDeviceType !== 'cover') {
                        log('warn', `⚠️ Type HA incorrect: ${haDeviceType} (attendu: cover) pour deviceId: ${deviceId}`);
                    } else if (deviceType === 'switch' && !lighting2Handler && device?.type === 'AC') {
                        log('error', `❌ lighting2Handler non initialisé`);
                        log('error', `❌ RFXCOM peut ne pas être complètement initialisé. Vérifiez les logs d'initialisation.`);
                    } else if (deviceType === 'cover' && !lighting1Handler && device?.type === 'ARC') {
                        log('error', `❌ lighting1Handler non initialisé`);
                        log('error', `❌ RFXCOM peut ne pas être complètement initialisé. Vérifiez les logs d'initialisation.`);
                    } else if (deviceType === 'switch' && device && !rfxtrx) {
                        log('error', `❌ RFXCOM non initialisé (rfxtrx est null) pour deviceId: ${deviceId}`);
                    }
                }
            } else {
                log('debug', `⚠️ Format de topic non reconnu: ${topic}`);
            }
        });

        mqttHelper.connect();
    } catch (error) {
        log('warn', `⚠️ Impossible d'initialiser MQTT: ${error.message}`);
        log('warn', `⚠️ Les entités Home Assistant ne seront pas créées automatiquement`);
    }
}

// Initialise la file d'attente des commandes RFXCOM (une commande à la fois vers le module)
// Enregistre le résultat d'une commande (succès ou erreur) et déclenche une reconnexion après N timeouts consécutifs
function recordCommandResult(err) {
    lastCommandSentAt = Date.now();
    if (err && (err.message || '').includes('timed out')) {
        consecutiveTimeoutCount += 1;
        if (consecutiveTimeoutCount >= 5) {
            log('warn', `⚠️ ${consecutiveTimeoutCount} timeouts consécutifs → reconnexion RFXCOM programmée`);
            consecutiveTimeoutCount = 0;
            scheduleRFXCOMReconnect();
        }
    } else {
        consecutiveTimeoutCount = 0;
    }
}

// Ferme le port RFXCOM puis réinitialise après un délai (sans redémarrer tout l'add-on)
function scheduleRFXCOMReconnect() {
    if (reconnectingRFXCOM) return;
    reconnectingRFXCOM = true;
    log('info', '🔄 Reconnexion RFXCOM dans 3 secondes (fermeture puis réouverture du port)...');
    closeRFXCOM();
    setTimeout(() => {
        initializeRFXCOMAsync();
        // Libérer le verrou après un délai suffisant pour que l'init se termine (ou échoue)
        setTimeout(() => {
            reconnectingRFXCOM = false;
        }, 20000);
    }, 3000);
}

const KEEPALIVE_INTERVAL_MS = 12000;  // Toutes les 12 s
const KEEPALIVE_IDLE_MS = 10000;      // Envoyer un keepalive si aucune commande depuis 10 s

function startKeepalive() {
    if (keepaliveIntervalId) return;
    keepaliveIntervalId = setInterval(() => {
        if (!rfxtrxReady || !rfxtrx || reconnectingRFXCOM) return;
        if (commandQueue.isProcessing()) return;
        if (Date.now() - lastCommandSentAt < KEEPALIVE_IDLE_MS) return;
        try {
            rfxtrx.getRFXStatus((err) => {
                if (err) log('debug', 'Keepalive RFXCOM:', err.message);
            });
        } catch (e) {
            log('debug', 'Keepalive RFXCOM:', e.message);
        }
    }, KEEPALIVE_INTERVAL_MS);
    log('info', '🔄 Keepalive RFXCOM activé (toutes les 12 s si inactif > 10 s)');
}

function stopKeepalive() {
    if (keepaliveIntervalId) {
        clearInterval(keepaliveIntervalId);
        keepaliveIntervalId = null;
    }
}

function initCommandQueue() {
    lastCommandSentAt = Date.now(); // évite un keepalive dans les 10 s suivant le prêt
    commandQueue.init({
        getDevices: () => devices,
        getLighting1: () => lighting1Handler,
        getLighting2: () => lighting2Handler,
        log,
        onCommandComplete: recordCommandResult
    });
    log('info', '📋 File d\'attente des commandes RFXCOM initialisée (une commande à la fois)');
    startKeepalive();
}

// Fonction pour arrêter proprement l'add-on en cas d'erreur RFXCOM critique
function shutdownOnRFXCOMError(message) {
    log('error', `❌ ${message}`);
    log('error', `🛑 Arrêt de l'add-on car RFXCOM est essentiel pour son fonctionnement`);
    setTimeout(() => {
        cleanupAndExit(1);
    }, 2000); // Délai de 2 secondes pour permettre l'écriture des logs
}

// Initialiser RFXCOM de manière asynchrone sans bloquer le serveur
function initializeRFXCOMAsync() {
    if (!fs.existsSync(SERIAL_PORT)) {
        shutdownOnRFXCOMError(`Port série ${SERIAL_PORT} non disponible. RFXCOM est essentiel pour cet add-on.`);
        return;
    }

    try {
        log('info', `🔌 Initialisation du module RFXCOM sur ${SERIAL_PORT}...`);

        // Nettoyer toute instance précédente si elle existe
        if (rfxtrx) {
            try {
                log('info', '🧹 Nettoyage de l\'instance RFXCOM précédente...');
                rfxtrx.removeAllListeners();
                rfxtrx.close();
            } catch (err) {
                log('warn', `⚠️ Erreur lors du nettoyage de l'instance précédente: ${err.message}`);
            }
            rfxtrx = null;
        }

        const debugMode = LOG_LEVEL === 'debug';
        // concurrency: 1 = une seule commande en vol à la fois (évite timeouts groupés :
        // le package appelle le callback au "write" et non à l'ACK, donc sans ça plusieurs commandes partent d'un coup)
        rfxtrx = new rfxcom.RfxCom(SERIAL_PORT, {
            debug: debugMode,
            concurrency: 1,
            timeout: 12000
        });

        // Ajouter un timeout pour éviter que l'initialisation bloque indéfiniment
        let timeoutTriggered = false;
        let initCompleted = false;
        const initTimeout = setTimeout(() => {
            if (!initCompleted) {
                timeoutTriggered = true;
                shutdownOnRFXCOMError(`Timeout lors de l'initialisation RFXCOM (30s). Le module RFXCOM n'a pas répondu dans le délai imparti.`);
            }
        }, 30000);

        // Variable pour suivre si les listeners ont été enregistrés
        let listenersRegistered = false;

        // Fonction pour enregistrer les listeners de messages
        // Doit être appelée après l'événement 'receiverstarted'
        const registerMessageListeners = () => {
            if (listenersRegistered || !rfxtrx) {
                return; // Éviter d'enregistrer plusieurs fois
            }
            listenersRegistered = true;

            // Écouter les messages si la détection automatique est activée
            if (AUTO_DISCOVERY) {
                log('info', `👂 Enregistrement des listeners pour détection automatique...`);
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

                // Écouter spécifiquement les événements "temperaturerain1" pour les sondes Alecto
                rfxtrx.on('temperaturerain1', (msg) => {
                    log('info', `🌡️ Message Alecto temperaturerain1 reçu:`, JSON.stringify(msg));
                    if (msg && typeof msg === 'object') {
                        handleReceivedMessage(msg);
                    }
                });

                // Écouter spécifiquement les événements "temperaturehumidity1" pour les sondes Alecto TH13/WS1700
                rfxtrx.on('temperaturehumidity1', (msg) => {
                    log('info', `🌡️ Message Alecto TH13/WS1700 temperaturehumidity1 reçu:`, JSON.stringify(msg));
                    if (msg && typeof msg === 'object') {
                        handleReceivedMessage(msg);
                    }
                });
                log('info', `✅ Listeners de détection automatique enregistrés`);
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
            log('info', `📊 État: AUTO_DISCOVERY=${AUTO_DISCOVERY}, listenersRegistered=${listenersRegistered}, rfxtrxReady=${rfxtrxReady}`);
        };

        // Écouter les événements AVANT d'appeler initialise
        // Cela garantit qu'on ne manque pas les événements

        // Écouter connectfailed pour détecter les échecs de connexion
        rfxtrx.once('connectfailed', () => {
            if (!timeoutTriggered) {
                timeoutTriggered = true;
                clearTimeout(initTimeout);
                shutdownOnRFXCOMError('Échec de connexion au module RFXCOM. Vérifiez le port série et les permissions.');
            }
        });

        // Écouter connecting pour le debug
        rfxtrx.on('connecting', () => {
            log('info', '📡 Connexion RFXCOM en cours...');
        });

        // Quand ready est émis, considérer que l'initialisation est en cours
        let readyEmitted = false;
        rfxtrx.once('ready', () => {
            log('info', `✅ RFXCOM prêt (événement 'ready')`);
            readyEmitted = true;

            // Fallback : si le callback initialise n'est pas appelé dans les 3 secondes après ready,
            // considérer que l'initialisation est réussie (certaines versions du package ne déclenchent pas toujours le callback)
            setTimeout(() => {
                if (!initCompleted && !timeoutTriggered && rfxtrx) {
                    log('warn', `⚠️ Callback initialise non appelé après 'ready', considération de l'initialisation comme réussie`);
                    initCompleted = true;
                    clearTimeout(initTimeout);

                    // Créer les handlers maintenant
                    lighting1Handler = new rfxcom.Lighting1(rfxtrx, rfxcom.lighting1.ARC);
                    lighting1Handler.switchUp = function(houseCode, unitCode, callback) {
                        return this.switchOn(`${houseCode}${unitCode}`, callback);
                    };
                    lighting1Handler.switchDown = function(houseCode, unitCode, callback) {
                        return this.switchOff(`${houseCode}${unitCode}`, callback);
                    };
                    lighting1Handler.stop = function(houseCode, unitCode, callback) {
                        return this.chime(`${houseCode}${unitCode}`, callback);
                    };
                    lighting2Handler = new rfxcom.Lighting2(rfxtrx, rfxcom.lighting2.AC);

                    log('info', `✅ Handlers RFXCOM créés: lighting1Handler=${!!lighting1Handler}, lighting2Handler=${!!lighting2Handler}`);
                    log('info', `✅ RFXCOM initialisé avec succès (via fallback après 'ready')`);
                    // Ne pas marquer comme prêt ici, attendre receiverstarted ou le timeout
                    log('info', `⏳ En attente de l'événement 'receiverstarted' pour confirmer que le module est prêt...`);

                    // Fallback : si 'receiverstarted' n'est pas émis dans les 5 secondes,
                    // marquer RFXCOM comme prêt quand même (pour compatibilité avec certaines versions)
                    // IMPORTANT: Ce fallback est crucial quand AUTO_DISCOVERY est activé car receiverstarted
                    // peut ne pas être émis dans certaines configurations
                    setTimeout(() => {
                        if (!rfxtrxReady && rfxtrx) {
                            rfxtrxReady = true;
                            initCommandQueue();
                            log('info', `✅ RFXCOM marqué comme prêt (via fallback après 5 secondes depuis 'ready')`);
                            // S'assurer que les listeners sont enregistrés si receiverstarted n'a pas été émis
                            // Cela est particulièrement important quand AUTO_DISCOVERY est activé
                            if (!listenersRegistered) {
                                log('warn', `⚠️ Enregistrement des listeners via fallback (receiverstarted non émis)`);
                                registerMessageListeners();
                            }
                            // IMPORTANT: Forcer le démarrage de la queue de transmission si initialising est encore true
                            // Cela peut arriver si receiverstarted n'est pas émis, ce qui empêche la queue de démarrer
                            if (rfxtrx.initialising === true && rfxtrx.TxQ && typeof rfxtrx.TxQ.start === 'function') {
                                log('warn', `⚠️ La queue de transmission n'a pas été démarrée automatiquement, démarrage forcé...`);
                                try {
                                    rfxtrx.initialising = false; // Marquer comme non initialisant pour permettre le démarrage
                                    rfxtrx.TxQ.start();
                                    log('info', `✅ Queue de transmission démarrée avec succès`);
                                    log('warn', `⚠️ L'événement 'receiverstarted' n'a pas été reçu: le RFXtrx n'a peut-être pas confirmé son initialisation. Si les appareils ne réagissent pas, vérifiez le câble USB, le port série (${SERIAL_PORT}) et lancez avec LOG_LEVEL=debug pour voir le trafic série.`);
                                } catch (err) {
                                    log('error', `❌ Erreur lors du démarrage forcé de la queue: ${err.message}`);
                                }
                            }
                        }
                    }, 5000);

                    // Initialiser MQTT
                    setTimeout(() => {
                        initializeMQTT();
                        if (mqttHelper) {
                            mqttHelper.onConnect = () => {
                                log('info', '✅ Test de connexion MQTT réussi');
                                const deviceCount = Object.keys(devices).length;
                                if (deviceCount === 0) {
                                    log('info', '🔄 Tentative de récupération des appareils depuis les topics de découverte MQTT...');
                                    recoverDevicesFromMQTT();
                                } else {
                                    setTimeout(() => {
                                        log('info', `📡 Publication des ${deviceCount} entité(s) Home Assistant existante(s)...`);
                                        Object.keys(devices).forEach(deviceId => {
                                            const device = devices[deviceId];
                                            mqttHelper.publishDeviceDiscovery({ ...device, id: deviceId });
                                        });
                                    }, 1000);
                                }
                            };
                        }
                    }, 500);
                }
            }, 3000);
        });

        // Attendre l'événement 'receiverstarted' avant d'enregistrer les listeners
        // Cela garantit que le récepteur RFXCOM est complètement initialisé
        // NOTE: Cet événement peut ne pas être émis dans certaines configurations,
        // notamment quand AUTO_DISCOVERY est activé, d'où l'importance du fallback de 5 secondes
        rfxtrx.once('receiverstarted', () => {
            log('info', `✅ Récepteur RFXCOM démarré (événement 'receiverstarted'), enregistrement des listeners...`);
            rfxtrxReady = true; // Marquer RFXCOM comme prêt à recevoir des commandes
            initCommandQueue();
            registerMessageListeners();
        });

        // Gérer les erreurs de connexion série (après l'initialisation)
        rfxtrx.on('error', (err) => {
            if (initCompleted) {
                log('error', `❌ Erreur RFXCOM: ${err.message}`);
                shutdownOnRFXCOMError(`Erreur de connexion RFXCOM: ${err.message}`);
            } else {
                // Pendant l'initialisation, juste logger
                log('warn', `⚠️ Erreur RFXCOM pendant l'initialisation: ${err.message}`);
            }
        });

        rfxtrx.on('disconnect', () => {
            if (initCompleted) {
                log('error', '❌ RFXCOM déconnecté');
                shutdownOnRFXCOMError('RFXCOM s\'est déconnecté. L\'add-on ne peut pas fonctionner sans RFXCOM.');
            } else {
                // Pendant l'initialisation, juste logger
                log('warn', '⚠️ RFXCOM déconnecté pendant l\'initialisation');
            }
        });

        // Appeler initialise
        rfxtrx.initialise((error) => {
            // Si le timeout a déjà été déclenché, ne rien faire
            if (timeoutTriggered) {
                return;
            }
            initCompleted = true;
            clearTimeout(initTimeout);
            log('info', `📞 Callback initialise appelé (error: ${error ? error.message : 'null'})`);

            if (error) {
                shutdownOnRFXCOMError(`Erreur lors de l'initialisation RFXCOM: ${error.message || error}`);
                rfxtrx = null;
                return;
            } else {
                log('info', `✅ RFXCOM initialisé avec succès sur ${SERIAL_PORT}`);

                // Créer le handler pour Lighting1 (ARC, etc.)
                lighting1Handler = new rfxcom.Lighting1(rfxtrx, rfxcom.lighting1.ARC);

                // Ajouter les méthodes wrapper pour ARC (UP/DOWN/STOP)
                // car l'API rfxcom n'expose que switchOn, switchOff, chime
                lighting1Handler.switchUp = function(houseCode, unitCode, callback) {
                    // Pour ARC, switchOn (0x01) = UP (monter)
                    return this.switchOn(`${houseCode}${unitCode}`, callback);
                };

                lighting1Handler.switchDown = function(houseCode, unitCode, callback) {
                    // Pour ARC, switchOff (0x00) = DOWN (descendre)
                    return this.switchOff(`${houseCode}${unitCode}`, callback);
                };

                lighting1Handler.stop = function(houseCode, unitCode, callback) {
                    // Pour ARC, chime (0x07) peut être utilisé comme STOP
                    return this.chime(`${houseCode}${unitCode}`, callback);
                };

                // Créer le handler pour Lighting2 (AC, DIO Chacon, etc.)
                lighting2Handler = new rfxcom.Lighting2(rfxtrx, rfxcom.lighting2.AC);

                log('info', `✅ Handlers RFXCOM créés: lighting1Handler=${!!lighting1Handler}, lighting2Handler=${!!lighting2Handler}`);
                // Ne pas marquer comme prêt ici, attendre receiverstarted ou le timeout
                log('info', `⏳ En attente de l'événement 'receiverstarted' pour confirmer que le module est prêt...`);

                // Fallback : si 'receiverstarted' n'est pas émis dans les 5 secondes,
                // enregistrer quand même les listeners (pour compatibilité avec certaines versions)
                // IMPORTANT: Ce fallback est crucial quand AUTO_DISCOVERY est activé car receiverstarted
                // peut ne pas être émis dans certaines configurations
                setTimeout(() => {
                    if (!listenersRegistered && rfxtrx) {
                        log('warn', `⚠️ Événement 'receiverstarted' non reçu dans les 5 secondes, enregistrement des listeners de toute façon...`);
                        rfxtrxReady = true; // Marquer RFXCOM comme prêt même sans receiverstarted
                        initCommandQueue();
                        log('info', `✅ RFXCOM marqué comme prêt (via fallback après 5 secondes)`);
                        registerMessageListeners();
                        // IMPORTANT: Forcer le démarrage de la queue de transmission si initialising est encore true
                        // Cela peut arriver si receiverstarted n'est pas émis, ce qui empêche la queue de démarrer
                        if (rfxtrx.initialising === true && rfxtrx.TxQ && typeof rfxtrx.TxQ.start === 'function') {
                            log('warn', `⚠️ La queue de transmission n'a pas été démarrée automatiquement, démarrage forcé...`);
                            try {
                                rfxtrx.initialising = false; // Marquer comme non initialisant pour permettre le démarrage
                                rfxtrx.TxQ.start();
                                log('info', `✅ Queue de transmission démarrée avec succès`);
                                log('warn', `⚠️ L'événement 'receiverstarted' n'a pas été reçu: le RFXtrx n'a peut-être pas confirmé son initialisation. Si les appareils ne réagissent pas, vérifiez le câble USB, le port série (${SERIAL_PORT}) et lancez avec LOG_LEVEL=debug pour voir le trafic série.`);
                            } catch (err) {
                                log('error', `❌ Erreur lors du démarrage forcé de la queue: ${err.message}`);
                            }
                        }
                    } else if (!rfxtrxReady && rfxtrx) {
                        // Si listeners sont enregistrés mais rfxtrxReady n'est pas true, le marquer maintenant
                        // Cela peut arriver si receiverstarted est émis mais rfxtrxReady n'a pas été mis à jour
                        rfxtrxReady = true;
                        initCommandQueue();
                        log('info', `✅ RFXCOM marqué comme prêt (via fallback après 5 secondes)`);
                        // S'assurer que les listeners sont enregistrés même si receiverstarted n'a pas été émis
                        if (!listenersRegistered) {
                            registerMessageListeners();
                        }
                        // IMPORTANT: Forcer le démarrage de la queue de transmission si initialising est encore true
                        if (rfxtrx.initialising === true && rfxtrx.TxQ && typeof rfxtrx.TxQ.start === 'function') {
                            log('warn', `⚠️ La queue de transmission n'a pas été démarrée automatiquement, démarrage forcé...`);
                            try {
                                rfxtrx.initialising = false; // Marquer comme non initialisant pour permettre le démarrage
                                rfxtrx.TxQ.start();
                                log('info', `✅ Queue de transmission démarrée avec succès`);
                            } catch (err) {
                                log('error', `❌ Erreur lors du démarrage forcé de la queue: ${err.message}`);
                            }
                        }
                    }
                }, 5000);

                // Initialiser MQTT après l'initialisation complète de RFXCOM
                // Utiliser un petit délai pour s'assurer que tout est prêt
                setTimeout(() => {
                    initializeMQTT();

                    // Configurer la publication des entités après connexion MQTT
                    if (mqttHelper) {
                        mqttHelper.onConnect = () => {
                            // Test simple de connexion : publier le statut
                            log('info', '✅ Test de connexion MQTT réussi');

                            // Si aucun appareil n'est chargé, essayer de les récupérer depuis MQTT
                            const deviceCount = Object.keys(devices).length;
                            if (deviceCount === 0) {
                                log('info', '🔄 Tentative de récupération des appareils depuis les topics de découverte MQTT...');
                                recoverDevicesFromMQTT();
                            } else {
                                setTimeout(() => {
                                    log('info', `📡 Publication des ${deviceCount} entité(s) Home Assistant existante(s)...`);
                                    Object.keys(devices).forEach(deviceId => {
                                        const device = devices[deviceId];
                                        mqttHelper.publishDeviceDiscovery({ ...device, id: deviceId });
                                    });
                                }, 1000);
                            }
                        };
                    }
                }, 500);
            }
        });
    } catch (error) {
        shutdownOnRFXCOMError(`Erreur lors de la création de la connexion RFXCOM: ${error.message || error}`);
    }
}

// L'initialisation RFXCOM sera démarrée après le démarrage du serveur
// (voir plus bas dans le code, après app.listen)

// Fonction pour fermer proprement RFXCOM
function closeRFXCOM() {
    if (rfxtrx) {
        try {
            log('info', '🔌 Fermeture du port série RFXCOM...');
            // Retirer TOUS les listeners pour éviter les erreurs et les fuites mémoire
            rfxtrx.removeAllListeners('error');
            rfxtrx.removeAllListeners('disconnect');
            rfxtrx.removeAllListeners('receive');
            rfxtrx.removeAllListeners('ready');
            rfxtrx.removeAllListeners('receiverstarted');
            rfxtrx.removeAllListeners('temperaturerain1');
            rfxtrx.removeAllListeners('temperaturehumidity1');
            rfxtrx.removeAllListeners('connectfailed');
            rfxtrx.removeAllListeners('connecting');
            // Retirer tous les autres listeners au cas où
            rfxtrx.removeAllListeners();
            // Fermer le port série
            rfxtrx.close();
            log('info', '✅ Port série RFXCOM fermé et tous les listeners retirés');
        } catch (err) {
            log('warn', `⚠️ Erreur lors de la fermeture du port série: ${err.message}`);
        } finally {
            stopKeepalive();
            rfxtrx = null;
            lighting1Handler = null;
            lighting2Handler = null;
            rfxtrxReady = false;
        }
    }
}

// Fonction de nettoyage complète pour arrêter proprement l'add-on
function cleanupAndExit(exitCode = 0) {
    log('info', '🧹 Nettoyage des ressources...');

    // Sauvegarder les appareils
    try {
        saveDevices();
        log('info', '✅ Appareils sauvegardés');
    } catch (err) {
        log('warn', `⚠️ Erreur lors de la sauvegarde des appareils: ${err.message}`);
    }

    // Fermer la connexion MQTT
    if (mqttHelper) {
        try {
            mqttHelper.disconnect();
            log('info', '✅ Connexion MQTT fermée');
        } catch (err) {
            log('warn', `⚠️ Erreur lors de la fermeture MQTT: ${err.message}`);
        }
    }

    // Fermer RFXCOM
    closeRFXCOM();

    // Fermer le serveur HTTP
    if (server) {
        try {
            server.close(() => {
                log('info', '✅ Serveur HTTP fermé');
                // Attendre un peu pour que toutes les fermetures se terminent proprement
                setTimeout(() => {
                    log('info', '🛑 Arrêt de l\'add-on');
                    process.exit(exitCode);
                }, 500);
            });
        } catch (err) {
            log('warn', `⚠️ Erreur lors de la fermeture du serveur: ${err.message}`);
            setTimeout(() => {
                process.exit(exitCode);
            }, 500);
        }
    } else {
        // Si le serveur n'existe pas encore, arrêter directement
        setTimeout(() => {
            log('info', '🛑 Arrêt de l\'add-on');
            process.exit(exitCode);
        }, 500);
    }
}

// Gérer l'arrêt propre avec nettoyage complet
// Note: Les handlers dupliqués plus bas seront supprimés

// Gérer les erreurs non capturées pour éviter les crashes
process.on('uncaughtException', (error) => {
    log('error', `❌ Exception non capturée: ${error.message}`);
    log('error', `   Stack: ${error.stack}`);
    // Ne pas arrêter le processus, juste logger
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
                haDeviceType: 'cover', // Par défaut pour ARC
                name: `ARC ${msg.houseCode}${msg.unitCode}`,
                houseCode: msg.houseCode,
                unitCode: msg.unitCode,
                discovered: true,
                discoveredAt: new Date().toISOString()
            };
            saveDevices();

            // Publier la découverte Home Assistant
            if (mqttHelper && mqttHelper.connected) {
                mqttHelper.publishDeviceDiscovery({ ...devices[id], id: id });
            }
        }
    }

    // Détecter les nouveaux appareils AC (Lighting2)
    if (msg.type === 'lighting2' && msg.subtype === 'AC') {
        const deviceId = msg.id || msg.deviceId || msg.ID || 'unknown';
        const unitCode = msg.unitCode || msg.unit || 0;
        const id = `AC_${deviceId}_${unitCode}`;
        if (!devices[id]) {
            log('info', `🆕 Nouvel appareil AC détecté: ${deviceId}, Unit ${unitCode}`);
            devices[id] = {
                type: 'AC',
                haDeviceType: 'switch', // Par défaut pour AC
                name: `AC ${deviceId}/${unitCode}`,
                deviceId: deviceId.toString().toUpperCase(),
                unitCode: unitCode,
                discovered: true,
                discoveredAt: new Date().toISOString()
            };
            saveDevices();

            // Publier la découverte Home Assistant
            if (mqttHelper && mqttHelper.connected) {
                mqttHelper.publishDeviceDiscovery({ ...devices[id], id: id });
            }
        }
    }

    // Détecter les sondes de température/humidité/pluie (Alecto)
    // Le package rfxcom peut utiliser différents noms de type selon la version
    // Support pour "temperaturerain1" (Alecto temp+rain), "temperaturehumidity1" (Alecto TH13/WS1700), et "tempHumidity" (générique)
    const isTempSensor =
        msg.type === 'tempHumidity' ||
        msg.type === 'TEMP_HUM' ||
        msg.packetType === 'TEMP_HUM' ||
        msg.type === 'temperaturerain1' ||
        msg.type === 'temperaturehumidity1' ||
        msg.subtype === 13; // TH13

    if (isTempSensor) {
        // Extraire l'ID de la sonde depuis différents champs possibles
        let rawSensorId = msg.id || msg.sensorId || msg.ID || `temp_${msg.channel || msg.channelNumber || 0}`;
        
        // Normaliser l'ID pour éviter les doublons
        // Pour les IDs hexadécimaux (0x6A03, 6A03, etc.), normaliser en majuscules sans préfixe 0x
        let sensorId = String(rawSensorId).trim();
        if (sensorId.toLowerCase().startsWith('0x')) {
            sensorId = sensorId.substring(2).toUpperCase();
        } else if (/^[0-9A-Fa-f]{4}$/.test(sensorId)) {
            // Si c'est un ID hexadécimal de 4 caractères, le mettre en majuscules
            sensorId = sensorId.toUpperCase();
        } else {
            // Pour les autres formats, garder tel quel mais normaliser la casse
            sensorId = sensorId.toUpperCase();
        }
        
        const id = `TEMP_HUM_${sensorId}`;

        if (!devices[id]) {
            const sensorType = msg.type === 'temperaturehumidity1' || msg.subtype === 13 ? 'TH13/WS1700' : 'Alecto';
            log('info', `🆕 Nouvelle sonde température/humidité détectée (${sensorType}): ID ${sensorId} (raw: ${rawSensorId}), Channel ${msg.channel || 'N/A'}`);
            devices[id] = {
                type: 'TEMP_HUM',
                haDeviceType: 'sensor', // Les capteurs sont toujours des sensors
                name: `Sonde ${sensorType} ${sensorId}`,
                sensorId: sensorId,
                channel: msg.channel || msg.channelNumber,
                subtype: msg.subtype,
                discovered: true,
                discoveredAt: new Date().toISOString()
            };
            saveDevices();

            // Publier la découverte Home Assistant
            if (mqttHelper && mqttHelper.connected) {
                mqttHelper.publishDeviceDiscovery({ ...devices[id], id: id });
            }
        } else {
            // Log si on reçoit un message pour une sonde déjà connue avec un ID différent (pour debug)
            const existingSensorId = devices[id].sensorId;
            if (existingSensorId !== sensorId && rawSensorId !== existingSensorId) {
                log('debug', `📡 Message reçu pour sonde existante ${id} (ID normalisé: ${sensorId}, raw: ${rawSensorId})`);
            }
        }

        // Publier les valeurs actuelles
        if (mqttHelper && mqttHelper.connected && devices[id]) {
            // Le package peut utiliser différents noms pour la température
            const temperature = msg.temperature || msg.Temperature;
            const humidity = msg.humidity || msg.Humidity;
            const rainfall = msg.rainfall || msg.rain || msg.rainRate;

            if (temperature !== undefined && temperature !== null) {
                mqttHelper.publishSensorState(`${id}_temperature`, temperature.toString(), '°C');
            }
            if (humidity !== undefined && humidity !== null) {
                mqttHelper.publishSensorState(`${id}_humidity`, humidity.toString(), '%');
            }
            if (rainfall !== undefined && rainfall !== null) {
                mqttHelper.publishSensorState(`${id}_rainfall`, rainfall.toString(), 'mm');
            }
        }
    }
}

// Fonction pour récupérer les appareils depuis les topics de découverte MQTT
function recoverDevicesFromMQTT() {
    if (!mqttHelper || !mqttHelper.connected || !mqttHelper.client) {
        log('warn', '⚠️ MQTT non connecté, impossible de récupérer les appareils');
        // Créer le fichier vide si on ne peut pas récupérer
        if (Object.keys(devices).length === 0) {
            saveDevices();
        }
        return;
    }

    log('info', '🔍 Recherche des appareils dans les topics de découverte MQTT...');

    // S'abonner à tous les topics de découverte RFXCOM
    const discoveryTopics = [
        'homeassistant/cover/rfxcom/+/config',
        'homeassistant/switch/rfxcom/+/config',
        'homeassistant/sensor/rfxcom/+/config'
    ];

    let recoveredCount = 0;

    // Créer le listener avant le timeout pour pouvoir le nettoyer
    const discoveryMessageListener = (topic, message) => {
        try {
            // Ignorer les messages qui ne sont pas des configs de découverte
            if (!topic.includes('/config')) {
                return; // Laisser le handler normal gérer les autres messages
            }

            // Parser le message JSON
            const config = JSON.parse(message.toString());

            // Extraire le deviceId depuis le topic
            // Format: homeassistant/{type}/rfxcom/{deviceId}/config
            const topicParts = topic.split('/');
            if (topicParts.length < 4) return;

            const haDeviceType = topicParts[1]; // 'cover', 'switch', 'sensor'
            let deviceId = topicParts[3]; // L'ID de l'appareil

            // Ignorer si c'est un sensor (temp/hum) car ils sont gérés différemment
            if (haDeviceType === 'sensor' && (deviceId.includes('_temperature') || deviceId.includes('_humidity'))) {
                return; // On gère les sensors différemment
            }

            // Pour les sondes TEMP_HUM, normaliser l'ID avant de vérifier s'il existe
            if (deviceId.startsWith('TEMP_HUM_')) {
                let rawSensorId = deviceId.replace('TEMP_HUM_', '');
                let sensorId = String(rawSensorId).trim();
                if (sensorId.toLowerCase().startsWith('0x')) {
                    sensorId = sensorId.substring(2).toUpperCase();
                } else if (/^[0-9A-Fa-f]{4}$/.test(sensorId)) {
                    sensorId = sensorId.toUpperCase();
                } else {
                    sensorId = sensorId.toUpperCase();
                }
                deviceId = `TEMP_HUM_${sensorId}`;
            }

            // Vérifier si l'appareil existe déjà (après normalisation pour TEMP_HUM)
            if (devices[deviceId]) {
                log('debug', `📋 Appareil ${deviceId} déjà présent, ignoré`);
                return;
            }

            // Extraire les informations depuis unique_id ou device.identifiers
            const uniqueId = config.unique_id || '';
            const name = config.name || deviceId;

            // Parser le deviceId pour déterminer le type RFXCOM
            let device = null;

            if (deviceId.startsWith('ARC_')) {
                // Format: ARC_A_1
                const match = deviceId.match(/^ARC_([A-P])_(\d+)$/);
                if (match) {
                    device = {
                        type: 'ARC',
                        haDeviceType: haDeviceType === 'cover' ? 'cover' : 'switch',
                        name: name,
                        houseCode: match[1],
                        unitCode: parseInt(match[2]),
                        recovered: true,
                        recoveredAt: new Date().toISOString()
                    };
                }
            } else if (deviceId.startsWith('AC_')) {
                // Format: AC_XXXXXX_0
                const match = deviceId.match(/^AC_([A-F0-9]+)_(\d+)$/);
                if (match) {
                    device = {
                        type: 'AC',
                        haDeviceType: haDeviceType === 'cover' ? 'cover' : 'switch',
                        name: name,
                        deviceId: match[1].toUpperCase(),
                        unitCode: parseInt(match[2]),
                        recovered: true,
                        recoveredAt: new Date().toISOString()
                    };
                }
            } else if (deviceId.startsWith('TEMP_HUM_')) {
                // Format: TEMP_HUM_XXXXX (deviceId est déjà normalisé avant la vérification d'existence)
                const sensorId = deviceId.replace('TEMP_HUM_', '');
                
                device = {
                    type: 'TEMP_HUM',
                    haDeviceType: 'sensor',
                    name: name,
                    sensorId: sensorId,
                    recovered: true,
                    recoveredAt: new Date().toISOString()
                };
            }

            if (device) {
                devices[deviceId] = device;
                recoveredCount++;
                log('info', `✅ Appareil récupéré depuis MQTT: ${name} (${deviceId})`);
            } else {
                log('debug', `⚠️ Impossible de parser l'appareil ${deviceId} depuis le topic ${topic}`);
            }
        } catch (error) {
            log('debug', `⚠️ Erreur lors du parsing du message MQTT sur ${topic}: ${error.message}`);
        }
    };

    // Ajouter le listener temporaire directement sur le client
    mqttHelper.client.on('message', discoveryMessageListener);

    const timeout = setTimeout(() => {
        // Retirer le listener temporaire
        mqttHelper.client.removeListener('message', discoveryMessageListener);

        log('info', `✅ Récupération terminée: ${recoveredCount} appareil(s) récupéré(s) depuis MQTT`);
        if (recoveredCount > 0) {
            saveDevices();
            log('info', '💾 Appareils sauvegardés dans devices.json');

            // Républier les découvertes pour s'assurer qu'elles sont à jour
            setTimeout(() => {
                log('info', `📡 Republication des ${recoveredCount} entité(s) récupérée(s)...`);
                Object.keys(devices).forEach(deviceId => {
                    const device = devices[deviceId];
                    mqttHelper.publishDeviceDiscovery({ ...device, id: deviceId });
                });
            }, 1000);
        } else {
            log('info', '📦 Aucun appareil trouvé dans MQTT, création du fichier devices.json vide');
            saveDevices();
        }

        // Se désabonner des topics
        discoveryTopics.forEach(topic => {
            mqttHelper.client.unsubscribe(topic);
        });
    }, 5000); // Attendre 5 secondes pour recevoir tous les messages

    discoveryTopics.forEach(topic => {
        mqttHelper.client.subscribe(topic, { qos: 1 }, (error) => {
            if (error) {
                log('error', `❌ Erreur lors de l'abonnement à ${topic}: ${error.message}`);
            } else {
                log('debug', `✅ Abonné au topic: ${topic}`);
            }
        });
    });

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

        // Trouver un code libre si non fourni (si l'un ou l'autre est manquant, on génère les deux)
        let finalHouseCode = houseCode;
        let finalUnitCode = unitCode;

        if (!finalHouseCode || finalUnitCode === undefined || finalUnitCode === null || finalUnitCode === '') {
            const freeCode = findFreeArcCode();
            if (!freeCode) {
                return res.status(400).json({
                    status: 'error',
                    error: 'Aucun code libre disponible'
                });
            }
            finalHouseCode = freeCode.houseCode;
            finalUnitCode = freeCode.unitCode;
            log('info', `🔍 Codes générés automatiquement: House Code ${finalHouseCode}, Unit Code ${finalUnitCode}`);
        }

        const id = `ARC_${finalHouseCode}_${finalUnitCode}`;

        if (devices[id]) {
            return res.status(400).json({
                status: 'error',
                error: 'Cet appareil existe déjà'
            });
        }

        // Valeur par défaut pour haDeviceType : 'cover' pour ARC
        const haDeviceType = req.body.haDeviceType || 'cover';

        devices[id] = {
            type: 'ARC',
            haDeviceType: haDeviceType, // 'cover', 'switch', ou 'sensor'
            name: name,
            houseCode: finalHouseCode,
            unitCode: finalUnitCode,
            discovered: false,
            paired: false,
            createdAt: new Date().toISOString()
        };

        saveDevices();
        log('info', `✅ Appareil ARC créé: ${name} (${id}) - House code: ${finalHouseCode}, Unit code: ${finalUnitCode}`);

        // Publier la découverte Home Assistant selon haDeviceType
        if (mqttHelper && mqttHelper.connected) {
            mqttHelper.publishDeviceDiscovery({ ...devices[id], id: id });
            log('info', `📡 Entité Home Assistant créée pour ${name} (type: ${haDeviceType})`);
        } else {
            log('warn', `⚠️ MQTT non connecté, l'entité Home Assistant sera créée lors de la prochaine connexion`);
        }

        res.json({
            status: 'success',
            device: { ...devices[id], id: id },
            id: id,
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

        // Envoyer ON pour l'appairage (appairage = action ON) via la file d'attente
        commandQueue.push({
            type: 'arc',
            deviceId,
            command: 'on',
            onDone: (error) => {
                if (error) {
                    log('error', `❌ Erreur lors de l'appairage:`, error);
                    return res.status(500).json({
                        status: 'error',
                        error: error.message
                    });
                }
                log('info', `✅ Commande d'appairage (ON) envoyée pour ${device.name}`);
                devices[deviceId].pairingSent = true;
                saveDevices();
                res.json({
                    status: 'success',
                    message: 'Commande d\'appairage (ON) envoyée. Vérifiez si l\'appareil a répondu.',
                    device: devices[deviceId],
                    requiresConfirmation: true
                });
            }
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
        if (device.type !== 'ARC') {
            return res.status(400).json({
                status: 'error',
                error: 'Cet appareil n\'est pas de type ARC'
            });
        }

        if (confirmed === true) {
            device.paired = true;
            device.pairedAt = new Date().toISOString();
            saveDevices();

            log('info', `✅ Appairage confirmé pour ${device.name}`);
            res.json({
                status: 'success',
                message: 'Appairage confirmé. L\'appareil est maintenant appairé.',
                device: devices[deviceId]
            });
        } else {
            log('info', `⚠️ Appairage non confirmé pour ${device.name}`);
            res.json({
                status: 'info',
                message: 'Appairage non confirmé. Vous pouvez réessayer.',
                device: devices[deviceId]
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

// Désappairage ARC - Envoyer OFF pour désappairer (désappairage = action OFF)
app.post('/api/devices/arc/:id/unpair', (req, res) => {
    try {
        const deviceId = req.params.id;

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

        // Envoyer OFF pour le désappairage (désappairage = action OFF) via la file d'attente
        commandQueue.push({
            type: 'arc',
            deviceId,
            command: 'off',
            onDone: (error) => {
                if (error) {
                    log('error', `❌ Erreur lors du désappairage:`, error);
                    return res.status(500).json({
                        status: 'error',
                        error: error.message
                    });
                }
                log('info', `✅ Commande de désappairage (OFF) envoyée pour ${device.name}`);
                devices[deviceId].paired = false;
                devices[deviceId].pairingSent = false;
                if (devices[deviceId].pairedAt) {
                    delete devices[deviceId].pairedAt;
                }
                saveDevices();
                res.json({
                    status: 'success',
                    message: 'Désappairage effectué. L\'appareil ne répondra plus aux commandes.',
                    device: devices[deviceId]
                });
            }
        });
    } catch (error) {
        log('error', `❌ Erreur lors du désappairage:`, error);
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

    if (!rfxtrxReady) {
        return res.status(503).json({
            status: 'error',
            error: 'RFXCOM n\'est pas encore prêt à recevoir des commandes. Attendez que le module soit complètement initialisé.'
        });
    }

    if (command !== 'on' && command !== 'off' && command !== 'stop') {
        return res.status(400).json({
            status: 'error',
            error: 'Commande invalide'
        });
    }

    log('info', `📤 Envoi de la commande ${command} à ${device.name} (House: ${device.houseCode}, Unit: ${device.unitCode})`);

    commandQueue.push({
        type: 'arc',
        deviceId,
        command,
        onDone: (err) => {
            if (err) log('error', `❌ Erreur lors de l'envoi de la commande ${command}:`, err.message);
        }
    });

    res.json({
        status: 'success',
        message: `Commande ${command} mise en file d'attente`,
        device: deviceId,
        command: command
    });
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

// Fonction helper pour envoyer une commande AC
function sendAcCommand(deviceId, command, res) {
    if (!deviceId || !devices[deviceId]) {
        return res.status(404).json({
            status: 'error',
            error: 'Appareil non trouvé'
        });
    }

    const device = devices[deviceId];
    if (device.type !== 'AC') {
        return res.status(400).json({
            status: 'error',
            error: 'Cet appareil n\'est pas de type AC'
        });
    }

    if (!lighting2Handler) {
        return res.status(500).json({
            status: 'error',
            error: 'RFXCOM non initialisé'
        });
    }

    if (!rfxtrxReady) {
        return res.status(503).json({
            status: 'error',
            error: 'RFXCOM n\'est pas encore prêt à recevoir des commandes. Attendez que le module soit complètement initialisé.'
        });
    }

    if (command !== 'on' && command !== 'off') {
        return res.status(400).json({
            status: 'error',
            error: 'Commande invalide (utilisez "on" ou "off")'
        });
    }

    log('info', `📤 Envoi de la commande ${command} à ${device.name} (Device ID: ${device.deviceId}, Unit: ${device.unitCode})`);

    commandQueue.push({
        type: 'ac',
        deviceId,
        command,
        onDone: (err) => {
            if (err) log('error', `❌ Erreur lors de l'envoi de la commande ${command}:`, err.message);
        }
    });

    res.json({
        status: 'success',
        message: `Commande ${command} mise en file d'attente`,
        device: deviceId,
        command: command
    });
}

// Ajouter un appareil AC
app.post('/api/devices/ac', (req, res) => {
    try {
        log('info', `📥 Requête reçue pour ajouter un appareil AC`);
        const { name, deviceId, unitCode } = req.body;
        log('info', `📝 Données reçues: name="${name}", deviceId="${deviceId}", unitCode="${unitCode || 'auto'}"`);

        if (!name) {
            return res.status(400).json({
                status: 'error',
                error: 'Le nom est requis'
            });
        }

        // Trouver un code libre si non fourni (si l'un ou l'autre est manquant, on génère les deux)
        let finalDeviceId = deviceId;
        let finalUnitCode = unitCode;

        // Vérifier si les valeurs sont vraiment fournies
        // Pour deviceId: doit être une chaîne non vide
        const hasDeviceId = finalDeviceId !== undefined && finalDeviceId !== null && String(finalDeviceId).trim() !== '';

        // Pour unitCode: doit être un nombre valide (0 est valide)
        // Vérifier d'abord si c'est un nombre, sinon essayer de parser
        // Ignorer aussi "auto" qui pourrait être envoyé par erreur
        let parsedUnitCode = undefined;
        if (finalUnitCode !== undefined && finalUnitCode !== null) {
            if (typeof finalUnitCode === 'number') {
                parsedUnitCode = finalUnitCode;
            } else {
                const str = String(finalUnitCode).trim().toLowerCase();
                // Ignorer "auto" et les chaînes vides
                if (str !== '' && str !== 'auto') {
                    const parsed = parseInt(str, 10);
                    if (!isNaN(parsed)) {
                        parsedUnitCode = parsed;
                    }
                }
            }
        }
        const hasUnitCode = parsedUnitCode !== undefined;

        // Si l'un ou l'autre est manquant, générer les deux
        if (!hasDeviceId || !hasUnitCode) {
            log('info', `🔍 Génération automatique nécessaire (deviceId manquant: ${!hasDeviceId}, unitCode manquant: ${!hasUnitCode})`);
            const freeCode = findFreeAcCode();
            if (!freeCode) {
                return res.status(400).json({
                    status: 'error',
                    error: 'Aucun code libre disponible'
                });
            }
            // Utiliser les valeurs fournies si disponibles, sinon utiliser les valeurs générées
            finalDeviceId = hasDeviceId ? String(finalDeviceId).trim().toUpperCase() : freeCode.deviceId;
            finalUnitCode = hasUnitCode ? parsedUnitCode : freeCode.unitCode;
            log('info', `🔍 Codes finaux: Device ID ${finalDeviceId}, Unit Code ${finalUnitCode}`);
        } else {
            // Normaliser les valeurs fournies
            finalDeviceId = String(finalDeviceId).trim().toUpperCase();
            finalUnitCode = parsedUnitCode; // Utiliser la valeur parsée

            // Valider que le unitCode est dans la plage valide (0-16 pour AC)
            if (finalUnitCode < 0 || finalUnitCode > 16) {
                return res.status(400).json({
                    status: 'error',
                    error: `Unit Code invalide: ${finalUnitCode}. La valeur doit être entre 0 et 16.`
                });
            }

            log('info', `✅ Utilisation des valeurs fournies: Device ID ${finalDeviceId}, Unit Code ${finalUnitCode}`);
        }

        // Normaliser le deviceId (enlever 0x si présent, mettre en majuscules)
        const normalizedDeviceId = finalDeviceId.toString().replace(/^0x/i, '').toUpperCase();
        const id = `AC_${normalizedDeviceId}_${finalUnitCode}`;

        // Vérifier si l'appareil existe déjà
        if (devices[id]) {
            return res.status(400).json({
                status: 'error',
                error: 'Cet appareil existe déjà'
            });
        }

        // Valeur par défaut pour haDeviceType : 'switch' pour AC
        const haDeviceType = req.body.haDeviceType || 'switch';

        // Créer l'appareil
        devices[id] = {
            type: 'AC',
            haDeviceType: haDeviceType, // 'cover', 'switch', ou 'sensor'
            name: name,
            deviceId: normalizedDeviceId,
            unitCode: finalUnitCode,
            createdAt: new Date().toISOString()
        };

        saveDevices();
        log('info', `✅ Appareil AC ajouté: ${name} (${normalizedDeviceId}/${finalUnitCode})`);

        // Publier la découverte Home Assistant selon haDeviceType
        if (mqttHelper && mqttHelper.connected) {
            mqttHelper.publishDeviceDiscovery({ ...devices[id], id: id });
            log('info', `📡 Entité Home Assistant créée pour ${name} (type: ${haDeviceType})`);
        } else {
            log('warn', `⚠️ MQTT non connecté, l'entité Home Assistant sera créée lors de la prochaine connexion`);
        }

        res.json({
            status: 'success',
            message: 'Appareil AC ajouté avec succès',
            device: { ...devices[id], id: id },
            id: id
        });
    } catch (error) {
        log('error', `❌ Erreur lors de l'ajout de l'appareil AC:`, error);
        res.status(500).json({
            status: 'error',
            error: error.message
        });
    }
});

// Appairage AC - Étape 1: Envoyer la commande d'appairage
app.post('/api/devices/ac/pair', (req, res) => {
    try {
        const { deviceId } = req.body;

        if (!deviceId || !devices[deviceId]) {
            return res.status(400).json({
                status: 'error',
                error: 'Appareil non trouvé'
            });
        }

        const device = devices[deviceId];
        if (device.type !== 'AC') {
            return res.status(400).json({
                status: 'error',
                error: 'Cet appareil n\'est pas de type AC'
            });
        }

        if (!lighting2Handler) {
            return res.status(500).json({
                status: 'error',
                error: 'RFXCOM non initialisé'
            });
        }

        // Envoyer ON pour l'appairage (appairage = action ON) via la file d'attente
        commandQueue.push({
            type: 'ac',
            deviceId,
            command: 'on',
            onDone: (error) => {
                if (error) {
                    log('error', `❌ Erreur lors de l'appairage:`, error);
                    return res.status(500).json({
                        status: 'error',
                        error: error.message
                    });
                }
                log('info', `✅ Commande d'appairage (ON) envoyée pour ${device.name}`);
                devices[deviceId].pairingSent = true;
                saveDevices();
                res.json({
                    status: 'success',
                    message: 'Commande d\'appairage (ON) envoyée. Vérifiez si l\'appareil a répondu.',
                    device: devices[deviceId],
                    requiresConfirmation: true
                });
            }
        });
    } catch (error) {
        log('error', `❌ Erreur lors de l'appairage:`, error);
        res.status(500).json({
            status: 'error',
            error: error.message
        });
    }
});

// Confirmer l'appairage AC
app.post('/api/devices/ac/confirm-pair', (req, res) => {
    try {
        const { deviceId, confirmed } = req.body;

        if (!deviceId || !devices[deviceId]) {
            return res.status(400).json({
                status: 'error',
                error: 'Appareil non trouvé'
            });
        }

        const device = devices[deviceId];
        if (device.type !== 'AC') {
            return res.status(400).json({
                status: 'error',
                error: 'Cet appareil n\'est pas de type AC'
            });
        }

        if (confirmed === true) {
            device.paired = true;
            device.pairedAt = new Date().toISOString();
            saveDevices();

            // Publier la découverte Home Assistant
            if (mqttHelper && mqttHelper.connected) {
                mqttHelper.publishDeviceDiscovery({ ...devices[deviceId], id: deviceId });
            }

            log('info', `✅ Appairage confirmé pour ${device.name}`);
            res.json({
                status: 'success',
                message: 'Appairage confirmé. L\'appareil est maintenant appairé.',
                device: devices[deviceId]
            });
        } else {
            log('info', `⚠️ Appairage non confirmé pour ${device.name}`);
            res.json({
                status: 'info',
                message: 'Appairage non confirmé. Vous pouvez réessayer.',
                device: devices[deviceId]
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

// Désappairage AC - Envoyer OFF pour désappairer (désappairage = action OFF)
app.post('/api/devices/ac/:id/unpair', (req, res) => {
    try {
        const deviceId = req.params.id;

        if (!deviceId || !devices[deviceId]) {
            return res.status(404).json({
                status: 'error',
                error: 'Appareil non trouvé'
            });
        }

        const device = devices[deviceId];
        if (device.type !== 'AC') {
            return res.status(400).json({
                status: 'error',
                error: 'Cet appareil n\'est pas de type AC'
            });
        }

        if (!lighting2Handler) {
            return res.status(500).json({
                status: 'error',
                error: 'RFXCOM non initialisé'
            });
        }

        // Envoyer OFF pour le désappairage (désappairage = action OFF) via la file d'attente
        commandQueue.push({
            type: 'ac',
            deviceId,
            command: 'off',
            onDone: (error) => {
                if (error) {
                    log('error', `❌ Erreur lors du désappairage:`, error);
                    return res.status(500).json({
                        status: 'error',
                        error: error.message
                    });
                }
                log('info', `✅ Commande de désappairage (OFF) envoyée pour ${device.name}`);
                devices[deviceId].paired = false;
                devices[deviceId].pairingSent = false;
                if (devices[deviceId].pairedAt) {
                    delete devices[deviceId].pairedAt;
                }
                saveDevices();
                res.json({
                    status: 'success',
                    message: 'Désappairage effectué. L\'appareil ne répondra plus aux commandes.',
                    device: devices[deviceId]
                });
            }
        });
    } catch (error) {
        log('error', `❌ Erreur lors du désappairage:`, error);
        res.status(500).json({
            status: 'error',
            error: error.message
        });
    }
});

// Tester un appareil AC
app.post('/api/devices/ac/test', (req, res) => {
    try {
        const { deviceId, command } = req.body;

        if (!deviceId || !devices[deviceId]) {
            return res.status(400).json({
                status: 'error',
                error: 'Appareil non trouvé'
            });
        }

        const device = devices[deviceId];
        if (device.type !== 'AC') {
            return res.status(400).json({
                status: 'error',
                error: 'Cet appareil n\'est pas de type AC'
            });
        }

        if (!command || (command !== 'on' && command !== 'off')) {
            return res.status(400).json({
                status: 'error',
                error: 'Commande invalide (utilisez "on" ou "off")'
            });
        }

        sendAcCommand(deviceId, command, res);
    } catch (error) {
        log('error', `❌ Erreur lors du test:`, error);
        res.status(500).json({
            status: 'error',
            error: error.message
        });
    }
});

// Commandes AC - ON
app.post('/api/devices/ac/:id/on', (req, res) => {
    try {
        sendAcCommand(req.params.id, 'on', res);
    } catch (error) {
        log('error', `❌ Erreur lors de l'envoi de la commande ON:`, error);
        res.status(500).json({
            status: 'error',
            error: error.message
        });
    }
});

// Commandes AC - OFF
app.post('/api/devices/ac/:id/off', (req, res) => {
    try {
        sendAcCommand(req.params.id, 'off', res);
    } catch (error) {
        log('error', `❌ Erreur lors de l'envoi de la commande OFF:`, error);
        res.status(500).json({
            status: 'error',
            error: error.message
        });
    }
});

// Renommer un appareil
app.put('/api/devices/:id/rename', (req, res) => {
    try {
        const deviceId = req.params.id;
        const { name } = req.body;

        if (!devices[deviceId]) {
            return res.status(404).json({
                status: 'error',
                error: 'Appareil non trouvé'
            });
        }

        if (!name || name.trim() === '') {
            return res.status(400).json({
                status: 'error',
                error: 'Le nom est requis'
            });
        }

        const oldName = devices[deviceId].name;
        devices[deviceId].name = name.trim();
        saveDevices();

        log('info', `✅ Appareil renommé: ${oldName} → ${name}`);

        // Mettre à jour la découverte Home Assistant avec le nouveau nom
        if (mqttHelper && mqttHelper.connected) {
            mqttHelper.publishDeviceDiscovery({ ...devices[deviceId], id: deviceId });
        }

        res.json({
            status: 'success',
            message: 'Appareil renommé avec succès',
            device: devices[deviceId]
        });
    } catch (error) {
        log('error', `❌ Erreur lors du renommage:`, error);
        res.status(500).json({
            status: 'error',
            error: error.message
        });
    }
});

// Modifier le type d'un appareil (haDeviceType)
app.put('/api/devices/:id/type', (req, res) => {
    try {
        const deviceId = req.params.id;
        const { haDeviceType } = req.body;

        if (!devices[deviceId]) {
            return res.status(404).json({
                status: 'error',
                error: 'Appareil non trouvé'
            });
        }

        // Valider le type
        const validTypes = ['cover', 'switch', 'sensor'];
        if (!haDeviceType || !validTypes.includes(haDeviceType)) {
            return res.status(400).json({
                status: 'error',
                error: `Type invalide. Types valides: ${validTypes.join(', ')}`
            });
        }

        const oldType = devices[deviceId].haDeviceType ||
            (devices[deviceId].type === 'ARC' ? 'cover' :
             devices[deviceId].type === 'AC' ? 'switch' : 'sensor');

        devices[deviceId].haDeviceType = haDeviceType;
        saveDevices();

        log('info', `✅ Type d'appareil modifié: ${deviceId} (${oldType} → ${haDeviceType})`);

        // Supprimer l'ancienne découverte et publier la nouvelle
        if (mqttHelper && mqttHelper.connected) {
            // Supprimer l'ancienne découverte
            mqttHelper.removeDiscovery(deviceId);
            // Publier la nouvelle découverte
            setTimeout(() => {
                mqttHelper.publishDeviceDiscovery({ ...devices[deviceId], id: deviceId });
            }, 500);
        }

        res.json({
            status: 'success',
            message: `Type d'appareil modifié: ${oldType} → ${haDeviceType}`,
            device: devices[deviceId]
        });
    } catch (error) {
        log('error', `❌ Erreur lors de la modification du type:`, error);
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
// En mode test (API_PORT = 0), ne pas démarrer le serveur (sera géré par supertest)
if (API_PORT !== 0) {
    server = app.listen(API_PORT, '0.0.0.0', (err) => {
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
        log('info', `   POST /api/devices/arc/pair - Appairer un appareil ARC (envoie ON)`);
        log('info', `   POST /api/devices/arc/confirm-pair - Confirmer l'appairage ARC`);
        log('info', `   POST /api/devices/arc/:id/unpair - Désappairer un appareil ARC (envoie OFF)`);
        log('info', `   POST /api/devices/arc/:id/on - Ouvrir/Monter un appareil ARC`);
        log('info', `   POST /api/devices/arc/:id/off - Fermer/Descendre un appareil ARC`);
        log('info', `   POST /api/devices/arc/:id/stop - Arrêter un appareil ARC`);
        log('info', `   POST /api/devices/ac - Ajouter une prise AC`);
        log('info', `   POST /api/devices/ac/pair - Appairer une prise AC (envoie ON)`);
        log('info', `   POST /api/devices/ac/confirm-pair - Confirmer l'appairage AC`);
        log('info', `   POST /api/devices/ac/:id/unpair - Désappairer une prise AC (envoie OFF)`);
        log('info', `   POST /api/devices/ac/:id/on - Allumer une prise AC`);
        log('info', `   POST /api/devices/ac/:id/off - Éteindre une prise AC`);
        log('info', `   PUT /api/devices/:id/rename - Renommer un appareil`);
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
} else {
    // En mode test, ne pas démarrer le serveur ni les tests de santé
    // Démarrer seulement l'initialisation RFXCOM
    setTimeout(() => {
        initializeRFXCOMAsync();
    }, 500);
}

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

// Gestion de l'arrêt propre (handlers unifiés)
process.on('SIGTERM', () => {
    log('info', '🛑 Signal SIGTERM reçu, arrêt de l\'add-on...');
    cleanupAndExit(0);
});

process.on('SIGINT', () => {
    log('info', '🛑 Signal SIGINT reçu, arrêt de l\'add-on...');
    cleanupAndExit(0);
});

// Exporter l'app pour les tests
if (typeof module !== 'undefined' && module.exports) {
    const exported = { 
        app, 
        server
    };
    
    // Ajouter les getters/setters pour les handlers
    Object.defineProperty(exported, 'lighting1Handler', {
        get: function() { return lighting1Handler; },
        set: function(value) { lighting1Handler = value; },
        enumerable: true,
        configurable: true
    });
    
    Object.defineProperty(exported, 'lighting2Handler', {
        get: function() { return lighting2Handler; },
        set: function(value) { lighting2Handler = value; },
        enumerable: true,
        configurable: true
    });
    
    // Exporter rfxtrxReady pour les tests
    Object.defineProperty(exported, 'rfxtrxReady', {
        get: function() { return rfxtrxReady; },
        set: function(value) { rfxtrxReady = value; },
        enumerable: true,
        configurable: true
    });

    // Exporter initCommandQueue pour les tests (file d'attente RFXCOM)
    exported.initCommandQueue = initCommandQueue;

    module.exports = exported;
}
