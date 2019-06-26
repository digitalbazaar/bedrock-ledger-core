/*
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const bedrock = require('bedrock');
const brIdentity = require('bedrock-identity');
const {config} = bedrock;

const cfg = config['ledger-specific'];

bedrock.events.on('bedrock-mongodb.ready', async () => _insert(cfg.identities));

async function _insert(identities) {
  try {
    for(const i in identities) {
      const identity = identities[i];
      await brIdentity.insert(
        {actor: null, identity: identity.identity, meta: identity.meta});
    }
  } catch(e) {
    if(e.name !== 'DuplicateError') {
      // duplicate error means test data is already loaded
      throw e;
    }
  }
}
