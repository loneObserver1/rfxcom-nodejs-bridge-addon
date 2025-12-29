#!/usr/bin/env node
/**
 * Script de test pour envoyer ON/OFF à une prise DIO Chacon
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
    console.log('🔌 Test ON/OFF Prise DIO Chacon');
    console.log('='.repeat(80));
    console.log();
    
    const deviceId = 'A1B2C3';
    const unitCode = 5;
    const deviceIdFormatted = `0x${deviceId}/${unitCode}`;
    
    console.log('🎯 Configuration:');
    console.log(`   - Device ID: ${deviceId}`);
    console.log(`   - Unit Code: ${unitCode}`);
    console.log(`   - Format: ${deviceIdFormatted}`);
    console.log();
    
    // Trouver le port
    let port = findUSBPort();
    const portInput = (await question(`Port USB détecté: ${port}\n   Utiliser ce port ? (O/n): `)).trim().toLowerCase();
    if (portInput === 'n' || portInput === 'non') {
        port = (await question('Entrez le chemin du port USB: ')).trim();
        if (!port) {
            console.log('❌ Port requis');
            process.exit(1);
        }
    }
    
    console.log();
    console.log(`🔌 Connexion à ${port}...`);
    
    const rfxtrx = new rfxcom.RfxCom(port, {
        debug: false,
    });
    
    let connected = false;
    let lighting2 = null;
    
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
        console.log('✅ Connecté et prêt');
        console.log();
        connected = true;
        lighting2 = new rfxcom.Lighting2(rfxtrx, rfxcom.lighting2.AC);
        
        // Fonction pour envoyer une commande
        const sendCommand = async (cmd, cmdName) => {
            return new Promise((resolve, reject) => {
                console.log(`📤 Envoi de la commande ${cmdName}...`);
                const startTime = Date.now();
                
                const callback = (err) => {
                    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
                    if (err) {
                        console.error(`   ❌ Erreur après ${elapsed}s:`, err);
                        reject(err);
                    } else {
                        console.log(`   ✅ Commande ${cmdName} envoyée avec succès (${elapsed}s)`);
                        resolve();
                    }
                };
                
                if (cmd === 'on') {
                    lighting2.switchOn(deviceIdFormatted, callback);
                } else {
                    lighting2.switchOff(deviceIdFormatted, callback);
                }
            });
        };
        
        // Boucle de test
        const testLoop = async () => {
            try {
                // Test OFF (la lampe est allumée)
                await sendCommand('off', 'OFF');
                await question('\n⏸️  Appuyez sur Entrée pour continuer...');
                
                // Test ON
                await sendCommand('on', 'ON');
                await question('\n⏸️  Appuyez sur Entrée pour continuer...');
                
                // Test OFF à nouveau
                await sendCommand('off', 'OFF');
                await question('\n⏸️  Appuyez sur Entrée pour continuer...');
                
                // Test ON à nouveau
                await sendCommand('on', 'ON');
                
                console.log();
                console.log('✅ Tests terminés');
                console.log();
                console.log('💡 Vérifiez si la lampe a réagi aux commandes');
                
                rfxtrx.close();
                rl.close();
                process.exit(0);
            } catch (err) {
                console.error('❌ Erreur lors des tests:', err);
                rfxtrx.close();
                rl.close();
                process.exit(1);
            }
        };
        
        // Démarrer les tests après un court délai
        setTimeout(() => {
            testLoop();
        }, 500);
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



