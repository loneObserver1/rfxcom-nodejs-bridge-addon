/**
 * Tests pour les endpoints API
 */

// Mock des dépendances AVANT les imports
jest.mock('fs');
jest.mock('rfxcom');
jest.mock('../mqtt_helper');

const request = require('supertest');
const fs = require('fs');
const rfxcom = require('rfxcom');

let app;
let mockRfxtrx;
let mockLighting1;
let mockLighting2;

beforeAll((done) => {
    // Mock fs avant de charger app
    fs.existsSync = jest.fn().mockReturnValue(true);
    fs.mkdirSync = jest.fn();
    fs.readFileSync = jest.fn().mockReturnValue('{}');
    fs.writeFileSync = jest.fn();
    fs.renameSync = jest.fn();
    fs.unlinkSync = jest.fn();

    // Utiliser les mocks depuis __mocks__/rfxcom.js
    mockRfxtrx = rfxcom.__mockRfxtrx;
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

    // Charger l'app après les mocks
    delete require.cache[require.resolve('../app')];
    const appModule = require('../app');
    app = appModule.app;

    // Initialiser les handlers pour les tests de commandes
    setTimeout(() => {
        if (appModule.lighting1Handler === null || appModule.lighting1Handler === undefined) {
            appModule.lighting1Handler = mockLighting1;
        }
        if (appModule.lighting2Handler === null || appModule.lighting2Handler === undefined) {
            appModule.lighting2Handler = mockLighting2;
        }
        done();
    }, 200);
});

beforeEach(() => {
    jest.clearAllMocks();
    fs.readFileSync.mockReturnValue('{}');

    // Réinitialiser les handlers
    if (app && app.lighting1Handler === null) {
        app.lighting1Handler = mockLighting1;
    }
    if (app && app.lighting2Handler === null) {
        app.lighting2Handler = mockLighting2;
    }
});

