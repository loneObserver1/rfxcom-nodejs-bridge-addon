/**
 * Tests pour MQTTHelper
 */

const MQTTHelper = require('../mqtt_helper');
const mqtt = require('mqtt');

jest.mock('mqtt');

describe('MQTTHelper', () => {
    let mqttHelper;
    let mockLog;
    let mockClient;

    beforeEach(() => {
        jest.clearAllMocks();

        mockLog = jest.fn();
        mockClient = {
            on: jest.fn(),
            subscribe: jest.fn(),
            unsubscribe: jest.fn(),
            publish: jest.fn(),
            end: jest.fn(),
            connected: true
        };

        mqtt.connect = jest.fn().mockReturnValue(mockClient);

        mqttHelper = new MQTTHelper(mockLog, {
            host: 'localhost',
            port: 1883,
            username: 'test',
            password: 'test'
        });
    });

    describe('Constructor', () => {
        it('devrait créer une instance MQTTHelper', () => {
            expect(mqttHelper).toBeDefined();
            expect(mqttHelper.log).toBe(mockLog);
        });
    });

    describe('connect', () => {
        it('devrait se connecter au broker MQTT', () => {
            mqttHelper.connect();

            expect(mqtt.connect).toHaveBeenCalled();
        });

        it('devrait gérer les événements de connexion', () => {
            mqttHelper.connect();

            // Simuler l'événement connect
            const connectHandler = mockClient.on.mock.calls.find(call => call[0] === 'connect')[1];
            if (connectHandler) {
                connectHandler();
            }

            expect(mockLog).toHaveBeenCalled();
        });
    });

    describe('disconnect', () => {
        it('devrait se déconnecter proprement', () => {
            mqttHelper.client = mockClient;
            mqttHelper.connected = true;

            mqttHelper.disconnect();

            expect(mockClient.publish).toHaveBeenCalled();
            expect(mockClient.end).toHaveBeenCalled();
        });
    });

    describe('publishDeviceDiscovery', () => {
        it('devrait publier la découverte pour un appareil cover', () => {
            mqttHelper.client = mockClient;
            mqttHelper.connected = true;

            const device = {
                id: 'ARC_A_1',
                type: 'ARC',
                haDeviceType: 'cover',
                name: 'Volet Test'
            };

            mqttHelper.publishDeviceDiscovery(device);

            expect(mockClient.publish).toHaveBeenCalled();
        });

        it('devrait publier la découverte pour un appareil switch', () => {
            mqttHelper.client = mockClient;
            mqttHelper.connected = true;

            const device = {
                id: 'AC_A1B2C3_0',
                type: 'AC',
                haDeviceType: 'switch',
                name: 'Prise Test'
            };

            mqttHelper.publishDeviceDiscovery(device);

            expect(mockClient.publish).toHaveBeenCalled();
        });

        it('devrait publier la découverte pour un capteur TEMP_HUM avec rainfall', () => {
            mqttHelper.client = mockClient;
            mqttHelper.connected = true;

            const device = {
                id: 'TEMP_HUM_123',
                type: 'TEMP_HUM',
                haDeviceType: 'sensor',
                name: 'Sonde Test',
                sensorId: '123',
                rainfall: true
            };

            mqttHelper.publishDeviceDiscovery(device);

            // Devrait publier pour température, humidité et rainfall
            expect(mockClient.publish).toHaveBeenCalledTimes(3);
        });

        it('devrait publier la découverte pour un capteur TEMP_HUM sans rainfall', () => {
            mqttHelper.client = mockClient;
            mqttHelper.connected = true;

            const device = {
                id: 'TEMP_HUM_123',
                type: 'TEMP_HUM',
                haDeviceType: 'sensor',
                name: 'Sonde Test',
                sensorId: '123'
            };

            mqttHelper.publishDeviceDiscovery(device);

            // Devrait publier pour température et humidité seulement
            expect(mockClient.publish).toHaveBeenCalledTimes(2);
        });

        it('ne devrait rien faire si MQTT n\'est pas connecté', () => {
            mqttHelper.connected = false;

            const device = {
                id: 'ARC_A_1',
                type: 'ARC',
                haDeviceType: 'cover',
                name: 'Volet Test'
            };

            mqttHelper.publishDeviceDiscovery(device);

            expect(mockClient.publish).not.toHaveBeenCalled();
        });
    });

    describe('publishSensorState', () => {
        it('devrait publier l\'état d\'un capteur', () => {
            mqttHelper.client = mockClient;
            mqttHelper.connected = true;

            mqttHelper.publishSensorState('sensor_id', '25.5', '°C');

            expect(mockClient.publish).toHaveBeenCalled();
        });

        it('ne devrait rien faire si MQTT n\'est pas connecté', () => {
            mqttHelper.connected = false;

            mqttHelper.publishSensorState('sensor_id', '25.5', '°C');

            expect(mockClient.publish).not.toHaveBeenCalled();
        });
    });

    describe('connect - Cas d\'erreur', () => {
        it('devrait gérer les erreurs de connexion', () => {
            mqttHelper.connect();

            const errorHandler = mockClient.on.mock.calls.find(call => call[0] === 'error')[1];
            if (errorHandler) {
                errorHandler(new Error('Connection failed'));
            }

            expect(mockLog).toHaveBeenCalled();
        });

        it('devrait gérer les événements offline', () => {
            mqttHelper.connect();
            mqttHelper.connected = true;

            const offlineHandler = mockClient.on.mock.calls.find(call => call[0] === 'offline')[1];
            if (offlineHandler) {
                offlineHandler();
            }

            expect(mockLog).toHaveBeenCalled();
        });

        it('devrait gérer les événements close', () => {
            mqttHelper.connect();
            mqttHelper.connected = true;

            const closeHandler = mockClient.on.mock.calls.find(call => call[0] === 'close')[1];
            if (closeHandler) {
                closeHandler();
            }

            expect(mockLog).toHaveBeenCalled();
        });

        it('devrait limiter les tentatives de connexion', () => {
            mqttHelper.maxConnectionAttempts = 2;
            mqttHelper.connectionAttempts = 1;

            mqttHelper.connect();

            expect(mqtt.connect).toHaveBeenCalled();
        });

        it('ne devrait pas reconnecter après le maximum de tentatives', () => {
            mqttHelper.maxConnectionAttempts = 2;
            mqttHelper.connectionAttempts = 2;

            mqttHelper.connect();

            // Ne devrait pas appeler mqtt.connect
            expect(mqtt.connect).not.toHaveBeenCalled();
        });
    });

    describe('connect - Sans authentification', () => {
        it('devrait se connecter sans username/password', () => {
            const helper = new MQTTHelper(mockLog, {
                host: 'localhost',
                port: 1883
            });

            helper.connect();

            expect(mqtt.connect).toHaveBeenCalled();
        });
    });

    describe('setMessageHandler', () => {
        it('devrait définir un handler de messages', () => {
            const handler = jest.fn();
            mqttHelper.setMessageHandler(handler);

            expect(mqttHelper.messageHandler).toBe(handler);
        });

        it('devrait attacher le handler si déjà connecté', () => {
            mqttHelper.client = mockClient;
            mqttHelper.connected = true;
            const handler = jest.fn();

            mqttHelper.setMessageHandler(handler);

            expect(mockClient.subscribe).toHaveBeenCalled();
        });
    });

    describe('removeDiscovery', () => {
        it('devrait supprimer la découverte pour un appareil', () => {
            mqttHelper.client = mockClient;
            mqttHelper.connected = true;

            mqttHelper.removeDiscovery('ARC_A_1');

            // Devrait publier pour cover, switch et sensors
            expect(mockClient.publish).toHaveBeenCalled();
        });

        it('ne devrait rien faire si MQTT n\'est pas connecté', () => {
            mqttHelper.connected = false;

            mqttHelper.removeDiscovery('ARC_A_1');

            expect(mockClient.publish).not.toHaveBeenCalled();
        });
    });

    describe('publishCoverState', () => {
        it('devrait publier l\'état d\'un volet', () => {
            mqttHelper.client = mockClient;
            mqttHelper.connected = true;

            mqttHelper.publishCoverState('ARC_A_1', 'open');

            expect(mockClient.publish).toHaveBeenCalled();
        });

        it('ne devrait rien faire si MQTT n\'est pas connecté', () => {
            mqttHelper.connected = false;

            mqttHelper.publishCoverState('ARC_A_1', 'open');

            expect(mockClient.publish).not.toHaveBeenCalled();
        });
    });

    describe('attachMessageHandler', () => {
        it('devrait attacher le handler si connecté', () => {
            mqttHelper.client = mockClient;
            mqttHelper.connected = true;
            mqttHelper.messageHandler = jest.fn();

            mqttHelper.attachMessageHandler();

            expect(mockClient.subscribe).toHaveBeenCalled();
        });

        it('ne devrait rien faire si pas connecté', () => {
            mqttHelper.connected = false;

            mqttHelper.attachMessageHandler();

            expect(mockClient.subscribe).not.toHaveBeenCalled();
        });
    });

    describe('connect - Gestion des erreurs de publication', () => {
        it('devrait gérer les erreurs lors de la publication du statut', () => {
            mqttHelper.connect();
            mqttHelper.connected = true;

            const connectHandler = mockClient.on.mock.calls.find(call => call[0] === 'connect')[1];
            if (connectHandler) {
                // Simuler une erreur lors de la publication
                mockClient.publish.mockImplementation((topic, payload, options, callback) => {
                    if (callback) {
                        callback(new Error('Erreur de publication'));
                    }
                });
                connectHandler();
            }

            expect(mockLog).toHaveBeenCalled();
        });
    });

    describe('connect - Gestion des erreurs spécifiques', () => {
        it('devrait gérer les erreurs d\'authentification', () => {
            mqttHelper.connect();

            const errorHandler = mockClient.on.mock.calls.find(call => call[0] === 'error')[1];
            if (errorHandler) {
                const error = { message: 'Not authorized', code: 5 };
                errorHandler(error);
            }

            expect(mockLog).toHaveBeenCalled();
        });

        it('devrait gérer les erreurs ECONNREFUSED', () => {
            mqttHelper.connect();

            const errorHandler = mockClient.on.mock.calls.find(call => call[0] === 'error')[1];
            if (errorHandler) {
                const error = { message: 'ECONNREFUSED', code: 'ECONNREFUSED' };
                errorHandler(error);
            }

            expect(mockLog).toHaveBeenCalled();
        });

        it('devrait gérer les erreurs génériques', () => {
            mqttHelper.connect();

            const errorHandler = mockClient.on.mock.calls.find(call => call[0] === 'error')[1];
            if (errorHandler) {
                const error = { message: 'Erreur générique', code: 'UNKNOWN' };
                errorHandler(error);
            }

            expect(mockLog).toHaveBeenCalled();
        });

        it('devrait arrêter après le maximum de tentatives', () => {
            mqttHelper.maxConnectionAttempts = 2;
            mqttHelper.connectionAttempts = 2;
            mqttHelper.connect();

            const errorHandler = mockClient.on.mock.calls.find(call => call[0] === 'error')[1];
            if (errorHandler) {
                const error = { message: 'Erreur' };
                errorHandler(error);
            }

            expect(mockClient.end).toHaveBeenCalled();
        });
    });

    describe('connect - Reconnexion', () => {
        it('devrait gérer la reconnexion', () => {
            mqttHelper.connect();
            mqttHelper.connectionAttempts = 1;
            mqttHelper.maxConnectionAttempts = 3;

            const reconnectHandler = mockClient.on.mock.calls.find(call => call[0] === 'reconnect')[1];
            if (reconnectHandler) {
                reconnectHandler();
            }

            expect(mockLog).toHaveBeenCalled();
        });

        it('devrait arrêter la reconnexion après le maximum', () => {
            mqttHelper.connect();
            mqttHelper.connectionAttempts = 2;
            mqttHelper.maxConnectionAttempts = 2;

            const reconnectHandler = mockClient.on.mock.calls.find(call => call[0] === 'reconnect')[1];
            if (reconnectHandler) {
                reconnectHandler();
            }

            expect(mockClient.end).toHaveBeenCalled();
        });
    });
});

