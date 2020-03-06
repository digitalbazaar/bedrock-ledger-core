/*
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const _ = require('lodash');
const bedrock = require('bedrock');
const brAccount = require('bedrock-account');
const brLedgerAgent = require('bedrock-ledger-agent');
const brLedgerNode = require('bedrock-ledger-node');
const https = require('https');
const logger = require('./logger');
const {promisify} = require('util');
const getAgentIterator = promisify(brLedgerAgent.getAgentIterator);
const {config, util: {delay, BedrockError}} = bedrock;
const {WebLedgerClient} = require('web-ledger-client');
const brHttpsAgent = require('bedrock-https-agent');

// module API
const api = {};
module.exports = api;

const cfg = config['ledger-core'];

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

  await bedrock.runOnceAsync('ledger-core.setupLedger', setup);
  return {ledgerAgent: null};
}

async function _findAgent() {
  const options = {
    owner: cfg.ledgerOwnerId
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
  if(!ledgerConfiguration) {
    throw new BedrockError('Ledger configuration not found. ' +
      '"bedrock.config[\'ledger-core\'].config" not set.', 'NotFoundError');
  }
  // create ledger
  const options = Object.assign({
    ledgerConfiguration,
    genesis: true,
    public: true,
    owner: ledgerOwner.id,
  }, _agentPlugins(), _storagePlugins());

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
  // we need to get the HTTPS Agent here as it starts out as null.
  const {httpsAgent} = brHttpsAgent;
  if (httpsAgent === null) {
    throw new BedrockError('Bedrock HTTPS Agent is null.', 'InvalidStateError');
  }
  const ledgerOwner = await _getLedgerOwner();

  let genesisBlock = null;
  do {
    const hostname = _.sample(config['ledger-core'].peers);
    const clientOptions = {hostname, httpsAgent};
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

  const ledgerNode = await brLedgerNode.add(null, Object.assign(
    {genesisBlock}, _storagePlugins()));

  const options = Object.assign({
    public: true,
    owner: ledgerOwner.id,
  }, _agentPlugins());

  const brLedgerAgentAdd = promisify(brLedgerAgent.add);
  try {
    await brLedgerAgentAdd(ledgerOwner, ledgerNode.id, options);
  } catch(e) {
    logger.error('Error while initializing ledger', {error: e});
    throw e;
  }
}

async function _getLedgerOwner() {
  return brAccount.getCapabilities({id: cfg.ledgerOwnerId});
}

function _agentPlugins() {
  const options = {};
  if(cfg.agentPlugins.length !== 0) {
    options.plugins = cfg.agentPlugins;
  }
  return options;
}

function _storagePlugins() {
  const options = {};
  if(cfg.storagePlugins.length !== 0) {
    options.storage = {
      plugin: 'mongodb',
      storagePlugins: cfg.storagePlugins,
    };
  }
  return options;
}
