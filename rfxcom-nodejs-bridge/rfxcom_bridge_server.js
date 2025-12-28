#!/usr/bin/env node
/**
 * Serveur HTTP pour le bridge RFXCOM Node.js
 * Expose une API REST pour communiquer avec le plugin Python Home Assistant
 */

const http = require('http');
const url = require('url');
const rfxcom = require('rfxcom');

// Configuration depuis les options de l'add-on
const PORT = process.env.API_PORT || 8888;
// Le port série sera transmis par le plugin via l'API
let currentSerialPort = process.env.PORT || '/dev/ttyUSB0';

let rfxtrx = null;
let handlers = {};
let isInitialized = false;

// Initialiser la connexion RFXCOM avec un port spécifique
function initializeRFXCOM(serialPort) {
    // Si déjà initialisé avec le même port, ne rien faire
    if (isInitialized && currentSerialPort === serialPort) {
        return Promise.resolve();
    }

    // Si déjà initialisé avec un autre port, fermer la connexion précédente
    if (isInitialized && rfxtrx) {
        try {
            rfxtrx.close();
        } catch (error) {
            console.warn('⚠️ Erreur lors de la fermeture de la connexion précédente:', error);
        }
        isInitialized = false;
        handlers = {};
    }

    currentSerialPort = serialPort || currentSerialPort;

    return new Promise((resolve, reject) => {
        try {
            rfxtrx = new rfxcom.RfxCom(currentSerialPort, {
                debug: false
            });

            rfxtrx.initialise((error) => {
                if (error) {
                    console.error('❌ Erreur lors de l\'initialisation RFXCOM:', error);
                    reject(error);
                    return;
                }

                console.log('✅ RFXCOM initialisé sur', currentSerialPort);
                isInitialized = true;
                resolve();
            });
        } catch (error) {
            console.error('❌ Erreur lors de la création de la connexion RFXCOM:', error);
            reject(error);
        }
    });
}

// Créer un handler pour un protocole donné
function getHandler(protocol) {
    if (handlers[protocol]) {
        return handlers[protocol];
    }

    let handler = null;

    switch (protocol) {
        case 'ARC':
        case 'X10':
        case 'ABICOD':
        case 'WAVEMAN':
        case 'EMW100':
        case 'IMPULS':
        case 'RISINGSUN':
        case 'PHILIPS':
        case 'ENERGENIE':
        case 'ENERGENIE_5':
        case 'COCOSTICK':
            handler = new rfxcom.Lighting1(rfxtrx, rfxcom.lighting1[protocol]);
            break;
        case 'AC':
        case 'HOMEEASY_EU':
        case 'ANSLUT':
        case 'KAMBROOK':
            handler = new rfxcom.Lighting2(rfxtrx, rfxcom.lighting2[protocol]);
            break;
        case 'IKEA_KOPPLA':
            handler = new rfxcom.Lighting3(rfxtrx, rfxcom.lighting3[protocol]);
            break;
        case 'PT2262':
            handler = new rfxcom.Lighting4(rfxtrx, rfxcom.lighting4[protocol]);
            break;
        case 'LIGHTWAVERF':
        case 'EMW100_GDO':
        case 'BBSB':
        case 'RSL':
        case 'LIVOLO':
        case 'TRC02':
        case 'AOKE':
        case 'RGB_TRC02':
            handler = new rfxcom.Lighting5(rfxtrx, rfxcom.lighting5[protocol]);
            break;
        case 'BLYSS':
            handler = new rfxcom.Lighting6(rfxtrx, rfxcom.lighting6[protocol]);
            break;
        default:
            throw new Error(`Protocole non supporté: ${protocol}`);
    }

    handlers[protocol] = handler;
    return handler;
}

// Envoyer une commande
async function sendCommand(protocol, deviceId, houseCode, unitCode, command, serialPort) {
    // Initialiser avec le port transmis (ou utiliser le port actuel)
    if (!isInitialized || (serialPort && serialPort !== currentSerialPort)) {
        await initializeRFXCOM(serialPort);
    }

    const handler = getHandler(protocol);

    return new Promise((resolve, reject) => {
        try {
            // Convertir la commande
            const cmd = command.toLowerCase() === 'on' ? 1 : 0;

            // Envoyer selon le protocole
            if (houseCode && unitCode) {
                // Lighting1 (ARC, X10, etc.)
                handler.switchOn(houseCode, unitCode, (error) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve({ status: 'success' });
                    }
                });
            } else if (deviceId) {
                // Lighting2-6 (AC, PT2262, etc.)
                if (unitCode !== undefined) {
                    handler.switchOn(deviceId, unitCode, (error) => {
                        if (error) {
                            reject(error);
                        } else {
                            resolve({ status: 'success' });
                        }
                    });
                } else {
                    handler.switchOn(deviceId, (error) => {
                        if (error) {
                            reject(error);
                        } else {
                            resolve({ status: 'success' });
                        }
                    });
                }
            } else {
                reject(new Error('Paramètres insuffisants pour envoyer la commande'));
            }
        } catch (error) {
            reject(error);
        }
    });
}

// Gérer les requêtes HTTP
const server = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    const parsedUrl = url.parse(req.url, true);
    const path = parsedUrl.pathname;

    // Health check
    if (path === '/health' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'ok',
            initialized: isInitialized,
            port: currentSerialPort
        }));
        return;
    }

    // API endpoint
    if (path === '/api/command' && req.method === 'POST') {
        let body = '';
        
        req.on('data', (chunk) => {
            body += chunk.toString();
        });

        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                const { protocol, device_id, house_code, unit_code, command, port } = data;

                if (!protocol || !command) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        status: 'error',
                        error: 'Paramètres manquants: protocol et command sont requis'
                    }));
                    return;
                }

                const result = await sendCommand(
                    protocol,
                    device_id,
                    house_code,
                    unit_code,
                    command,
                    port  // Transmettre le port série si fourni
                );

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result));
            } catch (error) {
                console.error('❌ Erreur lors du traitement de la commande:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    status: 'error',
                    error: error.message
                }));
            }
        });
        return;
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        status: 'error',
        error: 'Endpoint non trouvé'
    }));
});

// Démarrer le serveur
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Serveur RFXCOM Node.js Bridge démarré sur le port ${PORT}`);
    console.log(`📡 Port série par défaut: ${currentSerialPort}`);
    console.log(`💡 Le port série sera configuré par le plugin via l'API /api/init`);
    
    // Ne plus initialiser automatiquement - le plugin le fera via l'API
});

// Gérer l'arrêt propre
process.on('SIGTERM', () => {
    console.log('🛑 Arrêt du serveur...');
    if (rfxtrx) {
        rfxtrx.close();
    }
    server.close(() => {
        process.exit(0);
    });
});

