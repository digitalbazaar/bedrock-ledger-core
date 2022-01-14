/*
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const _ = require('lodash');
const bedrock = require('bedrock');
const brAccount = require('bedrock-account');
const brLedgerAgent = require('bedrock-ledger-agent');
const brLedgerNode = require('bedrock-ledger-node');
const {documentLoader} = require('bedrock-jsonld-document-loader');
const logger = require('./logger');
const {promisify} = require('util');
const getAgentIterator = promisify(brLedgerAgent.getAgentIterator);
const {config, util: {delay, BedrockError}} = bedrock;
const {WebLedgerClient} = require('web-ledger-client');
const brHttpsAgent = require('bedrock-https-agent');
const {sign} = require('jsonld-signatures');
const {Ed25519Signature2020} = require('@digitalbazaar/ed25519-signature-2020');
const {CapabilityInvocation} = require('@digitalbazaar/zcapld');
const {decodeSecretKeySeed} = require('bnid');
const didKeyDriver = require('@digitalbazaar/did-method-key').driver();

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
  const {config, maintainerKeySecret} = cfg;
  if(!config) {
    throw new BedrockError('Ledger configuration not found. ' +
      '"bedrock.config[\'ledger-core\'].config" not set.', 'NotFoundError');
  }
  const secretType = typeof maintainerKeySecret;
  if(secretType !== 'string') {
    throw new BedrockError(
      `Expected "maintainerKeySecret" to be a "string" got "${secretType}".`,
      'TypeError'
    );
  }
  const seed = decodeSecretKeySeed({secretKeySeed: maintainerKeySecret});
  const keyPair = await didKeyDriver.generate({seed});
  const key = keyPair.methodFor({purpose: 'capabilityInvocation'});
  const suite = new Ed25519Signature2020({key});
  const purpose = new CapabilityInvocation({
    capability: config.ledger,
    invocationTarget: `${config.ledger}/config`,
    capabilityAction: 'write'
  });
  const ledgerConfiguration = await sign(
    config, {suite, purpose, documentLoader});
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
function _getPeerHistoryUrl({peerId, hostname}) {
  return `https://${hostname}` +
    `/consensus/continuity2017/peers/${encodeURIComponent(peerId)}`;
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
  logger.debug({endpoints});
  const peers = endpoints.filter(({targetNode}) => targetNode !== localPeerId)
    .map(({targetNode, hostname}) => {
      return {
        id: targetNode,
        url: _getPeerHistoryUrl({
          hostname,
          peerId: targetNode
        })
      };
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
