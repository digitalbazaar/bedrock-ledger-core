/*
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const {config} = require('bedrock');

require('../configs/ledger');
require('../configs/roles');

const cfg = config['ledger-core'] = {};

// the account/identity ID that will own the ledger
cfg.ledgerOwnerId = null;

// the ledger configuration to use when initializing the ledger
cfg.config = null;

// the ledger maintainer's key secret.
cfg.maintainerKeySecret = null;

// if the node is to be the genesis node, leave this empty, otherwise, specify
// 'hostname:port' for the genesis node
cfg.peers = [];

// add plugins by name e.g. 'example-agent-plugin'
cfg.agentPlugins = [];

// add plugins by name e.g. 'example-storage-plugin'
cfg.storagePlugins = [];
