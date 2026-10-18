import {runDeploymentMutations} from '../src/deployment-mutations.mjs';
try{console.log(JSON.stringify(runDeploymentMutations(),null,2));}catch(e){console.error(JSON.stringify({gate:'UNIVERSAL_DEPLOYMENT_MUTATION',status:'FAIL',reason:e.message}));process.exitCode=1;}
