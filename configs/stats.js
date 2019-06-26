/*!
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const {config} = require('bedrock');

config['stats'].storage.push({name: 'redis'});
// generate stats reports at 1 minute intervals
config['stats'].report.interval = 60 * 1000;
