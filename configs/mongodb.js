/*!
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const {config} = require('bedrock');

// mongodb config
config.mongodb.name = 'ledger_app_template';
config.mongodb.username = 'bedrockledger';
config.mongodb.password = 'password';
config.mongodb.adminPrompt = true;
