/*!
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const bedrock = require('bedrock');
const {config} = bedrock;
const {constants} = config;
const c = bedrock.util.config.main;
const cc = c.computer();

const cfg = config['ledger-specific'] = {};

cfg.peers = [];

cfg.did = 'did:ledgertest:0e6bdea3-05d2-4d96-a344-df65ed03b55a';

cc('ledger-specific.config', () => ({
  '@context': constants.WEB_LEDGER_CONTEXT_V1_URL,
  type: 'WebLedgerConfiguration',
  ledger: cfg.did,
  consensusMethod: 'Continuity2017',
  electorSelectionMethod: {
    type: 'MostRecentParticipants',
  },
  // ledgerConfigurationValidator: [],
  // operationValidator: [],
  sequence: 0
}));

const identities = cfg.identities = {};

const userName = 'regularUser';
identities[userName] = {};
identities[userName].identity = _createIdentity(userName);
identities[userName].meta = {
  sysResourceRole: [{
    sysRole: 'ledger-app.admin',
    generateResource: 'id'
  }]
};

function _createIdentity(userName) {
  return {
    id: 'did:ff85ee23-9737-4fa3-a303-f466f11fcc94',
    label: userName,
  };
}
