// Load nock FIRST before any HTTP clients
const nock = require('nock');
const axios = require('axios');
const cheerio = require('cheerio');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const { sampleHtmlWithYale } = require('./test-utils');

// Set a different port for testing to avoid conflict with the main app
const TEST_PORT = 3099;
let server;

describe('Integration Tests', () => {
  // Modify the app to use a test port
  beforeAll(async () => {
    // Setup nock BEFORE loading the app
    nock.disableNetConnect();
    nock.enableNetConnect('127.0.0.1');
    nock.enableNetConnect('localhost');
    
    // Clear the require cache for app.js and axios to ensure nock can intercept
    delete require.cache[require.resolve('../app.js')];
    delete require.cache[require.resolve('axios')];
    
    // Now import the app and start it on test port
    const app = require('../app.js');
    server = app.listen(TEST_PORT);
    
    // Give the server time to start
    await new Promise(resolve => setTimeout(resolve, 500));
  }, 10000); // Increase timeout for server startup

  afterEach(() => {
    // Clean up nock mocks after each test
    nock.cleanAll();
  });

  afterAll(async () => {
    // Close the test server
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    nock.cleanAll();
    nock.enableNetConnect();
  });

  test('Should replace Yale with Fale in fetched content', async () => {
    // Setup mock for example.com with more specific configuration
    const scope = nock('https://example.com')
      .get('/')
      .reply(200, sampleHtmlWithYale, {
        'Content-Type': 'text/html'
      });
    
    // Make a request to our proxy app
    const response = await axios.post(`http://localhost:${TEST_PORT}/fetch`, {
      url: 'https://example.com/'
    });
    
    expect(response.status).toBe(200);
    expect(response.data.success).toBe(true);
    
    // Verify Yale has been replaced with Fale in text
    const $ = cheerio.load(response.data.content);
    expect($('title').text()).toBe('Fale University Test Page');
    expect($('h1').text()).toBe('Welcome to Fale University');
    expect($('p').first().text()).toContain('Fale University is a private');
    
    // Verify URLs remain unchanged
    const links = $('a');
    let hasYaleUrl = false;
    links.each((i, link) => {
      const href = $(link).attr('href');
      if (href && href.includes('yale.edu')) {
        hasYaleUrl = true;
      }
    });
    expect(hasYaleUrl).toBe(true);
    
    // Verify link text is changed
    expect($('a').first().text()).toBe('About Fale');
    
    // Verify nock intercepted the request
    expect(scope.isDone()).toBe(true);
  }, 10000); // Increase timeout for this test

  test('Should handle invalid URLs', async () => {
    try {
      await axios.post(`http://localhost:${TEST_PORT}/fetch`, {
        url: 'not-a-valid-url'
      });
      // Should not reach here
      expect(true).toBe(false);
    } catch (error) {
      expect(error.response.status).toBe(500);
    }
  });

  test('Should handle missing URL parameter', async () => {
    try {
      await axios.post(`http://localhost:${TEST_PORT}/fetch`, {});
      // Should not reach here
      expect(true).toBe(false);
    } catch (error) {
      expect(error.response.status).toBe(400);
      expect(error.response.data.error).toBe('URL is required');
    }
  });
});
