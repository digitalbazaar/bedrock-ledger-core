/*!
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const {config} = require('bedrock');

// logging
config.loggers.email.silent = true;
config.loggers.email.to = ['cluster@localhost'];
config.loggers.email.from = 'cluster@localhost';

config.loggers.app.tailable = true;
config.loggers.app.level = 'debug';
config.loggers.app.maxFiles = 1000;
