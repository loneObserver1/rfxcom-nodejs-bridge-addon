#!/usr/bin/env node
/**
 * Script de test pour envoyer ON/OFF à un volet ARC
 */

const rfxcom = require('rfxcom');
const readline = require('readline');

// Interface readline
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(prompt) {
    return new Promise((resolve) => {
        rl.question(prompt, resolve);
    });
}

// Trouver le port USB automatiquement
function findUSBPort() {
    const fs = require('fs');
    const os = require('os');
    const platform = os.platform();
    
    if (platform === 'darwin') {
        try {
            const devDir = '/dev';
            const files = fs.readdirSync(devDir);
            const usbPorts = files.filter(f => 
                f.startsWith('cu.usbserial-') || 
                f.startsWith('cu.usbmodem') ||
                (f.startsWith('tty.usbserial-') || f.startsWith('tty.usbmodem'))
            );
            
            if (usbPorts.length > 0) {
                const cuPort = usbPorts.find(p => p.startsWith('cu.'));
                if (cuPort) {
                    return `/dev/${cuPort}`;
                }
                return `/dev/${usbPorts[0]}`;
            }
        } catch (err) {
            // Ignorer
        }
        return '/dev/cu.usbserial-A11DA9X2';
    } else if (platform === 'linux') {
        try {
            const devDir = '/dev';
            const files = fs.readdirSync(devDir);
            const usbPorts = files.filter(f => f.startsWith('ttyUSB') || f.startsWith('ttyACM'));
            if (usbPorts.length > 0) {
                return `/dev/${usbPorts[0]}`;
            }
        } catch (err) {
            // Ignorer
        }
        return '/dev/ttyUSB0';
    } else {
        return 'COM3';
    }
}

async function main() {
    console.log('='.repeat(80));
    console.log('🔌 Test ON/OFF Volet ARC');
    console.log('='.repeat(80));
    console.log();
    
    const houseCode = 'A';
    const unitCode = 1;
    
    console.log('🎯 Configuration:');
    console.log(`   - House Code: ${houseCode}`);
    console.log(`   - Unit Code: ${unitCode}`);
    console.log();
    
    // Trouver le port
    let port = findUSBPort();
    
    // Vérifier si un port est passé en argument
    const args = process.argv.slice(2);
    if (args.length > 0 && args[0] !== '--auto') {
        port = args[0];
        console.log(`📌 Port spécifié en argument: ${port}`);
    } else {
        const portInput = (await question(`Port USB détecté: ${port}\n   Utiliser ce port ? (O/n): `)).trim().toLowerCase();
        if (portInput === 'n' || portInput === 'non') {
            port = (await question('Entrez le chemin du port USB: ')).trim();
            if (!port) {
                console.log('❌ Port requis');
                process.exit(1);
            }
        }
    }
    
    console.log();
    console.log(`🔌 Connexion à ${port}...`);
    
    const rfxtrx = new rfxcom.RfxCom(port, {
        debug: false,
    });
    
    let connected = false;
    let lighting1 = null;
    
    rfxtrx.on('connectfailed', () => {
        console.error('❌ Échec de connexion');
        rl.close();
        process.exit(1);
    });
    
    rfxtrx.on('disconnect', () => {
        console.error('❌ RFXCOM déconnecté');
        rl.close();
        process.exit(1);
    });
    
    rfxtrx.on('error', (err) => {
        console.error('❌ Erreur:', err);
    });
    
    rfxtrx.on('connecting', () => {
        console.log('   📡 Connexion en cours...');
    });
    
    rfxtrx.on('ready', () => {
        console.log('✅ RFXCOM prêt');
    
        const lighting1 = new rfxcom.Lighting1(
            rfxtrx,
            rfxcom.lighting1.ARC
        );
        
        // Ajouter les méthodes manquantes pour ARC (UP/DOWN/STOP)
        // En utilisant _sendCommand directement avec les bonnes commandes
        lighting1.switchUp = function(houseCode, unitCode, callback) {
            // Pour ARC, switchOn (0x01) = UP (monter)
            return this.switchOn(`${houseCode}${unitCode}`, callback);
        };
        
        lighting1.switchDown = function(houseCode, unitCode, callback) {
            // Pour ARC, switchOff (0x00) = DOWN (descendre)
            return this.switchOff(`${houseCode}${unitCode}`, callback);
        };
        
        lighting1.stop = function(houseCode, unitCode, callback) {
            // Pour ARC, chime (0x07) peut être utilisé comme STOP
            // ou on peut réenvoyer switchOff
            return this.chime(`${houseCode}${unitCode}`, callback);
        };
    
        // Descendre
        console.log('⬇️ Descente');
        lighting1.switchDown('A', 1);
    
        setTimeout(() => {
            // Stop
            console.log('⏹ Stop');
            lighting1.stop('A', 1);
        }, 3000);
    
        setTimeout(() => {
            // Monter
            console.log('⬆️ Montée');
            lighting1.switchUp('A', 1);
        }, 6000);
    });    
    
    // Initialiser la connexion
    rfxtrx.initialise(() => {
        // Le callback est appelé quand 'ready' est émis
    });
}

// Gestion des erreurs
process.on('unhandledRejection', (err) => {
    console.error('❌ Erreur non gérée:', err);
    rl.close();
    process.exit(1);
});

// Lancer le script
main().catch((err) => {
    console.error('❌ Erreur fatale:', err);
    rl.close();
    process.exit(1);
});

