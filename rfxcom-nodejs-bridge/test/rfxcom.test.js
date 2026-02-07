/**
 * Tests pour les fonctions RFXCOM
 * Note: Ces fonctions ne sont pas exportées, donc on teste via les endpoints API
 */

jest.mock('fs');
jest.mock('rfxcom');
jest.mock('../mqtt_helper');

const fs = require('fs');
const request = require('supertest');

describe('Fonctions RFXCOM (testées via API)', () => {
    let app;
    let mockRfxtrx;

    beforeAll(() => {
        // Mock fs
        fs.existsSync = jest.fn().mockReturnValue(true);
        fs.mkdirSync = jest.fn();
        fs.readFileSync = jest.fn().mockReturnValue('{}');
        fs.writeFileSync = jest.fn();
        fs.renameSync = jest.fn();
        fs.unlinkSync = jest.fn();

        // Mock RFXCOM
        mockRfxtrx = {
            on: jest.fn(),
            once: jest.fn(),
            removeAllListeners: jest.fn(),
            close: jest.fn(),
            initialise: jest.fn((callback) => setTimeout(() => callback(null), 50))
        };

        // Le mock rfxcom est automatiquement utilisé via jest.mock('rfxcom')
        const rfxcom = require('rfxcom');
        mockRfxtrx = rfxcom.__mockRfxtrx;

        // Mock MQTT Helper
        const MQTTHelper = require('../mqtt_helper');
        MQTTHelper.mockImplementation(() => ({
            connect: jest.fn(),
            disconnect: jest.fn(),
            connected: true,
            client: {
                subscribe: jest.fn(),
                unsubscribe: jest.fn(),
                publish: jest.fn(),
                on: jest.fn()
            },
            publishDeviceDiscovery: jest.fn(),
            removeDiscovery: jest.fn(),
            setMessageHandler: jest.fn()
        }));

        // Charger l'app
        delete require.cache[require.resolve('../app')];
        const appModule = require('../app');
        app = appModule.app;
    });

    beforeEach(() => {
        jest.clearAllMocks();
        fs.readFileSync.mockReturnValue('{}');
    });

    describe('Initialisation RFXCOM', () => {
        it('devrait initialiser RFXCOM au démarrage', (done) => {
            // L'initialisation est asynchrone, on vérifie juste qu'elle ne crash pas
            const rfxcom = require('rfxcom');
            const mockRfxtrx = rfxcom.__mockRfxtrx;
            setTimeout(() => {
                expect(mockRfxtrx.initialise).toHaveBeenCalled();
                done();
            }, 200);
        }, 5000);
    });

    describe('Commandes RFXCOM via API', () => {
        it('devrait envoyer des commandes ARC via les endpoints', async () => {
            // Créer un appareil ARC
            const createResponse = await request(app)
                .post('/api/devices/arc')
                .send({
                    name: 'Volet RFXCOM Test',
                    houseCode: 'E',
                    unitCode: 3
                });

            expect(createResponse.status).toBe(200);
            const deviceId = createResponse.body.id;

            await new Promise(resolve => setTimeout(resolve, 100));

            // Tester les commandes
            const onResponse = await request(app)
                .post(`/api/devices/arc/${deviceId}/on`);
            expect(onResponse.status).toBe(200);

            const offResponse = await request(app)
                .post(`/api/devices/arc/${deviceId}/off`);
            expect(offResponse.status).toBe(200);

            const stopResponse = await request(app)
                .post(`/api/devices/arc/${deviceId}/stop`);
            expect(stopResponse.status).toBe(200);
        }, 10000);
    });
});

