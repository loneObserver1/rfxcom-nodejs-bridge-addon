/**
 * Tests pour les fonctions internes de app.js
 * Ces fonctions sont testées via les endpoints API et les appels directs
 */

jest.mock('fs');
jest.mock('rfxcom');
jest.mock('../mqtt_helper');

const fs = require('fs');
const request = require('supertest');

describe('Fonctions internes app.js', () => {
    let app;
    let appModule;

    beforeAll(() => {
        // Mock fs
        fs.existsSync = jest.fn().mockReturnValue(true);
        fs.mkdirSync = jest.fn();
        fs.readFileSync = jest.fn().mockReturnValue('{}');
        fs.writeFileSync = jest.fn();
        fs.renameSync = jest.fn();
        fs.unlinkSync = jest.fn();

        // Mock rfxcom
        const rfxcom = require('rfxcom');

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
    });

    beforeEach(() => {
        jest.clearAllMocks();
        fs.readFileSync.mockReturnValue('{}');
        fs.existsSync.mockReturnValue(true);
    });

    describe('loadDevices - Cas de fichiers', () => {
        it('devrait charger un fichier valide avec appareils via API', async () => {
            const mockDevices = {
                'ARC_A_1': {
                    type: 'ARC',
                    name: 'Test Volet',
                    houseCode: 'A',
                    unitCode: 1,
                    haDeviceType: 'cover'
                }
            };
            fs.readFileSync.mockReturnValue(JSON.stringify(mockDevices));
            fs.existsSync.mockReturnValue(true);

            // Recharger l'app
            delete require.cache[require.resolve('../app')];
            const appModule = require('../app');
            const testApp = appModule.app;

            // Vérifier via l'API que les appareils sont chargés
            const response = await request(testApp).get('/api/devices');
            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
        });

        it('devrait gérer un fichier vide via API', async () => {
            fs.readFileSync.mockReturnValue('');
            fs.existsSync.mockReturnValue(true);
            fs.writeFileSync.mockClear();

            delete require.cache[require.resolve('../app')];
            const appModule = require('../app');
            const testApp = appModule.app;

            // Le fichier vide devrait être réinitialisé
            expect(fs.writeFileSync).toHaveBeenCalled();
        });

        it('devrait gérer un fichier invalide (array) via API', async () => {
            fs.readFileSync.mockReturnValue('[]');
            fs.existsSync.mockReturnValue(true);
            fs.writeFileSync.mockClear();

            delete require.cache[require.resolve('../app')];
            const appModule = require('../app');
            const testApp = appModule.app;

            // Le fichier invalide devrait être réinitialisé
            expect(fs.writeFileSync).toHaveBeenCalled();
        });

        it('devrait migrer haDeviceType pour ARC via API', async () => {
            const mockDevices = {
                'ARC_A_1': {
                    type: 'ARC',
                    name: 'Test Volet',
                    houseCode: 'A',
                    unitCode: 1
                    // Pas de haDeviceType
                }
            };
            fs.readFileSync.mockReturnValue(JSON.stringify(mockDevices));
            fs.existsSync.mockReturnValue(true);
            fs.writeFileSync.mockClear();

            delete require.cache[require.resolve('../app')];
            const appModule = require('../app');
            const testApp = appModule.app;

            // Vérifier que la migration a été effectuée
            const response = await request(testApp).get('/api/devices/ARC_A_1');
            expect(response.status).toBe(200);
            expect(response.body.device.haDeviceType).toBe('cover');
        });

        it('devrait migrer haDeviceType pour AC via API', async () => {
            const mockDevices = {
                'AC_A1B2C3_0': {
                    type: 'AC',
                    name: 'Test Prise',
                    deviceId: 'A1B2C3',
                    unitCode: 0
                    // Pas de haDeviceType
                }
            };
            fs.readFileSync.mockReturnValue(JSON.stringify(mockDevices));
            fs.existsSync.mockReturnValue(true);
            fs.writeFileSync.mockClear();

            delete require.cache[require.resolve('../app')];
            const appModule = require('../app');
            const testApp = appModule.app;

            // Vérifier que la migration a été effectuée
            const response = await request(testApp).get('/api/devices/AC_A1B2C3_0');
            expect(response.status).toBe(200);
            expect(response.body.device.haDeviceType).toBe('switch');
        });

        it('devrait migrer haDeviceType pour TEMP_HUM via API', async () => {
            const mockDevices = {
                'TEMP_HUM_123': {
                    type: 'TEMP_HUM',
                    name: 'Test Sonde',
                    sensorId: '123'
                    // Pas de haDeviceType
                }
            };
            fs.readFileSync.mockReturnValue(JSON.stringify(mockDevices));
            fs.existsSync.mockReturnValue(true);
            fs.writeFileSync.mockClear();

            delete require.cache[require.resolve('../app')];
            const appModule = require('../app');
            const testApp = appModule.app;

            // Vérifier que la migration a été effectuée
            const response = await request(testApp).get('/api/devices/TEMP_HUM_123');
            expect(response.status).toBe(200);
            expect(response.body.device.haDeviceType).toBe('sensor');
        });

        it('devrait gérer l\'absence de fichier via API', async () => {
            fs.existsSync.mockReturnValue(false);

            delete require.cache[require.resolve('../app')];
            const appModule = require('../app');
            const testApp = appModule.app;

            // Vérifier que l'API fonctionne même sans fichier
            const response = await request(testApp).get('/api/devices');
            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
        });

        it('devrait gérer les erreurs de lecture via API', async () => {
            fs.readFileSync.mockImplementation(() => {
                throw new Error('Erreur de lecture');
            });
            fs.existsSync.mockReturnValue(true);
            fs.writeFileSync.mockClear();

            delete require.cache[require.resolve('../app')];
            const appModule = require('../app');
            const testApp = appModule.app;

            // L'API devrait fonctionner même en cas d'erreur de lecture
            const response = await request(testApp).get('/api/devices');
            expect(response.status).toBe(200);
        });
    });

    describe('saveDevices - Via API', () => {
        it('devrait sauvegarder lors de la création d\'un appareil ARC', async () => {
            fs.writeFileSync.mockClear();
            
            const response = await request(app)
                .post('/api/devices/arc')
                .send({ name: 'Volet Test Save' });

            expect(response.status).toBe(200);
            expect(fs.writeFileSync).toHaveBeenCalled();
        });

        it('devrait sauvegarder lors de la création d\'un appareil AC', async () => {
            fs.writeFileSync.mockClear();
            
            const response = await request(app)
                .post('/api/devices/ac')
                .send({ name: 'Prise Test Save' });

            expect(response.status).toBe(200);
            expect(fs.writeFileSync).toHaveBeenCalled();
        });

        it('devrait gérer les erreurs de sauvegarde', async () => {
            fs.writeFileSync.mockImplementation(() => {
                throw new Error('Erreur d\'écriture');
            });
            fs.renameSync.mockImplementation(() => {
                throw new Error('Erreur de renommage');
            });

            const response = await request(app)
                .post('/api/devices/arc')
                .send({ name: 'Volet Test Error' });

            // L'appareil devrait quand même être créé en mémoire
            expect(response.status).toBe(200);
        });
    });

    describe('findFreeArcCode - Via API', () => {
        it('devrait trouver un code libre automatiquement', async () => {
            const response = await request(app)
                .post('/api/devices/arc')
                .send({ name: 'Volet Auto Code' });

            expect(response.status).toBe(200);
            expect(response.body.device).toHaveProperty('houseCode');
            expect(response.body.device).toHaveProperty('unitCode');
        });

        it('devrait trouver le prochain code libre', async () => {
            // Créer un premier appareil
            await request(app)
                .post('/api/devices/arc')
                .send({ name: 'Volet 1', houseCode: 'A', unitCode: 1 });

            // Créer un deuxième avec auto
            const response = await request(app)
                .post('/api/devices/arc')
                .send({ name: 'Volet 2' });

            expect(response.status).toBe(200);
            expect(response.body.device.houseCode).toBe('A');
            expect(response.body.device.unitCode).toBe(2);
        });
    });

    describe('findFreeAcCode - Via API', () => {
        it('devrait trouver un code libre automatiquement', async () => {
            const response = await request(app)
                .post('/api/devices/ac')
                .send({ name: 'Prise Auto Code' });

            expect(response.status).toBe(200);
            expect(response.body.device).toHaveProperty('deviceId');
            expect(response.body.device).toHaveProperty('unitCode');
        });
    });

    describe('ensureDataDirectory', () => {
        it('devrait créer le répertoire s\'il n\'existe pas', async () => {
            fs.existsSync.mockReturnValue(false);
            fs.mkdirSync.mockClear();

            delete require.cache[require.resolve('../app')];
            require('../app');

            expect(fs.mkdirSync).toHaveBeenCalled();
        });

        it('devrait gérer les erreurs de création de répertoire', async () => {
            fs.existsSync.mockReturnValue(false);
            fs.mkdirSync.mockImplementation(() => {
                throw new Error('Permission denied');
            });

            delete require.cache[require.resolve('../app')];
            // Ne devrait pas crasher
            expect(() => require('../app')).not.toThrow();
        });
    });
});

