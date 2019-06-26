/*
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const {config} = require('bedrock');

require('../configs/continuity');
require('../configs/ledger');
require('../configs/roles');

const cfg = config['ledger-core'] = {};

// the account/identity ID that will own the ledger
cfg.ledgerOwnerId = null;

// the ledger configuration to use when initializing the ledger
cfg.config = null;

// if the node is to be the genesis node, leave this empty, otherwise, specify
// 'hostname:port' for the genesis node
cfg.peers = [];
