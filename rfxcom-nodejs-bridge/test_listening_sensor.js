#!/usr/bin/env node
/**
 * Script de test pour écouter les messages de capteurs RFXCOM (TEMP_HUM)
 * Aide à diagnostiquer pourquoi les sondes ne sont pas détectées
 */

const rfxcom = require('rfxcom');
const fs = require('fs');
const os = require('os');

// Trouver le port USB automatiquement
function findUSBPort() {
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
        // Essayer d'abord les ports série par ID (plus fiables)
        try {
            const serialByIdDir = '/dev/serial/by-id';
            if (fs.existsSync(serialByIdDir)) {
                const files = fs.readdirSync(serialByIdDir);
                const rfxcomPorts = files.filter(f => f.includes('RFXCOM') || f.includes('rfxcom'));
                if (rfxcomPorts.length > 0) {
                    return `/dev/serial/by-id/${rfxcomPorts[0]}`;
                }
            }
        } catch (err) {
            // Ignorer
        }

        // Sinon, chercher dans /dev
        try {
            const devDir = '/dev';
            const files = fs.readdirSync(devDir);
            const usbPorts = files.filter(f => f.startsWith('ttyUSB') || f.startsWith('ttyACM') || f.startsWith('ttyS'));
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

function formatMessage(msg) {
    console.log('\n' + '='.repeat(80));
    console.log('📨 MESSAGE RFXCOM REÇU');
    console.log('='.repeat(80));

    // Afficher tous les champs disponibles
    console.log('\n📋 Tous les champs du message:');
    console.log(JSON.stringify(msg, null, 2));

    // Informations spécifiques pour TEMP_HUM
    console.log('\n🔍 Analyse pour détection TEMP_HUM:');
    console.log(`   - msg.type: ${msg.type} (${typeof msg.type})`);
    console.log(`   - msg.packetType: ${msg.packetType} (${typeof msg.packetType})`);
    console.log(`   - msg.subtype: ${msg.subtype} (${typeof msg.subtype})`);

    // Vérifier si c'est un message TEMP_HUM selon les critères du code
    // Support pour "temperaturerain1" (Alecto temp+rain), "temperaturehumidity1" (Alecto TH13/WS1700), et "tempHumidity" (générique)
    const isTempHum =
        msg.type === 'tempHumidity' ||
        msg.type === 'TEMP_HUM' ||
        msg.packetType === 'TEMP_HUM' ||
        msg.type === 'temperaturerain1' ||
        msg.type === 'temperaturehumidity1' ||
        msg.subtype === 13; // TH13

    console.log(`\n✅ Est-ce un message TEMP_HUM/Alecto ? ${isTempHum ? 'OUI' : 'NON'}`);

    if (isTempHum) {
        console.log('\n📊 Extraction de l\'ID du capteur:');
        const sensorId = msg.id || msg.sensorId || msg.ID || `temp_${msg.channel || msg.channelNumber || 0}`;
        console.log(`   - msg.id: ${msg.id} (${typeof msg.id})`);
        console.log(`   - msg.sensorId: ${msg.sensorId} (${typeof msg.sensorId})`);
        console.log(`   - msg.ID: ${msg.ID} (${typeof msg.ID})`);
        console.log(`   - msg.channel: ${msg.channel} (${typeof msg.channel})`);
        console.log(`   - msg.channelNumber: ${msg.channelNumber} (${typeof msg.channelNumber})`);
        console.log(`   → ID extrait: ${sensorId}`);
        console.log(`   → ID complet pour device: TEMP_HUM_${sensorId}`);

        console.log('\n🌡️ Valeurs du capteur:');
        console.log(`   - msg.temperature: ${msg.temperature} (${typeof msg.temperature})`);
        console.log(`   - msg.Temperature: ${msg.Temperature} (${typeof msg.Temperature})`);
        console.log(`   - msg.humidity: ${msg.humidity} (${typeof msg.humidity})`);
        console.log(`   - msg.Humidity: ${msg.Humidity} (${typeof msg.Humidity})`);
        console.log(`   - msg.rainfall: ${msg.rainfall} (${typeof msg.rainfall})`);
        console.log(`   - msg.rain: ${msg.rain} (${typeof msg.rain})`);
        console.log(`   - msg.rainRate: ${msg.rainRate} (${typeof msg.rainRate})`);

        const temperature = msg.temperature || msg.Temperature;
        const humidity = msg.humidity || msg.Humidity;
        const rainfall = msg.rainfall || msg.rain || msg.rainRate;

        if (temperature !== undefined && temperature !== null) {
            console.log(`   ✅ Température détectée: ${temperature}°C`);
        } else {
            console.log(`   ⚠️ Température non trouvée dans les champs standards`);
        }

        if (humidity !== undefined && humidity !== null) {
            console.log(`   ✅ Humidité détectée: ${humidity}%`);
        } else {
            console.log(`   ⚠️ Humidité non trouvée dans les champs standards`);
        }

        if (rainfall !== undefined && rainfall !== null) {
            console.log(`   ✅ Pluviométrie détectée: ${rainfall}mm`);
        } else {
            console.log(`   ⚠️ Pluviométrie non trouvée dans les champs standards`);
        }
    } else {
        console.log('\n⚠️ Ce message n\'est pas reconnu comme TEMP_HUM par le code actuel');
        console.log('   Vérifiez les valeurs de msg.type et msg.packetType ci-dessus');
    }

    console.log('\n' + '='.repeat(80) + '\n');
}

async function main() {
    console.log('='.repeat(80));
    console.log('🔍 Test d\'écoute des capteurs RFXCOM (TEMP_HUM)');
    console.log('='.repeat(80));
    console.log();
    console.log('💡 Ce script écoute tous les messages RFXCOM et affiche en détail');
    console.log('   les messages de type TEMP_HUM pour aider au diagnostic.');
    console.log();

    // Trouver le port
    let port = findUSBPort();
    console.log(`🔌 Port série détecté: ${port}`);

    // Vérifier que le port existe
    if (!fs.existsSync(port)) {
        console.error(`❌ Port ${port} non trouvé`);
        console.log('\nPorts disponibles:');
        try {
            const devDir = '/dev';
            const files = fs.readdirSync(devDir);
            const ports = files.filter(f =>
                f.startsWith('ttyUSB') ||
                f.startsWith('ttyACM') ||
                f.startsWith('ttyS') ||
                f.startsWith('cu.')
            );
            ports.forEach(p => console.log(`   - /dev/${p}`));
        } catch (err) {
            console.error('   Impossible de lister les ports');
        }
        process.exit(1);
    }

    console.log(`✅ Port trouvé: ${port}`);
    console.log();
    console.log('📡 Connexion à RFXCOM...');
    console.log('   (Appuyez sur Ctrl+C pour arrêter)');
    console.log();

    const rfxtrx = new rfxcom.RfxCom(port, {
        debug: false,
    });

    let messageCount = 0;
    let tempHumCount = 0;

    rfxtrx.on('connectfailed', () => {
        console.error('❌ Échec de connexion');
        process.exit(1);
    });

    rfxtrx.on('disconnect', () => {
        console.error('❌ RFXCOM déconnecté');
        process.exit(1);
    });

    rfxtrx.on('error', (err) => {
        console.error('❌ Erreur:', err);
    });

    rfxtrx.on('connecting', () => {
        console.log('   📡 Connexion en cours...');
    });

    rfxtrx.on('ready', () => {
        console.log('✅ RFXCOM connecté et prêt');
        console.log();
        console.log('👂 Écoute des messages RFXCOM...');
        console.log('   En attente de messages de capteurs...');
        console.log();
    });

    rfxtrx.on('receiverstarted', () => {
        console.log('✅ Récepteur RFXCOM démarré');
        console.log();
    });

    // Écouter spécifiquement les événements "temperaturerain1" pour les sondes Alecto
    rfxtrx.on('temperaturerain1', (msg) => {
        messageCount++;
        tempHumCount++;
        console.log(`\n${'='.repeat(80)}`);
        console.log(`🎯 MESSAGE ALECTO TEMPERATURERAIN1 #${tempHumCount} (message total #${messageCount})`);
        console.log('='.repeat(80));
        console.log('\n📋 Message Alecto reçu:');
        console.log(JSON.stringify(msg, null, 2));
        if (msg && typeof msg === 'object') {
            formatMessage(msg);
        }
        console.log('\n' + '='.repeat(80) + '\n');
    });
    
    // Écouter spécifiquement les événements "temperaturehumidity1" pour les sondes Alecto TH13/WS1700
    rfxtrx.on('temperaturehumidity1', (msg) => {
        messageCount++;
        tempHumCount++;
        console.log(`\n${'='.repeat(80)}`);
        console.log(`🎯 MESSAGE ALECTO TH13/WS1700 TEMPERATUREHUMIDITY1 #${tempHumCount} (message total #${messageCount})`);
        console.log('='.repeat(80));
        console.log('\n📋 Message Alecto TH13/WS1700 reçu:');
        console.log(JSON.stringify(msg, null, 2));
        if (msg && typeof msg === 'object') {
            formatMessage(msg);
        }
        console.log('\n' + '='.repeat(80) + '\n');
    });

    // Écouter tous les messages
    rfxtrx.on('receive', (evt, msg) => {
        messageCount++;

        // Afficher TOUS les messages, même ceux qui semblent vides
        console.log(`\n${'='.repeat(80)}`);
        console.log(`📨 Message #${messageCount} reçu`);
        console.log('='.repeat(80));
        
        // Afficher evt (premier paramètre)
        console.log('\n📋 Paramètre evt:');
        console.log(`   - Type: ${typeof evt}`);
        console.log(`   - Valeur: ${JSON.stringify(evt, null, 2)}`);
        if (evt && typeof evt === 'object') {
            if (Array.isArray(evt)) {
                console.log(`   - C'est un tableau de ${evt.length} bytes`);
                // Parser le packet type depuis les bytes
                if (evt.length > 1) {
                    const packetType = evt[1];
                    console.log(`   - Packet type (byte 1): 0x${packetType.toString(16).toUpperCase()} (${packetType})`);
                    if (packetType === 0x4f) {
                        console.log(`   🎯 C'EST UN PACKET TYPE 0x4F (temperaturerain1/Alecto) !`);
                        // Parser les données manuellement
                        if (evt.length >= 9) {
                            const signbit = evt[4] & 0x80;
                            const temperature = ((evt[4] & 0x7f) * 256 + evt[5]) / 10 * (signbit ? -1 : 1);
                            const rainfall = (evt[6] * 256 + evt[7]) / 10;
                            const batteryLevel = evt[8] & 0x0f;
                            const rssi = (evt[8] >> 4) & 0xf;
                            const sensorId = "0x" + evt.slice(2, 4).map(b => b.toString(16).padStart(2, '0')).join("").toUpperCase();
                            console.log(`   📊 Données parsées manuellement:`);
                            console.log(`      - Sensor ID: ${sensorId}`);
                            console.log(`      - Température: ${temperature}°C`);
                            console.log(`      - Pluviométrie: ${rainfall}mm`);
                            console.log(`      - Niveau batterie: ${batteryLevel}`);
                            console.log(`      - RSSI: ${rssi}`);
                        }
                    } else if (packetType === 0x01) {
                        console.log(`   🎯 C'EST UN PACKET TYPE 0x01 (peut être TH13/WS1700) !`);
                        // Vérifier si c'est un message TH13 (se termine par "RFXCOM")
                        if (evt.length >= 19) {
                            const endText = String.fromCharCode.apply(String, evt.slice(evt.length - 6));
                            if (endText === "RFXCOM" || endText === "XCOM") {
                                console.log(`   ✅ Message se termine par "${endText}" → Probablement TH13/WS1700`);
                                // Parser selon le format TH13: data[4-5] = temp, data[5] = hum_raw
                                if (evt.length >= 10) {
                                    const tempInteger = evt[6]; // data[4] dans le format décodé
                                    const tempFraction = evt[7]; // data[5] dans le format décodé
                                    const temperature = tempInteger + (tempFraction / 256);
                                    const humidityRaw = evt[7] & 0x7F;
                                    const humidity = Math.round(humidityRaw * 100 / 327);
                                    const sensorId = "0x" + evt.slice(4, 6).map(b => b.toString(16).padStart(2, '0')).join("").toUpperCase();
                                    console.log(`   📊 Données parsées manuellement (TH13):`);
                                    console.log(`      - Sensor ID: ${sensorId}`);
                                    console.log(`      - Température: ${temperature.toFixed(1)}°C`);
                                    console.log(`      - Humidité: ${humidity}%`);
                                }
                            }
                        }
                    }
                }
            } else {
                console.log(`   - Clés: ${Object.keys(evt).join(', ')}`);
            }
        }
        
        // Afficher msg (deuxième paramètre)
        console.log('\n📋 Paramètre msg:');
        console.log(`   - Type: ${typeof msg}`);
        console.log(`   - Valeur: ${JSON.stringify(msg, null, 2)}`);
        if (msg && typeof msg === 'object') {
            console.log(`   - Clés: ${Object.keys(msg).join(', ')}`);
        }

        // Si msg est un objet, vérifier si c'est TEMP_HUM
        if (msg && typeof msg === 'object') {
            // Vérifier si c'est un message TEMP_HUM (support Alecto)
            const isTempHum =
                msg.type === 'tempHumidity' ||
                msg.type === 'TEMP_HUM' ||
                msg.packetType === 'TEMP_HUM' ||
                msg.type === 'temperaturerain1' ||
                msg.type === 'temperaturehumidity1' ||
                msg.subtype === 13; // TH13

            if (isTempHum) {
                tempHumCount++;
                const sensorType = msg.type === 'temperaturehumidity1' || msg.subtype === 13 ? 'TH13/WS1700' : 'Alecto';
                console.log(`\n🎯 MESSAGE TEMP_HUM/${sensorType} #${tempHumCount} (message total #${messageCount})`);
            } else {
                console.log(`\n📨 Type de message: ${msg.type || msg.packetType || 'inconnu'}`);
            }

            formatMessage(msg);
        } else if (evt && typeof evt === 'object') {
            // Peut-être que les données sont dans evt au lieu de msg
            console.log('\n⚠️ msg n\'est pas un objet, mais evt l\'est. Analyse de evt...');
            const isTempHum =
                evt.type === 'tempHumidity' ||
                evt.type === 'TEMP_HUM' ||
                evt.packetType === 'TEMP_HUM' ||
                evt.type === 'temperaturerain1' ||
                evt.type === 'temperaturehumidity1' ||
                evt.subtype === 13; // TH13
            
            if (isTempHum) {
                tempHumCount++;
                console.log(`\n🎯 MESSAGE TEMP_HUM/ALECTO DANS evt #${tempHumCount} (message total #${messageCount})`);
                formatMessage(evt);
            } else {
                console.log(`\n📨 Type dans evt: ${evt.type || evt.packetType || 'inconnu'}`);
                formatMessage(evt);
            }
        } else {
            // Afficher les deux paramètres bruts
            console.log('\n⚠️ Ni evt ni msg ne sont des objets valides');
            console.log(`   evt: ${evt}`);
            console.log(`   msg: ${msg}`);
            console.log(`   Types: evt=${typeof evt}, msg=${typeof msg}`);
        }
        
        console.log('\n' + '='.repeat(80) + '\n');
    });

    // Initialiser la connexion
    rfxtrx.initialise((error) => {
        if (error) {
            console.error('❌ Erreur lors de l\'initialisation:', error);
            process.exit(1);
        }
    });

    // Gérer l'arrêt propre
    process.on('SIGINT', () => {
        console.log('\n\n🛑 Arrêt du script...');
        console.log(`📊 Statistiques:`);
        console.log(`   - Messages totaux reçus: ${messageCount}`);
        console.log(`   - Messages TEMP_HUM: ${tempHumCount}`);
        rfxtrx.close();
        process.exit(0);
    });
}

// Gestion des erreurs
process.on('unhandledRejection', (err) => {
    console.error('❌ Erreur non gérée:', err);
    process.exit(1);
});

// Lancer le script
main().catch((err) => {
    console.error('❌ Erreur fatale:', err);
    process.exit(1);
});


