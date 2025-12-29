#!/usr/bin/env node
/**
 * Script de test pour appairer une prise AC (DIO Chacon)
 * 
 * Processus :
 * 1. Choisir un Device ID (ex: A1B2C3 ou 0xA1B2C3)
 * 2. Choisir un Unit Code (0-16)
 * 3. Mettre la prise en mode appairage
 * 4. Envoyer ON pour appairer
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

// Normaliser le Device ID (enlever 0x si présent, mettre en majuscules)
function normalizeDeviceId(deviceId) {
    return deviceId.toString().replace(/^0x/i, '').toUpperCase();
}

async function main() {
    console.log('='.repeat(80));
    console.log('🔌 Test Appairage Prise AC (DIO Chacon)');
    console.log('='.repeat(80));
    console.log();
    
    // Demander le Device ID
    let deviceIdInput = (await question('📝 Entrez le Device ID (ex: A1B2C3 ou 0xA1B2C3): ')).trim();
    if (!deviceIdInput) {
        console.log('❌ Device ID requis');
        rl.close();
        process.exit(1);
    }
    
    const deviceId = normalizeDeviceId(deviceIdInput);
    
    // Demander le Unit Code
    let unitCodeInput = (await question('📝 Entrez le Unit Code (0-16, par défaut 0): ')).trim();
    const unitCode = unitCodeInput ? parseInt(unitCodeInput, 10) : 0;
    
    if (isNaN(unitCode) || unitCode < 0 || unitCode > 16) {
        console.log('❌ Unit Code invalide (doit être entre 0 et 16)');
        rl.close();
        process.exit(1);
    }
    
    const deviceIdFormatted = `0x${deviceId}/${unitCode}`;
    
    console.log();
    console.log('🎯 Configuration:');
    console.log(`   - Device ID: ${deviceId}`);
    console.log(`   - Unit Code: ${unitCode}`);
    console.log(`   - Format: ${deviceIdFormatted}`);
    console.log();
    
    // Confirmer que la prise est en mode appairage
    console.log('⚠️  IMPORTANT: Mettez la prise en mode appairage maintenant !');
    const confirm = (await question('   La prise est-elle en mode appairage ? (O/n): ')).trim().toLowerCase();
    if (confirm === 'n' || confirm === 'non') {
        console.log('❌ Veuillez mettre la prise en mode appairage et relancer le script');
        rl.close();
        process.exit(1);
    }
    
    // Trouver le port
    let port = findUSBPort();
    const portInput = (await question(`\nPort USB détecté: ${port}\n   Utiliser ce port ? (O/n): `)).trim().toLowerCase();
    if (portInput === 'n' || portInput === 'non') {
        port = (await question('Entrez le chemin du port USB: ')).trim();
        if (!port) {
            console.log('❌ Port requis');
            rl.close();
            process.exit(1);
        }
    }
    
    console.log();
    console.log(`🔌 Connexion à ${port}...`);
    
    const rfxtrx = new rfxcom.RfxCom(port, {
        debug: false,
    });
    
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
        console.log();
        
        const lighting2 = new rfxcom.Lighting2(rfxtrx, rfxcom.lighting2.AC);
        
        console.log('📤 Envoi de la commande ON pour appairer...');
        console.log(`   Device ID: ${deviceIdFormatted}`);
        console.log();
        
        lighting2.switchOn(deviceIdFormatted, async (error) => {
            if (error) {
                console.error('❌ Erreur lors de l\'appairage:', error);
                rl.close();
                process.exit(1);
            } else {
                console.log('✅ Commande ON envoyée avec succès');
                console.log();
                console.log('💡 Vérifiez si la prise a répondu :');
                console.log('   - Si la prise a clignoté ou réagi → Appairage réussi !');
                console.log('   - Si rien ne s\'est passé → Réessayez en vérifiant :');
                console.log('     • La prise est bien en mode appairage');
                console.log('     • Le Device ID et Unit Code sont corrects');
                console.log('     • Le protocole AC est activé dans votre RFXCOM');
                console.log();
                
                const test = (await question('Voulez-vous tester la commande ON/OFF maintenant ? (O/n): ')).trim().toLowerCase();
                
                if (test !== 'n' && test !== 'non') {
                    console.log();
                    console.log('📤 Test ON...');
                    lighting2.switchOn(deviceIdFormatted, (err) => {
                        if (err) {
                            console.error('   ❌ Erreur:', err);
                        } else {
                            console.log('   ✅ ON envoyé');
                        }
                        
                        setTimeout(() => {
                            console.log();
                            console.log('📤 Test OFF...');
                            lighting2.switchOff(deviceIdFormatted, (err) => {
                                if (err) {
                                    console.error('   ❌ Erreur:', err);
                                } else {
                                    console.log('   ✅ OFF envoyé');
                                }
                                
                                console.log();
                                console.log('✅ Tests terminés');
                                console.log('💡 Vérifiez si la prise répond aux commandes');
                                
                                rfxtrx.close();
                                rl.close();
                                process.exit(0);
                            });
                        }, 2000);
                    });
                } else {
                    rfxtrx.close();
                    rl.close();
                    process.exit(0);
                }
            }
        });
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

