/*
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const bedrock = require('bedrock');
require('bedrock-express');
require('bedrock-identity');
require('bedrock-ledger-agent');
require('bedrock-ledger-consensus-continuity');
require('bedrock-ledger-consensus-continuity-es-most-recent-participants');
require('bedrock-ledger-node');
require('bedrock-ledger-storage-mongodb');
require('bedrock-mongodb');
require('bedrock-permission');
require('bedrock-redis');
require('bedrock-views');

// stats modules
require('bedrock-package-manager');
require('bedrock-stats');
require('bedrock-stats-http');
require('bedrock-stats-storage-redis');
require('bedrock-ledger-node-stats-monitor');
require('bedrock-ledger-consensus-continuity-stats-monitor');

require('./config');
require('./ledger');
