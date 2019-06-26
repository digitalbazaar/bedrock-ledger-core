/*
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const _ = require('lodash');
const bedrock = require('bedrock');
const brIdentity = require('bedrock-identity');
const brLedgerAgent = require('bedrock-ledger-agent');
const brLedgerNode = require('bedrock-ledger-node');
const https = require('https');
const logger = require('./logger');
const {promisify} = require('util');
const getAgentIterator = promisify(brLedgerAgent.getAgentIterator);
const {config, util: {delay, BedrockError}} = bedrock;
const {WebLedgerClient} = require('web-ledger-client');

// module API
const api = {};
module.exports = api;

const cfg = config['ledger-specific'];

bedrock.events.on('bedrock.started', async () => {
  let ledgerAgent;
  while(!ledgerAgent) {
    ({ledgerAgent} = await _setupLedger());
    if(!ledgerAgent) {
      // wait a second before trying again
      await delay(1000);
    }
  }
  logger.debug(
    'Successfully initialized ledger agent in worker.',
    {ledgerAgentId: ledgerAgent.id});
  api.agent = ledgerAgent;
});

async function _setupLedger() {
  // check to see if the agent already exists
  try {
    const ledgerAgent = await _findAgent();
    return {ledgerAgent};
  } catch(e) {
    if(e.name !== 'NotFoundError') {
      throw e;
    }
  }
  // ledgerAgent was not found and needs to be initialized
  let setup;
  if(cfg.peers.length === 0) {
    // this is the genesis node - no ledger agents, no peers
    setup = _setupGenesisNode;
  } else {
    // this is a peer node - no ledger agents, list of peers
    setup = _setupPeerNode;
  }

  await bedrock.runOnceAsync('ledger-specific.setupLedger', setup);
  return {ledgerAgent: null};
}

async function _findAgent() {
  const options = {
    owner: cfg.identities.regularUser.identity.id
  };
  let iterator;
  try {
    iterator = await getAgentIterator(null, options);
  } catch(e) {
    logger.error('Error while scanning for ledger', {error: e});
    throw e;
  }
  for(const promise of iterator) {
    const ledgerAgent = await promise;
    if(ledgerAgent.ledgerNode.id) {
      return ledgerAgent;
    }
  }
  throw new BedrockError('Ledger agent not found.', 'NotFoundError');
}

// setup the genesis node
async function _setupGenesisNode() {
  const ledgerOwner = await _getLedgerOwner();
  const ledgerConfiguration = cfg.config;
  // create ledger
  const options = {
    ledgerConfiguration,
    genesis: true,
    public: true,
    owner: ledgerOwner.id,
  };
  const brLedgerAgentAdd = promisify(brLedgerAgent.add);
  try {
    await brLedgerAgentAdd(ledgerOwner, null, options);
  } catch(e) {
    logger.error('Error while initializing ledger', {error: e});
    throw e;
  }
}

// setup a peer node by fetching the genesis block from another peer
async function _setupPeerNode() {
  logger.debug('Retrieving genesis block from peers', {peers: cfg.peers});
  const {strictSSL} = config.jsonld;

  const ledgerOwner = await _getLedgerOwner();

  let genesisBlock = null;
  do {
    const hostname = _.sample(config['ledger-test'].peers);
    const clientOptions = {hostname};
    if(!strictSSL) {
      clientOptions.httpsAgent = new https.Agent({rejectUnauthorized: false});
    }
    const client = new WebLedgerClient(clientOptions);
    try {
      logger.debug(`Attempting to contact peer ${hostname}`);
      genesisBlock = await client.getGenesisBlock();
    } catch(e) {
      logger.error('Peer could not be contacted. Retrying...', {error: e});
      // wait before next attempt
      await delay(5000);
    }
  } while(!genesisBlock);

  logger.debug('Successfully retrieved genesis block from peer.');

  const ledgerNode = await brLedgerNode.add(null, {genesisBlock});

  const options = {
    public: true,
    owner: ledgerOwner.id,
  };
  const brLedgerAgentAdd = promisify(brLedgerAgent.add);
  try {
    await brLedgerAgentAdd(ledgerOwner, ledgerNode.id, options);
  } catch(e) {
    logger.error('Error while initializing ledger', {error: e});
    throw e;
  }
}

async function _getLedgerOwner() {
  const {id} = config['ledger-specific'].identities.regularUser.identity;
  return brIdentity.getCapabilities({id});
}
