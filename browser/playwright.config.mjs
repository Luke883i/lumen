import {defineConfig, devices} from '@playwright/test';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const port=3219;
const origin='http://127.0.0.1:'+port;

export default defineConfig({
  testDir:'./tests',
  testMatch:'*.spec.mjs',
  fullyParallel:false,
  forbidOnly:!!process.env.CI,
  workers:1,
  retries:0,
  timeout:45000,
  globalTimeout:8*60*1000,
  reporter:process.env.CI?[['line'],['html',{open:'never',outputFolder:'playwright-report'}]]:[['list']],
  outputDir:'test-results',
  use:{
    baseURL:origin,
    trace:'retain-on-failure',
    screenshot:'only-on-failure',
    actionTimeout:12000
  },
  projects:[
    {name:'chrome-desktop',use:{...devices['Desktop Chrome'],baseURL:'http://127.0.0.1:3219'}},
    {name:'android-emulation',use:{...devices['Pixel 7'],browserName:'chromium',baseURL:'http://127.0.0.1:3220'}}
  ],
  // Failure in one platform must not mutate another platform's test database.
  webServer:[3219,3220].map(port=>({
    command:'npm run dev',
    cwd:root,
    url:'http://127.0.0.1:'+port+'/api/health',
    timeout:90000,
    reuseExistingServer:false,
    env:{
      PORT:String(port),
      LUMEN_DB_PATH:':memory:',
      LUMEN_DEMO:'1',
      NODE_ENV:'test',
      KOHA_CIRCULATION_ENABLED:'0',
      KOHA_LOANS_ENABLED:'0',
      KOHA_RETURNS_ENABLED:'0',
      OIDC_ONLY:'0'
    },
    stdout:'ignore',stderr:'pipe'
  }))
});
