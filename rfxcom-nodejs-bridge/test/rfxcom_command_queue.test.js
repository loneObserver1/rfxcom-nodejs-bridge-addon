/**
 * Tests unitaires pour la file d'attente des commandes RFXCOM (rfxcom_command_queue.js).
 * Vérifie le traitement séquentiel (une commande à la fois), les callbacks et la gestion d'erreurs.
 */

const commandQueue = require('../rfxcom_command_queue');

describe('File d\'attente des commandes RFXCOM', () => {
    let mockDevices;
    let mockLighting1;
    let mockLighting2;
    let logCalls;

    beforeEach(() => {
        logCalls = [];
        const logFn = (level, ...args) => logCalls.push({ level, args });

        mockDevices = {
            ARC_A_1: {
                type: 'ARC',
                name: 'Volet Test',
                houseCode: 'A',
                unitCode: 1
            },
            AC_123456_0: {
                type: 'AC',
                name: 'Prise Test',
                deviceId: '123456',
                unitCode: 0
            }
        };

        mockLighting1 = {
            switchUp: jest.fn((houseCode, unitCode, cb) => setImmediate(() => cb(null))),
            switchDown: jest.fn((houseCode, unitCode, cb) => setImmediate(() => cb(null))),
            stop: jest.fn((houseCode, unitCode, cb) => setImmediate(() => cb(null)))
        };

        mockLighting2 = {
            switchOn: jest.fn((deviceIdFormatted, cb) => setImmediate(() => cb(null))),
            switchOff: jest.fn((deviceIdFormatted, cb) => setImmediate(() => cb(null)))
        };

        commandQueue.init({
            getDevices: () => mockDevices,
            getLighting1: () => mockLighting1,
            getLighting2: () => mockLighting2,
            log: logFn
        });
    });

    describe('init et push sans init', () => {
        it('devrait ignorer push si la queue n\'est pas initialisée', () => {
            const logSpy = jest.fn();
            commandQueue.init({ getDevices: null, getLighting1: null, getLighting2: null, log: logSpy });

            commandQueue.push({
                type: 'arc',
                deviceId: 'ARC_A_1',
                command: 'on'
            });

            expect(logSpy).toHaveBeenCalledWith('warn', expect.stringContaining('non initialisée'));
            expect(commandQueue.getQueueLength()).toBe(0);
        });

        it('devrait réinitialiser la queue et processing à l\'init', () => {
            commandQueue.push({ type: 'arc', deviceId: 'ARC_A_1', command: 'on' });
            commandQueue.init({
                getDevices: () => mockDevices,
                getLighting1: () => mockLighting1,
                getLighting2: () => mockLighting2,
                log: () => {}
            });
            expect(commandQueue.getQueueLength()).toBe(0);
            expect(commandQueue.isProcessing()).toBe(false);
        });
    });

    describe('jobs invalides', () => {
        it('devrait ignorer un job sans type', (done) => {
            const logSpy = jest.fn();
            commandQueue.init({
                getDevices: () => mockDevices,
                getLighting1: () => mockLighting1,
                getLighting2: () => mockLighting2,
                log: logSpy
            });
            commandQueue.push({ deviceId: 'ARC_A_1', command: 'on' });
            expect(logSpy).toHaveBeenCalledWith('warn', expect.stringContaining('invalide'));
            expect(mockLighting1.switchUp).not.toHaveBeenCalled();
            setImmediate(done);
        });

        it('devrait ignorer un job sans deviceId', (done) => {
            const logSpy = jest.fn();
            commandQueue.init({
                getDevices: () => mockDevices,
                getLighting1: () => mockLighting1,
                getLighting2: () => mockLighting2,
                log: logSpy
            });
            commandQueue.push({ type: 'arc', command: 'on' });
            expect(logSpy).toHaveBeenCalledWith('warn', expect.stringContaining('invalide'));
            setImmediate(done);
        });
    });

    describe('commande ARC', () => {
        it('devrait exécuter une commande ARC on et appeler onSuccess et onDone', (done) => {
            let onSuccessCalled = false;
            let onDoneCalled = false;
            commandQueue.push({
                type: 'arc',
                deviceId: 'ARC_A_1',
                command: 'on',
                onSuccess: () => { onSuccessCalled = true; },
                onDone: (err) => {
                    onDoneCalled = true;
                    expect(err).toBeNull();
                }
            });
            setImmediate(() => {
                expect(mockLighting1.switchUp).toHaveBeenCalledWith('A', 1, expect.any(Function));
                expect(onSuccessCalled).toBe(true);
                expect(onDoneCalled).toBe(true);
                done();
            });
        });

        it('devrait exécuter une commande ARC off (switchDown)', (done) => {
            commandQueue.push({
                type: 'arc',
                deviceId: 'ARC_A_1',
                command: 'off',
                onDone: (err) => {
                    expect(err).toBeNull();
                    expect(mockLighting1.switchDown).toHaveBeenCalledWith('A', 1, expect.any(Function));
                    done();
                }
            });
        });

        it('devrait mapper open/close pour ARC (cover)', (done) => {
            commandQueue.push({
                type: 'arc',
                deviceId: 'ARC_A_1',
                command: 'open',
                onDone: (err) => {
                    expect(err).toBeNull();
                    expect(mockLighting1.switchUp).toHaveBeenCalled();
                    done();
                }
            });
        });
    });

    describe('commande AC', () => {
        it('devrait exécuter une commande AC on et appeler switchOn', (done) => {
            commandQueue.push({
                type: 'ac',
                deviceId: 'AC_123456_0',
                command: 'on',
                onDone: (err) => {
                    expect(err).toBeNull();
                    expect(mockLighting2.switchOn).toHaveBeenCalledWith('0x123456/0', expect.any(Function));
                    done();
                }
            });
        });

        it('devrait exécuter une commande AC off', (done) => {
            commandQueue.push({
                type: 'ac',
                deviceId: 'AC_123456_0',
                command: 'off',
                onDone: (err) => {
                    expect(err).toBeNull();
                    expect(mockLighting2.switchOff).toHaveBeenCalledWith('0x123456/0', expect.any(Function));
                    done();
                }
            });
        });
    });

    describe('traitement séquentiel (une commande à la fois)', () => {
        it('devrait traiter la deuxième commande seulement après la fin de la première', (done) => {
            let firstDone = false;
            mockLighting1.switchUp.mockImplementation((h, u, cb) => {
                setImmediate(() => {
                    expect(firstDone).toBe(false);
                    firstDone = true;
                    cb(null);
                });
            });

            commandQueue.push({
                type: 'arc',
                deviceId: 'ARC_A_1',
                command: 'on',
                onDone: () => {}
            });
            commandQueue.push({
                type: 'arc',
                deviceId: 'ARC_A_1',
                command: 'off',
                onDone: (err) => {
                    expect(err).toBeNull();
                    expect(firstDone).toBe(true);
                    expect(mockLighting1.switchUp).toHaveBeenCalledTimes(1);
                    expect(mockLighting1.switchDown).toHaveBeenCalledTimes(1);
                    done();
                }
            });
        });

        it('getQueueLength et isProcessing reflètent l\'état', (done) => {
            expect(commandQueue.getQueueLength()).toBe(0);
            expect(commandQueue.isProcessing()).toBe(false);

            mockLighting1.switchUp.mockImplementation((h, u, cb) => {
                expect(commandQueue.isProcessing()).toBe(true);
                setImmediate(() => cb(null));
            });

            commandQueue.push({ type: 'arc', deviceId: 'ARC_A_1', command: 'on', onDone: () => {} });
            commandQueue.push({ type: 'arc', deviceId: 'ARC_A_1', command: 'off', onDone: () => {} });

            setImmediate(() => {
                expect(commandQueue.getQueueLength()).toBe(1);
            });
            setTimeout(() => {
                expect(commandQueue.getQueueLength()).toBe(0);
                expect(commandQueue.isProcessing()).toBe(false);
                done();
            }, 50);
        });
    });

    describe('erreurs', () => {
        it('devrait appeler onDone avec erreur si l\'appareil est introuvable', (done) => {
            commandQueue.push({
                type: 'arc',
                deviceId: 'INEXISTANT',
                command: 'on',
                onDone: (err) => {
                    expect(err).toBeInstanceOf(Error);
                    expect(err.message).toContain('introuvable');
                    expect(mockLighting1.switchUp).not.toHaveBeenCalled();
                    done();
                }
            });
        });

        it('devrait appeler onDone avec erreur si Lighting1 est null (ARC)', (done) => {
            commandQueue.init({
                getDevices: () => mockDevices,
                getLighting1: () => null,
                getLighting2: () => mockLighting2,
                log: () => {}
            });
            commandQueue.push({
                type: 'arc',
                deviceId: 'ARC_A_1',
                command: 'on',
                onDone: (err) => {
                    expect(err).toBeInstanceOf(Error);
                    expect(err.message).toContain('Lighting1');
                    done();
                }
            });
        });

        it('devrait appeler onDone avec erreur si le handler appelle le callback avec erreur', (done) => {
            mockLighting1.switchUp.mockImplementation((h, u, cb) => setImmediate(() => cb(new Error('RF timeout'))));
            commandQueue.push({
                type: 'arc',
                deviceId: 'ARC_A_1',
                command: 'on',
                onSuccess: () => {},
                onDone: (err) => {
                    expect(err).toBeInstanceOf(Error);
                    expect(err.message).toBe('RF timeout');
                    done();
                }
            });
        });
    });
});
