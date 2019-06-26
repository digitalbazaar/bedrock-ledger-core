/*!
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const {config} = require('bedrock');

// core configuration
config.core.workers = 1;
config.core.master.title = 'bedrock-ledger-1d';
config.core.worker.title = 'bedrock-ledger-1d-worker';
config.core.worker.restart = false;

config.jsonld.strictSSL = false;
