/**
 * Tests pour les fonctions utilitaires
 * Note: Ces fonctions ne sont pas exportées, donc on teste via les endpoints API
 */

jest.mock('fs');
jest.mock('rfxcom');
jest.mock('../mqtt_helper');

const fs = require('fs');
const request = require('supertest');

describe('Fonctions utilitaires (testées via API)', () => {
    let app;

    beforeAll(() => {
        // Mock fs
        fs.existsSync = jest.fn().mockReturnValue(true);
        fs.mkdirSync = jest.fn();
        fs.readFileSync = jest.fn().mockReturnValue('{}');
        fs.writeFileSync = jest.fn();
        fs.renameSync = jest.fn();
        fs.unlinkSync = jest.fn();

        // Mock rfxcom
        const mockRfxtrx = {
            on: jest.fn(),
            once: jest.fn(),
            removeAllListeners: jest.fn(),
            close: jest.fn(),
            initialise: jest.fn((callback) => setTimeout(() => callback(null), 50))
        };

        // Le mock rfxcom est automatiquement utilisé via jest.mock('rfxcom')
        const rfxcom = require('rfxcom');

        // Charger l'app
        delete require.cache[require.resolve('../app')];
        const appModule = require('../app');
        app = appModule.app;
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('loadDevices via API', () => {
        it('devrait charger les appareils depuis le fichier', async () => {
            const mockDevices = {
                'ARC_A_1': {
                    type: 'ARC',
                    name: 'Test Volet',
                    houseCode: 'A',
                    unitCode: 1
                }
            };
            fs.readFileSync.mockReturnValue(JSON.stringify(mockDevices));
            fs.existsSync.mockReturnValue(true);

            // Recharger l'app pour que loadDevices soit appelé
            delete require.cache[require.resolve('../app')];
            require('../app');

            expect(fs.readFileSync).toHaveBeenCalled();
        });
    });

    describe('saveDevices via API', () => {
        it('devrait sauvegarder les appareils lors de la création', async () => {
            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue('{}');

            const response = await request(app)
                .post('/api/devices/arc')
                .send({ name: 'Volet Test' });

            expect(response.status).toBe(200);
            expect(fs.writeFileSync).toHaveBeenCalled();
        });
    });

    describe('findFreeArcCode via API', () => {
        it('devrait générer automatiquement un code ARC libre', async () => {
            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue('{}');

            const response = await request(app)
                .post('/api/devices/arc')
                .send({ name: 'Volet Auto' });

            expect(response.status).toBe(200);
            expect(response.body.device).toHaveProperty('houseCode');
            expect(response.body.device).toHaveProperty('unitCode');
            expect(response.body.device.houseCode).toMatch(/^[A-P]$/);
            expect(response.body.device.unitCode).toBeGreaterThanOrEqual(1);
        });
    });

    describe('findFreeAcCode via API', () => {
        it('devrait générer automatiquement un code AC libre', async () => {
            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue('{}');

            const response = await request(app)
                .post('/api/devices/ac')
                .send({ name: 'Prise Auto' });

            expect(response.status).toBe(200);
            expect(response.body.device).toHaveProperty('deviceId');
            expect(response.body.device).toHaveProperty('unitCode');
            expect(response.body.device.deviceId).toMatch(/^[0-9A-F]{6}$/);
        });
    });
});

