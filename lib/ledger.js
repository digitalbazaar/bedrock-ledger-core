/*
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const _ = require('lodash');
const bedrock = require('bedrock');
const brAccount = require('bedrock-account');
const brLedgerAgent = require('bedrock-ledger-agent');
const brLedgerNode = require('bedrock-ledger-node');
const logger = require('./logger');
const {promisify} = require('util');
const getAgentIterator = promisify(brLedgerAgent.getAgentIterator);
const {config, util: {delay, BedrockError}} = bedrock;
const {WebLedgerClient} = require('web-ledger-client');
const brHttpsAgent = require('bedrock-https-agent');
const {purposes: {AssertionProofPurpose}, sign} = require('jsonld-signatures');
const {Ed25519Signature2020} = require('@digitalbazaar/ed25519-signature-2020');
const {
  Ed25519VerificationKey2020
} = require('@digitalbazaar/ed25519-verification-key-2020');

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

/**
 * Takes in a path to a maintainerKey.
 *
 * @param {string} maintainerKey - A path to a maintainerKey.
 *
 * @returns{Promise<Ed25519VerificationKey2020>} - Returns the mainainer's
 *  Ed25519VerificationKey 2020.
 */
async function getMaintainerKey(maintainerKey) {
  if(!maintainerKey) {
    return Ed25519VerificationKey2020.generate();
  }
  const keyOptions = require(maintainerKey);
  return new Ed25519VerificationKey2020(keyOptions);
}

// setup the genesis node
async function _setupGenesisNode() {
  const ledgerOwner = await _getLedgerOwner();
  const {config, maintainerKeyPath} = cfg;
  if(!config) {
    throw new BedrockError('Ledger configuration not found. ' +
      '"bedrock.config[\'ledger-core\'].config" not set.', 'NotFoundError');
  }
  const key = await getMaintainerKey(maintainerKeyPath);
  const suite = new Ed25519Signature2020({key});
  const purpose = new AssertionProofPurpose();
  const ledgerConfiguration = await sign(config, {suite, purpose});
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
  if(httpsAgent === null) {
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

  // Gather Peer IDs of nodes based on their hostname
  const endpoints = await _getEndpoints({
    hostnames: config['ledger-core'].peers
  });
  // Ensure we filter out the local peer from the list of peers
  const localPeerId = await ledgerNode.consensus._localPeers.getPeerId(
    {ledgerNodeId: ledgerNode.id});

  const peers = endpoints.filter(({targetNode}) => targetNode !== localPeerId)
    .map(({targetNode}) => {
      return {id: targetNode, url: targetNode};
    });
  logger.debug('Peers', {peers});
  const promises = peers.map(async peer => {
    try {
      logger.debug('Adding peer to node', {peer});
      await ledgerNode.peers.add({peer});
    } catch(e) {
      if(e.name !== 'DuplicateError') {
        throw e;
      }
    }
  });
  await Promise.all(promises);
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

async function _getEndpoints({hostnames}) {
  return Promise.all(hostnames.map(hostname => (async () => {
    const client = new WebLedgerClient(
      {hostname, httpsAgent: brHttpsAgent.httpsAgent});

    try {
      // there is no benefit in running getServiceEndpoint and getTargetNode
      // in parallel
      const endpoint = await client.getServiceEndpoint(
        {serviceId: 'ledgerOperationService'});
      const targetNode = await client.getTargetNode();
      return {client, endpoint, hostname, targetNode};
    } catch(e) {
      // FIXME: remove overly verbose axios error, WebLedgerClient should be
      // update to tame these errors
      delete e.details.error;
      throw e;
    }
  })()));
}
