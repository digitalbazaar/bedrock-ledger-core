/*!
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const {config} = require('bedrock');

config['ledger-consensus-continuity'].consensus.workerpool.enabled = true;
config['ledger-consensus-continuity'].writer.debounce = 5000;
