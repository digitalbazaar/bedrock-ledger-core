/*!
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const {config} = require('bedrock');

// enable consensus workers
config.ledger.jobs.scheduleConsensusWork.enabled = true;
