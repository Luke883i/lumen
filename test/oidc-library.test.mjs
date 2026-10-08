import test from 'node:test';
import assert from 'node:assert/strict';
import * as oidc from 'openid-client';
test('pinned OIDC library exposes required audited protocol primitives',()=>{
 for(const method of ['discovery','randomPKCECodeVerifier','calculatePKCECodeChallenge','buildAuthorizationUrl','authorizationCodeGrant','enableNonRepudiationChecks','ClientSecretBasic'])
   assert.equal(typeof oidc[method],'function',method);
});
