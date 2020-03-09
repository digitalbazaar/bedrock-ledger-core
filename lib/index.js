/*
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

require('bedrock');
require('bedrock-express');
require('bedrock-identity');
require('bedrock-ledger-agent');
require('bedrock-ledger-consensus-continuity');
require('bedrock-ledger-node');
require('bedrock-ledger-storage-mongodb');
require('bedrock-mongodb');
require('bedrock-permission');
require('bedrock-redis');
require('bedrock-views');
require('bedrock-package-manager');

require('./config');

require('./ledger');