describe('API Endpoints', () => {
    describe('GET /health', () => {
        it('devrait retourner un statut 200', async () => {
            const response = await request(app).get('/health');
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('status', 'ok');
        });
    });

    describe('GET /api/devices', () => {
        it('devrait retourner la liste des appareils', async () => {
            const response = await request(app).get('/api/devices');
            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
        });
    });

    describe('GET /api/devices/:id', () => {
        it('devrait retourner un appareil existant', async () => {
            // Créer un appareil d'abord
            const createResponse = await request(app)
                .post('/api/devices/arc')
                .send({ name: 'Test Volet' });

            const deviceId = createResponse.body.id;

            const response = await request(app).get(`/api/devices/${deviceId}`);
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('id', deviceId);
        });

        it('devrait retourner 404 pour un appareil inexistant', async () => {
            const response = await request(app).get('/api/devices/INEXISTANT');
            expect(response.status).toBe(404);
        });
    });

    describe('POST /api/devices/arc', () => {
        it('devrait créer un appareil ARC avec génération automatique', async () => {
            const response = await request(app)
                .post('/api/devices/arc')
                .send({ name: 'Volet Test' });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('status', 'success');
            expect(response.body.device).toHaveProperty('type', 'ARC');
            expect(response.body.device).toHaveProperty('houseCode');
            expect(response.body.device).toHaveProperty('unitCode');
        });

        it('devrait créer un appareil ARC avec houseCode et unitCode fournis', async () => {
            const response = await request(app)
                .post('/api/devices/arc')
                .send({
                    name: 'Volet Test',
                    houseCode: 'A',
                    unitCode: 1
                });

            expect(response.status).toBe(200);
            expect(response.body.device).toHaveProperty('houseCode', 'A');
            expect(response.body.device).toHaveProperty('unitCode', 1);
        });

        it('devrait retourner une erreur si le nom est manquant', async () => {
            const response = await request(app)
                .post('/api/devices/arc')
                .send({});

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('status', 'error');
        });

        it('devrait retourner une erreur si l\'appareil existe déjà', async () => {
            // Créer un premier appareil
            const firstResponse = await request(app)
                .post('/api/devices/arc')
                .send({
                    name: 'Volet Test',
                    houseCode: 'A',
                    unitCode: 1
                });

            expect(firstResponse.status).toBe(200);

            // Essayer de créer le même appareil
            const secondResponse = await request(app)
                .post('/api/devices/arc')
                .send({
                    name: 'Volet Test 2',
                    houseCode: 'A',
                    unitCode: 1
                });

            expect(secondResponse.status).toBe(400);
            expect(secondResponse.body).toHaveProperty('status', 'error');
        });
    });

    describe('POST /api/devices/ac', () => {
        it('devrait créer un appareil AC avec génération automatique', async () => {
            const response = await request(app)
                .post('/api/devices/ac')
                .send({ name: 'Prise Test' });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('status', 'success');
            expect(response.body.device).toHaveProperty('type', 'AC');
            expect(response.body.device).toHaveProperty('deviceId');
            expect(response.body.device).toHaveProperty('unitCode');
        });

        it('devrait créer un appareil AC avec deviceId et unitCode fournis', async () => {
            const response = await request(app)
                .post('/api/devices/ac')
                .send({
                    name: 'Prise Test',
                    deviceId: 'A1B2C3',
                    unitCode: 5
                });

            expect(response.status).toBe(200);
            expect(response.body.device).toHaveProperty('deviceId');
            expect(response.body.device).toHaveProperty('unitCode', 5);
        });

        it('devrait retourner une erreur si le nom est manquant', async () => {
            const response = await request(app)
                .post('/api/devices/ac')
                .send({});

            expect(response.status).toBe(400);
        });

        it('devrait valider que unitCode est entre 0 et 16', async () => {
            const response = await request(app)
                .post('/api/devices/ac')
                .send({
                    name: 'Prise Test',
                    deviceId: 'A1B2C3',
                    unitCode: 20
                });

            expect(response.status).toBe(400);
        });
    });

    describe('PUT /api/devices/:id/rename', () => {
        it('devrait renommer un appareil', async () => {
            // Créer un appareil
            const createResponse = await request(app)
                .post('/api/devices/arc')
                .send({ name: 'Ancien Nom' });

            const deviceId = createResponse.body.id;

            // Renommer
            const response = await request(app)
                .put(`/api/devices/${deviceId}/rename`)
                .send({ name: 'Nouveau Nom' });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('status', 'success');
        });

        it('devrait retourner 404 pour un appareil inexistant', async () => {
            const response = await request(app)
                .put('/api/devices/INEXISTANT/rename')
                .send({ name: 'Nouveau Nom' });

            expect(response.status).toBe(404);
        });
    });

    describe('DELETE /api/devices/:id', () => {
        it('devrait supprimer un appareil', async () => {
            // Créer un appareil
            const createResponse = await request(app)
                .post('/api/devices/arc')
                .send({ name: 'Volet à supprimer' });

            const deviceId = createResponse.body.id;

            // Supprimer
            const response = await request(app)
                .delete(`/api/devices/${deviceId}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('status', 'success');
        });

        it('devrait retourner 404 pour un appareil inexistant', async () => {
            const response = await request(app)
                .delete('/api/devices/INEXISTANT');

            expect(response.status).toBe(404);
        });
    });

    describe('POST /api/devices/arc/:id/on', () => {
        it('devrait envoyer une commande ON à un appareil ARC', async () => {
            // Créer un appareil
            const createResponse = await request(app)
                .post('/api/devices/arc')
                .send({
                    name: 'Volet Test',
                    houseCode: 'A',
                    unitCode: 1
                });

            const deviceId = createResponse.body.id;

            // Attendre un peu pour que l'appareil soit bien créé
            await new Promise(resolve => setTimeout(resolve, 100));

            // Envoyer commande ON
            const response = await request(app)
                .post(`/api/devices/arc/${deviceId}/on`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('status', 'success');
        }, 10000);

        it('devrait retourner 404 pour un appareil inexistant', async () => {
            const response = await request(app)
                .post('/api/devices/arc/INEXISTANT/on');

            expect(response.status).toBe(404);
        });
    });

    describe('POST /api/devices/ac/:id/on', () => {
        it('devrait envoyer une commande ON à un appareil AC', async () => {
            // Créer un appareil
            const createResponse = await request(app)
                .post('/api/devices/ac')
                .send({
                    name: 'Prise Test',
                    deviceId: 'A1B2C3',
                    unitCode: 0
                });

            const deviceId = createResponse.body.id;

            // Attendre un peu pour que l'appareil soit bien créé
            await new Promise(resolve => setTimeout(resolve, 100));

            // Envoyer commande ON
            const response = await request(app)
                .post(`/api/devices/ac/${deviceId}/on`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('status', 'success');
        }, 10000);
    });

    describe('POST /api/devices/arc/pair', () => {
        it('devrait envoyer une commande d\'appairage', async () => {
            // Créer un appareil
            const createResponse = await request(app)
                .post('/api/devices/arc')
                .send({
                    name: 'Volet Pair',
                    houseCode: 'B',
                    unitCode: 2
                });

            const deviceId = createResponse.body.id;

            await new Promise(resolve => setTimeout(resolve, 100));

            // Appairer
            const response = await request(app)
                .post('/api/devices/arc/pair')
                .send({ deviceId });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('status', 'success');
        }, 10000);
    });

    describe('POST /api/devices/ac/pair', () => {
        it('devrait envoyer une commande d\'appairage AC', async () => {
            // Créer un appareil
            const createResponse = await request(app)
                .post('/api/devices/ac')
                .send({
                    name: 'Prise Pair',
                    deviceId: 'B2C3D4',
                    unitCode: 1
                });

            const deviceId = createResponse.body.id;

            await new Promise(resolve => setTimeout(resolve, 100));

            // Appairer
            const response = await request(app)
                .post('/api/devices/ac/pair')
                .send({ deviceId });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('status', 'success');
        }, 10000);
    });
});

