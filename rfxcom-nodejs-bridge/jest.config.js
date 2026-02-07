module.exports = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/test/setup.js'],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/test/',
    '/public/'
  ],
  collectCoverageFrom: [
    'app.js',
    'mqtt_helper.js'
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },
  testTimeout: 15000,
  // Empêcher le démarrage automatique du serveur dans les tests
  testMatch: ['**/test/**/*.test.js']
};

