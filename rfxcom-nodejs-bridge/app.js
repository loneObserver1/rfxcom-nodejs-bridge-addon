const rfxcom = require('rfxcom');
const fs = require('fs');

// Récupérer le port série et le niveau de log depuis les variables d'environnement
const SERIAL_PORT = process.env.SERIAL_PORT || '/dev/ttyUSB0';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

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

console.log(`🚀 RFXCOM Node.js Bridge add-on démarré`);
log('info', `📡 Port série configuré: ${SERIAL_PORT}`);
log('info', `📝 Niveau de log: ${LOG_LEVEL}`);

// Vérifier si le port série existe
if (!fs.existsSync(SERIAL_PORT)) {
    log('error', `❌ Le port série ${SERIAL_PORT} n'existe pas !`);
    log('info', `💡 Vérifiez que votre émetteur RFXCOM est bien branché.`);
    log('debug', `💡 Ports disponibles dans /dev:`);
    try {
        const devFiles = fs.readdirSync('/dev').filter(f => f.startsWith('ttyUSB') || f.startsWith('ttyACM') || f.startsWith('cu.'));
        if (devFiles.length > 0) {
            log('debug', `   ${devFiles.join(', ')}`);
        } else {
            log('debug', `   Aucun port série détecté`);
        }
    } catch (err) {
        log('debug', `   Impossible de lister les ports série: ${err.message}`);
    }
    process.exit(1);
}

// Vérifier les permissions sur le port série
try {
    fs.accessSync(SERIAL_PORT, fs.constants.R_OK | fs.constants.W_OK);
    log('info', `✅ Permissions OK sur ${SERIAL_PORT}`);
} catch (error) {
    log('error', `❌ Pas de permissions en lecture/écriture sur ${SERIAL_PORT}`);
    log('error', `   ${error.message}`);
    process.exit(1);
}

// Initialiser le module RFXCOM
let rfxtrx = null;

try {
    log('info', `🔌 Initialisation du module RFXCOM sur ${SERIAL_PORT}...`);

    const debugMode = LOG_LEVEL === 'debug';
    rfxtrx = new rfxcom.RfxCom(SERIAL_PORT, {
        debug: debugMode
    });

    rfxtrx.initialise((error) => {
        if (error) {
            log('error', `❌ Erreur lors de l'initialisation RFXCOM:`, error);
            log('error', `   Message: ${error.message}`);
            log('error', `   Code: ${error.code || 'N/A'}`);
            if (LOG_LEVEL === 'debug') {
                log('debug', `   Stack: ${error.stack}`);
            }
            process.exit(1);
        } else {
            log('info', `✅ RFXCOM initialisé avec succès sur ${SERIAL_PORT}`);
            log('info', `🎉 L'addon est prêt à recevoir des commandes !`);
        }
    });

    // Gérer l'arrêt propre
    process.on('SIGTERM', () => {
        log('info', '🛑 Arrêt du module RFXCOM...');
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
    log('error', `   Message: ${error.message}`);
    if (LOG_LEVEL === 'debug') {
        log('debug', `   Stack: ${error.stack}`);
    }
    process.exit(1);
}
