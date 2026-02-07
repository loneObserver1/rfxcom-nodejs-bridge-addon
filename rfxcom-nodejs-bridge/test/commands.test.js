/**
 * Tests pour les fonctions de commandes RFXCOM (via endpoints API)
 */

jest.mock('fs');
jest.mock('rfxcom');
jest.mock('../mqtt_helper');

const fs = require('fs');
const request = require('supertest');

describe('Fonctions de commandes (via API)', () => {
    let app;
    let appModule;
    let mockLighting1;
    let mockLighting2;

    beforeAll(() => {
        // Mock fs
        fs.existsSync = jest.fn().mockReturnValue(true);
        fs.mkdirSync = jest.fn();
        fs.readFileSync = jest.fn().mockReturnValue('{}');
        fs.writeFileSync = jest.fn();
        fs.renameSync = jest.fn();
        fs.unlinkSync = jest.fn();

        // Utiliser les mocks depuis __mocks__/rfxcom.js
        const rfxcom = require('rfxcom');
        mockLighting1 = rfxcom.__mockLighting1;
        mockLighting2 = rfxcom.__mockLighting2;

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
        appModule = require('../app');
        app = appModule.app;

        // Initialiser les handlers et la file d'attente (commandes passent par la queue)
        appModule.lighting1Handler = mockLighting1;
        appModule.lighting2Handler = mockLighting2;
        appModule.rfxtrxReady = true;
        if (typeof appModule.initCommandQueue === 'function') {
            appModule.initCommandQueue();
        }
    });

    beforeEach(() => {
        jest.clearAllMocks();
        fs.readFileSync.mockReturnValue('{}');
    });

    describe('Commandes ARC via API', () => {
        it('devrait envoyer ON, OFF, STOP à un appareil ARC', async () => {
            // Créer un appareil
            const createResponse = await request(app)
                .post('/api/devices/arc')
                .send({
                    name: 'Volet Commande Test',
                    houseCode: 'F',
                    unitCode: 4
                });

            const deviceId = createResponse.body.id;
            await new Promise(resolve => setTimeout(resolve, 100));

            // Test ON
            const onResponse = await request(app)
                .post(`/api/devices/arc/${deviceId}/on`);
            expect(onResponse.status).toBe(200);
            expect(mockLighting1.switchUp).toHaveBeenCalled();

            // Test OFF
            const offResponse = await request(app)
                .post(`/api/devices/arc/${deviceId}/off`);
            expect(offResponse.status).toBe(200);
            expect(mockLighting1.switchDown).toHaveBeenCalled();

            // Test STOP
            const stopResponse = await request(app)
                .post(`/api/devices/arc/${deviceId}/stop`);
            expect(stopResponse.status).toBe(200);
            expect(mockLighting1.stop).toHaveBeenCalled();
        }, 10000);

        it('devrait retourner 404 pour un appareil inexistant', async () => {
            const response = await request(app)
                .post('/api/devices/arc/ARC_INEXISTANT/on');

            expect(response.status).toBe(404);
        });
    });

    describe('Commandes AC via API', () => {
        it('devrait envoyer ON et OFF à un appareil AC', async () => {
            // Créer un appareil
            const createResponse = await request(app)
                .post('/api/devices/ac')
                .send({
                    name: 'Prise Commande Test',
                    deviceId: 'C3D4E5',
                    unitCode: 2
                });

            const deviceId = createResponse.body.id;
            await new Promise(resolve => setTimeout(resolve, 100));

            // Test ON
            const onResponse = await request(app)
                .post(`/api/devices/ac/${deviceId}/on`);
            expect(onResponse.status).toBe(200);
            expect(mockLighting2.switchOn).toHaveBeenCalled();

            // Test OFF
            const offResponse = await request(app)
                .post(`/api/devices/ac/${deviceId}/off`);
            expect(offResponse.status).toBe(200);
            expect(mockLighting2.switchOff).toHaveBeenCalled();
        }, 10000);
    });
});

