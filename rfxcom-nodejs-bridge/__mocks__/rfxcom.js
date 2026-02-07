/**
 * Mock pour le module rfxcom
 * Évite le chargement des dépendances natives (serialport)
 */

const mockRfxtrx = {
    on: jest.fn(),
    once: jest.fn(),
    removeAllListeners: jest.fn(),
    close: jest.fn(),
    initialise: jest.fn((callback) => {
        // Simuler un callback réussi après un délai
        setTimeout(() => callback && callback(null), 50);
    })
};

const mockLighting1 = {
    switchOn: jest.fn((id, callback) => callback && callback(null)),
    switchOff: jest.fn((id, callback) => callback && callback(null)),
    chime: jest.fn((id, callback) => callback && callback(null)),
    switchUp: jest.fn((houseCode, unitCode, callback) => callback && callback(null)),
    switchDown: jest.fn((houseCode, unitCode, callback) => callback && callback(null)),
    stop: jest.fn((houseCode, unitCode, callback) => callback && callback(null))
};

const mockLighting2 = {
    switchOn: jest.fn((id, callback) => callback && callback(null)),
    switchOff: jest.fn((id, callback) => callback && callback(null))
};

function RfxCom(port, options) {
    return mockRfxtrx;
}

function Lighting1(rfxtrx) {
    return mockLighting1;
}

function Lighting2(rfxtrx) {
    return mockLighting2;
}

module.exports = {
    RfxCom: jest.fn().mockImplementation(RfxCom),
    Lighting1: jest.fn().mockImplementation(Lighting1),
    Lighting2: jest.fn().mockImplementation(Lighting2),
    lighting1: { ARC: 'ARC' },
    lighting2: { AC: 'AC' },
    // Exporter les mocks pour les tests
    __mockRfxtrx: mockRfxtrx,
    __mockLighting1: mockLighting1,
    __mockLighting2: mockLighting2
};




