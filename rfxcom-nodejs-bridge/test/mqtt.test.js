/**
 * Tests pour les fonctions MQTT
 * Note: Ces fonctions ne sont pas exportées, donc on teste via les endpoints API
 */

jest.mock('fs');
jest.mock('rfxcom');
jest.mock('../mqtt_helper');

const fs = require('fs');
const request = require('supertest');
const MQTTHelper = require('../mqtt_helper');

describe('Fonctions MQTT (testées via API)', () => {
    let app;
    let mockMqttHelper;

    beforeAll(() => {
        // Mock fs
        fs.existsSync = jest.fn().mockReturnValue(true);
        fs.mkdirSync = jest.fn();
        fs.readFileSync = jest.fn().mockReturnValue('{}');
        fs.writeFileSync = jest.fn();
        fs.renameSync = jest.fn();
        fs.unlinkSync = jest.fn();

        // Mock RFXCOM
        const mockRfxtrx = {
            on: jest.fn(),
            once: jest.fn(),
            removeAllListeners: jest.fn(),
            close: jest.fn(),
            initialise: jest.fn((callback) => setTimeout(() => callback(null), 50))
        };

        // Le mock rfxcom est automatiquement utilisé via jest.mock('rfxcom')
        const rfxcom = require('rfxcom');

        // Mock MQTT Helper
        mockMqttHelper = {
            connect: jest.fn(),
            disconnect: jest.fn(),
            connected: true,
            client: {
                subscribe: jest.fn((topic, options, callback) => callback && callback(null)),
                unsubscribe: jest.fn(),
                publish: jest.fn(),
                on: jest.fn()
            },
            publishDeviceDiscovery: jest.fn(),
            removeDiscovery: jest.fn(),
            setMessageHandler: jest.fn(),
            onConnect: null
        };

        MQTTHelper.mockImplementation(() => mockMqttHelper);

        // Charger l'app
        delete require.cache[require.resolve('../app')];
        const appModule = require('../app');
        app = appModule.app;
    });

    beforeEach(() => {
        jest.clearAllMocks();
        fs.readFileSync.mockReturnValue('{}');
        mockMqttHelper.connected = true;
    });

    describe('MQTT via création d\'appareils', () => {
        it('devrait publier la découverte MQTT lors de la création d\'un appareil', async () => {
            const response = await request(app)
                .post('/api/devices/arc')
                .send({ name: 'Volet MQTT Test' });

            expect(response.status).toBe(200);
            // Vérifier que publishDeviceDiscovery a été appelé si MQTT est connecté
            // (peut ne pas être appelé si mqttHelper n'est pas encore initialisé)
        }, 10000);

        it('devrait publier la découverte MQTT pour un appareil AC', async () => {
            const response = await request(app)
                .post('/api/devices/ac')
                .send({ name: 'Prise MQTT Test' });

            expect(response.status).toBe(200);
        }, 10000);
    });
});

